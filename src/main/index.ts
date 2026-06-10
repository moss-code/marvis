import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { closeAll } from './mcp'
import { initRuntimeEnv } from './runtimeEnv'
import { getWorkspaceDir } from './workspace'

loadEnv({ path: join(app.getAppPath(), '.env') })
initRuntimeEnv()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: '小马办公室',
    backgroundColor: '#EFE8DC',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  getWorkspaceDir()
  initDb()
  createWindow()
  registerIpc(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void closeAll()
})
