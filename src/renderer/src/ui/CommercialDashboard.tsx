import { useEffect, useMemo, useState } from 'react'
import type { ApprovalRequest, PaletteId, Pony, Solution, SolutionDraft } from '@shared/types'
import { useAppStore } from '@/store/appStore'
import { showAppAlert, showAppConfirm } from '@/store/dialogStore'
import { OFFICE_CAPACITY } from '@shared/office'
import { PonyCard } from '@/ui/PonyCard'
import { HireForm } from '@/ui/HireForm'
import { setAppearance, useAppearance, type Appearance } from '@/appearance'
import { AgentHomeContent } from '@/ui/HomePage'
import { AutomationSection } from '@/ui/automation/AutomationSection'
import { NotificationsDrawerContent } from '@/ui/NotificationsDrawer'
import { WorkspaceEmbedded } from '@/ui/WorkspaceEmbedded'
import type { UserPreferences } from '@shared/types'

type Section = 'home' | 'workspace' | 'overview' | 'solutions' | 'employees' | 'usage' | 'security' | 'automation'
type ConfigPanel = 'notifications' | 'support' | 'monitor' | 'resource' | 'solution-create' | 'consulting' | 'bill' | 'security-policy' | 'order' | 'profile' | 'tenant-settings' | 'account-security' | 'preferences'

interface CommercialDashboardProps {
  userName: string
  openPreferences?: boolean
  onPreferencesOpened?(): void
  onLogout(): void
}

const sectionLabels: Record<Section, string> = {
  home: '智能首页',
  workspace: '任务工作台',
  overview: '运营总览',
  solutions: '解决方案',
  employees: '数字员工',
  usage: '用量与计费',
  security: '安全与审计',
  automation: '自动化'
}

const workspaceNavItems: { id: Section; label: string; icon: string }[] = [
  { id: 'home', label: '智能首页', icon: '⌂' },
  { id: 'automation', label: '自动化', icon: '◷' },
  { id: 'workspace', label: '任务工作台', icon: '▹' }
]

const operationNavItems: { id: Section; label: string; icon: string; action?: 'monitor' }[] = [
  { id: 'overview', label: '运营总览', icon: '◫' },
  { id: 'solutions', label: '解决方案', icon: '◇' },
  { id: 'employees', label: '数字员工', icon: '◎' },
  { id: 'usage', label: '用量与计费', icon: '▥' },
  { id: 'security', label: '安全与审计', icon: '⌾' },
  { id: 'home', label: '运行监控', icon: '⌁', action: 'monitor' }
]

const employeePalette: Record<PaletteId, string> = {
  linen: '#eee1c9',
  camel: '#e6d7c1',
  ochre: '#ead2bf',
  sage: '#dfe3d2',
  terracotta: '#edd8d0'
}

export function CommercialDashboard({ userName, openPreferences, onPreferencesOpened, onLogout }: CommercialDashboardProps): React.JSX.Element {
  const init = useAppStore((s) => s.init)
  const solutions = useAppStore((s) => s.solutions)
  const ponies = useAppStore((s) => s.ponies)
  const pendingApprovals = useAppStore((s) => s.pendingApprovals)
  const openPonyId = useAppStore((s) => s.openPonyId)
  const hiringOpen = useAppStore((s) => s.hiringOpen)
  const closePony = useAppStore((s) => s.closePony)
  const closeHiring = useAppStore((s) => s.closeHiring)
  const openPony = useAppStore((s) => s.openPony)
  const setActiveSolution = useAppStore((s) => s.setActiveSolution)
  const [section, setSection] = useState<Section>('home')
  const [panel, setPanel] = useState<ConfigPanel | null>(null)
  const [panelContext, setPanelContext] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const securityReminderCount = pendingApprovals.length
  const activeSolutionId = useAppStore((s) => s.activeSolutionId)
  const openPanel = (next: ConfigPanel, context = ''): void => { setAccountMenuOpen(false); setPanelContext(context); setPanel(next) }
  const selectedPony = ponies.find((pony) => pony.id === openPonyId)
  const activeSolution = solutions.find((s) => s.id === activeSolutionId)
  const enterWorkspace = (solutionId?: string): void => {
    if (solutionId) {
      const solution = solutions.find((s) => s.id === solutionId)
      setActiveSolution(solutionId, solution?.defaultTaskTemplate ?? null)
    }
    setSection('workspace')
  }

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!openPreferences) return
    setPanel('preferences')
    onPreferencesOpened?.()
  }, [openPreferences, onPreferencesOpened])

  return (
    <main className="commercial-shell">
      <aside className="commercial-sidebar">
        <div className="commercial-logo"><span>翼</span><div><strong>翼智小马</strong><small>解决方案供应平台</small></div></div>
        <nav>
          <p>工作空间</p>
          {workspaceNavItems.map((item) => (
            <button
              key={item.label}
              className={section === item.id ? 'active' : ''}
              onClick={() => setSection(item.id)}
            >
              <i>{item.icon}</i>{item.label}
            </button>
          ))}
          <p>运行中心</p>
          {operationNavItems.map((item) => (
            <button
              key={item.label}
              className={!item.action && section === item.id ? 'active' : ''}
              onClick={() => {
                if (item.action === 'monitor') openPanel('monitor')
                else setSection(item.id)
              }}
            >
              <i>{item.icon}</i>{item.label}
              {item.id === 'security' && securityReminderCount > 0 && <em>{securityReminderCount}</em>}
            </button>
          ))}
        </nav>
        <div className="tenant-card">
          <span>当前租户</span><strong>华东通信集团</strong><small>企业专业版 · 试点授权</small>
          <div><i style={{ width: '72%' }} /></div><small>本月资源额度 72%</small>
        </div>
        <button className="sidebar-support" onClick={() => openPanel('support')}>服务支持 <span>→</span></button>
      </aside>

      <section className={`commercial-main${section === 'workspace' ? ' commercial-main-workspace' : ''}`}>
        {section === 'workspace' ? (
          <WorkspaceEmbedded
            userName={userName}
            activeSolution={activeSolution}
            accountMenuOpen={accountMenuOpen}
            setAccountMenuOpen={setAccountMenuOpen}
            onLogout={onLogout}
            openPanel={openPanel}
          />
        ) : (
          <>
        <header className="commercial-topbar">
          <div><span className="crumb">企业控制台</span><b>/</b><strong>{sectionLabels[section]}</strong></div>
          <div className="topbar-actions">
            <button className="notice-button" aria-label="通知" title="通知" onClick={() => openPanel('notifications')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              <i />
            </button>
            <div className="account-menu-wrap">
              <button className={accountMenuOpen ? 'user-menu active' : 'user-menu'} onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>
                <span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>企业管理员</small></div><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
              </button>
              {accountMenuOpen && <div className="account-dropdown">
                <div className="account-dropdown-head"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>demo@wingai.cn</small></div></div>
                <div className="account-dropdown-section"><button onClick={() => openPanel('profile')}><i>人</i><span><strong>个人资料</strong><small>姓名、联系方式与头像</small></span></button><button onClick={() => openPanel('tenant-settings')}><i>企</i><span><strong>企业信息</strong><small>租户资料与成员权限</small></span></button><button onClick={() => openPanel('account-security')}><i>锁</i><span><strong>账号安全</strong><small>密码、登录与身份认证</small></span></button><button onClick={() => openPanel('preferences')}><i>偏</i><span><strong>偏好设置</strong><small>通知、语言与界面体验</small></span></button></div>
                <div className="account-dropdown-footer"><button onClick={onLogout}><i>退</i><span>退出当前账号</span></button></div>
              </div>}
            </div>
          </div>
        </header>

        <div className={`commercial-content${section === 'home' ? ' commercial-content-home' : ''}`}>
          {section === 'home' && <AgentHomeContent userName={userName} onOpenWorkspace={() => enterWorkspace()} />}
          {section === 'overview' && <Overview solutions={solutions} onOpenWorkspace={() => enterWorkspace()} onViewSolutions={() => setSection('solutions')} onOpenPanel={openPanel} />}
          {section === 'solutions' && <Solutions solutions={solutions} onEnterWorkspace={enterWorkspace} onOpenPanel={openPanel} />}
          {section === 'employees' && <Employees />}
          {section === 'usage' && <Usage onOpenPanel={openPanel} />}
          {section === 'security' && <SecurityPanel onOpenPanel={openPanel} />}
          {section === 'automation' && <AutomationSection solutions={solutions} />}
        </div>
          </>
        )}
      </section>
      {panel && <ConfigDrawer kind={panel} context={panelContext} onClose={() => setPanel(null)} onOpenWorkspace={() => enterWorkspace()} />}
      {selectedPony && <PonyCard pony={selectedPony} onClose={closePony} />}
      {hiringOpen && (
        <HireForm
          onClose={closeHiring}
          onHired={(ponyId) => {
            const pony = useAppStore.getState().ponies.find((p) => p.id === ponyId)
            void showAppAlert(
              pony
                ? `「${pony.name}」已接入数字员工档案。可在本页编辑，或通过「解决方案」配置将其编入办公室（每间办公室最多 12 名）。`
                : '数字员工已接入档案。'
            )
            openPony(ponyId)
          }}
        />
      )}
    </main>
  )
}

