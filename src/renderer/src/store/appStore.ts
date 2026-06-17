import { create } from 'zustand'
import { showAppAlert } from '@/store/dialogStore'
import type {
  AccessoryId,
  AgentEvent,
  ApprovalDecisionValue,
  ApprovalRequest,
  AuditLogEntry,
  ChatMessage,
  McpServerConfig,
  McpServerStatus,
  ModelConfig,
  PaletteId,
  PermissionPolicy,
  Pony,
  PonyDraft,
  PonySkin,
  ReportMeta,
  SessionBindings,
  Skill,
  Solution,
  SolutionDraft,
  TableSchema,
  SelfCheckItem
} from '@shared/types'
import { GENERAL_OFFICE_SOLUTION_ID } from '@shared/solutionRoster'
import {
  persistActiveSolutionId,
  readPersistedActiveSolutionId,
  resolveActiveSolutionId
} from '@/activeSolution'
import { ReplayDirector } from '@/replay/ReplayDirector'
import { sceneBus } from '@/scene/sceneBus'

interface AppState {
  ponies: Pony[]
  solutions: Solution[]
  activeSolutionId: string
  pendingTaskTemplate: string | null
  chat: ChatMessage[]
  streaming: string
  running: boolean
  currentRunId: string | null
  cancelling: boolean
  replaying: boolean
  replayEvents: AgentEvent[]
  replaySpeed: 1 | 2
  events: AgentEvent[]
  reports: ReportMeta[]
  tables: TableSchema[]
  activeTableNames: string[]
  sessionSkillIds: string[]
  sessionMcpServerIds: string[]
  skills: Skill[]
  mcpServers: McpServerConfig[]
  mcpStatus: McpServerStatus[]
  openReportId: string | null
  openPonyId: string | null
  hiringOpen: boolean
  settingsOpen: boolean
  logOpen: boolean
  historyOpen: boolean
  governanceOpen: boolean
  pendingApprovals: ApprovalRequest[]
  approvalHistory: ApprovalRequest[]
  auditLogs: AuditLogEntry[]
  permissionPolicies: PermissionPolicy[]
  selfChecking: boolean

  init(): Promise<void>
  send(text: string, mode?: 'chat' | 'task', solutionId?: string): Promise<void>
  setActiveSolution(solutionId: string, template?: string | null): void
  clearPendingTaskTemplate(): void
  refreshSolutions(): Promise<void>
  saveSolutionDraft(draft: SolutionDraft): Promise<Solution>
  removeSolution(id: string): Promise<void>
  cancelRun(): Promise<void>
  upload(path?: string): Promise<void>
  handleEvent(ev: AgentEvent): void
  startReplay(events: AgentEvent[]): void
  stopReplay(): void
  setReplaySpeed(speed: 1 | 2): void
  openHistory(): void
  closeHistory(): void
  openGovernance(): void
  closeGovernance(): void
  refreshGovernance(): Promise<void>
  handleApprovalRequired(request: ApprovalRequest): void
  decideApproval(requestId: string, decision: ApprovalDecisionValue): Promise<void>
  clearChat(): Promise<void>
  dropTable(table: string): Promise<void>
  setActiveTables(names: string[]): Promise<void>
  removeFromActive(table: string): Promise<void>
  toggleActiveTable(table: string): Promise<void>
  bindSessionSkill(skillId: string): void
  bindSessionMcp(serverId: string): void
  unbindSessionSkill(skillId: string): void
  unbindSessionMcp(serverId: string): void
  getSessionBindings(): SessionBindings
  removeReport(reportId: string): Promise<void>
  loadConfig(): Promise<ModelConfig>
  saveConfig(c: ModelConfig): Promise<void>
  openReport(id: string | null): void
  toggleLog(): void
  openLog(): void
  closeLog(): void
  openPony(id: string): void
  closePony(): void
  openHiring(): void
  closeHiring(): void
  openSettings(): void
  closeSettings(): void
  refreshPonies(): Promise<void>
  refreshSkills(): Promise<void>
  refreshMcp(): Promise<void>
  refreshMcpStatus(): Promise<void>
  savePonyDraft(draft: PonyDraft): Promise<Pony>
  hirePonyForSolution(solutionId: string, draft: PonyDraft): Promise<Pony>
  dismissPonyFromSolution(solutionId: string, ponyId: string): Promise<void>
  dismissPonyGlobally(ponyId: string): Promise<void>
  savePermissionPolicy(policy: PermissionPolicy): Promise<void>
  savePermissionPolicies(policies: PermissionPolicy[]): Promise<void>
  removePony(id: string): Promise<void>
  saveSkillDraft(input: {
    id?: string
    name: string
    description: string
    markdown: string
  }): Promise<void>
  removeSkill(id: string): Promise<void>
  rescanSkills(): Promise<void>
  saveMcpDraft(input: {
    id?: string
    name?: string
    json: string
  }): Promise<void>
  removeMcp(id: string): Promise<void>
  testMcp(id: string): Promise<McpServerStatus>
  runSelfCheck(): Promise<SelfCheckItem[]>
}

