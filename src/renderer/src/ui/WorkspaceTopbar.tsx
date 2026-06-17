import { useState } from 'react'
import type { Solution } from '@shared/types'
import { useAppStore } from '@/store/appStore'
import { AudioDirector } from '@/audio/AudioDirector'

interface WorkspaceTopbarProps {
  userName: string
  activeSolution?: Solution
  accountMenuOpen: boolean
  setAccountMenuOpen(open: boolean): void
  onLogout(): void
  openPanel(kind: 'notifications' | 'profile' | 'tenant-settings' | 'account-security' | 'preferences'): void
}

/** 场景工具条：仅覆盖左侧 Pixi 场景列，右侧 Chat 从工作区顶边起置顶 */
export function WorkspaceTopbar({
  userName,
  activeSolution,
  accountMenuOpen,
  setAccountMenuOpen,
  onLogout,
  openPanel
}: WorkspaceTopbarProps): React.JSX.Element {
  const openHistory = useAppStore((s) => s.openHistory)
  const openGovernance = useAppStore((s) => s.openGovernance)
  const openSettings = useAppStore((s) => s.openSettings)
  const [soundOn, setSoundOn] = useState(() => AudioDirector.get().isEnabled())

  return (
    <header className="workspace-scene-toolbar">
      <div className="workspace-scene-toolbar-leading">
        {activeSolution ? (
          <span className="solution-title-badge" title={activeSolution.desc}>
            {activeSolution.title}
          </span>
        ) : (
          <span className="workspace-scene-toolbar-label">任务工作台</span>
        )}
      </div>
      <div className="workspace-topbar-tools">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openHistory()}>
          任务历史
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openGovernance()}>
          治理中心
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSettings()}>
          设置
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title={soundOn ? '关闭音效' : '开启音效'}
          onClick={() => setSoundOn(AudioDirector.get().toggle())}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        {import.meta.env.DEV && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const fn = (window as unknown as Record<string, unknown>).__mockRun
              if (typeof fn === 'function') void (fn as () => Promise<void>)()
            }}
          >
            动画演示
          </button>
        )}
      </div>
      <div className="workspace-scene-toolbar-actions">
        <button className="notice-button" aria-label="通知" title="通知" onClick={() => openPanel('notifications')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </svg>
          <i />
        </button>
        <div className="account-menu-wrap">
          <button
            className={accountMenuOpen ? 'user-menu active' : 'user-menu'}
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            aria-expanded={accountMenuOpen}
          >
            <span>{userName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{userName}</strong>
              <small>企业管理员</small>
            </div>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 8 4 4 4-4" />
            </svg>
          </button>
          {accountMenuOpen && (
            <div className="account-dropdown">
              <div className="account-dropdown-head">
                <span>{userName.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{userName}</strong>
                  <small>demo@wingai.cn</small>
                </div>
              </div>
              <div className="account-dropdown-section">
                <button onClick={() => openPanel('profile')}>
                  <i>人</i>
                  <span>
                    <strong>个人资料</strong>
                    <small>姓名、联系方式与头像</small>
                  </span>
                </button>
                <button onClick={() => openPanel('tenant-settings')}>
                  <i>企</i>
                  <span>
                    <strong>企业信息</strong>
                    <small>租户资料与成员权限</small>
                  </span>
                </button>
                <button onClick={() => openPanel('account-security')}>
                  <i>锁</i>
                  <span>
                    <strong>账号安全</strong>
                    <small>密码、登录与身份认证</small>
                  </span>
                </button>
                <button onClick={() => openPanel('preferences')}>
                  <i>偏</i>
                  <span>
                    <strong>偏好设置</strong>
                    <small>通知、语言与界面体验</small>
                  </span>
                </button>
              </div>
              <div className="account-dropdown-footer">
                <button onClick={onLogout}>
                  <i>退</i>
                  <span>退出当前账号</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
