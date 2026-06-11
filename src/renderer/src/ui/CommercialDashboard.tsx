import { useState } from 'react'

type Section = 'overview' | 'solutions' | 'employees' | 'usage' | 'security'

interface CommercialDashboardProps {
  userName: string
  onOpenWorkspace(): void
  onLogout(): void
}

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: '运营总览', icon: '◫' },
  { id: 'solutions', label: '解决方案', icon: '◇' },
  { id: 'employees', label: '数字员工', icon: '◎' },
  { id: 'usage', label: '用量与计费', icon: '▥' },
  { id: 'security', label: '安全与审计', icon: '⌾' }
]

const solutions = [
  { title: '经营分析解决方案', code: 'BUSINESS INSIGHT', tone: 'amber', desc: '自然语言取数、经营洞察与报告自动生成', agents: 4, runs: '1,286', success: '98.6%', tag: '已授权' },
  { title: '智能营销解决方案', code: 'SMART MARKETING', tone: 'blue', desc: '客户画像、人员匹配、话术生成与任务推送', agents: 5, runs: '864', success: '96.8%', tag: '试用中' },
  { title: '调账稽核解决方案', code: 'AUDIT AUTOMATION', tone: 'green', desc: 'EOP 工单获取、规则稽核与异常自动退回', agents: 4, runs: '2,431', success: '99.2%', tag: '已授权' }
]

