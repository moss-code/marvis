import { create } from 'zustand'
import type { AgentEvent, ChatMessage, Pony, ReportMeta, TableSchema } from '@shared/types'

interface AppState {
  ponies: Pony[]
  chat: ChatMessage[]
  /** 领队马本轮流式输出（增量拼接） */
  streaming: string
  running: boolean
  events: AgentEvent[]
  reports: ReportMeta[]
  tables: TableSchema[]
  openReportId: string | null
  logOpen: boolean

  init(): Promise<void>
  send(text: string): Promise<void>
  upload(): Promise<void>
  handleEvent(ev: AgentEvent): void
  openReport(id: string | null): void
  toggleLog(): void
}

export const useAppStore = create<AppState>((set, get) => ({
  ponies: [],
  chat: [],
  streaming: '',
  running: false,
  events: [],
  reports: [],
  tables: [],
  openReportId: null,
  logOpen: true,

  init: async () => {
    const [ponies, chat, reports, tables] = await Promise.all([
      window.api.listPonies(),
      window.api.chatHistory(),
      window.api.listReports(),
      window.api.listTables()
    ])
    set({ ponies, chat, reports, tables })
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
  toggleLog: () => set((s) => ({ logOpen: !s.logOpen }))
}))
