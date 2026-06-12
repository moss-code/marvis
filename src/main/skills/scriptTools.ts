import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { PonyId, Skill } from '../../shared/types'
import type { Emitter } from '../agents'
import { logSummary } from '../../shared/logSummary'
import { logError } from '../logger'
import { runSkillScript, type RunScriptResult } from './runScript'
import { runGovernedAction } from '../governance'

const SCRIPT_TIMEOUT_MS = 60_000

const SCRIPT_CATALOG_NOTE = `注意：Skill 的 scripts/ 多为编辑/辅助工具，通常不能从零生成成品。
从零产出时：先 read_skill_reference 读 SKILL.md 引用的文档，再在沙箱 scripts/ 自写脚本并用 run_sandbox_script 执行。`

/** 平台启发式：不展示 scripts/office/** 等深层工具目录，减少误用 */
function isCatalogScript(scriptFile: string): boolean {
  const norm = scriptFile.replace(/\\/g, '/')
  return !norm.startsWith('office/')
}

function buildScriptCatalog(skillIds: string[], allSkills: Skill[]): string {
  const lines: string[] = []
  for (const id of skillIds) {
    const skill = allSkills.find((s) => s.id === id)
    if (!skill?.scripts?.length) continue
    for (const script of skill.scripts) {
      if (!isCatalogScript(script.file)) continue
      lines.push(`- skill="${id}" script="${script.file}"`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '（当前小马未绑定可列出的顶层 scripts/ 脚本）'
}

function formatScriptFailure(result: RunScriptResult): string {
  const parts = [`exitCode=${result.exitCode ?? 'null'}`]
  if (result.stderr?.trim()) parts.push(`stderr: ${result.stderr.trim()}`)
  if (result.stdout?.trim()) parts.push(`stdout: ${result.stdout.trim()}`)
  return parts.join('\n')
}

/** 为小马生成 Skill 脚本执行工具（仅已勾选的 Skill） */
export function getSkillScriptTools(
  skillIds: string[],
  allSkills: Skill[],
  ctx: { runId: string; taskId: string; pony: PonyId; ponyName?: string; emit: Emitter; signal?: AbortSignal }
): ToolSet {
  const allowed = new Set(skillIds)
  const catalog = buildScriptCatalog(skillIds, allSkills)
  const hasScripts = skillIds.some((id) => allSkills.find((s) => s.id === id)?.scripts?.length)

  if (!hasScripts) return {}

  return {
    run_skill_script: tool({
      description: `执行已绑定 Skill 的 scripts/ 目录脚本（支持 node/python/shell，可发起网络请求）。
${SCRIPT_CATALOG_NOTE}
失败时返回 exitCode 与完整 stderr，请根据错误修正后重试。仅允许下列组合：
${catalog}`,
      inputSchema: z.object({
        skill: z.string().describe('Skill id（目录名）'),
        script: z.string().describe('scripts/ 下相对路径，如 thumbnail.py 或 office/unpack.py'),
        args: z.array(z.string()).optional().describe('传给脚本的命令行参数'),
        input: z.string().optional().describe('写入 stdin 的文本（可选）')
      }),
      execute: async ({ skill, script, args, input }) => {
        const started = Date.now()
        const argsLog = logSummary(JSON.stringify({ skill, script, args, input }))
        ctx.emit({
          type: 'tool_call_started',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'run_skill_script',
          argsSummary: argsLog.summary,
          argsDetail: argsLog.detail
        })

        try {
          if (!allowed.has(skill)) {
            throw new Error(`小马未绑定 Skill「${skill}」，无法执行其脚本`)
          }
          const skillDef = allSkills.find((s) => s.id === skill)
          const known = skillDef?.scripts?.some((s) => s.file === script)
          if (!known) {
            const available = skillDef?.scripts?.map((s) => s.file).join('、') ?? '无'
            throw new Error(`Skill「${skill}」下没有脚本 scripts/${script}。可用：${available}`)
          }

          const result = await runGovernedAction(
            {
              runId: ctx.runId,
              taskId: ctx.taskId,
              ponyId: ctx.pony,
              ponyName: ctx.ponyName,
              emit: ctx.emit
            },
            {
              toolName: 'run_skill_script',
              actionType: 'skill_script',
              resource: `${skill}/scripts/${script}`,
              riskLevel: 'high',
              reason: 'Skill script 将在本机执行脚本',
              argsSummary: argsLog.summary,
              requiresSkillScript: true,
              destructive: true
            },
            () => runSkillScript(skill, script, args ?? [], input, ctx.signal)
          )

          const ok = result.exitCode === 0 && !result.timedOut
          let resultSummary: string
          let resultDetail: string

          if (result.timedOut) {
            resultSummary = `脚本超时（${SCRIPT_TIMEOUT_MS / 1000}s）`
            resultDetail = formatScriptFailure(result)
            logError('skill-script', `脚本超时 skill=${skill} script=${script}`, resultDetail)
          } else if (!ok) {
            resultSummary = `脚本失败 exit=${result.exitCode}: ${(result.stderr || result.stdout || '无输出').trim().slice(0, 240)}`
            resultDetail = formatScriptFailure(result)
            logError('skill-script', `脚本失败 skill=${skill} script=${script}`, resultDetail)
          } else {
            const raw = `exit=0 stdout=${result.stdout || '(空)'}`
            const resultLog = logSummary(raw)
            resultSummary = resultLog.summary
            resultDetail = resultLog.detail ?? resultLog.summary
          }

          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'run_skill_script',
            ok,
            resultSummary,
            resultDetail,
            durationMs: Date.now() - started
          })

          if (result.timedOut) {
            return {
              error: `脚本执行超时（${SCRIPT_TIMEOUT_MS / 1000} 秒）`,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr
            }
          }

          if (!ok) {
            return {
              error: `脚本执行失败（exitCode=${result.exitCode}）`,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr
            }
          }

          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr || undefined
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logError('skill-script', `脚本调用异常 skill=${skill} script=${script}`, err)
          const failLog = logSummary(msg)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'run_skill_script',
            ok: false,
            resultSummary: failLog.summary,
            resultDetail: failLog.detail,
            durationMs: Date.now() - started
          })
          return { error: msg }
        }
      }
    })
  }
}
