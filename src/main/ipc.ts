import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { AgentEvent } from '../shared/types'
import { listChatMessages, listDataTables, listPonies, listReports } from './db'
import { importXlsx } from './db/xlsx'
import { exportReportPdf, loadReportForView } from './reports'
import { startRun } from './agents'

let running = false

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const emit = (e: AgentEvent): void => {
    getWindow()?.webContents.send(IPC.AGENT_EVENT, e)
  }

  ipcMain.handle(IPC.CHAT_SEND, async (_e, text: string, runId: string) => {
    if (typeof text !== 'string' || text.trim().length === 0) return
    if (running) throw new Error('小马们正在干活，请等本轮任务完成')
    running = true
    // 受理即返回，过程经 agent:event 推送
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
}
