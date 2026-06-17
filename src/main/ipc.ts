import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC } from '../shared/ipc'
import type { AgentEvent, AutomationJobDraft, ModelConfig, UserPreferences } from '../shared/types'
import {
  clearChatMessages,
  deleteMcpServer,
  deletePony,
  dismissPonyFromSolution,
  dismissPonyGlobally,
  hirePonyForSolution,
  deleteReport,
  deleteSkill,
  appendActiveTableNames,
  dropDataTable,
  getActiveTableNames,
  getDataResourceState,
  getRunEvents,
  getSolution,
  listChatMessages,
  listDataTables,
  setActiveTableNames,
  listMcpServers,
  listPonies,
  listReports,
  listRuns,
  listSkills,
  listSolutions,
  saveMcpServer,
  savePony,
  saveSkill,
  saveSolution,
  deleteSolution
} from './db'
import { getAutomationJob } from './db/automation'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from './db/notifications'
import { getUserPreferences, saveUserPreferences } from './db/preferences'
import { importTabular } from './db/tabular'
import { exportReportPdf, loadReportForView } from './reports'
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
import type { ApprovalDecision, PermissionPolicy, PonyDraft, SolutionDraft } from '../shared/types'
import {
  installSkillFromSkillsSh,
  repairWorkspaceSkillsIfNeeded,
  searchSkillsSh
} from './skills/registry'
import {
  deleteAutomationJob,
  listJobsWithStatus,
  saveAutomationJob,
  toggleAutomationJob,
  triggerAutomationJob
} from './automation/executor'
import { listAutomationTemplates } from './automation/templates'
import {
  cancelQueuedRun,
  enqueueManualRun,
  initRunQueue,
  isRunBusy
} from './automation/queue'

function assertNotRunning(): void {
  if (isRunBusy()) throw new Error('小马们正在干活，请等本轮任务完成')
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  setMcpWindowProvider(getWindow)
  setGovernanceWindowProvider(getWindow)

  const emit = (e: AgentEvent): void => {
    logAgentEvent(e)
    getWindow()?.webContents.send(IPC.AGENT_EVENT, e)
  }

  initRunQueue(emit)

  ipcMain.handle(
    IPC.CHAT_SEND,
    async (
      _e,
      text: string,
      runId: string,
      mode: 'chat' | 'task' = 'task',
      solutionId?: string,
      bindings?: { skillIds?: string[]; mcpServerIds?: string[] }
    ) => {
      if (typeof text !== 'string' || text.trim().length === 0) return
      const sessionBindings = {
        skillIds: Array.isArray(bindings?.skillIds) ? bindings.skillIds.filter((id) => typeof id === 'string') : [],
        mcpServerIds: Array.isArray(bindings?.mcpServerIds)
          ? bindings.mcpServerIds.filter((id) => typeof id === 'string')
          : []
      }
      logInfo('chat', mode === 'chat' ? '用户发起咨询' : '用户发起任务', {
        runId,
        mode,
        solutionId: solutionId ?? null,
        sessionSkills: sessionBindings.skillIds,
        sessionMcp: sessionBindings.mcpServerIds,
        text: text.trim().slice(0, 120)
      })
      enqueueManualRun(runId, text.trim(), mode, solutionId, sessionBindings)
    }
  )

  ipcMain.handle(IPC.CHAT_CANCEL, (_e, runId: string) => {
    cancelQueuedRun(runId)
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
    if (isRunBusy()) throw new Error('小马们正在干活，请等本轮任务完成')
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

  ipcMain.handle(IPC.PONY_HIRE_FOR_SOLUTION, (_e, solutionId: string, draft: PonyDraft) => {
    assertNotRunning()
    return hirePonyForSolution(solutionId, draft)
  })

  ipcMain.handle(IPC.PONY_DISMISS_FROM_SOLUTION, (_e, solutionId: string, ponyId: string) => {
    assertNotRunning()
    return dismissPonyFromSolution(solutionId, ponyId)
  })

  ipcMain.handle(IPC.PONY_DISMISS_GLOBAL, (_e, ponyId: string) => {
    assertNotRunning()
    return dismissPonyGlobally(ponyId)
  })

  ipcMain.handle(IPC.SOLUTION_LIST, () => listSolutions())
  ipcMain.handle(IPC.SOLUTION_GET, (_e, id: string) => getSolution(id))
  ipcMain.handle(IPC.SOLUTION_SAVE, (_e, draft: SolutionDraft) => {
    assertNotRunning()
    return saveSolution(draft)
  })

  ipcMain.handle(IPC.SOLUTION_DELETE, (_e, id: string) => {
    assertNotRunning()
    deleteSolution(id)
  })

  ipcMain.handle(IPC.SKILL_LIST, async () => {
    await repairWorkspaceSkillsIfNeeded()
    return listSkills()
  })

  ipcMain.handle(IPC.SKILL_SAVE, (_e, input) => saveSkill(input))

  ipcMain.handle(IPC.SKILL_DELETE, (_e, id: string) => deleteSkill(id))

  ipcMain.handle(IPC.SKILL_RESCAN, async () => {
    await repairWorkspaceSkillsIfNeeded()
    return listSkills()
  })

  ipcMain.handle(IPC.SKILL_REGISTRY_SEARCH, (_e, query: string, limit?: number) =>
    searchSkillsSh(query, limit)
  )

  ipcMain.handle(
    IPC.SKILL_REGISTRY_INSTALL,
    (_e, input: { source: string; skillId: string; id?: string }) => {
      assertNotRunning()
      return installSkillFromSkillsSh(input)
    }
  )

  ipcMain.handle(IPC.APP_OPEN_URL, (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
      throw new Error('无效的 URL')
    }
    return shell.openExternal(url.trim())
  })

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

  ipcMain.handle(IPC.AUTOMATION_LIST, () => listJobsWithStatus())
  ipcMain.handle(IPC.AUTOMATION_GET, (_e, id: string) => getAutomationJob(id))
  ipcMain.handle(
    IPC.AUTOMATION_SAVE,
    (
      _e,
      draft: AutomationJobDraft,
      attachmentSources?: { sourcePath: string; fileName: string }[]
    ) => saveAutomationJob(draft, attachmentSources)
  )
  ipcMain.handle(IPC.AUTOMATION_DELETE, (_e, id: string) => {
    deleteAutomationJob(id)
  })
  ipcMain.handle(IPC.AUTOMATION_TOGGLE, (_e, id: string, enabled: boolean) =>
    toggleAutomationJob(id, enabled)
  )
  ipcMain.handle(IPC.AUTOMATION_RUN_NOW, (_e, id: string) => triggerAutomationJob(id))
  ipcMain.handle(IPC.AUTOMATION_TEMPLATES, () => listAutomationTemplates())

  ipcMain.handle(IPC.NOTIFICATION_LIST, () => listNotifications())
  ipcMain.handle(IPC.NOTIFICATION_MARK_READ, (_e, id: string) => {
    markNotificationRead(id)
  })
  ipcMain.handle(IPC.NOTIFICATION_MARK_ALL_READ, () => {
    markAllNotificationsRead()
  })

  ipcMain.handle(IPC.PREFERENCES_GET, () => getUserPreferences())
  ipcMain.handle(IPC.PREFERENCES_SAVE, (_e, prefs: UserPreferences) => saveUserPreferences(prefs))
}
