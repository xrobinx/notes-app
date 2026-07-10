import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, Notification, Tray } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerNotesIpc } from './ipc/notes'
import { registerFoldersIpc } from './ipc/folders'
import { registerSettingsIpc, syncWidgetLoginSetting, WIDGET_STARTUP_ARG } from './ipc/settings'
import { registerFilesIpc } from './ipc/files'
import { registerSyncIpc } from './ipc/sync'
import { closeDb } from './database/db'
import { emptyOldTrash } from './database/notesRepository'
import { getRawSetting, getSettings, setRawSetting, setSetting } from './database/settingsRepository'
import { scheduleAutoSync } from './sync/driveSync'
import { getTranslationLanguage } from '../src/utils/languages'
import * as notesRepo from './database/notesRepository'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const widgetWindows = new Map<string, BrowserWindow>()
const reminderTimers = new Map<string, NodeJS.Timeout>()
let appIsQuitting = false
let restoredWidgetsOnLaunch = false
const isWidgetStartupLaunch = process.argv.includes(WIDGET_STARTUP_ARG)
let autoUpdatesStarted = false
let autoSyncStarted = false
const WIDGET_NOTE_ID_KEY = 'widgetNoteId'
const WIDGET_REMINDERS_KEY = 'widgetReminders'
const MAX_TIMER_DELAY = 2147483647

type WidgetType = 'widget' | 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder' | 'all' | 'note' | 'todo'
const widgetTypes: WidgetType[] = ['widget', 'today', 'pinned', 'quick', 'checklist', 'reminder', 'all', 'note', 'todo']
interface PersistedWidgetReminder {
  id: string
  text: string
  dueAt: string
  lastNotifiedAt?: string | null
  done?: boolean
}

function levenshteinDistance(a: string, b: string): number {
  const source = a.toLowerCase()
  const target = b.toLowerCase()
  const matrix = Array.from({ length: source.length + 1 }, (_, index) => [index])
  for (let column = 1; column <= target.length; column += 1) matrix[0][column] = column
  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      )
    }
  }
  return matrix[source.length][target.length]
}

function sortSpellSuggestions(word: string, suggestions: string[]): string[] {
  return [...new Set(suggestions)].sort((a, b) => {
    const aPrefix = a.toLowerCase().startsWith(word.slice(0, 2).toLowerCase()) ? 0 : 1
    const bPrefix = b.toLowerCase().startsWith(word.slice(0, 2).toLowerCase()) ? 0 : 1
    if (aPrefix !== bPrefix) return aPrefix - bPrefix
    return levenshteinDistance(word, a) - levenshteinDistance(word, b)
  })
}

