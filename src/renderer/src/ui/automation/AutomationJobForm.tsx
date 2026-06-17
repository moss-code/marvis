import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  AutomationJob,
  AutomationJobDraft,
  AutomationJobTemplate,
  AutomationSchedule,
  Solution
} from '@shared/types'
import { detectDispatchPrompt } from '@shared/automationDisplay'
import { useAppStore } from '@/store/appStore'
import { showAppAlert, showAppConfirm } from '@/store/dialogStore'
import { SlashBindMenu } from '@/ui/ComposerSessionBindings'
import { useJobSlashBind } from '@/ui/automation/useJobSlashBind'

interface AutomationJobFormProps {
  initial?: AutomationJob | null
  template?: AutomationJobTemplate | null
  solutions: Solution[]
  onClose(): void
  onSaved(job: AutomationJob): void
}

function JobBindingChips({
  skillIds,
  mcpServerIds,
  onRemoveSkill,
  onRemoveMcp
}: {
  skillIds: string[]
  mcpServerIds: string[]
  onRemoveSkill(id: string): void
  onRemoveMcp(id: string): void
}): React.JSX.Element | null {
  const skills = useAppStore((s) => s.skills)
  const mcpServers = useAppStore((s) => s.mcpServers)
  if (skillIds.length === 0 && mcpServerIds.length === 0) return null
  return (
    <div className="session-bind-chips">
      {skillIds.map((id) => {
        const skill = skills.find((s) => s.id === id)
        return (
          <span key={id} className="chip chip-active chip-skill">
            Skill · {skill?.name ?? id}
            <button type="button" className="chip-remove" onClick={() => onRemoveSkill(id)}>×</button>
          </span>
        )
      })}
      {mcpServerIds.map((id) => {
        const server = mcpServers.find((m) => m.id === id)
        return (
          <span key={id} className="chip chip-active chip-mcp">
            MCP · {server?.name ?? id}
            <button type="button" className="chip-remove" onClick={() => onRemoveMcp(id)}>×</button>
          </span>
        )
      })}
    </div>
  )
}