export const useAppStore = create<AppState>((set, get) => ({
  ponies: [],
  solutions: [],
  activeSolutionId: readPersistedActiveSolutionId() ?? GENERAL_OFFICE_SOLUTION_ID,
  pendingTaskTemplate: null,
  chat: [],
  streaming: '',
  running: false,
  currentRunId: null,
  cancelling: false,
  replaying: false,
  replayEvents: [],
  replaySpeed: 1,
  events: [],
  reports: [],
  tables: [],
  activeTableNames: [],
  sessionSkillIds: [],
  sessionMcpServerIds: [],
  skills: [],
  mcpServers: [],
  mcpStatus: [],
  openReportId: null,
  openPonyId: null,
  hiringOpen: false,
  settingsOpen: false,
  logOpen: false,
  historyOpen: false,
  governanceOpen: false,
  pendingApprovals: [],
  approvalHistory: [],
  auditLogs: [],
  permissionPolicies: [],
  selfChecking: false,

  init: async () => {
    const [ponies, solutions, chat, reports, tables, activeTableNames, skills, mcpServers, mcpStatus, governance] =
      await Promise.all([
        window.api.listPonies(),
        window.api.listSolutions(),
        window.api.chatHistory(),
        window.api.listReports(),
        window.api.listTables(),
        window.api.getActiveTables(),
        window.api.listSkills(),
        window.api.listMcpServers(),
        window.api.mcpStatus(),
        window.api.governanceState()
      ])
    set({
      ponies,
      solutions,
      activeSolutionId: resolveActiveSolutionId(solutions),
      chat,
      reports,
      tables,
      activeTableNames,
      skills,
      mcpServers,
      mcpStatus,
      pendingApprovals: governance.pending,
      approvalHistory: governance.recentRequests,
      auditLogs: governance.auditLogs,
      permissionPolicies: governance.policies
    })
  },

  send: async (text, mode = 'task', solutionId) => {
    const trimmed = text.trim()
    if (!trimmed || get().running || get().replaying) return
    const runId = crypto.randomUUID()
    const resolvedSolutionId = solutionId ?? get().activeSolutionId
    set({ running: true, streaming: '', currentRunId: runId, cancelling: false })
    try {
      await window.api.chatSend(trimmed, runId, mode, resolvedSolutionId, get().getSessionBindings())
    } catch (err) {
      set((s) => ({
        running: false,
        currentRunId: null,
        cancelling: false,
        chat: [
          ...s.chat,
          {
            id: crypto.randomUUID(),
            role: 'leader',
            content: `出错了：${err instanceof Error ? err.message : String(err)}`,
            createdAt: Date.now()
          }
        ]
      }))
    }
  },

  cancelRun: async () => {
    const { currentRunId, cancelling, running } = get()
    if (!running || !currentRunId || cancelling) return
    set({ cancelling: true })
    await window.api.chatCancel(currentRunId)
  },

  upload: async (path?: string) => {
    if (get().running) {
      await showAppAlert('小马们正在干活，请等本轮任务完成后再上传')
      return
    }
    try {
      const res = await window.api.uploadXlsx(path)
      if (res) set({ tables: res.tables, activeTableNames: res.activeTables })
    } catch (err) {
      await showAppAlert(err instanceof Error ? err.message : String(err))
    }
  },

  handleEvent: (ev) => {
    if (get().replaying) return
    if (ev.type === 'run_started') {
      set((s) => ({
        events: [ev],
        running: true,
        streaming: '',
        chat: [
          ...s.chat,
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: ev.userQuery,
            createdAt: Date.now()
          }
        ]
      }))
      return
    }
    set((s) => ({ events: [...s.events, ev] }))
    switch (ev.type) {
      case 'leader_say':
        set((s) => ({ streaming: s.streaming + ev.text }))
        break
      case 'report_ready':
        set((s) => ({
          reports: [{ id: ev.reportId, title: ev.title, createdAt: Date.now() }, ...s.reports]
        }))
        break
      case 'run_finished':
        set((s) => ({
          running: false,
          streaming: '',
          currentRunId: null,
          cancelling: false,
          chat: [
            ...s.chat,
            {
              id: crypto.randomUUID(),
              role: 'leader',
              content: ev.finalText || s.streaming || '（完成）',
              createdAt: Date.now()
            }
          ]
        }))
        break
    }
  },

  startReplay: (events) => {
    if (get().running || get().replaying) return
    ReplayDirector.get().start(
      events,
      (replayEvents) => set({ replayEvents }),
      (active) => set({ replaying: active, replayEvents: active ? get().replayEvents : [], replaySpeed: 1 })
    )
  },

  stopReplay: () => {
    ReplayDirector.get().stop()
    set({ replaying: false, replayEvents: [], replaySpeed: 1 })
  },

  setReplaySpeed: (speed) => {
    ReplayDirector.get().setSpeed(speed)
    set({ replaySpeed: speed })
  },

  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
  openGovernance: () => {
    set({ governanceOpen: true })
    void get().refreshGovernance()
  },
  closeGovernance: () => set({ governanceOpen: false }),

  refreshGovernance: async () => {
    const governance = await window.api.governanceState()
    set({
      pendingApprovals: governance.pending,
      approvalHistory: governance.recentRequests,
      auditLogs: governance.auditLogs,
      permissionPolicies: governance.policies
    })
  },

  handleApprovalRequired: (request) => {
    set((s) => ({
      pendingApprovals: [request, ...s.pendingApprovals.filter((r) => r.id !== request.id)],
      approvalHistory: [request, ...s.approvalHistory.filter((r) => r.id !== request.id)],
      governanceOpen: true
    }))
  },

  decideApproval: async (requestId, decision) => {
    await window.api.decideApproval({ requestId, decision })
    await get().refreshGovernance()
  },

  clearChat: async () => {
    await window.api.chatClear()
    set({ chat: [], events: [], streaming: '' })
  },

  dropTable: async (table) => {
    const tables = await window.api.dropTable(table)
    const activeTableNames = await window.api.getActiveTables()
    set({ tables, activeTableNames })
  },

  setActiveTables: async (names) => {
    if (get().running || get().replaying || get().selfChecking) {
      await showAppAlert('小马们正在干活，请等本轮任务完成后再调整数据资源')
      return
    }
    try {
      const state = await window.api.setActiveTables(names)
      set({ tables: state.tables, activeTableNames: state.activeTables })
    } catch (err) {
      await showAppAlert(err instanceof Error ? err.message : String(err))
    }
  },

  removeFromActive: async (table) => {
    const { activeTableNames } = get()
    await get().setActiveTables(activeTableNames.filter((t) => t !== table))
  },

  toggleActiveTable: async (table) => {
    const { activeTableNames } = get()
    if (activeTableNames.includes(table)) {
      await get().removeFromActive(table)
    } else {
      await get().setActiveTables([...activeTableNames, table])
    }
  },

  bindSessionSkill: (skillId) => {
    set((s) =>
      s.sessionSkillIds.includes(skillId)
        ? s
        : { sessionSkillIds: [...s.sessionSkillIds, skillId] }
    )
  },

  bindSessionMcp: (serverId) => {
    set((s) =>
      s.sessionMcpServerIds.includes(serverId)
        ? s
        : { sessionMcpServerIds: [...s.sessionMcpServerIds, serverId] }
    )
  },

  unbindSessionSkill: (skillId) => {
    set((s) => ({ sessionSkillIds: s.sessionSkillIds.filter((id) => id !== skillId) }))
  },

  unbindSessionMcp: (serverId) => {
    set((s) => ({ sessionMcpServerIds: s.sessionMcpServerIds.filter((id) => id !== serverId) }))
  },

  getSessionBindings: (): SessionBindings => {
    const { sessionSkillIds, sessionMcpServerIds } = get()
    return { skillIds: sessionSkillIds, mcpServerIds: sessionMcpServerIds }
  },

  removeReport: async (reportId) => {
    const reports = await window.api.deleteReport(reportId)
    const { openReportId } = get()
    set({
      reports,
      openReportId: openReportId === reportId ? null : openReportId
    })
    sceneBus.scene?.syncReportPin(
      reports.length,
      reports.length > 0 ? reports[0].title : undefined
    )
  },

  loadConfig: () => window.api.getConfig(),

  saveConfig: async (c) => {
    await window.api.saveConfig(c)
  },

  openReport: (id) => set({ openReportId: id }),
  toggleLog: () => set((s) => ({ logOpen: !s.logOpen })),
  openLog: () => set({ logOpen: true }),
  closeLog: () => set({ logOpen: false }),
  openPony: (id) => {
    if (!get().ponies.some((p) => p.id === id)) return
    set({ openPonyId: id, hiringOpen: false, settingsOpen: false })
  },
  closePony: () => set({ openPonyId: null }),
  openHiring: () => set({ hiringOpen: true, openPonyId: null, settingsOpen: false }),
  closeHiring: () => set({ hiringOpen: false }),
  openSettings: () => {
    set({ settingsOpen: true, openPonyId: null, hiringOpen: false })
    void get().refreshMcp()
    void get().refreshSkills()
  },
  closeSettings: () => set({ settingsOpen: false }),

  refreshPonies: async () => {
    const ponies = await window.api.listPonies()
    set({ ponies })
  },

  refreshSolutions: async () => {
    const solutions = await window.api.listSolutions()
    set({ solutions })
  },

  saveSolutionDraft: async (draft) => {
    const solution = await window.api.saveSolution(draft)
    await get().refreshSolutions()
    return solution
  },

  removeSolution: async (id) => {
    await window.api.deleteSolution(id)
    if (get().activeSolutionId === id) {
      const nextId = GENERAL_OFFICE_SOLUTION_ID
      persistActiveSolutionId(nextId)
      set({ activeSolutionId: nextId })
    }
    await get().refreshSolutions()
  },

  setActiveSolution: (solutionId, template) => {
    persistActiveSolutionId(solutionId)
    const patch: Partial<Pick<AppState, 'activeSolutionId' | 'pendingTaskTemplate'>> = {
      activeSolutionId: solutionId
    }
    if (template !== undefined) patch.pendingTaskTemplate = template
    set(patch)
  },

  clearPendingTaskTemplate: () => {
    set({ pendingTaskTemplate: null })
  },

  refreshSkills: async () => {
    const skills = await window.api.listSkills()
    set({ skills })
  },

  refreshMcp: async () => {
    const [mcpServers, mcpStatus] = await Promise.all([
      window.api.listMcpServers(),
      window.api.mcpStatus()
    ])
    set({ mcpServers, mcpStatus })
  },

  refreshMcpStatus: async () => {
    const mcpStatus = await window.api.mcpStatus()
    set({ mcpStatus })
  },

  savePonyDraft: async (draft) => {
    const pony = await window.api.savePony(draft)
    await get().refreshPonies()
    await get().refreshGovernance()
    return pony
  },

  hirePonyForSolution: async (solutionId, draft) => {
    const { pony } = await window.api.hirePonyForSolution(solutionId, draft)
    await get().refreshPonies()
    await get().refreshSolutions()
    await get().refreshGovernance()
    return pony
  },

  dismissPonyFromSolution: async (solutionId, ponyId) => {
    if (get().openPonyId === ponyId) get().closePony()
    await window.api.dismissPonyFromSolution(solutionId, ponyId)
    await get().refreshPonies()
    await get().refreshSolutions()
  },

  dismissPonyGlobally: async (ponyId) => {
    if (get().openPonyId === ponyId) get().closePony()
    await window.api.dismissPonyGlobally(ponyId)
    await get().refreshPonies()
    await get().refreshSolutions()
  },

  savePermissionPolicy: async (policy) => {
    await window.api.savePermissionPolicy(policy)
    await get().refreshGovernance()
  },

  savePermissionPolicies: async (policies) => {
    for (const policy of policies) {
      await window.api.savePermissionPolicy(policy)
    }
    await get().refreshGovernance()
  },

  removePony: async (id) => {
    if (get().openPonyId === id) get().closePony()
    await window.api.deletePony(id)
    await get().refreshPonies()
  },

  saveSkillDraft: async (input) => {
    await window.api.saveSkill(input)
    await get().refreshSkills()
  },

  removeSkill: async (id) => {
    await window.api.deleteSkill(id)
    await get().refreshSkills()
    await get().refreshPonies()
  },

  rescanSkills: async () => {
    // listSkills 已会重新扫描工作区 skills/，与 skill:rescan 等价
    await get().refreshSkills()
  },

  saveMcpDraft: async (input) => {
    await window.api.saveMcpServer({ id: input.id, json: input.json })
    await get().refreshMcp()
  },

  removeMcp: async (id) => {
    await window.api.deleteMcpServer(id)
    await get().refreshMcp()
    await get().refreshPonies()
  },

  testMcp: async (id) => {
    const status = await window.api.testMcpServer(id)
    await get().refreshMcpStatus()
    return status
  },

  runSelfCheck: async () => {
    set({ selfChecking: true })
    try {
      return await window.api.selfCheck()
    } finally {
      set({ selfChecking: false })
    }
  }
}))

export const PALETTE_OPTIONS: { id: PaletteId; label: string; color: string }[] = [
  { id: 'linen', label: '亚麻', color: '#f7f1e5' },
  { id: 'camel', label: '驼色', color: '#c9a77c' },
  { id: 'ochre', label: '赭石', color: '#b5835a' },
  { id: 'sage', label: '鼠尾草', color: '#8a9b6e' },
  { id: 'terracotta', label: '赤陶', color: '#c97d5e' }
]

export const ACCESSORY_OPTIONS: { id: AccessoryId; label: string }[] = [
  { id: 'glasses', label: '眼镜' },
  { id: 'bowtie', label: '领结' },
  { id: 'beret', label: '贝雷帽' },
  { id: 'brass-tag', label: '黄铜吊牌' }
]

export function defaultSkin(): PonySkin {
  return { palette: 'linen', accessories: [] }
}
