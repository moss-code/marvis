import { useMemo, useState } from 'react'
import { mcpConnectionLabel, toMcpJson } from '@shared/mcp'
import type { SelfCheckItem } from '@shared/types'
import { useAppStore } from '@/store/appStore'
import { MarkdownBody } from '@/ui/MarkdownBody'
import { SkillBadges } from '@/ui/SkillBadges'

type Tab = 'mcp' | 'skill' | 'selfcheck'

const MCP_TEMPLATE = `{
  "mcpServers": {
    "amap-maps": {
      "url": "https://mcp.amap.com/mcp?key=您的高德Key"
    }
  }
}`

interface Props {
  onClose: () => void
}

function parseMcpJson(json: string): { ok: true } | { ok: false; error: string } {
  try {
    JSON.parse(json)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function SettingsPanel({ onClose }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('mcp')
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const mcpStatus = useAppStore((s) => s.mcpStatus)
  const selfChecking = useAppStore((s) => s.selfChecking)
  const saveSkillDraft = useAppStore((s) => s.saveSkillDraft)
  const removeSkill = useAppStore((s) => s.removeSkill)
  const rescanSkills = useAppStore((s) => s.rescanSkills)
  const saveMcpDraft = useAppStore((s) => s.saveMcpDraft)
  const removeMcp = useAppStore((s) => s.removeMcp)
  const testMcp = useAppStore((s) => s.testMcp)
  const runSelfCheck = useAppStore((s) => s.runSelfCheck)

  const [editingSkill, setEditingSkill] = useState<{
    id?: string
    name: string
    description: string
    markdown: string
  } | null>(null)
  const [skillPreview, setSkillPreview] = useState(false)

  const [editingMcp, setEditingMcp] = useState<{
    id?: string
    json: string
    readonly?: boolean
  } | null>(null)

  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [skillScanResult, setSkillScanResult] = useState('')
  const [selfCheckItems, setSelfCheckItems] = useState<SelfCheckItem[] | null>(null)
  const [error, setError] = useState('')

  const mcpJsonError = useMemo(() => {
    if (!editingMcp || editingMcp.readonly) return ''
    const parsed = parseMcpJson(editingMcp.json)
    return parsed.ok ? '' : parsed.error
  }, [editingMcp])

  const selfCheckHasFail = selfCheckItems?.some((i) => !i.ok) ?? false

  const statusDot = (id: string): string => {
    const st = mcpStatus.find((s) => s.id === id)
    if (!st || st.state === 'stopped') return 'dot-stopped'
    if (st.state === 'running') return 'dot-running'
    if (st.state === 'starting') return 'dot-starting'
    return 'dot-error'
  }

  const startNewMcp = (): void => {
    setEditingMcp({ json: MCP_TEMPLATE })
    setTestResults({})
  }

  const startNewSkill = (): void => {
    setEditingSkill({ name: '', description: '', markdown: '' })
    setSkillPreview(false)
  }

  const saveMcp = async (): Promise<void> => {
    if (!editingMcp || editingMcp.readonly || mcpJsonError) return
    setError('')
    try {
      await saveMcpDraft({ id: editingMcp.id, json: editingMcp.json })
      setEditingMcp(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const saveSkill = async (): Promise<void> => {
    if (!editingSkill) return
    setError('')
    try {
      await saveSkillDraft(editingSkill)
      setEditingSkill(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const runTest = async (id: string): Promise<void> => {
    setTestResults((prev) => ({ ...prev, [id]: '测试中…' }))
    const res = await testMcp(id)
    setTestResults((prev) => ({
      ...prev,
      [id]:
        res.state === 'error'
          ? `连接失败：${res.error ?? '未知错误'}`
          : `已连接，工具：${res.tools.join('、') || '（无）'}`
    }))
  }

  const runCheck = async (): Promise<void> => {
    setSelfCheckItems(null)
    const items = await runSelfCheck()
    setSelfCheckItems(items)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="serif modal-title">办公室设置</h2>
          <button className="btn btn-ghost modal-close" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'mcp' ? 'active' : ''}`}
            onClick={() => setTab('mcp')}
          >
            MCP Servers
          </button>
          <button
            className={`settings-tab ${tab === 'skill' ? 'active' : ''}`}
            onClick={() => setTab('skill')}
          >
            Skill 库
          </button>
          <button
            className={`settings-tab ${tab === 'selfcheck' ? 'active' : ''} ${selfCheckHasFail ? 'tab-warn' : ''}`}
            onClick={() => setTab('selfcheck')}
          >
            演示自检{selfCheckHasFail ? ' ●' : ''}
          </button>
        </div>

        <div className="modal-body settings-body">
          {tab === 'mcp' && (
            <>
              <p className="form-hint">
                使用 Cursor / Claude Desktop 兼容的 <code>mcpServers</code> JSON。远程服务填{' '}
                <code>url</code>（如高德），本地子进程填 <code>command</code> / <code>args</code>。
              </p>
              <div className="list-toolbar">
                <button className="btn btn-ghost" onClick={startNewMcp}>
                  新建 Server
                </button>
              </div>
              <ul className="settings-list">
                {mcpServers.map((m) => (
                  <li key={m.id} className="settings-list-item-wrap">
                    <div className="settings-list-item">
                      <span className={`status-dot ${statusDot(m.id)}`} />
                      <span className="settings-item-name">{m.name}</span>
                      <span className="settings-item-meta">{mcpConnectionLabel(m)}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingMcp({
                            id: m.id,
                            json: toMcpJson(m),
                            readonly: m.builtin
                          })
                        }}
                      >
                        {m.builtin ? '查看' : '编辑'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => void runTest(m.id)}>
                        测试
                      </button>
                      {!m.builtin && (
                        <button
                          className="btn btn-ghost btn-sm btn-danger"
                          onClick={() => void removeMcp(m.id)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                    {testResults[m.id] && (
                      <p className="form-hint settings-row-result">{testResults[m.id]}</p>
                    )}
                  </li>
                ))}
              </ul>

              {editingMcp && (
                <div className="settings-editor">
                  <h3 className="serif">
                    {editingMcp.readonly
                      ? '内置 MCP（只读）'
                      : editingMcp.id
                        ? '编辑 MCP'
                        : '新建 MCP'}
                  </h3>
                  <label className="form-label">
                    标准 JSON 配置
                    <textarea
                      className="form-textarea mono"
                      rows={12}
                      readOnly={editingMcp.readonly}
                      value={editingMcp.json}
                      onChange={(e) =>
                        setEditingMcp({ ...editingMcp, json: e.target.value })
                      }
                    />
                  </label>
                  {mcpJsonError && <p className="form-error">{mcpJsonError}</p>}
                  <div className="modal-footer inline">
                    <button className="btn btn-ghost" onClick={() => setEditingMcp(null)}>
                      关闭
                    </button>
                    {!editingMcp.readonly && (
                      <button
                        className="btn btn-primary"
                        onClick={() => void saveMcp()}
                        disabled={!!mcpJsonError}
                      >
                        保存
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'skill' && (
            <>
              <p className="form-hint">
                预置 Skill 在应用数据库；<strong>自定义 Skill 遵循 Cursor Agent Skill 目录规范</strong>
                ，保存在工作区 <code>skills/&lt;id&gt;/SKILL.md</code>。可从外部批量复制完整 Skill
                目录（含 <code>reference.md</code>、<code>examples.md</code>、<code>scripts/</code>
                ），再点「重新扫描」。
              </p>
              <div className="list-toolbar">
                <button className="btn btn-ghost" onClick={startNewSkill}>
                  新建 Skill
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSkillScanResult('扫描中…')
                    void rescanSkills()
                      .then(() => setSkillScanResult('已重新扫描工作区 skills/ 目录'))
                      .catch((err) =>
                        setSkillScanResult(err instanceof Error ? err.message : String(err))
                      )
                  }}
                >
                  重新扫描
                </button>
              </div>
              <ul className="settings-list">
                {skills.map((s) => (
                  <li key={s.id} className="settings-list-item">
                    <span className="settings-item-name">
                      {s.name}
                      {s.builtin ? '（内置）' : ''}
                      <SkillBadges skill={s} />
                    </span>
                    <span className="settings-item-meta">
                      {s.description}
                      {!s.builtin && s.path ? ` · ${s.path}/` : ''}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingSkill({
                          id: s.id,
                          name: s.name,
                          description: s.description,
                          markdown: s.markdown
                        })
                        setSkillPreview(false)
                      }}
                    >
                      编辑
                    </button>
                    {!s.builtin && (
                      <button
                        className="btn btn-ghost btn-sm btn-danger"
                        onClick={() => void removeSkill(s.id)}
                      >
                        删除
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {skillScanResult && <p className="form-hint">{skillScanResult}</p>}

              {editingSkill && (
                <div className="settings-editor">
                  <h3 className="serif">{editingSkill.id ? '编辑 Skill' : '新建 Skill'}</h3>
                  <label className="form-label">
                    名称
                    <input
                      className="form-input"
                      value={editingSkill.name}
                      onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                    />
                  </label>
                  <label className="form-label">
                    一句话描述
                    <input
                      className="form-input"
                      value={editingSkill.description}
                      onChange={(e) =>
                        setEditingSkill({ ...editingSkill, description: e.target.value })
                      }
                    />
                  </label>
                  <div className="skill-editor-tabs">
                    <button
                      type="button"
                      className={`settings-tab ${!skillPreview ? 'active' : ''}`}
                      onClick={() => setSkillPreview(false)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className={`settings-tab ${skillPreview ? 'active' : ''}`}
                      onClick={() => setSkillPreview(true)}
                    >
                      预览
                    </button>
                  </div>
                  {!skillPreview ? (
                    <label className="form-label">
                      SKILL.md 正文（不含 frontmatter，建议 ≤2000 字）
                      <textarea
                        className="form-textarea mono"
                        rows={10}
                        value={editingSkill.markdown}
                        onChange={(e) =>
                          setEditingSkill({ ...editingSkill, markdown: e.target.value })
                        }
                      />
                      <span className="char-count">
                        {editingSkill.markdown.length} / 2000
                      </span>
                    </label>
                  ) : (
                    <div className="skill-preview panel">
                      <MarkdownBody>{editingSkill.markdown || '（空）'}</MarkdownBody>
                    </div>
                  )}
                  <div className="modal-footer inline">
                    <button className="btn btn-ghost" onClick={() => setEditingSkill(null)}>
                      取消
                    </button>
                    <button className="btn btn-primary" onClick={() => void saveSkill()}>
                      保存
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'selfcheck' && (
            <>
              <p className="form-hint">
                演示开场前一键体检，串行检查环境、模型、数据、MCP、工作区与报告引擎。任何一项失败请按提示修复。
              </p>
              <button
                className="btn btn-primary"
                disabled={selfChecking}
                onClick={() => void runCheck()}
              >
                {selfChecking ? '自检中…' : '运行自检'}
              </button>
              {selfCheckItems && (
                <ul className="selfcheck-list">
                  {selfCheckItems.map((item) => (
                    <li key={item.name} className={`selfcheck-item ${item.ok ? 'ok' : 'fail'}`}>
                      <span className="selfcheck-icon">{item.ok ? '✓' : '✗'}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <p className="form-hint">{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