export function AutomationJobForm({
  initial,
  template,
  solutions,
  onClose,
  onSaved
}: AutomationJobFormProps): React.JSX.Element {
  const tplDraft = template?.draft
  const [mode, setMode] = useState<'solution' | 'agent'>(initial?.mode ?? tplDraft?.mode ?? 'solution')
  const [name, setName] = useState(initial?.name ?? template?.name ?? '')
  const [solutionId, setSolutionId] = useState(initial?.solutionId ?? tplDraft?.solutionId ?? solutions[0]?.id ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? tplDraft?.prompt ?? '')
  const [skillIds, setSkillIds] = useState<string[]>(initial?.skillIds ?? tplDraft?.skillIds ?? [])
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(initial?.mcpServerIds ?? tplDraft?.mcpServerIds ?? [])
  const [scheduleKind, setScheduleKind] = useState<'periodic' | 'interval' | 'once'>(
    initial?.schedule.kind ?? tplDraft?.schedule.kind ?? 'periodic'
  )
  const [periodicUnit, setPeriodicUnit] = useState<'daily' | 'weekly' | 'monthly'>(
    initial?.schedule.periodicUnit ?? tplDraft?.schedule.periodicUnit ?? 'daily'
  )
  const [hour, setHour] = useState(initial?.schedule.hour ?? tplDraft?.schedule.hour ?? 9)
  const [minute, setMinute] = useState(initial?.schedule.minute ?? tplDraft?.schedule.minute ?? 0)
  const [weekday, setWeekday] = useState(initial?.schedule.weekday ?? tplDraft?.schedule.weekday ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(initial?.schedule.dayOfMonth ?? tplDraft?.schedule.dayOfMonth ?? 1)
  const [intervalMinutes, setIntervalMinutes] = useState(initial?.schedule.intervalMinutes ?? tplDraft?.schedule.intervalMinutes ?? 1440)
  const [runAtLocal, setRunAtLocal] = useState(() => {
    const t = initial?.schedule.runAt ?? tplDraft?.schedule.runAt
    if (!t) return ''
    const d = new Date(t)
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [ignoreRisk, setIgnoreRisk] = useState(initial?.ignoreRisk ?? tplDraft?.ignoreRisk ?? false)
  const [notifyInApp, setNotifyInApp] = useState(initial?.notify.inApp ?? true)
  const [notifyDesktop, setNotifyDesktop] = useState(initial?.notify.desktop ?? true)
  const [notifyWechat, setNotifyWechat] = useState(initial?.notify.wechat ?? false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [existingAttachments, setExistingAttachments] = useState(initial?.attachments ?? [])
  const [saving, setSaving] = useState(false)

  const promptRef = useRef<HTMLTextAreaElement>(null)
  const slash = useJobSlashBind(
    prompt,
    setPrompt,
    (id) => setSkillIds((ids) => (ids.includes(id) ? ids : [...ids, id])),
    (id) => setMcpServerIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
  )

  useEffect(() => {
    void useAppStore.getState().refreshSkills()
    void useAppStore.getState().refreshMcp()
  }, [])

  useEffect(() => {
    if (mode !== 'solution' || !solutionId) return
    const sol = solutions.find((s) => s.id === solutionId)
    if (sol && !initial && !template) setPrompt(sol.defaultTaskTemplate)
  }, [mode, solutionId, solutions, initial, template])

  const buildSchedule = (): AutomationSchedule => {
    const base: AutomationSchedule = {
      kind: scheduleKind,
      timezone: 'Asia/Shanghai',
      validFrom: validFrom ? new Date(validFrom).getTime() : undefined,
      validUntil: validUntil ? new Date(validUntil).getTime() : undefined
    }
    if (scheduleKind === 'periodic') {
      return { ...base, periodicUnit, hour, minute, weekday, dayOfMonth }
    }
    if (scheduleKind === 'interval') {
      return { ...base, intervalMinutes }
    }
    return { ...base, runAt: runAtLocal ? new Date(runAtLocal).getTime() : Date.now() + 3600_000 }
  }

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      await showAppAlert('请填写任务名称')
      return
    }
    if (!prompt.trim()) {
      await showAppAlert('请填写提示词')
      return
    }
    if (mode === 'solution' && !solutionId) {
      await showAppAlert('请选择解决方案')
      return
    }
    if (mode === 'agent' && detectDispatchPrompt(prompt)) {
      const ok = await showAppConfirm(
        '检测到提示词涉及派单或多小马协作。建议改用「方案任务」模式。仍要保存为主 Agent 任务吗？'
      )
      if (!ok) return
    }

    const draft: AutomationJobDraft = {
      id: initial?.id,
      name: name.trim(),
      enabled: initial?.enabled ?? true,
      mode,
      solutionId: mode === 'solution' ? solutionId : undefined,
      prompt: prompt.trim(),
      skillIds,
      mcpServerIds,
      schedule: buildSchedule(),
      ignoreRisk,
      notify: {
        inApp: notifyInApp,
        desktop: notifyDesktop,
        wechat: notifyWechat,
        onSuccess: true,
        onFailure: true
      }
    }

    const attachmentSources = pendingFiles.map((f) => ({
      sourcePath: window.api.getPathForFile(f),
      fileName: f.name
    }))

    setSaving(true)
    try {
      const job = await window.api.saveAutomationJob(
        draft,
        attachmentSources.length ? attachmentSources : undefined
      )
      onSaved(job)
      onClose()
    } catch (err) {
      await showAppAlert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const onFilePick = (files: FileList | null): void => {
    if (!files?.length) return
    setPendingFiles((prev) => [...prev, ...Array.from(files)])
    setExistingAttachments([])
  }

  return createPortal(
    <div
      className="automation-form-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="automation-form-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="automation-form-header">
          <h2 id="automation-form-title">{initial ? '编辑自动化任务' : '添加自动化任务'}</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="automation-form-scroll">
        <div className="automation-mode-tabs">
          <button type="button" className={mode === 'solution' ? 'active' : ''} onClick={() => setMode('solution')}>
            方案任务
          </button>
          <button type="button" className={mode === 'agent' ? 'active' : ''} onClick={() => setMode('agent')}>
            主 Agent 任务
          </button>
        </div>

        <label className="automation-field">
          <span>名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：每日经营分析" />
        </label>

        {mode === 'solution' && (
          <label className="automation-field">
            <span>解决方案</span>
            <select value={solutionId} onChange={(e) => setSolutionId(e.target.value)}>
              {solutions.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </label>
        )}

        <label className="automation-field">
          <span>提示词</span>
          <div className="automation-composer">
            <JobBindingChips
              skillIds={mode === 'agent' ? skillIds : []}
              mcpServerIds={mode === 'agent' ? mcpServerIds : []}
              onRemoveSkill={(id) => setSkillIds((ids) => ids.filter((x) => x !== id))}
              onRemoveMcp={(id) => setMcpServerIds((ids) => ids.filter((x) => x !== id))}
            />
            <textarea
              ref={promptRef}
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (mode === 'agent' && slash.onKeyDown(e)) return
              }}
              placeholder={mode === 'agent' ? '输入任务说明，输入 / 绑定 Skill 或 MCP' : '描述要执行的任务'}
            />
            {mode === 'agent' && (
              <SlashBindMenu slash={slash} disabled={false} anchorRef={promptRef} />
            )}
          </div>
        </label>

        <div className="automation-field">
          <span>数据文件（可选）</span>
          <div className="automation-file-row">
            <label className="automation-file-btn">
              选择文件
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                multiple
                hidden
                onChange={(e) => onFilePick(e.target.files)}
              />
            </label>
            <div className="automation-file-chips">
              {existingAttachments.map((a) => (
                <span key={a.storedPath} className="chip">{a.fileName}</span>
              ))}
              {pendingFiles.map((f) => (
                <span key={f.name + f.size} className="chip chip-new">{f.name}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="automation-field">
          <span>执行频率</span>
          <div className="automation-freq-tabs">
            <button type="button" className={scheduleKind === 'periodic' ? 'active' : ''} onClick={() => setScheduleKind('periodic')}>周期</button>
            <button type="button" className={scheduleKind === 'interval' ? 'active' : ''} onClick={() => setScheduleKind('interval')}>按间隔</button>
            <button type="button" className={scheduleKind === 'once' ? 'active' : ''} onClick={() => setScheduleKind('once')}>单次</button>
          </div>
          {scheduleKind === 'periodic' && (
            <div className="automation-freq-detail">
              <select value={periodicUnit} onChange={(e) => setPeriodicUnit(e.target.value as typeof periodicUnit)}>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
              {periodicUnit === 'weekly' && (
                <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                  {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              )}
              {periodicUnit === 'monthly' && (
                <input type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} />
              )}
              <input type="time" value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`} onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                setHour(h)
                setMinute(m)
              }} />
            </div>
          )}
          {scheduleKind === 'interval' && (
            <div className="automation-freq-detail">
              <input type="number" min={5} value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} />
              <span>分钟</span>
            </div>
          )}
          {scheduleKind === 'once' && (
            <input type="datetime-local" value={runAtLocal} onChange={(e) => setRunAtLocal(e.target.value)} />
          )}
        </div>

        <div className="automation-field-row">
          <label className="automation-field">
            <span>生效开始（可选）</span>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </label>
          <label className="automation-field">
            <span>生效结束（可选）</span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </div>

        <label className="automation-switch">
          <input type="checkbox" checked={ignoreRisk} onChange={(e) => setIgnoreRisk(e.target.checked)} />
          <span><strong>无视风险状态</strong><small>无人值守时自动放行高风险审批（会写入审计日志）</small></span>
        </label>

        <fieldset className="automation-notify">
          <legend>执行后通知</legend>
          <label><input type="checkbox" checked={notifyInApp} onChange={(e) => setNotifyInApp(e.target.checked)} /> 应用内通知</label>
          <label><input type="checkbox" checked={notifyDesktop} onChange={(e) => setNotifyDesktop(e.target.checked)} /> 桌面通知</label>
          <label className="muted"><input type="checkbox" checked={notifyWechat} onChange={(e) => setNotifyWechat(e.target.checked)} disabled /> 微信推送（试点）</label>
        </fieldset>
        </div>

        <footer className="automation-form-footer">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? '保存中…' : initial ? '保存' : '添加'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}