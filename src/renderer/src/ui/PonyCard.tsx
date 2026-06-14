import { useEffect, useState } from 'react'
import type { PermissionPolicy, PermissionPolicyLevel, Pony, PonyDraft } from '@shared/types'
import { ACCESSORY_OPTIONS, PALETTE_OPTIONS, useAppStore } from '@/store/appStore'
import { showAppAlert, showAppConfirm } from '@/store/dialogStore'
import { SkillBadges } from '@/ui/SkillBadges'

interface Props {
  pony: Pony
  onClose: () => void
  /** 工作台模式：按方案编制移除/解雇 */
  solutionContext?: { solutionId: string }
}

export function PonyCard({ pony, onClose, solutionContext }: Props): React.JSX.Element {
  const running = useAppStore((s) => s.running)
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  const solutions = useAppStore((s) => s.solutions)
  const savePonyDraft = useAppStore((s) => s.savePonyDraft)
  const permissionPolicies = useAppStore((s) => s.permissionPolicies)
  const savePermissionPolicy = useAppStore((s) => s.savePermissionPolicy)
  const dismissPonyFromSolution = useAppStore((s) => s.dismissPonyFromSolution)
  const dismissPonyGlobally = useAppStore((s) => s.dismissPonyGlobally)

  const [name, setName] = useState(pony.name)
  const [role, setRole] = useState(pony.role)
  const [skin, setSkin] = useState(pony.skin)
  const [skillIds, setSkillIds] = useState<string[]>(pony.skills)
  const [mcpIds, setMcpIds] = useState<string[]>(pony.mcpServers)
  const [policyDraft, setPolicyDraft] = useState<PermissionPolicy | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [error, setError] = useState('')
  const policy =
    policyDraft ??
    permissionPolicies.find((p) => p.ponyId === pony.id) ?? {
      ponyId: pony.id,
      level: pony.id === 'file' ? 'approval_required_write' : 'read_only',
      canReadFiles: true,
      canWriteFiles: pony.id === 'file',
      canCallMcp: pony.id === 'file',
      canRunSkillScript: false,
      canExportReports: pony.id === 'file',
      updatedAt: 0
    }

  useEffect(() => {
    setName(pony.name)
    setRole(pony.role)
    setSkin(pony.skin)
    setSkillIds(pony.skills)
    setMcpIds(pony.mcpServers)
    setPolicyDraft(permissionPolicies.find((p) => p.ponyId === pony.id) ?? null)
  }, [permissionPolicies, pony])

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
      name,
      role,
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

  const updatePolicy = (patch: Partial<PermissionPolicy>): void => {
    setPolicyDraft((prev) => ({ ...policy, ...(prev ?? {}), ...patch, ponyId: pony.id }))
  }

  const submitPolicy = async (): Promise<void> => {
    if (running) return
    setSavingPolicy(true)
    setError('')
    try {
      await savePermissionPolicy(policy)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingPolicy(false)
    }
  }

  const requestDismiss = async (): Promise<void> => {
    if (running || pony.id === 'leader' || !solutionContext) return

    const refs = solutions.filter(
      (s) => s.id !== solutionContext.solutionId && s.ponyIds.includes(pony.id)
    )
    const willDeleteRecord = !pony.builtin && refs.length === 0
    const actionLabel = willDeleteRecord ? '解雇' : '从本方案移除'
    const message = willDeleteRecord
      ? `确定解雇「${pony.name}」吗？将从本方案编制移除并删除档案，此操作不可撤销。`
      : `确定将「${pony.name}」从本方案编制移除吗？${pony.builtin ? '预置小马档案将保留。' : '其他方案仍引用时将保留档案。'}`

    if (
      !(await showAppConfirm(message, {
        danger: true,
        confirmLabel: `确认${actionLabel}`
      }))
    ) {
      return
    }
    onClose()
    try {
      await dismissPonyFromSolution(solutionContext.solutionId, pony.id)
    } catch (err) {
      await showAppAlert(err instanceof Error ? err.message : String(err))
    }
  }

  const requestGlobalDismiss = async (): Promise<void> => {
    if (running || pony.builtin || pony.id === 'leader' || solutionContext) return

    const refs = solutions.filter((s) => s.ponyIds.includes(pony.id))
    const message =
      refs.length > 0
        ? `「${pony.name}」仍在以下解决方案编制中：\n${refs.map((s) => `· ${s.title}`).join('\n')}\n\n解雇将从上述方案移除其席位，并永久删除档案。是否仍要解雇？`
        : `确定解雇「${pony.name}」吗？将从档案中永久删除，此操作不可撤销。`

    if (
      !(await showAppConfirm(message, {
        danger: true,
        confirmLabel: '确认解雇'
      }))
    ) {
      return
    }
    onClose()
    try {
      await dismissPonyGlobally(pony.id)
    } catch (err) {
      await showAppAlert(err instanceof Error ? err.message : String(err))
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
                  <SkillBadges skill={s} />
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

          <fieldset className="form-fieldset" disabled={running}>
            <legend>权限策略</legend>
            <label className="form-label">
              策略等级
              <select
                className="form-input"
                value={policy.level}
                onChange={(e) => updatePolicy({ level: e.target.value as PermissionPolicyLevel })}
              >
                <option value="read_only">只读</option>
                <option value="workspace_write">工作区写入</option>
                <option value="approval_required_write">需审批写入</option>
                <option value="deny_dangerous">禁止危险操作</option>
              </select>
            </label>
            <div className="check-row policy-checks">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={policy.canReadFiles}
                  onChange={(e) => updatePolicy({ canReadFiles: e.target.checked })}
                />
                可读文件
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={policy.canWriteFiles}
                  onChange={(e) => updatePolicy({ canWriteFiles: e.target.checked })}
                />
                可写文件
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={policy.canCallMcp}
                  onChange={(e) => updatePolicy({ canCallMcp: e.target.checked })}
                />
                可调用 MCP
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={policy.canRunSkillScript}
                  onChange={(e) => updatePolicy({ canRunSkillScript: e.target.checked })}
                />
                可运行 Skill script
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={policy.canExportReports}
                  onChange={(e) => updatePolicy({ canExportReports: e.target.checked })}
                />
                可导出/归档报告
              </label>
            </div>
            <div className="list-toolbar">
              <button className="btn btn-ghost btn-sm" onClick={() => void submitPolicy()} disabled={savingPolicy}>
                保存策略
              </button>
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          {running && <p className="form-hint">小马们正在干活，暂不可保存</p>}
        </div>

        <footer className="modal-footer">
          {!solutionContext && !pony.builtin && (
            <button
              className="btn btn-ghost btn-danger"
              onClick={() => void requestGlobalDismiss()}
              disabled={running}
            >
              解雇
            </button>
          )}
          {solutionContext && pony.id !== 'leader' && (
            <button
              className="btn btn-ghost btn-danger"
              onClick={() => void requestDismiss()}
              disabled={running}
            >
              {!pony.builtin &&
              !solutions.some(
                (s) => s.id !== solutionContext.solutionId && s.ponyIds.includes(pony.id)
              )
                ? '解雇'
                : '从本方案移除'}
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
