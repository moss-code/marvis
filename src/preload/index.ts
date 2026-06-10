import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type WindowApi } from '../shared/ipc'
import type { AgentEvent } from '../shared/types'

const api: WindowApi = {
  chatSend: (text, runId) => ipcRenderer.invoke(IPC.CHAT_SEND, text, runId),
  chatHistory: () => ipcRenderer.invoke(IPC.CHAT_HISTORY),
  uploadXlsx: (path) => ipcRenderer.invoke(IPC.FILE_UPLOAD_XLSX, path),
  listTables: () => ipcRenderer.invoke(IPC.DB_LIST_TABLES),
  getReport: (reportId) => ipcRenderer.invoke(IPC.REPORT_GET, reportId),
  listReports: () => ipcRenderer.invoke(IPC.REPORT_LIST),
  exportPdf: (reportId) => ipcRenderer.invoke(IPC.REPORT_EXPORT_PDF, reportId),
  listPonies: () => ipcRenderer.invoke(IPC.PONY_LIST),
  onAgentEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: AgentEvent): void => cb(ev)
    ipcRenderer.on(IPC.AGENT_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_EVENT, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
