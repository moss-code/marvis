import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { statSync } from 'node:fs'
import type { PonyId } from '../../shared/types'
import type { Emitter } from '../agents'
import { logSummary } from '../../shared/logSummary'
import { runGovernedAction } from '../governance'
import { logError } from '../logger'
import {
  assertSandboxScriptPath,
  destroyTaskSandbox,
  getTaskSandbox,
  promoteSandboxFile,
  type TaskSandbox
} from '../sandbox'
import { runScriptFile, type RunScriptResult } from './runScript'

const SCRIPT_TIMEOUT_MS = 60_000

function formatScriptFailure(result: RunScriptResult): string {
  const parts = [`exitCode=${result.exitCode ?? 'null'}`]
  if (result.stderr?.trim()) parts.push(`stderr: ${result.stderr.trim()}`)
  if (result.stdout?.trim()) parts.push(`stdout: ${result.stdout.trim()}`)
  return parts.join('\n')
}

function requireSandbox(runId: string, taskId: string): TaskSandbox {
  const sandbox = getTaskSandbox(runId, taskId)
  if (!sandbox) {
    throw new Error('本任务未启用沙箱（需在权限策略中勾选「可运行 Skill script」）')
  }
  return sandbox
}

/** 沙箱内脚本执行与成品提升（需 canRunSkillScript 权限，任务开始时自动建沙箱） */
export function getSandboxTools(
  ctx: {
    runId: string
    taskId: string
    pony: PonyId
    ponyName?: string
    emit: Emitter
    signal?: AbortSignal
  },
  sandbox: TaskSandbox | undefined
): ToolSet {
  if (!sandbox) return {}

  return {
    run_sandbox_script: tool({
      description: `在本任务沙箱的 scripts/ 目录执行脚本（Python/Node 等）。
先用 filesystem.write_file 把脚本写到沙箱 scripts/ 路径，再调用本工具执行。
沙箱根目录：${sandbox.root}`,
      inputSchema: z.object({
        script: z.string().describe('相对 scripts/ 的路径，如 generate_report.py'),
        args: z.array(z.string()).optional().describe('命令行参数'),
        input: z.string().optional().describe('写入 stdin 的文本（可选）')
      }),
      execute: async ({ script, args, input }) => {
        const started = Date.now()
        const argsLog = logSummary(JSON.stringify({ script, args, input }))
        ctx.emit({
          type: 'tool_call_started',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'run_sandbox_script',
          argsSummary: argsLog.summary,
          argsDetail: argsLog.detail
        })

        try {
          const sb = requireSandbox(ctx.runId, ctx.taskId)
          const scriptPath = assertSandboxScriptPath(sb, script)

          const result = await runGovernedAction(
            {
              runId: ctx.runId,
              taskId: ctx.taskId,
              ponyId: ctx.pony,
              ponyName: ctx.ponyName,
              emit: ctx.emit
            },
            {
              toolName: 'run_sandbox_script',
              actionType: 'skill_script',
              resource: `sandbox/scripts/${script}`,
              riskLevel: 'high',
              reason: '沙箱脚本将在本机执行',
              argsSummary: argsLog.summary,
              requiresSkillScript: true,
              destructive: true,
              autoAllow: true
            },
            () =>
              runScriptFile(
                scriptPath,
                sb.scriptsDir,
                args ?? [],
                input,
                ctx.signal,
                'sandbox-script',
                { runId: ctx.runId, taskId: ctx.taskId }
              )
          )

          const ok = result.exitCode === 0 && !result.timedOut
          let resultSummary: string
          let resultDetail: string

          if (result.timedOut) {
            resultSummary = `沙箱脚本超时（${SCRIPT_TIMEOUT_MS / 1000}s）`
            resultDetail = formatScriptFailure(result)
            logError('sandbox-script', `超时 script=${script}`, resultDetail)
          } else if (!ok) {
            resultSummary = `沙箱脚本失败 exit=${result.exitCode}: ${(result.stderr || result.stdout || '无输出').trim().slice(0, 240)}`
            resultDetail = formatScriptFailure(result)
            logError('sandbox-script', `失败 script=${script}`, resultDetail)
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
            tool: 'run_sandbox_script',
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
          return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logError('sandbox-script', `调用异常 script=${script}`, err)
          const failLog = logSummary(msg)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'run_sandbox_script',
            ok: false,
            resultSummary: failLog.summary,
            resultDetail: failLog.detail,
            durationMs: Date.now() - started
          })
          return { error: msg }
        }
      }
    }),

    promote_sandbox_file: tool({
      description: `将沙箱 out/ 中的成品复制到工作区指定路径（相对工作区根或绝对路径，须在工作区内）。
默认提升后删除本任务沙箱。`,
      inputSchema: z.object({
        outFile: z.string().describe('out/ 下相对路径，如 2025年下半年营业厅经营分析报告.pptx'),
        destPath: z.string().describe('工作区目标路径，如 2025年下半年营业厅经营分析报告.pptx'),
        removeSandbox: z.boolean().optional().describe('提升成功后是否删除沙箱，默认 true')
      }),
      execute: async ({ outFile, destPath, removeSandbox = true }) => {
        const started = Date.now()
        const argsLog = logSummary(JSON.stringify({ outFile, destPath, removeSandbox }))
        ctx.emit({
          type: 'tool_call_started',
          runId: ctx.runId,
          taskId: ctx.taskId,
          pony: ctx.pony,
          tool: 'promote_sandbox_file',
          argsSummary: argsLog.summary,
          argsDetail: argsLog.detail
        })

        try {
          const sb = requireSandbox(ctx.runId, ctx.taskId)
          const dest = await runGovernedAction(
            {
              runId: ctx.runId,
              taskId: ctx.taskId,
              ponyId: ctx.pony,
              ponyName: ctx.ponyName,
              emit: ctx.emit
            },
            {
              toolName: 'promote_sandbox_file',
              actionType: 'file_write',
              resource: destPath,
              riskLevel: 'high',
              reason: '将沙箱成品写入工作区',
              argsSummary: argsLog.summary,
              requiresWrite: true,
              destructive: true,
              autoAllow: true
            },
            () => promoteSandboxFile(sb, outFile, destPath)
          )
          const size = statSync(dest).size
          const okLog = logSummary(`${dest} (${size} bytes)`)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'promote_sandbox_file',
            ok: true,
            resultSummary: okLog.summary,
            resultDetail: okLog.detail,
            durationMs: Date.now() - started
          })

          if (removeSandbox) {
            destroyTaskSandbox(ctx.runId, ctx.taskId)
          }

          return { path: dest, sizeBytes: size, sandboxRemoved: removeSandbox }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const failLog = logSummary(msg)
          ctx.emit({
            type: 'tool_call_finished',
            runId: ctx.runId,
            taskId: ctx.taskId,
            pony: ctx.pony,
            tool: 'promote_sandbox_file',
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
