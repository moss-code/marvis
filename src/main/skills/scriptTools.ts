import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { PonyId, Skill } from '../../shared/types'
import type { Emitter } from '../agents'
import { runSkillScript } from './runScript'

const SUMMARY_MAX = 200
const SCRIPT_TIMEOUT_MS = 60_000

function truncate(s: string, n = SUMMARY_MAX): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function buildScriptCatalog(skillIds: string[], allSkills: Skill[]): string {
  const lines: string[] = []
  for (const id of skillIds) {
    const skill = allSkills.find((s) => s.id === id)
    if (!skill?.scripts?.length) continue
    for (const script of skill.scripts) {
      lines.push(`- skill="${id}" script="${script.file}"`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '（当前小马未绑定含 scripts/ 的 Skill）'
}

/** 为小马生成 Skill 脚本执行工具（仅已勾选的 Skill） */
export function getSkillScriptTools(
  skillIds: string[],
  allSkills: Skill[],
  ctx: { runId: string; taskId: string; pony: PonyId; emit: Emitter }
): ToolSet {
  const allowed = new Set(skillIds)
  const catalog = buildScriptCatalog(skillIds, allSkills)
  const hasScripts = skillIds.some((id) => allSkills.find((s) => s.id === id)?.scripts?.length)

  if (!hasScripts) return {}

  return {
    run_skill_script: tool({
      description: `执行已绑定 Skill 的 scripts/ 目录脚本（支持 node/python/shell，可发起网络请求）。仅允许下列组合：
${catalog}`,
      inputSchema: z.object({
        skill: z.string().describe('Skill id（目录名）'),
        script: z.string().describe('scripts/ 下相对路径，如 fetch.py 或 utils/query.js'),
        args: z.array(z.string()).optional().describe('传给脚本的命令行参数'),
        input: z.string().optional().describe('写入 stdin 的文本（可选）')
      }),
      execute: async ({ skill, script, args, input }) => {
        const started = Date.now()
        const argsSummary = truncate(JSON.stringify({ skill, script, args, input }))
        ctx.emit({
          type: 'tool_call_started',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'run_skill_script',
          argsSummary
        })

        try {
          if (!allowed.has(skill)) {
            throw new Error(`小马未绑定 Skill「${skill}」，无法执行其脚本`)
          }
          const skillDef = allSkills.find((s) => s.id === skill)
          const known = skillDef?.scripts?.some((s) => s.file === script)
          if (!known) {
            throw new Error(`Skill「${skill}」下没有脚本 scripts/${script}`)
          }

          const result = await runSkillScript(skill, script, args ?? [], input)
          const summary = truncate(
            result.timedOut
              ? `超时（${SCRIPT_TIMEOUT_MS / 1000}s）`
              : `exit=${result.exitCode} stdout=${result.stdout || '(空)'}`
          )
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'run_skill_script',
            ok: result.exitCode === 0 && !result.timedOut,
            resultSummary: summary,
            durationMs: Date.now() - started
          })

          if (result.timedOut) {
            return { error: `脚本执行超时（${SCRIPT_TIMEOUT_MS / 1000} 秒）`, stderr: result.stderr }
          }

          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr || undefined
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'run_skill_script',
            ok: false,
            resultSummary: truncate(msg),
            durationMs: Date.now() - started
          })
          return { error: msg }
        }
      }
    })
  }
}