function Overview({ solutions, onOpenWorkspace, onViewSolutions, onOpenPanel }: { solutions: Solution[]; onOpenWorkspace(): void; onViewSolutions(): void; onOpenPanel(kind: ConfigPanel, context?: string): void }): React.JSX.Element {
  return <>
    <div className="dashboard-welcome">
      <div><span className="eyebrow">星期四 · 6 月 11 日</span><h1>上午好，欢迎回到翼智小马</h1><p>数字员工团队运行稳定，今日已自动完成 <strong>126</strong> 项企业任务。</p></div>
      <button className="commercial-primary" onClick={onOpenWorkspace}>+ 发起智能任务</button>
    </div>
    <section className="metric-grid">
      <Metric label="今日任务" value="126" delta="↑ 18.2%" note="较昨日" accent="gold" />
      <Metric label="任务成功率" value="98.7%" delta="↑ 1.4%" note="近 7 日" accent="green" />
      <Metric label="数字员工在线" value="12 / 12" delta="全部在线" note="运行健康" accent="blue" />
      <Metric label="本月预估节省" value="¥ 86,420" delta="312 h" note="人工工时" accent="violet" />
    </section>
    <div className="dashboard-columns">
      <section className="commercial-card solution-overview">
        <div className="card-heading"><div><h2>解决方案运行概览</h2><p>已授权方案的实时业务表现</p></div><button onClick={onViewSolutions}>查看全部 →</button></div>
        <div className="solution-list">
          {solutions.map((item) => <div className="solution-row" key={item.id}><span className={`solution-icon ${item.tone}`}>{item.title.slice(0, 1)}</span><div><strong>{item.title}</strong><small>{item.desc}</small></div><div className="solution-stat"><strong>{item.demoStats.runs}</strong><small>累计任务</small></div><div className="solution-stat"><strong>{item.demoStats.success}</strong><small>成功率</small></div><span className="status-pill">运行中</span></div>)}
        </div>
      </section>
      <section className="commercial-card resource-card">
        <div className="card-heading"><div><h2>本月资源用量</h2><p>更新于 10:32</p></div><button onClick={() => onOpenPanel('resource')}>详情</button></div>
        <Resource label="模型 Token" value="7.26M / 10M" percent={73} color="gold" />
        <Resource label="任务执行次数" value="4,581 / 8,000" percent={57} color="blue" />
        <Resource label="MCP 工具调用" value="12,430 / 20,000" percent={62} color="green" />
        <div className="cost-box"><span>本月费用预估</span><strong>¥ 12,680.40</strong><small>含平台授权、模型与云资源</small></div>
      </section>
    </div>
    <section className="commercial-card activity-card">
      <div className="card-heading"><div><h2>实时运行动态</h2><p>关键任务与风险事件</p></div><span className="live-label"><i /> 实时</span></div>
      <div className="activity-table"><div className="table-head"><span>任务</span><span>解决方案</span><span>执行员工</span><span>状态</span><span>耗时</span></div>
        <Activity task="6月营业厅经营日报生成" solution="经营分析" employee="数据分析马" status="已完成" time="2m 14s" />
        <Activity task="校园赠送金调账工单稽核" solution="调账稽核" employee="流程稽核马" status="执行中" time="48s" running />
        <Activity task="高价值客户营销名单筛选" solution="智能营销" employee="客户画像马" status="待确认" time="1m 26s" warning />
      </div>
    </section>
  </>
}

