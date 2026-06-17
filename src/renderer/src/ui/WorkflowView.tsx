import { useMemo, useState } from 'react'
import type { AgentEvent } from '@shared/types'
import { useAppStore } from '@/store/appStore'
import { buildWorkflow, findWorkflowNode } from '@/workflow/buildWorkflow'
import { WorkflowNodeDetail } from '@/ui/WorkflowNodeDetail'

interface WorkflowViewProps {
  events: AgentEvent[]
  /** overlay=场景顶栏；embedded=历史任务内嵌 */
  variant?: 'overlay' | 'embedded'
}

export function WorkflowView({ events, variant = 'overlay' }: WorkflowViewProps): React.JSX.Element {
  const ponies = useAppStore((s) => s.ponies)
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const sessionSkillIds = useAppStore((s) => s.sessionSkillIds)
  const sessionMcpServerIds = useAppStore((s) => s.sessionMcpServerIds)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nodes = useMemo(() => buildWorkflow(events, ponies), [events, ponies])
  const selected = findWorkflowNode(nodes, selectedId)
  const selectedPony = selected?.ponyId ? ponies.find((p) => p.id === selected.ponyId) : undefined

  const panelClass = variant === 'overlay' ? 'workflow-panel' : 'workflow-panel workflow-panel-embedded'

  return (
    <>
      <div className={panelClass} aria-label="协作工作流">
        <div className="workflow-panel-head">
          <span>协作工作流</span>
          <small>{nodes.length > 0 ? `${nodes.length} 个节点` : '无节点'}</small>
        </div>
        {nodes.length === 0 ? (
          <p className="workflow-empty">该任务没有可展示的工作流节点</p>
        ) : (
          <ol className="workflow-track">
            {nodes.map((node, index) => (
              <li key={node.id} className="workflow-step">
                <button
                  type="button"
                  className={`workflow-node workflow-node-${node.status}${selectedId === node.id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(node.id)}
                  title="点击查看详情"
                >
                  <span className="workflow-node-kind">
                    {node.kind === 'start'
                      ? '开始'
                      : node.kind === 'leader'
                        ? '编排'
                        : node.kind === 'report'
                          ? '报告'
                          : '执行'}
                  </span>
                  <strong>{node.ponyName}</strong>
                  <em>{node.label}</em>
                </button>
                {index < nodes.length - 1 && <span className="workflow-arrow" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
      </div>

      {selected && (
        <WorkflowNodeDetail
          node={selected}
          pony={selectedPony}
          skills={skills}
          mcpServers={mcpServers}
          sessionSkillIds={sessionSkillIds}
          sessionMcpServerIds={sessionMcpServerIds}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}
