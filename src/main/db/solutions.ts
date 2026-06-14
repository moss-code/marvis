import type { Pony, PonyId, Solution, SolutionDraft, SolutionFlowNode } from '../../shared/types'
import { OFFICE_CAPACITY } from '../../shared/office'
import { randomUUID } from 'node:crypto'

export const PRESET_SOLUTION_PONIES: Pony[] = [
  {
    id: 'solution-marketing',
    name: '画像马',
    role: '客户画像专家：基于业务数据筛选高价值目标客户，输出画像标签、分层摘要与个性化触达话术要点',
    builtin: true,
    skin: { palette: 'ochre', accessories: ['glasses'] },
    skills: ['skill-summary'],
    mcpServers: []
  },
  {
    id: 'solution-audit',
    name: '稽核马',
    role: '流程稽核专家：对照业务规则检查工单/调账记录，识别类型与备注不一致、字段缺失等异常并输出清单',
    builtin: true,
    skin: { palette: 'sage', accessories: ['brass-tag'] },
    skills: [],
    mcpServers: []
  }
]

export const PRESET_SOLUTIONS: Solution[] = [
  {
    id: 'general-office',
    title: '总办公室',
    code: 'GENERAL OFFICE',
    tone: 'amber',
    desc: '公司默认办公室，按编制展示活跃数字员工',
    status: 'authorized',
    tag: '已授权',
    ponyIds: ['leader'],
    flow: [
      { id: 'entry', kind: 'leader_entry', label: '领队马', purpose: '理解需求并派单' }
    ],
    leaderHints:
      '本任务在「总办公室」执行。按当前方案编制派单；若用户未指定专项方案，以编制内数字员工为协作范围。',
    defaultTaskTemplate: '请帮我处理一项办公任务',
    demoStats: { agents: 1, runs: '3,582', success: '97.4%' },
    builtin: true,
    updatedAt: 0
  },
  {
    id: 'business-insight',
    title: '经营分析解决方案',
    code: 'BUSINESS INSIGHT',
    tone: 'amber',
    desc: '自然语言取数、经营洞察与报告自动生成',
    status: 'authorized',
    tag: '已授权',
    ponyIds: ['leader', 'data', 'report'],
    flow: [
      { id: 'entry', kind: 'leader_entry', label: '领队马', purpose: '理解经营分析需求并拆解派单' },
      { id: 'data', kind: 'pony', ponyId: 'data', label: '数据马', purpose: 'SQL 取数与指标解读' },
      { id: 'report', kind: 'pony', ponyId: 'report', label: '报表马', purpose: '生成 ECharts 经营报告' }
    ],
    leaderHints: `本任务属于「经营分析」方案。优先派 data 马完成营业厅/业务指标分析，再派 report 马生成可视化报告。brief 传给 report 时必须附带完整数字与结论。若用户未上传数据，提醒先选择或上传 xlsx。`,
    reportStyleHint: '经营分析报告：突出 KPI 卡片、营业厅排名对比、趋势折线/柱状图，结论面向管理层，语气专业简洁。',
    defaultTaskTemplate: '分析各营业厅业务表现并生成报告',
    requiredData: ['xlsx'],
    demoStats: { agents: 3, runs: '1,286', success: '98.6%' },
    builtin: true,
    updatedAt: 0
  },
  {
    id: 'smart-marketing',
    title: '智能营销解决方案',
    code: 'SMART MARKETING',
    tone: 'blue',
    desc: '客户画像、人员匹配、话术生成与任务推送',
    status: 'trial',
    tag: '试用中',
    ponyIds: ['leader', 'solution-marketing', 'data', 'writer', 'file'],
    flow: [
      { id: 'entry', kind: 'leader_entry', label: '领队马', purpose: '理解营销目标并编排派单' },
      { id: 'marketing', kind: 'pony', ponyId: 'solution-marketing', label: '画像马', purpose: '客户分层与画像摘要' },
      { id: 'data', kind: 'pony', ponyId: 'data', label: '数据马', purpose: '筛选高价值客户数据', optional: true },
      { id: 'writer', kind: 'pony', ponyId: 'writer', label: '文书马', purpose: '触达话术与推送文案' },
      { id: 'file', kind: 'pony', ponyId: 'file', label: '文件马', purpose: '归档营销名单与话术', optional: true }
    ],
    leaderHints: `本任务属于「智能营销」方案。典型顺序：data 马筛选目标客户 → solution-marketing 画像马输出分层与标签 → writer 文书马撰写触达话术；需要归档时派 file 马。按实际数据情况灵活派单，不要跳过真实工具执行。`,
    reportStyleHint: '营销方案产出以画像摘要、目标名单要点、触达话术为主；若生成报告，侧重客户分层与转化机会，图表简洁。',
    defaultTaskTemplate: '基于现有客户数据筛选高价值营销目标，生成画像摘要和触达话术',
    demoStats: { agents: 5, runs: '864', success: '96.8%' },
    builtin: true,
    updatedAt: 0
  },
  {
    id: 'audit-automation',
    title: '调账稽核解决方案',
    code: 'AUDIT AUTOMATION',
    tone: 'green',
    desc: 'EOP 工单获取、规则稽核与异常自动退回',
    status: 'authorized',
    tag: '已授权',
    ponyIds: ['leader', 'solution-audit', 'data', 'writer'],
    flow: [
      { id: 'entry', kind: 'leader_entry', label: '领队马', purpose: '理解稽核范围与规则' },
      { id: 'data', kind: 'pony', ponyId: 'data', label: '数据马', purpose: '查询工单/调账明细' },
      { id: 'audit', kind: 'pony', ponyId: 'solution-audit', label: '稽核马', purpose: '规则比对与异常识别' },
      { id: 'writer', kind: 'pony', ponyId: 'writer', label: '文书马', purpose: '异常清单与退回说明' }
    ],
    leaderHints: `本任务属于「调账稽核」方案。先派 data 马拉取工单/调账数据，再派 solution-audit 稽核马按规则检查类型与备注一致性，最后由 writer 文书马整理异常清单。发现异常须如实列出，禁止编造通过结果。`,
    defaultTaskTemplate: '稽核本批次校园赠送金调账工单，检查调账类型与备注是否一致，输出异常清单',
    demoStats: { agents: 4, runs: '2,431', success: '99.2%' },
    builtin: true,
    updatedAt: 0
  }
]

