import { useEffect, useMemo, useRef, useState } from 'react'
import type { PermissionPolicy, PermissionPolicyLevel, Pony, PonyId } from '@shared/types'
import { useAppStore } from '@/store/appStore'

type PolicyPresetId = 'ask' | 'auto' | 'full' | 'custom'

interface PolicyPreset {
  id: Exclude<PolicyPresetId, 'custom'>
  label: string
  description: string
  level: PermissionPolicyLevel
  canRunSkillScript: boolean
}

const PRESETS: PolicyPreset[] = [
  {
    id: 'ask',
    label: '请求批准',
    description: '写入、归档、脚本和高风险工具操作先进入审批',
    level: 'approval_required_write',
    canRunSkillScript: true
  },
  {
    id: 'auto',
    label: '替我审批',
    description: '常规工作区操作自动放行，仅风险动作请求批准',
    level: 'workspace_write',
    canRunSkillScript: false
  },
  {
    id: 'full',
    label: '完全访问权限',
    description: '授予工作区工具能力，越界与敏感信息仍强制拦截',
    level: 'workspace_write',
    canRunSkillScript: true
  }
]

const CUSTOM_PRESET = {
  id: 'custom' as const,
  label: '自定义策略',
  description: '已在小马配置中单独调整权限'
}

function policyForPreset(ponyId: PonyId, preset: PolicyPreset): PermissionPolicy {
  return {
    ponyId,
    level: preset.level,
    canReadFiles: true,
    canWriteFiles: true,
    canCallMcp: true,
    canRunSkillScript: preset.canRunSkillScript,
    canExportReports: true,
    updatedAt: Date.now()
  }
}

function getPolicy(policies: PermissionPolicy[], pony: Pony): PermissionPolicy {
  return (
    policies.find((p) => p.ponyId === pony.id) ?? {
      ponyId: pony.id,
      level: pony.id === 'file' ? 'approval_required_write' : 'read_only',
      canReadFiles: true,
      canWriteFiles: pony.id === 'file',
      canCallMcp: pony.id === 'file',
      canRunSkillScript: false,
      canExportReports: pony.id === 'file',
      updatedAt: 0
    }
  )
}

function matchesPreset(policy: PermissionPolicy, preset: PolicyPreset): boolean {
  return (
    policy.level === preset.level &&
    policy.canReadFiles &&
    policy.canWriteFiles &&
    policy.canCallMcp &&
    policy.canRunSkillScript === preset.canRunSkillScript &&
    policy.canExportReports
  )
}

export function GovernancePolicyMenu({ disabled }: { disabled: boolean }): React.JSX.Element {
  const ponies = useAppStore((s) => s.ponies)
  const policies = useAppStore((s) => s.permissionPolicies)
  const savePermissionPolicies = useAppStore((s) => s.savePermissionPolicies)
  const pendingCount = useAppStore((s) => s.pendingApprovals.length)
  const openGovernance = useAppStore((s) => s.openGovernance)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<PolicyPresetId | null>(null)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const activePreset = useMemo(() => {
    if (ponies.length === 0) return CUSTOM_PRESET
    const resolved = ponies.map((pony) => getPolicy(policies, pony))
    return PRESETS.find((preset) => resolved.every((policy) => matchesPreset(policy, preset))) ?? CUSTOM_PRESET
  }, [policies, ponies])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const applyPreset = async (preset: PolicyPreset): Promise<void> => {
    if (disabled || saving) return
    setSaving(preset.id)
    setError('')
    try {
      await savePermissionPolicies(ponies.map((pony) => policyForPreset(pony.id, preset)))
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="policy-menu" ref={menuRef}>
      <button
        type="button"
        className="policy-trigger"
        disabled={disabled || saving !== null}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="一键配置安全审批策略"
      >
        <span className="policy-shield" aria-hidden="true" />
        <span>{saving ? '保存中' : activePreset.label}</span>
        {pendingCount > 0 && <b>{pendingCount}</b>}
        <i aria-hidden="true">⌄</i>
      </button>

      {open && (
        <div className="policy-dropdown" role="menu">
          <div className="policy-dropdown-head">
            <strong>如何批准小马操作？</strong>
            <button type="button" onClick={openGovernance}>
              查看治理中心
            </button>
          </div>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="policy-option"
              disabled={saving !== null}
              role="menuitem"
              onClick={() => void applyPreset(preset)}
            >
              <span className="policy-option-icon" aria-hidden="true" />
              <span>
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
              {activePreset.id === preset.id && <em aria-label="当前策略">✓</em>}
            </button>
          ))}
          {activePreset.id === 'custom' && (
            <p className="policy-custom-note">当前为细粒度自定义策略，可在小马卡片中继续调整。</p>
          )}
          {error && <p className="policy-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
