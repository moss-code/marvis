import type { AgentEvent, Pony } from '@shared/types'
import type { WorkflowNode, WorkflowNodeStatus, WorkflowToolCall } from '@shared/workflow'
import { extractWorkflowMarkdownPreview } from '@/workflow/markdownPreview'

function ponyName(ponies: Pony[], id: string): string {
  return ponies.find((p) => p.id === id)?.name ?? id
}

export function buildWorkflow(events: AgentEvent[], ponies: Pony[]): WorkflowNode[] {
  const nodes: WorkflowNode[] = []
  const dispatchByTask = new Map<string, WorkflowNode>()
  let leaderNode: WorkflowNode | null = null
  let runFinished = false

  for (const ev of events) {
    switch (ev.type) {
      case 'run_started':
        nodes.push({
          id: `run-${ev.runId}`,
          kind: 'start',
          ponyName: '用户',
          label: '任务开始',
          status: 'done',
          brief: ev.userQuery,
          toolCalls: []
        })
        break
      case 'leader_thinking':
        if (!leaderNode) {
          leaderNode = {
            id: `leader-${ev.runId}`,
            kind: 'leader',
            ponyId: 'leader',
            ponyName: ponyName(ponies, 'leader'),
            label: '理解派单',
            status: 'active',
            brief: '理解任务并拆解派单',
            toolCalls: []
          }
          nodes.push(leaderNode)
        }
        break
      case 'task_dispatched': {
        if (leaderNode) leaderNode.status = 'done'
        const node: WorkflowNode = {
          id: `task-${ev.taskId}`,
          kind: 'dispatch',
          ponyId: ev.to,
          ponyName: ponyName(ponies, ev.to),
          label: ponyName(ponies, ev.to),
          status: 'active',
          brief: ev.brief,
          briefDetail: ev.briefDetail,
          toolCalls: [],
          taskId: ev.taskId
        }
        dispatchByTask.set(ev.taskId, node)
        nodes.push(node)
        break
      }
      case 'tool_call_started': {
        const node = dispatchByTask.get(ev.taskId)
        if (!node) break
        node.status = 'active'
        node.toolCalls.push({
          tool: ev.tool,
          argsSummary: ev.argsSummary,
          argsDetail: ev.argsDetail
        })
        break
      }
      case 'tool_call_finished': {
        const node = dispatchByTask.get(ev.taskId)
        const call = node?.toolCalls.findLast((t) => t.tool === ev.tool && t.ok === undefined)
        if (call) {
          call.ok = ev.ok
          call.resultSummary = ev.resultSummary
          call.resultDetail = ev.resultDetail
          call.durationMs = ev.durationMs
        }
        break
      }
      case 'task_completed': {
        const node = dispatchByTask.get(ev.taskId)
        if (node) {
          node.status = 'done'
          node.rawOutput = ev.summaryDetail
          node.outputDetail = ev.summaryDetail
          node.output =
            ev.finalOutput ??
            extractWorkflowMarkdownPreview(ev.summaryDetail, ev.summary) ??
            ev.summary
        }
        break
      }
      case 'task_failed': {
        const node = dispatchByTask.get(ev.taskId)
        if (node) {
          node.status = 'failed'
          node.rawOutput = ev.reasonDetail
          node.outputDetail = ev.reasonDetail
          node.output = ev.reasonDetail ?? ev.reason
        }
        break
      }
      case 'report_ready':
        nodes.push({
          id: `report-${ev.reportId}`,
          kind: 'report',
          ponyId: 'report',
          ponyName: ponyName(ponies, 'report'),
          label: '钉上白板',
          status: 'done',
          brief: ev.title,
          toolCalls: [],
          reportId: ev.reportId
        })
        break
      case 'run_finished':
        runFinished = true
        break
      default:
        break
    }
  }

  if (leaderNode && leaderNode.status === 'active') {
    leaderNode.status = runFinished ? 'done' : 'active'
  }

  for (const node of dispatchByTask.values()) {
    if (node.status === 'active' && runFinished) node.status = 'done'
  }

  return nodes
}

export function findWorkflowNode(nodes: WorkflowNode[], id: string | null): WorkflowNode | undefined {
  if (!id) return undefined
  return nodes.find((n) => n.id === id)
}

export function statusLabel(status: WorkflowNodeStatus): string {
  switch (status) {
    case 'pending':
      return '等待中'
    case 'active':
      return '进行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
  }
}
