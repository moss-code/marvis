import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { AgentEvent, ModelConfig } from '../shared/types'
import {
  clearChatMessages,
  deleteMcpServer,
  deletePony,
  deleteReport,
  deleteSkill,
  appendActiveTableNames,
  dropDataTable,
  getActiveTableNames,
  getDataResourceState,
  getRunEvents,
  listChatMessages,
  listDataTables,
  setActiveTableNames,
  listMcpServers,
  listPonies,
  listReports,
  listRuns,
  listSkills,
  saveMcpServer,
  savePony,
  saveSkill
} from './db'
import { importTabular } from './db/tabular'
import { exportReportPdf, loadReportForView } from './reports'
import { startRun } from './agents'
import { logAgentEvent, logInfo } from './logger'
import { invalidateServer, listStatus, setMcpWindowProvider, testServer } from './mcp'
import { runSelfCheck } from './selfCheck'
import { getModelConfig, saveModelConfig } from './config'
import {
  getGovernanceState,
  getPermissionPolicy,
  resolveApprovalDecision,
  savePermissionPolicy,
  setGovernanceWindowProvider
} from './governance'
import type { ApprovalDecision, PermissionPolicy } from '../shared/types'

let running = false
let currentRun: { runId: string; controller: AbortController } | null = null

function assertNotRunning(): void {
  if (running) throw new Error('小马们正在干活，请等本轮任务完成')
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  setMcpWindowProvider(getWindow)
  setGovernanceWindowProvider(getWindow)

  const emit = (e: AgentEvent): void => {
    logAgentEvent(e)
    getWindow()?.webContents.send(IPC.AGENT_EVENT, e)
  }

  ipcMain.handle(IPC.CHAT_SEND, async (_e, text: string, runId: string) => {
    if (typeof text !== 'string' || text.trim().length === 0) return
    if (running) throw new Error('小马们正在干活，请等本轮任务完成')
    logInfo('chat', '用户发起任务', { runId, text: text.trim().slice(0, 120) })
    running = true
    const controller = new AbortController()
    currentRun = { runId, controller }
    startRun(runId, text.trim(), emit, controller.signal).finally(() => {
      running = false
      currentRun = null
    })
  })

  ipcMain.handle(IPC.CHAT_CANCEL, (_e, runId: string) => {
    if (currentRun?.runId === runId) {
      currentRun.controller.abort()
    }
  })

  ipcMain.handle(IPC.CHAT_CLEAR, () => {
    assertNotRunning()
    clearChatMessages()
  })

  ipcMain.handle(IPC.RUN_LIST, () => listRuns())
  ipcMain.handle(IPC.RUN_GET, (_e, runId: string) => getRunEvents(runId))

  ipcMain.handle(IPC.DB_DROP_TABLE, (_e, table: string) => {
    assertNotRunning()
    dropDataTable(table)
    return listDataTables()
  })

  ipcMain.handle(IPC.REPORT_DELETE, (_e, reportId: string) => {
    assertNotRunning()
    deleteReport(reportId)
    return listReports()
  })

  ipcMain.handle(IPC.CONFIG_GET, () => getModelConfig())
  ipcMain.handle(IPC.CONFIG_SAVE, (_e, c: ModelConfig) => {
    assertNotRunning()
    saveModelConfig(c)
  })

  ipcMain.handle(IPC.GOVERNANCE_STATE, () => getGovernanceState())
  ipcMain.handle(IPC.GOVERNANCE_DECIDE, (_e, decision: ApprovalDecision) =>
    resolveApprovalDecision(decision)
  )
  ipcMain.handle(IPC.GOVERNANCE_POLICY_GET, (_e, ponyId: string) => getPermissionPolicy(ponyId))
  ipcMain.handle(IPC.GOVERNANCE_POLICY_SAVE, (_e, policy: PermissionPolicy) =>
    savePermissionPolicy(policy)
  )

  ipcMain.handle(IPC.CHAT_HISTORY, () => listChatMessages())

  ipcMain.handle(IPC.FILE_UPLOAD_XLSX, async (_e, path?: string) => {
    if (running) throw new Error('小马们正在干活，请等本轮任务完成')
    let filePath = path
    if (!filePath) {
      const win = getWindow()
      if (!win) return null
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: '上传数据文件',
        filters: [
          { name: '数据文件', extensions: ['xlsx', 'xls', 'csv', 'txt'] },
          { name: 'Excel', extensions: ['xlsx', 'xls'] },
          { name: 'CSV', extensions: ['csv'] },
          { name: '文本', extensions: ['txt'] }
        ],
        properties: ['openFile']
      })
      if (canceled || filePaths.length === 0) return null
      filePath = filePaths[0]
    }
    const before = new Set(listDataTables().map((t) => t.table))
    const tables = importTabular(filePath)
    const imported = tables.map((t) => t.table).filter((name) => !before.has(name))
    const activeTables = appendActiveTableNames(imported)
    return { tables, activeTables }
  })

  ipcMain.handle(IPC.DB_LIST_TABLES, () => listDataTables())
  ipcMain.handle(IPC.DB_GET_ACTIVE_TABLES, () => getActiveTableNames())
  ipcMain.handle(IPC.DB_SET_ACTIVE_TABLES, (_e, names: string[]) => {
    assertNotRunning()
    if (!Array.isArray(names)) throw new Error('无效的 Active 表列表')
    setActiveTableNames(names)
    return getDataResourceState()
  })
  ipcMain.handle(IPC.REPORT_GET, (_e, id: string) => loadReportForView(id))
  ipcMain.handle(IPC.REPORT_LIST, () => listReports())
  ipcMain.handle(IPC.REPORT_EXPORT_PDF, (_e, id: string) => exportReportPdf(id))
  ipcMain.handle(IPC.PONY_LIST, () => listPonies())

  ipcMain.handle(IPC.PONY_SAVE, (_e, draft) => {
    assertNotRunning()
    return savePony(draft)
  })

  ipcMain.handle(IPC.PONY_DELETE, (_e, id: string) => {
    assertNotRunning()
    deletePony(id)
  })

  ipcMain.handle(IPC.SKILL_LIST, () => listSkills())

  ipcMain.handle(IPC.SKILL_SAVE, (_e, input) => saveSkill(input))

  ipcMain.handle(IPC.SKILL_DELETE, (_e, id: string) => deleteSkill(id))

  ipcMain.handle(IPC.SKILL_RESCAN, () => listSkills())

  ipcMain.handle(IPC.MCP_LIST, () => listMcpServers())

  ipcMain.handle(IPC.MCP_SAVE, (_e, input) => {
    const cfg = saveMcpServer(input)
    invalidateServer(cfg.id)
    return cfg
  })

  ipcMain.handle(IPC.MCP_DELETE, (_e, id: string) => {
    deleteMcpServer(id)
    invalidateServer(id)
  })

  ipcMain.handle(IPC.MCP_TEST, (_e, id: string) => testServer(id))

  ipcMain.handle(IPC.MCP_STATUS, () => listStatus())

  ipcMain.handle(IPC.APP_SELF_CHECK, () => runSelfCheck())
}