async function translateText(text: string, targetLanguage: string): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'auto')
  url.searchParams.set('tl', targetLanguage)
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Translation failed: ${response.status}`)
  const data = await response.json() as unknown
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Translation response was not understood.')
  return data[0]
    .map((part: unknown) => Array.isArray(part) && typeof part[0] === 'string' ? part[0] : '')
    .join('')
    .trim()
}

function configureSpellchecker(): void {
  const settings = getSettings()
  const language = getTranslationLanguage(settings.translationLanguage)
  const languages = Array.from(new Set(['en-US', language.spellcheck].filter(Boolean)))
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      window.webContents.session.setSpellCheckerLanguages(languages)
    } catch {
      try { window.webContents.session.setSpellCheckerLanguages(['en-US']) } catch { /* ignore */ }
    }
  }
}

function readPersistedWidgetReminders(): PersistedWidgetReminder[] {
  const reminders = getRawSetting<PersistedWidgetReminder[]>(WIDGET_REMINDERS_KEY)
  if (!Array.isArray(reminders)) return []
  return reminders.filter(reminder => {
    const dueTime = new Date(reminder.dueAt).getTime()
    return Boolean(reminder.id && reminder.text?.trim()) && !Number.isNaN(dueTime)
  })
}

function writePersistedWidgetReminders(reminders: PersistedWidgetReminder[]): void {
  setRawSetting(WIDGET_REMINDERS_KEY, reminders)
}

function upsertPersistedWidgetReminder(reminder: PersistedWidgetReminder): void {
  const reminders = readPersistedWidgetReminders()
    .filter(item => item.id !== reminder.id && !item.done)
  writePersistedWidgetReminders([...reminders, reminder])
}

function removePersistedWidgetReminder(id: string): void {
  writePersistedWidgetReminders(readPersistedWidgetReminders().filter(reminder => reminder.id !== id))
}

function markWidgetReminderNotified(id: string): void {
  const now = new Date().toISOString()
  writePersistedWidgetReminders(readPersistedWidgetReminders().map(reminder => (
    reminder.id === id ? { ...reminder, lastNotifiedAt: now } : reminder
  )))
}

function loadRenderer(window: BrowserWindow, widget?: WidgetType): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    const baseUrl = process.env['ELECTRON_RENDERER_URL']
    window.loadURL(widget ? `${baseUrl}?widget=${widget}` : baseUrl)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), widget ? { query: { widget } } : undefined)
  }
}

function registerZoomShortcuts(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (!(input.control || input.meta) || input.alt) return
    const key = input.key.toLowerCase()
    const code = input.code
    const isZoomIn = key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd'
    const isZoomOut = key === '-' || code === 'Minus' || code === 'NumpadSubtract'
    const isReset = key === '0' || code === 'Digit0' || code === 'Numpad0'
    if (!isZoomIn && !isZoomOut && !isReset) return

    event.preventDefault()
    if (isReset) {
      window.webContents.setZoomFactor(1)
      return
    }

    const current = window.webContents.getZoomFactor()
    const next = isZoomIn
      ? Math.min(2, current + 0.1)
      : Math.max(0.5, current - 0.1)
    window.webContents.setZoomFactor(Number(next.toFixed(2)))
  })
}

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.ico')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1c1c1e',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  })

  registerZoomShortcuts(mainWindow)

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    const settings = getSettings()
    const targetLanguage = getTranslationLanguage(settings.translationLanguage)
    const selectedText = params.selectionText.trim()
    const template: Electron.MenuItemConstructorOptions[] = sortSpellSuggestions(params.misspelledWord, params.dictionarySuggestions)
      .slice(0, 6)
      .map(suggestion => ({
      label: suggestion,
      click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
    }))
    if (params.misspelledWord.length > 0) {
      if (template.length === 0) template.push({ label: 'No spelling suggestions', enabled: false })
      template.push({ label: 'Add to dictionary', click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) })
    }
    if (selectedText) {
      if (template.length > 0) template.push({ type: 'separator' })
      template.push({
        label: `Translate selection to ${targetLanguage.label}`,
        click: async () => {
          try {
            const translated = await translateText(selectedText, targetLanguage.code)
            await mainWindow?.webContents.executeJavaScript(
              `document.execCommand('insertText', false, ${JSON.stringify(translated)})`
            )
          } catch {
            mainWindow?.webContents.send('update:status', 'Translation failed. Check your internet connection.')
          }
        },
      })
    }
    if (template.length === 0) return
    Menu.buildFromTemplate(template).popup()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (!restoredWidgetsOnLaunch) {
      restoredWidgetsOnLaunch = true
      setTimeout(restoreWidgets, 150)
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow!.webContents.send('window:state-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow!.webContents.send('window:state-changed', false)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadRenderer(mainWindow)
  configureSpellchecker()
}

function startFullAppServices(): void {
  if (!autoUpdatesStarted) {
    setupAutoUpdates()
    autoUpdatesStarted = true
  }
  if (!autoSyncStarted && !getSettings().performanceMode) {
    scheduleAutoSync(5000)
    autoSyncStarted = true
  }
}

function ensureMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  return mainWindow!
}

function showMainWindow(): BrowserWindow {
  const window = ensureMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  startFullAppServices()
  return window
}

function getOrCreateWidgetNote() {
  const savedId = getRawSetting<string>(WIDGET_NOTE_ID_KEY)
  const savedNote = savedId ? notesRepo.getNote(savedId) : null
  if (savedNote && !savedNote.deletedAt) return savedNote

  const note = notesRepo.createNote(null)
  notesRepo.updateNote(note.id, {
    title: 'Notes Widget',
    plainText: '',
  })
  setRawSetting(WIDGET_NOTE_ID_KEY, note.id)
  return notesRepo.getNote(note.id) ?? note
}

function openWidget(type: WidgetType): void {
  if (!widgetTypes.includes(type)) return
  if (getSettings().performanceMode) return
  const widgetKey: WidgetType = 'widget'

  const existing = widgetWindows.get(widgetKey)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    existing.moveTop()
    return
  }

  const sizes: Record<WidgetType, { width: number; height: number }> = {
    widget: { width: 456, height: 654 },
    today: { width: 340, height: 500 },
    pinned: { width: 320, height: 310 },
    quick: { width: 300, height: 260 },
    checklist: { width: 310, height: 370 },
    reminder: { width: 320, height: 360 },
    all: { width: 340, height: 500 },
    note: { width: 300, height: 260 },
    todo: { width: 310, height: 370 },
  }
  const size = sizes[widgetKey]
  const savedBounds = getSettings().widgetBounds[widgetKey]
  const widgetWindow = new BrowserWindow({
    width: savedBounds?.width ?? size.width,
    height: savedBounds?.height ?? size.height,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 330,
    minHeight: 430,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  })

  registerZoomShortcuts(widgetWindow)

  widgetWindows.set(widgetKey, widgetWindow)
  persistOpenWidgets()

  const saveWidgetBounds = () => {
    const settings = getSettings()
    setSetting('widgetBounds', {
      ...settings.widgetBounds,
      [widgetKey]: widgetWindow.getBounds(),
    })
  }

  widgetWindow.on('ready-to-show', () => {
    widgetWindow.show()
    widgetWindow.moveTop()
    widgetWindow.focus()
  })
  widgetWindow.on('moved', saveWidgetBounds)
  widgetWindow.on('resized', saveWidgetBounds)
  widgetWindow.on('maximize', () => widgetWindow.unmaximize())
  widgetWindow.on('enter-full-screen', () => widgetWindow.setFullScreen(false))
  widgetWindow.on('close', saveWidgetBounds)
  widgetWindow.on('closed', () => {
    widgetWindows.delete(widgetKey)
    if (!appIsQuitting) persistOpenWidgets()
  })
  loadRenderer(widgetWindow, widgetKey)
  configureSpellchecker()
}

function persistOpenWidgets(): void {
  setSetting('openWidgets', Array.from(widgetWindows.keys()).filter(type => widgetTypes.includes(type as WidgetType)))
}

function restoreWidgets(): void {
  const settings = getSettings()
  if (settings.performanceMode) return
  for (const type of settings.openWidgets) {
    openWidget(type)
  }
}

function createTray(): void {
  if (tray) return

  const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.ico'))
  tray = new Tray(icon)
  tray.setToolTip('Notes')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Notes',
      click: () => showMainWindow()
    },
    {
      label: 'Desktop Widgets',
      submenu: [
        { label: 'Notes Widget', click: () => openWidget('widget') },
      ]
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]))

  tray.on('click', () => {
    showMainWindow()
  })
}

function setupAutoUpdates(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => mainWindow?.webContents.send('update:status', 'Checking for updates...'))
  autoUpdater.on('update-available', () => mainWindow?.webContents.send('update:status', 'Update found. Downloading...'))
  autoUpdater.on('update-not-available', () => mainWindow?.webContents.send('update:status', 'App is up to date.'))
  autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update:status', 'Update ready. It will install when the app closes.'))
  autoUpdater.on('error', error => mainWindow?.webContents.send('update:status', `Update error: ${error.message}`))
  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify()
  }, 6000)
}

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.on('window:close-current', event => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})
ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.handle('widgets:open', (_event, type: WidgetType) => openWidget(type))
ipcMain.handle('widgets:load-note', () => getOrCreateWidgetNote())
ipcMain.handle('widgets:save-note', (_event, patch: { title?: string; body: string; plainText: string }) => {
  const note = getOrCreateWidgetNote()
  notesRepo.updateNote(note.id, {
    title: patch.title?.trim() || note.title || 'Note Title',
    body: patch.body,
    plainText: patch.plainText,
  })
  scheduleAutoSync()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('notes:updated', note.id)
  }
  return notesRepo.getNote(note.id)
})
ipcMain.handle('widgets:open-note', (_event, noteId: string) => {
  setSetting('lastOpenNoteId', noteId)
  const window = showMainWindow()
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', () => window.webContents.send('notes:open-note', noteId))
  } else {
    window.webContents.send('notes:open-note', noteId)
  }
  return { ok: true }
})
ipcMain.handle('language:refresh-spellchecker', () => configureSpellchecker())
function showReminderNotification(reminder: { id: string; text: string }): void {
  const icon = join(__dirname, '../../resources/icon.ico')
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Notes reminder',
      body: reminder.text,
      icon,
    })
    notification.on('click', () => showMainWindow())
    notification.show()
  } else {
    try {
      tray?.displayBalloon({
        title: 'Notes reminder',
        content: reminder.text,
        icon: nativeImage.createFromPath(icon),
      })
    } catch {
      // Windows notifications are best effort and can be blocked by system settings.
    }
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('widgets:reminder-fired', reminder.id)
  }
}

function clearWidgetReminderTimer(id: string): void {
  const timer = reminderTimers.get(id)
  if (timer) clearTimeout(timer)
  reminderTimers.delete(id)
}

function scheduleWidgetReminderTimer(reminder: PersistedWidgetReminder): void {
  const dueTime = new Date(reminder.dueAt).getTime()
  const delay = dueTime - Date.now()
  clearWidgetReminderTimer(reminder.id)
  if (reminder.done || Number.isNaN(dueTime)) return
  if (delay <= 0) {
    if (reminder.lastNotifiedAt) return
    showReminderNotification(reminder)
    markWidgetReminderNotified(reminder.id)
    return
  }
  const timer = setTimeout(() => {
    if (dueTime - Date.now() > 0) {
      scheduleWidgetReminderTimer(reminder)
      return
    }
    showReminderNotification(reminder)
    markWidgetReminderNotified(reminder.id)
    reminderTimers.delete(reminder.id)
  }, Math.min(delay, MAX_TIMER_DELAY))
  reminderTimers.set(reminder.id, timer)
}

function restoreWidgetReminderTimers(): void {
  for (const reminder of readPersistedWidgetReminders()) {
    scheduleWidgetReminderTimer(reminder)
  }
}

ipcMain.handle('widgets:schedule-reminder', (_event, reminder: { id: string; text: string; dueAt: string }) => {
  const dueTime = new Date(reminder.dueAt).getTime()
  if (!reminder.text.trim() || Number.isNaN(dueTime)) {
    return { ok: false, error: 'Choose a valid date and time.' }
  }
  const existing = readPersistedWidgetReminders().find(item => item.id === reminder.id)
  const persisted = {
    id: reminder.id,
    text: reminder.text.trim(),
    dueAt: reminder.dueAt,
    done: false,
    lastNotifiedAt: existing?.dueAt === reminder.dueAt ? existing.lastNotifiedAt ?? null : null,
  }
  upsertPersistedWidgetReminder(persisted)
  scheduleWidgetReminderTimer(persisted)
  return { ok: true }
})
ipcMain.handle('widgets:cancel-reminder', (_event, id: string) => {
  clearWidgetReminderTimer(id)
  removePersistedWidgetReminder(id)
  return { ok: true }
})

// Native theme
nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.notesapp.windows')
  // Register all IPC handlers
  registerNotesIpc()
  registerFoldersIpc()
  registerSettingsIpc()
  registerFilesIpc()
  registerSyncIpc()

  createTray()
  syncWidgetLoginSetting()
  restoreWidgetReminderTimers()

  if (isWidgetStartupLaunch) {
    openWidget('widget')
  } else {
    createWindow()
    startFullAppServices()
  }

  // Clean up old trash on launch
  try { emptyOldTrash() } catch { /* ignore */ }

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', () => {
  appIsQuitting = true
  for (const window of widgetWindows.values()) {
    if (!window.isDestroyed()) {
      const type = Array.from(widgetWindows.entries()).find(([, candidate]) => candidate === window)?.[0]
      const settings = getSettings()
      if (type) {
        setSetting('widgetBounds', {
          ...settings.widgetBounds,
          [type]: window.getBounds(),
        })
      }
    }
  }
  persistOpenWidgets()
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
