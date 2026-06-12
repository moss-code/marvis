import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { PonyId, Skill } from '../../shared/types'
import type { Emitter } from '../agents'
import { logSummary } from '../../shared/logSummary'
import { loadSkillReferenceContent } from './index'

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
  return lines.length > 0 ? lines.join('\n') : '（当前小马未绑定含参考文件的 Skill）'
}

/** 为小马生成 Skill 参考文件读取工具（agentskills.io 执行阶段：按需加载） */
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
      description: `按需读取已绑定 Skill 的参考文档（agentskills.io 执行阶段）。
SKILL.md 中引用的其他文件（如 pptxgenjs.md、editing.md、references/*.md）必须先通过本工具读取，再执行后续步骤。
仅允许下列组合：
${catalog}`,
      inputSchema: z.object({
        skill: z.string().describe('Skill id（目录名）'),
        file: z.string().describe('参考文件相对路径，如 pptxgenjs.md 或 references/REFERENCE.md')
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
            const available = skillDef.references?.map((r) => r.name).join('、') ?? '无'
            throw new Error(`Skill「${skill}」下没有参考文件 ${file}。可用：${available}`)
          }

          const content = loadSkillReferenceContent(skill, file)
          const body =
            content.length <= REF_MAX ? content : content.slice(0, REF_MAX) + '…（已截断）'
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
          return { content: body }
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