export function assertValidSolution(s: Solution): void {
  if (!s.id?.trim()) throw new Error('方案 id 不能为空')
  if (!s.title?.trim()) throw new Error('方案名称不能为空')
  if (!Array.isArray(s.flow) || s.flow.length === 0) throw new Error('方案 flow 不能为空')
  if (s.flow[0]?.kind !== 'leader_entry') {
    throw new Error('方案 flow 必须以领队马入口节点开始')
  }
  for (const node of s.flow) {
    if (node.kind === 'pony' && !node.ponyId) {
      throw new Error(`flow 节点 ${node.id} 缺少 ponyId`)
    }
  }
  if (!s.defaultTaskTemplate?.trim()) throw new Error('默认任务模板不能为空')
}

export function formatSolutionFlowSummary(flow: SolutionFlowNode[]): string {
  return flow
    .map((n, i) => {
      const tag = n.optional ? '（可选）' : ''
      if (n.kind === 'leader_entry') return `${i + 1}. 领队马入口${tag}：${n.purpose}`
      if (n.kind === 'human_gate') return `${i + 1}. 人工确认${tag}：${n.purpose}`
      return `${i + 1}. ${n.label}（${n.ponyId}）${tag}：${n.purpose}`
    })
    .join('\n')
}

export function ponyIdsToFlow(ponyIds: PonyId[], ponies: Pony[]): SolutionFlowNode[] {
  const flow: SolutionFlowNode[] = [
    { id: 'entry', kind: 'leader_entry', label: '领队马', purpose: '理解需求并派单' }
  ]
  for (const id of ponyIds) {
    if (id === 'leader') continue
    const pony = ponies.find((p) => p.id === id)
    flow.push({
      id: `pony-${id}`,
      kind: 'pony',
      ponyId: id,
      label: pony?.name ?? id,
      purpose: pony?.role ?? ''
    })
  }
  return flow
}

export function syncDemoStatsAgents(s: Solution): Solution {
  return {
    ...s,
    demoStats: {
      ...s.demoStats,
      agents: s.ponyIds.length
    }
  }
}

