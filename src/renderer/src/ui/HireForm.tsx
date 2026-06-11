import { useState } from 'react'
import type { PonyDraft } from '@shared/types'
import {
  ACCESSORY_OPTIONS,
  PALETTE_OPTIONS,
  defaultSkin,
  useAppStore
} from '@/store/appStore'
import { SkillBadges } from '@/ui/SkillBadges'

interface Props {
  onClose: () => void
  onHired: (ponyId: string) => void
}

export function HireForm({ onClose, onHired }: Props): React.JSX.Element {
  const running = useAppStore((s) => s.running)
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const savePonyDraft = useAppStore((s) => s.savePonyDraft)

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [skin, setSkin] = useState(defaultSkin())
  const [skillIds, setSkillIds] = useState<string[]>([])
  const [mcpIds, setMcpIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
    const draft: PonyDraft = { name, role, skin, skills: skillIds, mcpServers: mcpIds }
    try {
      const pony = await savePonyDraft(draft)
      onHired(pony.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const next = (): void => {
    if (step === 0) {
      if (!name.trim() || !role.trim()) {
        setError('请填写名字和职能')
        return
      }
    }
    setError('')
    setStep((s) => Math.min(s + 1, 3))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal panel hire-form" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="serif modal-title">招聘新小马</h2>
          <span className="step-indicator">步骤 {step + 1} / 4</span>
        </header>

        <div className="modal-body">
          {step === 0 && (
            <>
              <label className="form-label">
                名字（1~12 字）
                <input
                  className="form-input"
                  value={name}
                  maxLength={12}
                  onChange={(e) => setName(e.target.value)}
                  disabled={running}
                />
              </label>
              <label className="form-label">
                职能（1~60 字）
                <textarea
                  className="form-textarea"
                  value={role}
                  maxLength={60}
                  rows={3}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={running}
                />
              </label>
            </>
          )}

          {step === 1 && (
            <fieldset className="form-fieldset" disabled={running}>
              <legend>选择皮肤</legend>
              <div className="palette-row">
                {PALETTE_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`palette-swatch large ${skin.palette === p.id ? 'active' : ''}`}
                    style={{ background: p.color }}
                    title={p.label}
                    onClick={() => setSkin((s) => ({ ...s, palette: p.id }))}
                  />
                ))}
              </div>
              <div className="check-row" style={{ marginTop: 12 }}>
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
          )}

          {step === 2 && (
            <fieldset className="form-fieldset" disabled={running}>
              <legend>勾选 Skill</legend>
              <div className="check-col">
                {skills.map((s) => (
                  <label key={s.id} className="check-label">
                    <input
                      type="checkbox"
                      checked={skillIds.includes(s.id)}
                      onChange={() => toggleSkill(s.id)}
                    />
                    {s.name}
                    <SkillBadges skill={s} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <fieldset className="form-fieldset" disabled={running}>
              <legend>绑定 MCP</legend>
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
          )}

          {error && <p className="form-error">{error}</p>}
          {running && <p className="form-hint">小马们正在干活</p>}
        </div>

        <footer className="modal-footer">
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={running}>
              上一步
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          {step < 3 ? (
            <button className="btn btn-primary" onClick={next} disabled={running}>
              下一步
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void submit()} disabled={running || saving}>
              入职
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
