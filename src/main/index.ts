import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { initDb } from './db'
import { registerIpc } from './ipc'
import { closeAll } from './mcp'
import { initRuntimeEnv } from './runtimeEnv'
import { getWorkspaceDir } from './workspace'
import { loadEnvFile } from './envPath'
import { onSchedulerTick } from './automation/executor'
import { startAutomationScheduler, stopAutomationScheduler } from './automation/scheduler'

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

loadEnvFile()
initRuntimeEnv()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function showMainWindow(): void {
  if (!mainWindow) createWindow()
  else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('翼智小马')
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => showMainWindow())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
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

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

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
  createTray()
  registerIpc(() => mainWindow)
  startAutomationScheduler(onSchedulerTick)

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && quitting) app.quit()
})

app.on('before-quit', () => {
  quitting = true
  stopAutomationScheduler()
  void closeAll()
})
