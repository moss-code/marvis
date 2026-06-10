import { create } from 'zustand'
import type {
  AccessoryId,
  AgentEvent,
  ChatMessage,
  McpServerConfig,
  McpServerStatus,
  PaletteId,
  Pony,
  PonyDraft,
  PonySkin,
  ReportMeta,
  Skill,
  TableSchema
} from '@shared/types'

interface AppState {
  ponies: Pony[]
  chat: ChatMessage[]
  streaming: string
  running: boolean
  events: AgentEvent[]
  reports: ReportMeta[]
  tables: TableSchema[]
  skills: Skill[]
  mcpServers: McpServerConfig[]
  mcpStatus: McpServerStatus[]
  openReportId: string | null
  openPonyId: string | null
  hiringOpen: boolean
  settingsOpen: boolean
  logOpen: boolean

  init(): Promise<void>
  send(text: string): Promise<void>
  upload(): Promise<void>
  handleEvent(ev: AgentEvent): void
  openReport(id: string | null): void
  toggleLog(): void
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
}

export const useAppStore = create<AppState>((set, get) => ({
  ponies: [],
  chat: [],
  streaming: '',
  running: false,
  events: [],
  reports: [],
  tables: [],
  skills: [],
  mcpServers: [],
  mcpStatus: [],
  openReportId: null,
  openPonyId: null,
  hiringOpen: false,
  settingsOpen: false,
  logOpen: true,

  init: async () => {
    const [ponies, chat, reports, tables, skills, mcpServers, mcpStatus] = await Promise.all([
      window.api.listPonies(),
      window.api.chatHistory(),
      window.api.listReports(),
      window.api.listTables(),
      window.api.listSkills(),
      window.api.listMcpServers(),
      window.api.mcpStatus()
    ])
    set({ ponies, chat, reports, tables, skills, mcpServers, mcpStatus })
  },

  send: async (text) => {
    const trimmed = text.trim()
    if (!trimmed || get().running) return
    const runId = crypto.randomUUID()
    set({ running: true, streaming: '' })
    try {
      await window.api.chatSend(trimmed, runId)
    } catch (err) {
      set((s) => ({
        running: false,
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

  upload: async () => {
    const res = await window.api.uploadXlsx()
    if (res) set({ tables: res.tables })
  },

  handleEvent: (ev) => {
    set((s) => ({ events: [...s.events, ev] }))
    switch (ev.type) {
      case 'run_started':
        set((s) => ({
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
        break
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

  openReport: (id) => set({ openReportId: id }),
  toggleLog: () => set((s) => ({ logOpen: !s.logOpen })),
  openPony: (id) => set({ openPonyId: id, hiringOpen: false, settingsOpen: false }),
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
    return pony
  },

  removePony: async (id) => {
    await window.api.deletePony(id)
    await get().refreshPonies()
    set({ openPonyId: null })
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