export function CommercialDashboard({ userName, onOpenWorkspace, onLogout }: CommercialDashboardProps): React.JSX.Element {
  const [section, setSection] = useState<Section>('overview')

  return (
    <main className="commercial-shell">
      <aside className="commercial-sidebar">
        <div className="commercial-logo"><span>翼</span><div><strong>翼智小马</strong><small>解决方案供应平台</small></div></div>
        <nav>
          <p>工作空间</p>
          {navItems.map((item) => (
            <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
              <i>{item.icon}</i>{item.label}
              {item.id === 'security' && <em>2</em>}
            </button>
          ))}
          <p>运行中心</p>
          <button onClick={onOpenWorkspace}><i>▹</i>任务工作台</button>
          <button onClick={() => setSection('usage')}><i>⌁</i>运行监控</button>
        </nav>
        <div className="tenant-card">
          <span>当前租户</span><strong>华东通信集团</strong><small>企业专业版 · 试点授权</small>
          <div><i style={{ width: '72%' }} /></div><small>本月资源额度 72%</small>
        </div>
        <button className="sidebar-support">服务支持 <span>→</span></button>
      </aside>

      <section className="commercial-main">
        <header className="commercial-topbar">
          <div><span className="crumb">企业控制台</span><b>/</b><strong>{navItems.find((item) => item.id === section)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="notice-button" aria-label="通知" title="通知">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              <i />
            </button>
            <div className="user-menu"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>企业管理员</small></div></div>
            <button className="logout-button" onClick={onLogout}>退出</button>
          </div>
        </header>

        <div className="commercial-content">
          {section === 'overview' && <Overview onOpenWorkspace={onOpenWorkspace} onViewSolutions={() => setSection('solutions')} />}
          {section === 'solutions' && <Solutions onOpenWorkspace={onOpenWorkspace} />}
          {section === 'employees' && <Employees />}
          {section === 'usage' && <Usage />}
          {section === 'security' && <Security />}
        </div>
      </section>
    </main>
  )
}

function Overview({ onOpenWorkspace, onViewSolutions }: { onOpenWorkspace(): void; onViewSolutions(): void }): React.JSX.Element {
  return <>
    <div className="dashboard-welcome">
      <div><span className="eyebrow">THURSDAY · 11 JUNE</span><h1>上午好，欢迎回到翼智小马</h1><p>数字员工团队运行稳定，今日已自动完成 <strong>126</strong> 项企业任务。</p></div>
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
          {solutions.map((item) => <div className="solution-row" key={item.title}><span className={`solution-icon ${item.tone}`}>{item.title.slice(0, 1)}</span><div><strong>{item.title}</strong><small>{item.desc}</small></div><div className="solution-stat"><strong>{item.runs}</strong><small>累计任务</small></div><div className="solution-stat"><strong>{item.success}</strong><small>成功率</small></div><span className="status-pill">运行中</span></div>)}
        </div>
      </section>
      <section className="commercial-card resource-card">
        <div className="card-heading"><div><h2>本月资源用量</h2><p>更新于 10:32</p></div><button>详情</button></div>
        <Resource label="模型 Token" value="7.26M / 10M" percent={73} color="gold" />
        <Resource label="任务执行次数" value="4,581 / 8,000" percent={57} color="blue" />
        <Resource label="MCP 工具调用" value="12,430 / 20,000" percent={62} color="green" />
        <div className="cost-box"><span>本月费用预估</span><strong>¥ 12,680.40</strong><small>含平台授权、模型与云资源</small></div>
      </section>
    </div>
    <section className="commercial-card activity-card">
      <div className="card-heading"><div><h2>实时运行动态</h2><p>关键任务与风险事件</p></div><span className="live-label"><i /> LIVE</span></div>
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

function Solutions({ onOpenWorkspace }: { onOpenWorkspace(): void }): React.JSX.Element {
  return <><div className="section-title"><div><span className="eyebrow">SOLUTION MARKETPLACE</span><h1>企业解决方案</h1><p>将数字员工、工具与业务流程打包为可复制的企业能力。</p></div><button className="commercial-primary">+ 创建解决方案</button></div><div className="solution-market-grid">{solutions.map((item) => <article className="market-card" key={item.title}><div className={`market-cover ${item.tone}`}><span>{item.code}</span><strong>{item.title.slice(0, 2)}</strong><i>{item.tag}</i></div><div className="market-body"><h2>{item.title}</h2><p>{item.desc}</p><div className="market-meta"><span>{item.agents} 名数字员工</span><span>{item.success} 成功率</span></div><button onClick={onOpenWorkspace}>进入方案工作台 →</button></div></article>)}</div></>
}

function Employees(): React.JSX.Element {
  const people = [['领队马','任务理解与智能派单','在线','leader'],['数据分析马','SQL 查询与经营洞察','执行中','data'],['报告马','图表与报告自动生成','在线','report'],['客户画像马','客户洞察与价值识别','在线','customer'],['流程稽核马','规则核验与流程处理','在线','audit'],['安全审计马','权限控制与风险留痕','在线','security']]
  return <><div className="section-title"><div><span className="eyebrow">DIGITAL WORKFORCE</span><h1>数字员工中心</h1><p>统一管理企业数字员工的能力、权限、版本与运行状态。</p></div><button className="commercial-primary">+ 接入数字员工</button></div><div className="employee-grid">{people.map(([name, role, status, type]) => <article className="employee-card" key={name}><div className={`employee-avatar ${type}`}>{name.slice(0, 1)}</div><span className={`employee-online ${status === '执行中' ? 'busy' : ''}`}>{status}</span><h2>{name}</h2><p>{role}</p><div><span>成功率 <strong>98.9%</strong></span><span>本月任务 <strong>826</strong></span></div><button>查看能力档案</button></article>)}</div></>
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

function Usage(): React.JSX.Element {
  const [cycle, setCycle] = useState<BillingCycle>('quarter')
  const [selected, setSelected] = useState<BillingCycle | null>(null)
  const plan = billingPlans[cycle]

  return <>
    <div className="section-title"><div><span className="eyebrow">RESOURCE & BILLING</span><h1>套餐与计费</h1><p>根据业务规模选择计费方式，Token、任务和工具调用统一计量。</p></div><button className="commercial-secondary">企业定制咨询</button></div>
    <section className="billing-current">
      <div><span className="billing-current-icon">企</span><div><small>当前套餐</small><strong>企业专业版 · 包年</strong><p>授权有效期至 2027-05-31，剩余 354 天</p></div></div>
      <div className="billing-current-usage"><span>本周期额度使用</span><strong>72%</strong><i><b style={{ width: '72%' }} /></i></div>
      <button className="commercial-secondary">查看账单</button>
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

    {selected && <div className="plan-order-bar"><div><span>已选择</span><strong>{billingPlans[selected].label}</strong><small>{billingPlans[selected].price} {billingPlans[selected].unit}</small></div><div><button className="commercial-secondary" onClick={() => setSelected(null)}>取消</button><button className="commercial-primary" onClick={() => setSelected(null)}>确认套餐并生成订单</button></div></div>}
  </>
}

function CompareRow({ name, values }: { name: string; values: string[] }): React.JSX.Element {
  return <div className="comparison-row"><strong>{name}</strong>{values.map((value, index) => <span key={value} className={index === 2 ? 'recommended' : ''}>{value}</span>)}</div>
}

function Security(): React.JSX.Element {
  return <><div className="section-title"><div><span className="eyebrow">TRUST & GOVERNANCE</span><h1>安全与审计</h1><p>围绕数据、模型、工具与人工操作建立全链路可信治理。</p></div><button className="commercial-secondary">审计策略</button></div><div className="security-score"><div><span>92</span><small>安全评分</small></div><section><h2>企业空间风险状态良好</h2><p>租户隔离、敏感数据脱敏和关键工具白名单均已启用。</p><div><span>租户隔离</span><span>数据不出域</span><span>最小权限</span><span>日志留痕</span></div></section></div><section className="commercial-card audit-list"><div className="card-heading"><div><h2>待处理安全事项</h2><p>建议及时处理，保障方案稳定运行</p></div></div><Activity task="营销方案申请访问客户联系方式" solution="权限申请" employee="安全管理员" status="待确认" time="10:21" warning /><Activity task="EOP 工具调用参数触发敏感规则" solution="工具审计" employee="安全审计马" status="已拦截" time="09:46" /><Activity task="模型服务密钥完成周期轮换" solution="密钥管理" employee="系统" status="已完成" time="昨天" /></section></>
}
