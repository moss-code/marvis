import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type WindowApi } from '../shared/ipc'
import type { AgentEvent, ApprovalRequest } from '../shared/types'

const api: WindowApi = {
  chatSend: (text, runId) => ipcRenderer.invoke(IPC.CHAT_SEND, text, runId),
  chatHistory: () => ipcRenderer.invoke(IPC.CHAT_HISTORY),
  uploadXlsx: (path) => ipcRenderer.invoke(IPC.FILE_UPLOAD_XLSX, path),
  listTables: () => ipcRenderer.invoke(IPC.DB_LIST_TABLES),
  getActiveTables: () => ipcRenderer.invoke(IPC.DB_GET_ACTIVE_TABLES),
  setActiveTables: (names) => ipcRenderer.invoke(IPC.DB_SET_ACTIVE_TABLES, names),
  getReport: (reportId) => ipcRenderer.invoke(IPC.REPORT_GET, reportId),
  listReports: () => ipcRenderer.invoke(IPC.REPORT_LIST),
  exportPdf: (reportId) => ipcRenderer.invoke(IPC.REPORT_EXPORT_PDF, reportId),
  listPonies: () => ipcRenderer.invoke(IPC.PONY_LIST),
  savePony: (draft) => ipcRenderer.invoke(IPC.PONY_SAVE, draft),
  deletePony: (id) => ipcRenderer.invoke(IPC.PONY_DELETE, id),
  listSkills: () => ipcRenderer.invoke(IPC.SKILL_LIST),
  saveSkill: (s) => ipcRenderer.invoke(IPC.SKILL_SAVE, s),
  deleteSkill: (id) => ipcRenderer.invoke(IPC.SKILL_DELETE, id),
  rescanSkills: () => ipcRenderer.invoke(IPC.SKILL_RESCAN),
  listMcpServers: () => ipcRenderer.invoke(IPC.MCP_LIST),
  saveMcpServer: (c) => ipcRenderer.invoke(IPC.MCP_SAVE, c),
  deleteMcpServer: (id) => ipcRenderer.invoke(IPC.MCP_DELETE, id),
  testMcpServer: (id) => ipcRenderer.invoke(IPC.MCP_TEST, id),
  mcpStatus: () => ipcRenderer.invoke(IPC.MCP_STATUS),
  selfCheck: () => ipcRenderer.invoke(IPC.APP_SELF_CHECK),
  chatCancel: (runId) => ipcRenderer.invoke(IPC.CHAT_CANCEL, runId),
  chatClear: () => ipcRenderer.invoke(IPC.CHAT_CLEAR),
  listRuns: () => ipcRenderer.invoke(IPC.RUN_LIST),
  getRun: (runId) => ipcRenderer.invoke(IPC.RUN_GET, runId),
  dropTable: (table) => ipcRenderer.invoke(IPC.DB_DROP_TABLE, table),
  deleteReport: (reportId) => ipcRenderer.invoke(IPC.REPORT_DELETE, reportId),
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),
  saveConfig: (c) => ipcRenderer.invoke(IPC.CONFIG_SAVE, c),
  governanceState: () => ipcRenderer.invoke(IPC.GOVERNANCE_STATE),
  decideApproval: (decision) => ipcRenderer.invoke(IPC.GOVERNANCE_DECIDE, decision),
  getPermissionPolicy: (ponyId) => ipcRenderer.invoke(IPC.GOVERNANCE_POLICY_GET, ponyId),
  savePermissionPolicy: (policy) => ipcRenderer.invoke(IPC.GOVERNANCE_POLICY_SAVE, policy),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onAgentEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: AgentEvent): void => cb(ev)
    ipcRenderer.on(IPC.AGENT_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_EVENT, listener)
  },
  onApprovalRequired: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, request: ApprovalRequest): void => cb(request)
    ipcRenderer.on(IPC.GOVERNANCE_APPROVAL_REQUIRED, listener)
    return () => ipcRenderer.removeListener(IPC.GOVERNANCE_APPROVAL_REQUIRED, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
