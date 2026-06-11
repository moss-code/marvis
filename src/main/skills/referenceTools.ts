import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { PonyId, Skill } from '../../shared/types'
import type { Emitter } from '../agents'
import { logSummary } from '../../shared/logSummary'

const REF_MAX = 20000

function buildReferenceCatalog(skillIds: string[], allSkills: Skill[]): string {
  const lines: string[] = []
  for (const id of skillIds) {
    const skill = allSkills.find((s) => s.id === id)
    if (!skill?.references?.length) continue
    for (const ref of skill.references) {
      lines.push(`- skill="${id}" file="${ref.name}"`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '（当前小马未绑定含 references 的 Skill）'
}

function readReferenceContent(skillDef: Skill, file: string): string {
  const ref = skillDef.references?.find((r) => r.name === file)
  if (!ref) throw new Error(`Skill「${skillDef.id}」下没有参考文件 ${file}`)
  if (ref.content.length <= REF_MAX) return ref.content
  return ref.content.slice(0, REF_MAX) + '…（已截断）'
}

/** 为小马生成 Skill 参考文件读取工具（仅已勾选且含 references 的 Skill） */
export function getSkillReferenceTools(
  skillIds: string[],
  allSkills: Skill[],
  ctx: { runId: string; taskId: string; pony: PonyId; emit: Emitter }
): ToolSet {
  const allowed = new Set(skillIds)
  const catalog = buildReferenceCatalog(skillIds, allSkills)
  const hasRefs = skillIds.some((id) => allSkills.find((s) => s.id === id)?.references?.length)

  if (!hasRefs) return {}

  return {
    read_skill_reference: tool({
      description: `按需读取已绑定 Skill 的参考文档（reference.md / examples.md）。仅允许下列组合：
${catalog}`,
      inputSchema: z.object({
        skill: z.string().describe('Skill id（目录名）'),
        file: z.string().describe('参考文件名，如 reference.md 或 examples.md')
      }),
      execute: async ({ skill, file }) => {
        const started = Date.now()
        const argsLog = logSummary(JSON.stringify({ skill, file }))
        ctx.emit({
          type: 'tool_call_started',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'read_skill_reference',
          argsSummary: argsLog.summary,
          argsDetail: argsLog.detail
        })

        try {
          if (!allowed.has(skill)) {
            throw new Error(`小马未绑定 Skill「${skill}」，无法读取其参考文件`)
          }
          const skillDef = allSkills.find((s) => s.id === skill)
          if (!skillDef) throw new Error(`Skill「${skill}」不存在`)
          const known = skillDef.references?.some((r) => r.name === file)
          if (!known) {
            throw new Error(`Skill「${skill}」下没有参考文件 ${file}`)
          }

          const content = readReferenceContent(skillDef, file)
          const okLog = logSummary(`${file} ${content.length} 字符`)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'read_skill_reference',
            ok: true,
            resultSummary: okLog.summary,
            resultDetail: okLog.detail,
            durationMs: Date.now() - started
          })
          return { content }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const failLog = logSummary(msg)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'read_skill_reference',
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
