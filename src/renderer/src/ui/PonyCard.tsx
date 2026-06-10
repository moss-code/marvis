import { useEffect, useState } from 'react'
import type { Pony, PonyDraft } from '@shared/types'
import { ACCESSORY_OPTIONS, PALETTE_OPTIONS, useAppStore } from '@/store/appStore'

interface Props {
  pony: Pony
  onClose: () => void
}

export function PonyCard({ pony, onClose }: Props): React.JSX.Element {
  const running = useAppStore((s) => s.running)
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const savePonyDraft = useAppStore((s) => s.savePonyDraft)
  const removePony = useAppStore((s) => s.removePony)

  const [name, setName] = useState(pony.name)
  const [role, setRole] = useState(pony.role)
  const [skin, setSkin] = useState(pony.skin)
  const [skillIds, setSkillIds] = useState<string[]>(pony.skills)
  const [mcpIds, setMcpIds] = useState<string[]>(pony.mcpServers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(pony.name)
    setRole(pony.role)
    setSkin(pony.skin)
    setSkillIds(pony.skills)
    setMcpIds(pony.mcpServers)
  }, [pony])

  const toggleSkill = (id: string): void => {
    setSkillIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const toggleMcp = (id: string): void => {
    setMcpIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  const toggleAccessory = (id: (typeof ACCESSORY_OPTIONS)[number]['id']): void => {
    setSkin((s) => ({
      ...s,
      accessories: s.accessories.includes(id)
        ? s.accessories.filter((a) => a !== id)
        : [...s.accessories, id]
    }))
  }

  const submit = async (): Promise<void> => {
    if (running) return
    setSaving(true)
    setError('')
    const draft: PonyDraft = {
      id: pony.id,
      name: pony.builtin ? pony.name : name,
      role: pony.builtin ? pony.role : role,
      skin,
      skills: skillIds,
      mcpServers: mcpIds
    }
    try {
      await savePonyDraft(draft)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const dismiss = async (): Promise<void> => {
    if (running || pony.builtin) return
    if (!confirm(`确定解雇「${pony.name}」吗？`)) return
    try {
      await removePony(pony.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel pony-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="serif modal-title">{pony.name}</h2>
          <button className="btn btn-ghost modal-close" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="modal-body">
          {!pony.builtin && (
            <>
              <label className="form-label">
                名字
                <input
                  className="form-input"
                  value={name}
                  maxLength={12}
                  onChange={(e) => setName(e.target.value)}
                  disabled={running}
                />
              </label>
              <label className="form-label">
                职能
                <input
                  className="form-input"
                  value={role}
                  maxLength={60}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={running}
                />
              </label>
            </>
          )}
          {pony.builtin && <p className="form-hint">{pony.role}</p>}

          <fieldset className="form-fieldset" disabled={running}>
            <legend>调色板</legend>
            <div className="palette-row">
              {PALETTE_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`palette-swatch ${skin.palette === p.id ? 'active' : ''}`}
                  style={{ background: p.color }}
                  title={p.label}
                  onClick={() => setSkin((s) => ({ ...s, palette: p.id }))}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="form-fieldset" disabled={running}>
            <legend>配件</legend>
            <div className="check-row">
              {ACCESSORY_OPTIONS.map((a) => (
                <label key={a.id} className="check-label">
                  <input
                    type="checkbox"
                    checked={skin.accessories.includes(a.id)}
                    onChange={() => toggleAccessory(a.id)}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="form-fieldset" disabled={running}>
            <legend>Skill</legend>
            <div className="check-col">
              {skills.map((s) => (
                <label key={s.id} className="check-label">
                  <input
                    type="checkbox"
                    checked={skillIds.includes(s.id)}
                    onChange={() => toggleSkill(s.id)}
                  />
                  {s.name}
                  <span className="check-desc">{s.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="form-fieldset" disabled={running}>
            <legend>MCP</legend>
            <div className="check-col">
              {mcpServers.map((m) => (
                <label key={m.id} className="check-label">
                  <input
                    type="checkbox"
                    checked={mcpIds.includes(m.id)}
                    onChange={() => toggleMcp(m.id)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          {running && <p className="form-hint">小马们正在干活，暂不可保存</p>}
        </div>

        <footer className="modal-footer">
          {!pony.builtin && (
            <button className="btn btn-ghost btn-danger" onClick={() => void dismiss()} disabled={running}>
              解雇
            </button>
          )}
          <button className="btn btn-primary" onClick={() => void submit()} disabled={running || saving}>
            保存
          </button>
        </footer>
      </div>
    </div>
  )
}
