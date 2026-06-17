import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { McpServerConfig, Pony, Skill } from '@shared/types'
import type { WorkflowNode } from '@shared/workflow'
import { statusLabel } from '@/workflow/buildWorkflow'
import { extractWorkflowMarkdownPreview } from '@/workflow/markdownPreview'
import { MarkdownBody } from '@/ui/MarkdownBody'

interface WorkflowNodeDetailProps {
  node: WorkflowNode
  pony?: Pony
  skills: Skill[]
  mcpServers: McpServerConfig[]
  sessionSkillIds: string[]
  sessionMcpServerIds: string[]
  onClose(): void
}

function resolveSkillNames(ids: string[], skills: Skill[]): string[] {
  return ids.map((id) => skills.find((s) => s.id === id)?.name ?? id)
}

function resolveMcpNames(ids: string[], servers: McpServerConfig[]): string[] {
  return ids.map((id) => servers.find((s) => s.id === id)?.name ?? id)
}

function countLines(text: string): number {
  return text.split(/\r?\n/).length
}

function shouldShowRawCollapse(preview: string | undefined, raw: string | undefined): raw is string {
  if (!raw?.trim()) return false
  if (!preview?.trim()) return raw.length > 120 || raw.includes('\n')
  const flatPreview = preview.replace(/\s+/g, ' ').trim()
  const flatRaw = raw.replace(/\s+/g, ' ').trim()
  return raw.length > preview.length + 16 || flatRaw.length > flatPreview.length + 16 || raw.includes('\n')
}

function CollapsibleRawBlock({
  title,
  preview,
  raw,
  meta
}: {
  title: string
  preview?: string
  raw: string
  meta?: { label: string; value: string }[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const collapsible = shouldShowRawCollapse(preview, raw)

  if (!collapsible) {
    return (
      <section>
        <h3>{title}</h3>
        <MarkdownBody className="workflow-detail-markdown">{raw}</MarkdownBody>
      </section>
    )
  }

  return (
    <section>
      <h3>{title}</h3>
      {preview && preview.trim() && (
        <div className="workflow-detail-preview">
          <span className="workflow-detail-preview-label">摘要</span>
          <MarkdownBody className="workflow-detail-markdown">{preview}</MarkdownBody>
        </div>
      )}
      <details
        className="workflow-raw-details"
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          <span>执行轨迹与原始输出</span>
          {meta && meta.length > 0 && (
            <span className="workflow-raw-meta-inline">
              {meta.map((m) => (
                <em key={m.label}>
                  {m.label} {m.value}
                </em>
              ))}
            </span>
          )}
        </summary>
        <div className="workflow-raw-body">
          {meta && meta.length > 0 && (
            <dl className="workflow-raw-meta">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <MarkdownBody className="workflow-detail-markdown">{raw}</MarkdownBody>
        </div>
      </details>
    </section>
  )
}

export function WorkflowNodeDetail({
  node,
  pony,
  skills,
  mcpServers,
  sessionSkillIds,
  sessionMcpServerIds,
  onClose
}: WorkflowNodeDetailProps): React.JSX.Element {
  const ponySkillIds = pony ? [...new Set([...pony.skills, ...sessionSkillIds])] : sessionSkillIds
  const ponyMcpIds = pony ? [...new Set([...pony.mcpServers, ...sessionMcpServerIds])] : sessionMcpServerIds
  const skillNames = resolveSkillNames(ponySkillIds, skills)
  const mcpNames = resolveMcpNames(ponyMcpIds, mcpServers)
  const briefRaw = node.briefDetail ?? node.brief
  const outputRaw = node.rawOutput ?? node.outputDetail ?? node.output
  const outputPreview = extractWorkflowMarkdownPreview(outputRaw, node.output) ?? node.output

  const outputMeta = outputRaw
    ? [
        { label: '字符', value: String(outputRaw.length) },
        { label: '行数', value: String(countLines(outputRaw)) },
        { label: '工具', value: String(node.toolCalls.length) }
      ]
    : []

  return createPortal(
    <div className="workflow-detail-backdrop workflow-detail-backdrop--portal" onClick={onClose} role="presentation">
      <div
        className="workflow-detail-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-detail-title"
      >
        <header className="workflow-detail-header">
          <div>
            <span className={`workflow-node-status workflow-node-status-${node.status}`}>
              {statusLabel(node.status)}
            </span>
            <h2 id="workflow-detail-title">{node.ponyName}</h2>
            <p>{node.label}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div className="workflow-detail-body">
          {node.brief && briefRaw && (
            <CollapsibleRawBlock title="任务说明" preview={node.briefDetail ?? node.brief} raw={briefRaw} />
          )}

          {pony && (
            <section>
              <h3>职能小马</h3>
              <p className="workflow-detail-muted">{pony.role}</p>
            </section>
          )}

          {(skillNames.length > 0 || mcpNames.length > 0) && (
            <section>
              <h3>能力与绑定</h3>
              {skillNames.length > 0 && (
                <div className="workflow-detail-tags">
                  <span className="workflow-detail-tag-label">Skill</span>
                  {skillNames.map((name) => (
                    <span key={name} className="workflow-detail-tag">
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {mcpNames.length > 0 && (
                <div className="workflow-detail-tags">
                  <span className="workflow-detail-tag-label">MCP</span>
                  {mcpNames.map((name) => (
                    <span key={name} className="workflow-detail-tag workflow-detail-tag-mcp">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {node.toolCalls.length > 0 && (
            <section>
              <h3>工具调用</h3>
              <ul className="workflow-tool-list">
                {node.toolCalls.map((call, i) => (
                  <li key={`${call.tool}-${i}`} className={call.ok === false ? 'failed' : call.ok ? 'ok' : 'pending'}>
                    <div className="workflow-tool-head">
                      <strong>{call.tool}</strong>
                      {call.durationMs != null && <em>{call.durationMs}ms</em>}
                      {call.ok === true && <span className="ok-badge">成功</span>}
                      {call.ok === false && <span className="fail-badge">失败</span>}
                    </div>
                    <p>{call.argsDetail ?? call.argsSummary}</p>
                    {call.resultSummary && (
                      <MarkdownBody className="workflow-detail-markdown workflow-detail-result">
                        {call.resultDetail ?? call.resultSummary}
                      </MarkdownBody>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {outputRaw && (
            <CollapsibleRawBlock
              title={node.status === 'failed' ? '失败原因' : '输出摘要'}
              preview={outputPreview}
              raw={outputRaw}
              meta={outputMeta}
            />
          )}

          {!node.brief && !outputRaw && node.toolCalls.length === 0 && (
            <p className="workflow-detail-muted">该节点暂无更多详情，任务进行中…</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
