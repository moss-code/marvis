import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { AgentEvent } from '../shared/types'
import {
  deleteMcpServer,
  deletePony,
  deleteSkill,
  listChatMessages,
  listDataTables,
  listMcpServers,
  listPonies,
  listReports,
  listSkills,
  saveMcpServer,
  savePony,
  saveSkill
} from './db'
import { importXlsx } from './db/xlsx'
import { exportReportPdf, loadReportForView } from './reports'
import { startRun } from './agents'
import { logAgentEvent, logInfo } from './logger'
import { invalidateServer, listStatus, setMcpWindowProvider, testServer } from './mcp'
import { runSelfCheck } from './selfCheck'

let running = false

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  setMcpWindowProvider(getWindow)

  const emit = (e: AgentEvent): void => {
    logAgentEvent(e)
    getWindow()?.webContents.send(IPC.AGENT_EVENT, e)
  }

  ipcMain.handle(IPC.CHAT_SEND, async (_e, text: string, runId: string) => {
    if (typeof text !== 'string' || text.trim().length === 0) return
    if (running) throw new Error('小马们正在干活，请等本轮任务完成')
    logInfo('chat', '用户发起任务', { runId, text: text.trim().slice(0, 120) })
    running = true
    startRun(runId, text.trim(), emit).finally(() => {
      running = false
    })
  })

  ipcMain.handle(IPC.CHAT_HISTORY, () => listChatMessages())

  ipcMain.handle(IPC.FILE_UPLOAD_XLSX, async (_e, path?: string) => {
    let filePath = path
    if (!filePath) {
      const win = getWindow()
      if (!win) return null
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: '上传 xlsx 数据',
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
        properties: ['openFile']
      })
      if (canceled || filePaths.length === 0) return null
      filePath = filePaths[0]
    }
    return { tables: importXlsx(filePath) }
  })

  ipcMain.handle(IPC.DB_LIST_TABLES, () => listDataTables())
  ipcMain.handle(IPC.REPORT_GET, (_e, id: string) => loadReportForView(id))
  ipcMain.handle(IPC.REPORT_LIST, () => listReports())
  ipcMain.handle(IPC.REPORT_EXPORT_PDF, (_e, id: string) => exportReportPdf(id))
  ipcMain.handle(IPC.PONY_LIST, () => listPonies())

  ipcMain.handle(IPC.PONY_SAVE, (_e, draft) => {
    if (running) throw new Error('小马们正在干活，请等本轮任务完成')
    return savePony(draft)
  })

  ipcMain.handle(IPC.PONY_DELETE, (_e, id: string) => {
    if (running) throw new Error('小马们正在干活，请等本轮任务完成')
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
