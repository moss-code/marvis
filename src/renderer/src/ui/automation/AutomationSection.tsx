import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AutomationJob, AutomationJobTemplate, Solution } from '@shared/types'
import { showAppAlert, showAppConfirm } from '@/store/dialogStore'
import { AutomationJobCard } from '@/ui/automation/AutomationJobCard'
import { AutomationJobForm } from '@/ui/automation/AutomationJobForm'
import { AutomationTemplateCard } from '@/ui/automation/AutomationTemplateCard'

type JobFilter = 'all' | 'enabled' | 'paused' | 'solution' | 'agent'

interface AutomationSectionProps {
  solutions: Solution[]
}

export function AutomationSection({ solutions }: AutomationSectionProps): React.JSX.Element {
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [templates, setTemplates] = useState<AutomationJobTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AutomationJob | null>(null)
  const [template, setTemplate] = useState<AutomationJobTemplate | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<JobFilter>('all')

  const refresh = useCallback(async (): Promise<void> => {
    const [list, tpls] = await Promise.all([
      window.api.listAutomationJobs(),
      window.api.listAutomationTemplates()
    ])
    setJobs(list)
    setTemplates(tpls)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(timer)
  }, [refresh])

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter((job) => {
      if (filter === 'enabled' && !job.enabled) return false
      if (filter === 'paused' && job.enabled) return false
      if (filter === 'solution' && job.mode !== 'solution') return false
      if (filter === 'agent' && job.mode !== 'agent') return false
      if (!q) return true
      return job.name.toLowerCase().includes(q) || job.prompt.toLowerCase().includes(q)
    })
  }, [jobs, query, filter])

  const openCreate = (): void => {
    setEditing(null)
    setTemplate(null)
    setFormOpen(true)
  }

  const openFromTemplate = (tpl: AutomationJobTemplate): void => {
    setEditing(null)
    setTemplate(tpl)
    setFormOpen(true)
  }

  const onRunNow = async (job: AutomationJob): Promise<void> => {
    const result = await window.api.runAutomationNow(job.id)
    if (result === 'overflow') {
      await showAppAlert('执行队列已满（最多等待 3 个任务），请稍后再试。')
    } else if (result === 'skipped') {
      await showAppAlert('任务未能启动（可能已暂停或不在有效期内）。')
    }
    void refresh()
  }

  const onToggle = async (job: AutomationJob): Promise<void> => {
    await window.api.toggleAutomationJob(job.id, !job.enabled)
    void refresh()
  }

  const onDelete = async (job: AutomationJob): Promise<void> => {
    const ok = await showAppConfirm(`确定删除自动任务「${job.name}」吗？`)
    if (!ok) return
    await window.api.deleteAutomationJob(job.id)
    void refresh()
  }

  return (
    <section className="automation-page">
      <header className="automation-page-header">
        <div className="automation-page-intro">
          <h1>自动任务</h1>
          <p className="automation-page-hint">
            请保持电脑开机且客户端在运行，否则关机、休眠或退出时无法执行自动任务。
          </p>
        </div>
        <div className="automation-page-toolbar">
          <label className="automation-search">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索自动任务"
            />
          </label>
          <select
            className="automation-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as JobFilter)}
            aria-label="筛选任务"
          >
            <option value="all">全部项</option>
            <option value="enabled">已启用</option>
            <option value="paused">已暂停</option>
            <option value="solution">方案任务</option>
            <option value="agent">主 Agent</option>
          </select>
          <button type="button" className="automation-create-btn" onClick={openCreate}>
            + 新建自动任务
          </button>
        </div>
      </header>

      <section className="automation-block">
        <h2 className="automation-block-title">已配置自动任务</h2>
        <div className="automation-job-list">
          {loading ? (
            <p className="automation-empty">加载中…</p>
          ) : filteredJobs.length === 0 ? (
            <p className="automation-empty">
              {jobs.length === 0
                ? '还没有自动任务。点击「新建自动任务」或从下方模板开始。'
                : '没有匹配的任务，请调整搜索或筛选条件。'}
            </p>
          ) : (
            filteredJobs.map((job) => (
              <AutomationJobCard
                key={job.id}
                job={job}
                onEdit={() => {
                  setEditing(job)
                  setTemplate(null)
                  setFormOpen(true)
                }}
                onToggle={() => void onToggle(job)}
                onRunNow={() => void onRunNow(job)}
                onDelete={() => void onDelete(job)}
              />
            ))
          )}
        </div>
      </section>

      <section className="automation-block">
        <h2 className="automation-block-title">从模板开始</h2>
        <div className="automation-template-grid">
          {templates.map((tpl) => (
            <AutomationTemplateCard key={tpl.id} template={tpl} onUse={() => openFromTemplate(tpl)} />
          ))}
        </div>
      </section>

      {formOpen && (
        <AutomationJobForm
          initial={editing}
          template={template}
          solutions={solutions}
          onClose={() => setFormOpen(false)}
          onSaved={() => void refresh()}
        />
      )}
    </section>
  )
}