function Metric({ label, value, delta, note, accent }: { label: string; value: string; delta: string; note: string; accent: string }): React.JSX.Element {
  return <article className={`metric-card ${accent}`}><div><span>{label}</span><i>↗</i></div><strong>{value}</strong><p><b>{delta}</b> {note}</p></article>
}

function Resource({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }): React.JSX.Element {
  return <div className="resource-item"><div><span>{label}</span><strong>{value}</strong></div><div className="resource-track"><i className={color} style={{ width: `${percent}%` }} /></div></div>
}

function Activity({ task, solution, employee, status, time, running, warning }: { task: string; solution: string; employee: string; status: string; time: string; running?: boolean; warning?: boolean }): React.JSX.Element {
  return <div className="table-row"><strong>{task}</strong><span>{solution}</span><span>{employee}</span><span className={`activity-status ${running ? 'running' : warning ? 'warning' : ''}`}>{status}</span><span>{time}</span></div>
}

function Solutions({ solutions, onEnterWorkspace, onOpenPanel }: { solutions: Solution[]; onEnterWorkspace(solutionId: string): void; onOpenPanel(kind: ConfigPanel, context?: string): void }): React.JSX.Element {
  const activeSolutionId = useAppStore((s) => s.activeSolutionId)

  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">方案市场</span>
          <h1>企业解决方案</h1>
          <p>将数字员工、工具与业务流程打包为可复制的企业能力。</p>
        </div>
        <button className="commercial-primary" onClick={() => onOpenPanel('solution-create')}>
          + 创建解决方案
        </button>
      </div>
      <div className="solution-market-grid">
        {solutions.map((item) => (
          <article
            className={`market-card${item.id === activeSolutionId ? ' market-card-active' : ''}`}
            key={item.id}
          >
            <div className={`market-cover ${item.tone}`}>
              {item.id === activeSolutionId && <b className="market-enabled-badge">已启用</b>}
              <span>{item.code}</span>
              <strong>{item.title.slice(0, 2)}</strong>
              <i>{item.tag}</i>
            </div>
            <div className="market-body">
              <h2>{item.title}</h2>
              <p>{item.desc}</p>
              <div className="market-meta">
                <span>{item.ponyIds.length} 名数字员工</span>
                <span>{item.demoStats.success} 成功率</span>
              </div>
              <div className="market-actions">
                <button onClick={() => onOpenPanel('solution-create', item.id)}>配置方案</button>
                <button onClick={() => onEnterWorkspace(item.id)}>进入工作台 →</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function Employees(): React.JSX.Element {
  const ponies = useAppStore((s) => s.ponies)
  const running = useAppStore((s) => s.running)
  const openPony = useAppStore((s) => s.openPony)
  const openHiring = useAppStore((s) => s.openHiring)

  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">数字员工</span>
          <h1>数字员工中心</h1>
          <p>
            与任务工作台共用同一份数字员工档案，修改后实时同步。档案数量不限；每间方案办公室最多同时入驻
            12 名，请通过「解决方案」配置编制。
          </p>
        </div>
        <button
          className="commercial-primary"
          onClick={() => openHiring()}
          disabled={running}
          title={running ? '任务执行中，请稍后再接入' : '接入自定义数字员工档案（不限数量）'}
        >
          + 接入数字员工
        </button>
      </div>
      {ponies.length === 0 ? (
        <div className="employee-empty">正在读取任务工作台的数字员工信息…</div>
      ) : (
        <div className="employee-grid">
          {ponies.map((pony) => (
            <EmployeeCard
              key={pony.id}
              pony={pony}
              running={running}
              onOpen={() => openPony(pony.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function EmployeeCard({ pony, running, onOpen }: { pony: Pony; running: boolean; onOpen(): void }): React.JSX.Element {
  return <article className="employee-card"><div className="employee-avatar" style={{ background: employeePalette[pony.skin.palette] }}>{pony.name.slice(0, 1)}</div><span className={`employee-online ${running ? 'busy' : ''}`}>{running ? '任务执行中' : '在线'}</span><h2>{pony.name}</h2><p>{pony.role}</p><div><span>技能 <strong>{pony.skills.length}</strong></span><span>MCP <strong>{pony.mcpServers.length}</strong></span></div><button onClick={onOpen}>查看并编辑档案</button></article>
}

type BillingCycle = 'usage' | 'month' | 'quarter' | 'year'

const billingPlans: Record<BillingCycle, {
  label: string
  badge?: string
  price: string
  unit: string
  original?: string
  summary: string
  audience: string
  features: string[]
  overage: string
}> = {
  usage: {
    label: '按量计费', price: '¥ 0', unit: '基础月费', summary: '用多少付多少，灵活控制企业 AI 成本。', audience: '适合体验、临时项目和任务量波动较大的团队',
    features: ['任务执行 ¥1.20 / 次', '模型 Token ¥18 / 百万', 'MCP 调用 ¥0.03 / 次', '包含 3 名数字员工', '基础运行日志保留 30 天', '标准工单服务'], overage: '无固定配额，资源按实际使用量出账'
  },
  month: {
    label: '包月套餐', price: '¥ 2,980', unit: '/ 月', summary: '稳定月度额度，满足部门级日常使用。', audience: '适合单一业务部门和稳定运行的解决方案',
    features: ['每月 3,000 次任务', '每月 5M 模型 Token', '每月 10,000 次 MCP 调用', '包含 8 名数字员工', '3 个解决方案授权', '运行日志保留 180 天'], overage: '超额任务 ¥0.88 / 次，Token ¥14 / 百万'
  },
  quarter: {
    label: '包季套餐', badge: '推荐', price: '¥ 7,980', original: '¥ 8,940', unit: '/ 季', summary: '季度统筹资源，兼顾成本与业务扩展。', audience: '适合多部门试点和多个解决方案协同运行',
    features: ['每季 12,000 次任务', '每季 20M 模型 Token', '每季 40,000 次 MCP 调用', '包含 15 名数字员工', '8 个解决方案授权', '专属运营顾问与季度报告'], overage: '超额任务 ¥0.72 / 次，Token ¥12 / 百万'
  },
  year: {
    label: '包年套餐', badge: '最优惠', price: '¥ 26,800', original: '¥ 35,760', unit: '/ 年', summary: '企业级年度授权，支持规模化推广。', audience: '适合集团客户、正式生产和跨部门规模使用',
    features: ['每年 60,000 次任务', '每年 100M 模型 Token', '每年 200,000 次 MCP 调用', '数字员工数量不限', '解决方案授权不限', '7×24 服务与年度安全审计'], overage: '超额任务 ¥0.58 / 次，Token ¥9.8 / 百万'
  }
}

function Usage({ onOpenPanel }: { onOpenPanel(kind: ConfigPanel, context?: string): void }): React.JSX.Element {
  const [cycle, setCycle] = useState<BillingCycle>('quarter')
  const [selected, setSelected] = useState<BillingCycle | null>(null)
  const plan = billingPlans[cycle]

  return <>
    <div className="section-title"><div><span className="eyebrow">资源与计费</span><h1>套餐与计费</h1><p>根据业务规模选择计费方式，Token、任务和工具调用统一计量。</p></div><button className="commercial-secondary" onClick={() => onOpenPanel('consulting')}>企业定制咨询</button></div>
    <section className="billing-current">
      <div><span className="billing-current-icon">企</span><div><small>当前套餐</small><strong>企业专业版 · 包年</strong><p>授权有效期至 2027-05-31，剩余 354 天</p></div></div>
      <div className="billing-current-usage"><span>本周期额度使用</span><strong>72%</strong><i><b style={{ width: '72%' }} /></i></div>
      <button className="commercial-secondary" onClick={() => onOpenPanel('bill')}>查看账单</button>
    </section>

    <div className="billing-cycle-tabs">
      {(Object.keys(billingPlans) as BillingCycle[]).map((id) => <button key={id} className={cycle === id ? 'active' : ''} onClick={() => { setCycle(id); setSelected(null) }}><span>{billingPlans[id].label}</span>{billingPlans[id].badge && <em>{billingPlans[id].badge}</em>}</button>)}
    </div>

    <section className="plan-detail commercial-card">
      <div className="plan-summary">
        <div className="plan-heading"><span>{plan.label}</span>{plan.badge && <em>{plan.badge}</em>}</div>
        <p>{plan.summary}</p>
        <div className="plan-price">{plan.original && <del>{plan.original}</del>}<strong>{plan.price}</strong><span>{plan.unit}</span></div>
        <small>{plan.audience}</small>
        <button className="commercial-primary" onClick={() => setSelected(cycle)}>{cycle === 'usage' ? '开通按量计费' : '选择此套餐'}</button>
        <p className="plan-contract">支持对公付款与电子合同 · 价格为含税参考价</p>
      </div>
      <div className="plan-benefits">
        <div className="plan-benefits-heading"><h2>套餐权益</h2><span>所有资源均支持用量监控与超额预警</span></div>
        <div className="benefit-grid">{plan.features.map((feature) => <div key={feature}><i>✓</i><span>{feature}</span></div>)}</div>
        <div className="overage-note"><span>超额计费规则</span><strong>{plan.overage}</strong></div>
      </div>
    </section>

    <section className="plan-comparison commercial-card">
      <div className="card-heading"><div><h2>套餐对比</h2><p>选择适合当前业务阶段的资源组合</p></div></div>
      <div className="comparison-table">
        <div className="comparison-row comparison-head"><span>权益项目</span><span>按量计费</span><span>包月</span><span className="recommended">包季</span><span>包年</span></div>
        <CompareRow name="包含任务量" values={['按实际用量','3,000 次/月','12,000 次/季','60,000 次/年']} />
        <CompareRow name="模型 Token" values={['按实际用量','5M/月','20M/季','100M/年']} />
        <CompareRow name="数字员工" values={['3 名','8 名','15 名','不限']} />
        <CompareRow name="解决方案授权" values={['1 个','3 个','8 个','不限']} />
        <CompareRow name="日志保留" values={['30 天','180 天','1 年','3 年']} />
        <CompareRow name="服务支持" values={['标准工单','5×8 工单','专属顾问','7×24 专属服务']} />
      </div>
    </section>

    {selected && <div className="plan-order-bar"><div><span>已选择</span><strong>{billingPlans[selected].label}</strong><small>{billingPlans[selected].price} {billingPlans[selected].unit}</small></div><div><button className="commercial-secondary" onClick={() => setSelected(null)}>取消</button><button className="commercial-primary" onClick={() => { onOpenPanel('order', billingPlans[selected].label); setSelected(null) }}>确认套餐并生成订单</button></div></div>}
  </>
}

function CompareRow({ name, values }: { name: string; values: string[] }): React.JSX.Element {
  return <div className="comparison-row"><strong>{name}</strong>{values.map((value, index) => <span key={value} className={index === 2 ? 'recommended' : ''}>{value}</span>)}</div>
}

function SecurityPanel({ onOpenPanel }: { onOpenPanel(kind: ConfigPanel, context?: string): void }): React.JSX.Element {
  const approvalHistory = useAppStore((s) => s.approvalHistory)
  const pendingApprovals = useAppStore((s) => s.pendingApprovals)
  const openGovernance = useAppStore((s) => s.openGovernance)
  const items = useMemo(() => approvalHistory.slice(0, 6), [approvalHistory])
  const criticalCount = pendingApprovals.filter((item) => item.riskLevel === 'critical').length
  const score = Math.max(60, 96 - pendingApprovals.length * 4 - criticalCount * 6)

  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">可信治理</span>
          <h1>安全与审计</h1>
          <p>控制台已接入真实审批记录，围绕高风险操作建立可追溯治理闭环。</p>
        </div>
        <div className="section-actions">
          <button className="commercial-secondary" onClick={openGovernance}>审批中心</button>
          <button className="commercial-secondary" onClick={() => onOpenPanel('security-policy')}>审计策略</button>
        </div>
      </div>
      <div className="security-score">
        <div>
          <span>{score}</span>
          <small>安全评分</small>
        </div>
        <section>
          <h2>{pendingApprovals.length > 0 ? `当前有 ${pendingApprovals.length} 条待审批事项` : '企业空间风险状态良好'}</h2>
          <p>{pendingApprovals.length > 0 ? '高风险操作已进入审批队列，请在审批中心完成允许或拒绝。' : '当前没有待审批请求，租户隔离、敏感信息脱敏与最小权限策略均已生效。'}</p>
          <div><span>租户隔离</span><span>数据脱敏</span><span>最小权限</span><span>审计留痕</span></div>
        </section>
      </div>
      <section className="commercial-card audit-list">
        <div className="card-heading">
          <div>
            <h2>审批记录</h2>
            <p>展示真实治理审批请求及其当前状态。</p>
          </div>
        </div>
        <div className="audit-table-head">
          <span>审批事项</span>
          <span>类型</span>
          <span>发起小马</span>
          <span>状态</span>
          <span>时间</span>
          <span>操作</span>
        </div>
        {items.length === 0
          ? <div className="table-row audit-action-row"><strong>暂无审批记录</strong><span>--</span><span>--</span><span className="activity-status">空</span><span>--</span><span className="audit-no-action">--</span></div>
          : items.map((item) => <ApprovalAuditActivity key={item.id} request={item} onOpenGovernance={openGovernance} />)}
      </section>
    </>
  )
}

function approvalActionLabel(actionType: ApprovalRequest['actionType']): string {
  switch (actionType) {
    case 'file_write':
      return '写入'
    case 'file_overwrite':
      return '覆盖'
    case 'file_delete':
      return '删除'
    case 'file_move':
      return '移动'
    case 'mcp_call':
      return 'MCP 调用'
    case 'skill_script':
      return 'Skill 脚本'
    case 'report_export':
      return '报告导出'
  }
}

function approvalStatusLabel(status: ApprovalRequest['status']): string {
  switch (status) {
    case 'pending':
      return '待审批'
    case 'approved':
      return '已批准'
    case 'denied':
      return '已拒绝'
    case 'expired':
      return '已过期'
    case 'failed':
      return '失败'
  }
}

function formatApprovalTime(request: ApprovalRequest): string {
  return new Date(request.decidedAt ?? request.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function summarizeApproval(request: ApprovalRequest): string {
  return `${request.reason} | ${request.resource}`
}

function ApprovalAuditActivity({ request, onOpenGovernance }: { request: ApprovalRequest; onOpenGovernance(): void }): React.JSX.Element {
  const handled = request.status !== 'pending'

  return (
    <div className="table-row audit-action-row">
      <strong>{summarizeApproval(request)}</strong>
      <span>{approvalActionLabel(request.actionType)}</span>
      <span>{request.ponyName ?? request.ponyId}</span>
      <span className={`activity-status ${handled ? '' : 'warning'}`}>{approvalStatusLabel(request.status)}</span>
      <span>{formatApprovalTime(request)}</span>
      <button type="button" disabled={handled} onClick={onOpenGovernance}>{handled ? '已处理' : '去审批'}</button>
    </div>
  )
}


const panelMeta: Record<ConfigPanel, { title: string; subtitle: string; action: string }> = {
  notifications: { title: '消息通知', subtitle: '查看任务、资源和安全事件通知', action: '全部标记已读' },
  support: { title: '服务支持', subtitle: '提交问题或联系企业服务团队', action: '提交服务工单' },
  monitor: { title: '运行监控配置', subtitle: '设置运行指标、异常阈值与告警方式', action: '保存监控配置' },
  resource: { title: '资源与配额', subtitle: '管理 Token、任务和工具调用额度', action: '保存配额配置' },
  'solution-create': { title: '解决方案配置', subtitle: '组合数字员工、工具、流程与授权信息', action: '保存解决方案' },
  consulting: { title: '企业定制咨询', subtitle: '提交业务规模与交付需求', action: '预约方案顾问' },
  bill: { title: '企业账单', subtitle: '查看费用明细、发票状态与付款信息', action: '导出账单' },
  'security-policy': { title: '安全与审计策略', subtitle: '配置数据、模型、工具和操作审计规则', action: '保存审计策略' },
  order: { title: '确认套餐订单', subtitle: '核对套餐、企业信息与付款方式', action: '生成正式订单' },
  profile: { title: '个人资料', subtitle: '管理头像、姓名和联系方式', action: '保存个人资料' },
  'tenant-settings': { title: '企业信息', subtitle: '管理当前租户资料、成员与默认配置', action: '保存企业信息' },
  'account-security': { title: '账号安全', subtitle: '管理密码、登录设备和身份认证', action: '保存安全设置' },
  preferences: { title: '偏好设置', subtitle: '配置通知、语言、外观和工作习惯', action: '保存偏好设置' }
}

function ConfigDrawer({ kind, context, onClose, onOpenWorkspace }: { kind: ConfigPanel; context: string; onClose(): void; onOpenWorkspace(): void }): React.JSX.Element {
  const meta = panelMeta[kind]
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const solutions = useAppStore((s) => s.solutions)
  const running = useAppStore((s) => s.running)
  const saveSolutionDraft = useAppStore((s) => s.saveSolutionDraft)
  const removeSolution = useAppStore((s) => s.removeSolution)
  const [solutionDraft, setSolutionDraft] = useState<SolutionDraft | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences>({
    desktopNotifications: true,
    inAppNotifications: true
  })
  const [notificationRefresh, setNotificationRefresh] = useState(0)

  useEffect(() => {
    if (kind === 'preferences') {
      void window.api.getPreferences().then(setPreferences)
    }
  }, [kind])

  const editingSolution =
    kind === 'solution-create' && context
      ? solutions.find((s) => s.id === context || s.title === context)
      : undefined
  const canDeleteSolution = Boolean(editingSolution && !editingSolution.builtin)

  const requestDeleteSolution = async (): Promise<void> => {
    if (!editingSolution || editingSolution.builtin || running || deleting) return
    const rosterCount = editingSolution.ponyIds.length
    const confirmed = await showAppConfirm(
      `确定删除「${editingSolution.title}」吗？\n\n` +
        `该方案当前编制 ${rosterCount} 名数字员工。删除后方案记录将被移除，但数字员工档案将保留，不会被解雇。此操作不可撤销。`,
      { danger: true, confirmLabel: '确认删除' }
    )
    if (!confirmed) return
    setDeleting(true)
    setSaveError(null)
    try {
      await removeSolution(editingSolution.id)
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (kind === 'solution-create') {
      if (!solutionDraft) return
      setSaving(true)
      setSaveError(null)
      try {
        await saveSolutionDraft(solutionDraft)
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2200)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
      return
    }
    if (kind === 'preferences') {
      setSaving(true)
      try {
        await window.api.savePreferences(preferences)
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2200)
      } finally {
        setSaving(false)
      }
      return
    }
    if (kind === 'notifications') {
      setNotificationRefresh((token) => token + 1)
      await window.api.markAllNotificationsRead()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
      return
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  return <div className="config-drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="config-drawer">
      <header className="config-drawer-header"><div><span className="eyebrow">企业配置</span><h2>{meta.title}</h2><p>{meta.subtitle}</p></div><button className="drawer-close" onClick={onClose} aria-label="关闭">×</button></header>
      <form className="config-drawer-form" onSubmit={(event) => void submit(event)}>
        <div className="config-drawer-body"><DrawerContent kind={kind} context={context} onOpenWorkspace={onOpenWorkspace} onSolutionDraftChange={setSolutionDraft} preferences={preferences} onPreferencesChange={setPreferences} notificationRefresh={notificationRefresh} /></div>
        <footer className="config-drawer-footer">
          {saveError && <span className="drawer-error">{saveError}</span>}
          {saved && <span className="drawer-success">{kind === 'notifications' ? '✓ 已全部标记为已读' : '✓ 配置已保存'}</span>}
          {canDeleteSolution && (
            <button
              type="button"
              className="commercial-secondary btn-danger drawer-delete-btn"
              disabled={saving || deleting || running}
              onClick={() => void requestDeleteSolution()}
            >
              {deleting ? '删除中…' : '删除方案'}
            </button>
          )}
          <button type="button" className="commercial-secondary" onClick={onClose} disabled={deleting}>
            取消
          </button>
          <button
            type="submit"
            className="commercial-primary"
            disabled={saving || deleting || running || (kind === 'solution-create' && !solutionDraft?.title?.trim())}
          >
            {saving ? '保存中…' : meta.action}
          </button>
        </footer>
      </form>
    </aside>
  </div>
}

function DrawerContent({ kind, context, onOpenWorkspace, onSolutionDraftChange, preferences, onPreferencesChange, notificationRefresh }: { kind: ConfigPanel; context: string; onOpenWorkspace(): void; onSolutionDraftChange?(draft: SolutionDraft): void; preferences?: UserPreferences; onPreferencesChange?(prefs: UserPreferences): void; notificationRefresh?: number }): React.JSX.Element {
  if (kind === 'profile') return <div className="drawer-stack">
    <div className="profile-avatar-editor"><span>D</span><div><strong>账户头像</strong><small>支持 JPG、PNG，建议尺寸 400 × 400</small><button type="button">更换头像</button></div></div>
    <Field label="显示名称"><input defaultValue="demo" /></Field>
    <Field label="真实姓名"><input defaultValue="企业管理员" /></Field>
    <Field label="企业邮箱"><input type="email" defaultValue="demo@wingai.cn" /></Field>
    <Field label="手机号码"><input type="tel" placeholder="请输入手机号码" /></Field>
    <Field label="岗位"><input defaultValue="平台管理员" /></Field>
    <Field label="个人简介"><textarea rows={3} placeholder="填写职责范围或个人说明" /></Field>
  </div>

  if (kind === 'tenant-settings') return <div className="drawer-stack">
    <div className="drawer-info-card"><strong>华东通信集团</strong><span>租户编号 HDTX-2026-001 · 企业专业版</span></div>
    <Field label="企业名称"><input defaultValue="华东通信集团" /></Field>
    <Field label="所属行业"><select defaultValue="通信与信息服务"><option>通信与信息服务</option><option>金融</option><option>制造</option><option>政务</option><option>其他</option></select></Field>
    <Field label="企业规模"><select defaultValue="1000 人以上"><option>100 人以内</option><option>100-500 人</option><option>500-1000 人</option><option>1000 人以上</option></select></Field>
    <Field label="默认数据区域"><select defaultValue="华东区域专属云"><option>本地设备</option><option>华东区域专属云</option><option>客户私有云</option></select></Field>
    <h3 className="drawer-section-title">成员权限</h3>
    <div className="tenant-member-list"><MemberRow name="demo" role="企业管理员" status="当前账号" /><MemberRow name="王敏" role="安全管理员" status="正常" /><MemberRow name="李哲" role="解决方案经理" status="正常" /></div>
    <SwitchRow title="允许管理员邀请成员" text="企业管理员可通过邮箱邀请新成员加入当前租户" defaultChecked />
  </div>

  if (kind === 'account-security') return <div className="drawer-stack">
    <div className="security-status-card"><span>安全评分</span><strong>92</strong><small>账号安全状态良好</small></div>
    <Field label="当前密码"><input type="password" placeholder="请输入当前密码" /></Field>
    <Field label="新密码"><input type="password" placeholder="至少 8 位，包含数字与字母" /></Field>
    <Field label="确认新密码"><input type="password" placeholder="再次输入新密码" /></Field>
    <SwitchRow title="双重身份认证" text="登录时通过企业微信或验证器进行二次确认" defaultChecked />
    <SwitchRow title="新设备登录提醒" text="检测到新设备登录时发送桌面和邮件通知" defaultChecked />
    <h3 className="drawer-section-title">已登录设备</h3>
    <div className="login-device"><div><strong>Windows · 桌面客户端</strong><span>上海 · 当前设备 · 刚刚活跃</span></div><em>当前</em></div>
    <div className="login-device"><div><strong>Chrome · Windows 浏览器</strong><span>上海 · 2026-06-10 18:42</span></div><button type="button">退出设备</button></div>
  </div>

  if (kind === 'preferences') return <div className="drawer-stack">
    <AppearancePicker />
    <Field label="界面语言"><select defaultValue="简体中文"><option>简体中文</option><option>英文</option></select></Field>
    <Field label="日期与时间格式"><select defaultValue="24 小时制"><option>24 小时制</option><option>12 小时制</option></select></Field>
    <Field label="默认进入页面"><select defaultValue="任务工作台"><option>任务工作台</option><option>运营总览</option><option>解决方案</option></select></Field>
    <SwitchRow title="应用内通知" text="在消息中心显示自动化任务执行结果" checked={preferences?.inAppNotifications} onChange={(v) => onPreferencesChange?.({ ...preferences!, inAppNotifications: v })} />
    <SwitchRow title="桌面通知" text="接收任务完成、异常与人工确认通知" checked={preferences?.desktopNotifications} onChange={(v) => onPreferencesChange?.({ ...preferences!, desktopNotifications: v })} />
    <SwitchRow title="声音提示" text="任务派发和完成时播放提示音" defaultChecked />
    <SwitchRow title="自动打开最新报告" text="任务完成后自动展示新生成的报告" />
    <SwitchRow title="减少动画效果" text="减少场景和界面的动态过渡效果" />
    <Field label="界面缩放"><select defaultValue="100%"><option>90%</option><option>100%</option><option>110%</option><option>125%</option></select></Field>
  </div>

  if (kind === 'notifications') return <NotificationsDrawerContent refreshToken={notificationRefresh} />

  if (kind === 'support') return <div className="drawer-stack">
    <div className="drawer-info-card"><strong>企业专业版服务</strong><span>工作日 5×8 专属支持，平均响应时间 30 分钟</span></div>
    <Field label="问题类型"><select defaultValue="运行异常"><option>运行异常</option><option>方案配置</option><option>账单与套餐</option><option>安全与权限</option></select></Field>
    <Field label="问题标题"><input placeholder="请简要描述问题" /></Field>
    <Field label="详细说明"><textarea rows={5} placeholder="请填写复现步骤、影响范围和期望结果" /></Field>
    <Field label="紧急程度"><select defaultValue="一般"><option>一般</option><option>重要</option><option>紧急</option></select></Field>
    <Field label="联系人"><input defaultValue="demo · 企业管理员" /></Field>
  </div>

  if (kind === 'monitor') return <div className="drawer-stack">
    <div className="drawer-metric-strip"><div><strong>12</strong><span>在线员工</span></div><div><strong>3</strong><span>运行任务</span></div><div><strong>98.7%</strong><span>成功率</span></div></div>
    <h3 className="drawer-section-title">异常阈值</h3>
    <Field label="单任务最长运行时间"><div className="input-with-unit"><input type="number" defaultValue="15" /><span>分钟</span></div></Field>
    <Field label="连续失败告警次数"><div className="input-with-unit"><input type="number" defaultValue="3" /><span>次</span></div></Field>
    <Field label="成功率告警阈值"><div className="input-with-unit"><input type="number" defaultValue="95" /><span>%</span></div></Field>
    <SwitchRow title="自动重试" text="工具或模型临时失败时自动重试两次" defaultChecked />
    <SwitchRow title="异常自动暂停" text="连续失败后暂停相关解决方案，等待管理员处理" />
  </div>

  if (kind === 'resource') return <div className="drawer-stack">
    <div className="drawer-info-card"><strong>企业专业版 · 包年</strong><span>当前周期 2026-06-01 至 2027-05-31</span></div>
    <QuotaField label="模型 Token" used="7.26M" total="10M" value={73} />
    <QuotaField label="任务执行次数" used="4,581" total="8,000" value={57} />
    <QuotaField label="MCP 工具调用" used="12,430" total="20,000" value={62} />
    <h3 className="drawer-section-title">预算与告警</h3>
    <Field label="月度费用预算"><div className="input-with-unit"><span>¥</span><input type="number" defaultValue="15000" /></div></Field>
    <SwitchRow title="允许超额使用" text="配额用尽后按照套餐超额单价继续运行" defaultChecked />
  </div>

  if (kind === 'solution-create') {
    return <SolutionCreateForm context={context} onDraftChange={onSolutionDraftChange} />
  }

  if (kind === 'consulting') return <div className="drawer-stack">
    <div className="drawer-info-card"><strong>企业定制方案</strong><span>顾问将在 1 个工作日内联系并提供资源与交付建议</span></div>
    <Field label="企业名称"><input defaultValue="华东通信集团" /></Field>
    <Field label="预计使用人数"><select defaultValue="100-500 人"><option>50 人以内</option><option>50-100 人</option><option>100-500 人</option><option>500 人以上</option></select></Field>
    <Field label="重点场景"><textarea rows={4} placeholder="例如：经营分析、营销派单、流程稽核、私有化部署" /></Field>
    <Field label="联系人手机号"><input placeholder="请输入手机号" /></Field>
    <Field label="期望联系时间"><input type="datetime-local" /></Field>
  </div>

  if (kind === 'bill') return <div className="drawer-stack">
    <div className="drawer-metric-strip"><div><strong>¥12,680</strong><span>本月费用</span></div><div><strong>已支付</strong><span>账单状态</span></div><div><strong>6%</strong><span>税率</span></div></div>
    <Field label="账单周期"><input type="month" defaultValue="2026-06" /></Field>
    <div className="bill-list"><BillRow name="平台与方案授权" value="¥ 6,800.00" /><BillRow name="模型 Token 服务" value="¥ 3,260.40" /><BillRow name="云资源与存储" value="¥ 1,580.00" /><BillRow name="网络与安全服务" value="¥ 1,040.00" /><BillRow name="费用合计" value="¥ 12,680.40" total /></div>
    <SwitchRow title="自动申请电子发票" text="账单支付完成后自动开具增值税电子普通发票" defaultChecked />
  </div>

  if (kind === 'security-policy') return <div className="drawer-stack">
    <SwitchRow title="敏感数据自动脱敏" text="手机号、证件号、地址等字段进入模型前自动脱敏" defaultChecked />
    <SwitchRow title="高风险工具人工确认" text="流程写入、消息群发和数据导出必须经过管理员确认" defaultChecked />
    <SwitchRow title="MCP 工具白名单" text="仅允许调用已完成安全审核的工具" defaultChecked />
    <SwitchRow title="异常行为自动阻断" text="检测到越权访问或参数异常时立即终止任务" defaultChecked />
    <Field label="审计日志保留周期"><select defaultValue="3 年"><option>180 天</option><option>1 年</option><option>3 年</option><option>永久保留</option></select></Field>
    <Field label="管理员审批方式"><select defaultValue="控制台 + 企业微信"><option>仅控制台</option><option>控制台 + 企业微信</option><option>控制台 + 短信</option></select></Field>
    <Field label="数据存储区域"><select defaultValue="华东区域专属云"><option>本地设备</option><option>华东区域专属云</option><option>客户私有云</option></select></Field>
  </div>

  return <div className="drawer-stack">
    <div className="drawer-order-summary"><span>选购套餐</span><strong>{context || '企业专业版'}</strong><small>订单将在确认后生成，不会直接扣款</small></div>
    <Field label="企业名称"><input defaultValue="华东通信集团" /></Field>
    <Field label="统一社会信用代码"><input placeholder="请输入统一社会信用代码" /></Field>
    <Field label="付款方式"><select defaultValue="对公转账"><option>对公转账</option><option>企业网银</option><option>合同月结</option></select></Field>
    <Field label="合同联系人"><input defaultValue="demo" /></Field>
    <Field label="交付备注"><textarea rows={3} placeholder="填写发票、合同或私有化交付要求" /></Field>
    <label className="drawer-agreement"><input type="checkbox" defaultChecked /> 已阅读并同意企业服务协议与数据处理条款</label>
    <button type="button" className="drawer-workspace-link" onClick={onOpenWorkspace}>暂不购买，返回任务工作台</button>
  </div>
}

const appearanceOptions: { id: Appearance; name: string; description: string }[] = [
  { id: 'pony', name: '小马', description: '亚麻、暖灰与黄铜的默认外观' },
  { id: 'light', name: '浅色', description: '高对比、清爽明亮的浅色界面' },
  { id: 'dark', name: '深色', description: '低亮度、沉稳聚焦的深色界面' }
]

function AppearancePicker(): React.JSX.Element {
  const appearance = useAppearance()
  return <section className="appearance-setting"><div><h3>外观</h3><p>选择后立即应用到全部页面，并在下次启动时保留。</p></div><div className="appearance-options">{appearanceOptions.map((option) => <button key={option.id} type="button" className={appearance === option.id ? 'active' : ''} onClick={() => setAppearance(option.id)}><i className={`appearance-preview ${option.id}`}><b /><span /><span /><span /></i><strong>{option.name}</strong><small>{option.description}</small>{appearance === option.id && <em>当前使用</em>}</button>)}</div></section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return <label className="drawer-field"><span>{label}</span>{children}</label>
}

function SwitchRow({ title, text, defaultChecked, checked, onChange }: { title: string; text: string; defaultChecked?: boolean; checked?: boolean; onChange?(value: boolean): void }): React.JSX.Element {
  const isControlled = checked !== undefined
  const [internal, setInternal] = useState(defaultChecked ?? false)
  const value = isControlled ? checked : internal
  return (
    <label className="drawer-switch-row">
      <div><strong>{title}</strong><span>{text}</span></div>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          if (!isControlled) setInternal(e.target.checked)
          onChange?.(e.target.checked)
        }}
      />
      <i />
    </label>
  )
}

function NotificationItem({ title, text, time, tone }: { title: string; text: string; time: string; tone: string }): React.JSX.Element {
  return <article className={`drawer-notification ${tone}`}><i /><div><strong>{title}</strong><p>{text}</p><span>{time}</span></div></article>
}

function QuotaField({ label, used, total, value }: { label: string; used: string; total: string; value: number }): React.JSX.Element {
  return <div className="drawer-quota"><div><strong>{label}</strong><span>{used} / {total}</span></div><i><b style={{ width: `${value}%` }} /></i><small>使用率 {value}%</small></div>
}

function BillRow({ name, value, total }: { name: string; value: string; total?: boolean }): React.JSX.Element {
  return <div className={total ? 'bill-row total' : 'bill-row'}><span>{name}</span><strong>{value}</strong></div>
}

function MemberRow({ name, role, status }: { name: string; role: string; status: string }): React.JSX.Element {
  return <div className="tenant-member-row"><span>{name.slice(0, 1)}</span><div><strong>{name}</strong><small>{role}</small></div><em>{status}</em></div>
}

function SolutionCreateForm({ context, onDraftChange }: { context: string; onDraftChange?(draft: SolutionDraft): void }): React.JSX.Element {
  const solutions = useAppStore((s) => s.solutions)
  const ponies = useAppStore((s) => s.ponies)
  const existing = solutions.find((s) => s.id === context || s.title === context)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [desc, setDesc] = useState(existing?.desc ?? '')
  const [template, setTemplate] = useState(existing?.defaultTaskTemplate ?? '')
  const [leaderHints, setLeaderHints] = useState(existing?.leaderHints ?? '')
  const [selectedPonyIds, setSelectedPonyIds] = useState<string[]>(
    existing?.ponyIds ?? ['leader', 'data', 'report']
  )

  useEffect(() => {
    const draft: SolutionDraft = {
      id: existing?.id,
      title,
      desc,
      defaultTaskTemplate: template,
      leaderHints,
      ponyIds: selectedPonyIds
    }
    onDraftChange?.(draft)
  }, [existing?.id, title, desc, template, leaderHints, selectedPonyIds, onDraftChange])

  const togglePony = (id: string): void => {
    if (id === 'leader') return
    setSelectedPonyIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id)
      if (prev.length >= OFFICE_CAPACITY) return prev
      return [...prev, id]
    })
  }

  const selectAllPonies = (): void => {
    setSelectedPonyIds(ponies.slice(0, OFFICE_CAPACITY).map((p) => p.id))
  }

  const deselectAllPonies = (): void => {
    setSelectedPonyIds(['leader'])
  }

  return <div className="drawer-stack">
    <Field label="解决方案名称">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：客户流失预警解决方案"
      />
    </Field>
    <Field label="方案说明">
      <textarea
        rows={3}
        value={desc}
        onChange={(event) => setDesc(event.target.value)}
        placeholder="说明目标、输入数据和预期产出"
      />
    </Field>
    <Field label="默认任务模板">
      <textarea
        rows={2}
        value={template}
        onChange={(event) => setTemplate(event.target.value)}
        placeholder="进入工作台时预填的任务描述"
      />
    </Field>
    <h3 className="drawer-section-title">
      数字员工编排（{selectedPonyIds.length} / {OFFICE_CAPACITY} 名）
    </h3>
    <div className="drawer-toolbar" style={{ marginBottom: 8 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllPonies}>
        全选
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={deselectAllPonies}>
        仅保留领队
      </button>
    </div>
    <div className="drawer-check-grid">
      {ponies.map((pony) => (
        <label key={pony.id}>
          <input
            type="checkbox"
            checked={selectedPonyIds.includes(pony.id)}
            disabled={
              pony.id === 'leader' ||
              (!selectedPonyIds.includes(pony.id) && selectedPonyIds.length >= OFFICE_CAPACITY)
            }
            onChange={() => togglePony(pony.id)}
          />
          {pony.name}
        </label>
      ))}
    </div>
    <Field label="领队派单提示（leaderHints）">
      <textarea
        rows={4}
        value={leaderHints}
        onChange={(event) => setLeaderHints(event.target.value)}
        placeholder="描述本方案的推荐派单顺序与注意事项"
      />
    </Field>
    <SwitchRow title="高风险操作人工确认" text="写入业务系统或访问敏感数据前请求管理员确认" defaultChecked />
  </div>
}
