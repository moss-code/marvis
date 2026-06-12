import { useEffect, useRef, useState } from 'react'
import type { SkillsShCatalogItem } from '@shared/types'

interface Props {
  onClose(): void
  installedIds: Set<string>
  onInstalled(): Promise<void>
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function hasRegistryApi(): boolean {
  return typeof window.api.searchSkillsSh === 'function' && typeof window.api.installSkillFromSh === 'function'
}

export function SkillsShPanel({ onClose, installedIds, onInstalled }: Props): React.JSX.Element {
  const rootRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SkillsShCatalogItem[]>([])
  const [searchError, setSearchError] = useState('')
  const [pending, setPending] = useState<SkillsShCatalogItem | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState('')
  const apiReady = hasRegistryApi()

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    searchInputRef.current?.focus()
  }, [])

  const search = async (): Promise<void> => {
    const q = query.trim()
    if (!q) return
    if (!apiReady) {
      setSearchError('skills.sh 接口未加载，请完全退出应用后重新 npm run dev 启动')
      return
    }
    setSearching(true)
    setSearchError('')
    setInstallMsg('')
    try {
      const items = await window.api.searchSkillsSh(q, 50)
      setResults(items)
      if (items.length === 0) setSearchError('未找到相关 Skill')
    } catch (err) {
      setResults([])
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  const confirmInstall = async (): Promise<void> => {
    if (!pending || !apiReady) return
    setInstalling(true)
    setInstallMsg('')
    try {
      const res = await window.api.installSkillFromSh({
        source: pending.source,
        skillId: pending.skillId,
        id: pending.id
      })
      setInstallMsg(`已安装「${res.skill.name}」到工作区 skills/${res.skill.id}/`)
      setPending(null)
      await onInstalled()
    } catch (err) {
      setInstallMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  const openUrl = (url: string): void => {
    if (typeof window.api.openUrl === 'function') {
      void window.api.openUrl(url)
    } else {
      window.open(url, '_blank', 'noopener')
    }
  }

  const githubUrl = pending ? `https://github.com/${pending.source}` : ''

  return (
    <section ref={rootRef} className="skills-sh-panel">
      <header className="skills-sh-header">
        <div>
          <strong>从 skills.sh 安装</strong>
          <p className="form-hint">搜索社区 Skill，一键导入小马工作区 skills/ 目录</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          收起
        </button>
      </header>

      <div className="skills-sh-body">
        {!apiReady && (
          <p className="form-hint form-hint-warn">
            skills.sh 安装功能未就绪。请完全关闭应用窗口后重新运行 npm run dev（热更新不会重载 preload）。
          </p>
        )}

        <p className="form-hint">
          数据来自{' '}
          <button type="button" className="link-btn" onClick={() => openUrl('https://skills.sh')}>
            skills.sh
          </button>
          开放目录。安装后请在小马编辑页手动勾选绑定。
        </p>

        <div className="skills-sh-search">
          <input
            ref={searchInputRef}
            className="form-input"
            placeholder="搜索关键词，如 seo、react、grill-me"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search()
            }}
          />
          <button
            className="btn btn-primary"
            disabled={searching || !query.trim() || !apiReady}
            onClick={() => void search()}
          >
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>

        {searchError && <p className="form-hint form-hint-warn">{searchError}</p>}
        {installMsg && (
          <p className={`form-hint ${installMsg.startsWith('已安装') ? '' : 'form-hint-warn'}`}>{installMsg}</p>
        )}

        {results.length > 0 && (
          <ul className="skills-sh-list">
            {results.map((item) => {
              const installed = installedIds.has(item.skillId)
              return (
                <li key={item.id} className="skills-sh-item">
                  <div className="skills-sh-item-main">
                    <strong>{item.name}</strong>
                    <span className="skills-sh-meta">
                      {item.source} · {formatInstalls(item.installs)} 次安装
                      {installed ? ' · 已存在' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={installing || !apiReady}
                    onClick={() => setPending(item)}
                  >
                    安装
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {pending && (
          <div className="skills-sh-confirm">
            <h4 className="serif">确认安装</h4>
            <dl className="skills-sh-confirm-dl">
              <div>
                <dt>Skill</dt>
                <dd>{pending.name}</dd>
              </div>
              <div>
                <dt>来源仓库</dt>
                <dd>
                  <code>{pending.source}</code>
                </dd>
              </div>
              <div>
                <dt>安装命令</dt>
                <dd>
                  <code className="mono">
                    npx skills add {pending.source} --skill {pending.skillId}
                  </code>
                </dd>
              </div>
            </dl>
            <p className="form-hint">安装需要网络，将写入小马工作区，不会修改 Cursor 配置。</p>
            <div className="modal-footer inline">
              <button type="button" className="btn btn-ghost" disabled={installing} onClick={() => setPending(null)}>
                取消
              </button>
              <button type="button" className="btn btn-ghost" disabled={installing} onClick={() => openUrl(githubUrl)}>
                在 GitHub 查看
              </button>
              <button type="button" className="btn btn-primary" disabled={installing} onClick={() => void confirmInstall()}>
                {installing ? '安装中…' : '确认安装'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