export function filterRosterForSolution(roster: Pony[], solution: Solution | null | undefined): Pony[] {
  if (!solution) return roster
  const ids = new Set(solution.ponyIds)
  return roster.filter((p) => ids.has(p.id))
}

export function prepareSolutionForSave(solution: Solution, ponies: Pony[]): Solution {
  const ponyIdSet = new Set(ponies.map((p) => p.id))
  for (const id of solution.ponyIds) {
    if (!ponyIdSet.has(id)) throw new Error(`编制中包含不存在的小马：${id}`)
  }
  if (!solution.ponyIds.includes('leader')) {
    throw new Error('方案编制必须包含领队马')
  }
  if (solution.ponyIds.length > OFFICE_CAPACITY) {
    throw new Error(`方案办公室编制不能超过 ${OFFICE_CAPACITY} 名数字员工`)
  }
  const normalized = normalizeSolution({
    ...solution,
    flow: ponyIdsToFlow(solution.ponyIds, ponies)
  })
  return syncDemoStatsAgents(normalized)
}

export function formatSolutionLeaderHints(solution: Solution): string {
  const parts = [`## 当前解决方案：${solution.title}`, solution.leaderHints]
  if (solution.requiredData?.length) {
    parts.push(`### 数据要求\n建议上传：${solution.requiredData.join('、')}`)
  }
  const rosterHint = solution.ponyIds.filter((id) => id !== 'leader').join('、')
  if (rosterHint) {
    parts.push(`### 方案编制\n本方案关联数字员工 id：${rosterHint}`)
  }
  return parts.join('\n\n')
}

export function normalizeSolution(input: Solution): Solution {
  const now = Date.now()
  return {
    ...input,
    id: input.id.trim(),
    title: input.title.trim(),
    code: input.code.trim(),
    desc: input.desc.trim(),
    tag: input.tag.trim(),
    leaderHints: input.leaderHints.trim(),
    defaultTaskTemplate: input.defaultTaskTemplate.trim(),
    ponyIds: [...new Set(input.ponyIds)] as PonyId[],
    flow: input.flow.map((n) => ({ ...n, label: n.label.trim(), purpose: n.purpose.trim() })),
    updatedAt: input.updatedAt || now
  }
}

export function mergeSolutionDraft(existing: Solution | null, draft: SolutionDraft): Solution {
  const now = Date.now()
  if (existing) {
    return normalizeSolution({
      ...existing,
      title: draft.title.trim(),
      code: draft.code?.trim() ?? existing.code,
      tone: draft.tone ?? existing.tone,
      status: draft.status ?? existing.status,
      tag: draft.tag?.trim() ?? existing.tag,
      desc: draft.desc?.trim() ?? existing.desc,
      ponyIds: draft.ponyIds ?? existing.ponyIds,
      defaultTaskTemplate: draft.defaultTaskTemplate?.trim() ?? existing.defaultTaskTemplate,
      requiredData: draft.requiredData ?? existing.requiredData,
      demoStats: draft.demoStats ?? existing.demoStats,
      leaderHints: draft.leaderHints?.trim() ?? existing.leaderHints,
      reportStyleHint: draft.reportStyleHint?.trim() ?? existing.reportStyleHint,
      builtin: existing.builtin,
      updatedAt: now
    })
  }

  const id = draft.id?.trim() || `custom-solution-${randomUUID().slice(0, 8)}`
  return normalizeSolution({
    id,
    title: draft.title.trim(),
    code: draft.code?.trim() || id.toUpperCase().replace(/-/g, ' '),
    tone: draft.tone ?? 'amber',
    status: draft.status ?? 'draft',
    tag: draft.tag?.trim() || '草稿',
    desc: draft.desc?.trim() || '',
    ponyIds: draft.ponyIds ?? ['leader', 'data', 'report'],
    defaultTaskTemplate: draft.defaultTaskTemplate?.trim() || '',
    requiredData: draft.requiredData,
    demoStats: draft.demoStats ?? { agents: (draft.ponyIds ?? ['leader', 'data', 'report']).length, runs: '0', success: '—' },
    flow: [{ id: 'entry', kind: 'leader_entry', label: '领队马', purpose: '理解需求并派单' }],
    leaderHints: draft.leaderHints?.trim() || '',
    reportStyleHint: draft.reportStyleHint?.trim(),
    builtin: false,
    updatedAt: now
  })
}
