import { BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { app } from 'electron'
import mammoth from 'mammoth'
import AdmZip from 'adm-zip'
import { closeDb, getDb } from '../database/db'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'Note'
}

function buildPdfHtml(title: string, emoji: string, noteHtml: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 22mm 18mm; }
    body {
      margin: 0;
      color: #1d1d1f;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.58;
    }
    .note-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e5ea;
      font-size: 25px;
      line-height: 1.2;
      font-weight: 750;
    }
    .emoji { font-size: 30px; line-height: 1; }
    p { margin: 0 0 0.55em; }
    h1, h2, h3, h4, h5, h6 { margin: 0.75em 0 0.35em; line-height: 1.25; }
    h1 { font-size: 28px; }
    h2 { font-size: 22px; }
    h3 { font-size: 18px; }
    ul, ol { padding-left: 1.45em; margin: 0.45em 0; }
    blockquote {
      border-left: 3px solid #ffd60a;
      margin: 0.85em 0;
      padding: 0.35em 0 0.35em 1em;
      color: #555;
      font-style: italic;
    }
    hr { border: none; border-top: 1px solid #d1d1d6; margin: 1em 0; }
    a { color: #0a84ff; text-decoration: underline; }
    code {
      background: #f2f2f7;
      border-radius: 4px;
      padding: 2px 5px;
      font-family: "Cascadia Code", Consolas, monospace;
      font-size: 0.9em;
      color: #bf5af2;
    }
    pre {
      background: #14141b;
      color: #e2e8f0;
      border-radius: 8px;
      padding: 14px 16px;
      margin: 0.9em 0;
      overflow: hidden;
      page-break-inside: avoid;
    }
    pre code {
      display: block;
      padding: 0;
      background: transparent;
      color: inherit;
      line-height: 1.65;
      white-space: pre-wrap;
      font-family: "Cascadia Code", Consolas, monospace;
      font-size: 12px;
    }
    .hljs-keyword { color: #c792ea; font-style: italic; }
    .hljs-string { color: #c3e88d; }
    .hljs-comment { color: #6b7d86; font-style: italic; }
    .hljs-function, .hljs-title { color: #82aaff; }
    .hljs-number { color: #f78c6c; }
    .hljs-built_in, .hljs-operator, .hljs-meta, .hljs-punctuation { color: #89ddff; }
    .hljs-attr, .hljs-selector-tag, .hljs-tag { color: #f07178; }
    .hljs-type, .hljs-selector-class { color: #ffcb6b; }
    table { border-collapse: collapse; width: 100%; margin: 0.9em 0; table-layout: fixed; page-break-inside: avoid; }
    td, th { border: 1px solid #c7c7cc; padding: 8px 10px; vertical-align: top; }
    th { background: #f2f2f7; color: #3a3a3c; font-weight: 650; }
    img { max-width: 100%; height: auto; border-radius: 6px; display: block; margin: 0.8em 0; page-break-inside: avoid; }
    mark { border-radius: 3px; padding: 1px 2px; }
    file-attachment {
      display: inline-block;
      max-width: 360px;
      border: 1px solid #d1d1d6;
      border-radius: 8px;
      padding: 9px 11px;
      margin: 0.7em 0;
      background: #f5f5f7;
      color: #1d1d1f;
      font-weight: 600;
    }
    file-attachment::before { content: "Attachment: "; color: #6e6e73; font-weight: 500; }
  </style>
</head>
<body>
  <h1 class="note-title"><span class="emoji">${escapeHtml(emoji)}</span><span>${escapeHtml(title)}</span></h1>
  <main>${noteHtml}</main>
</body>
</html>`
}

export function registerFilesIpc(): void {
  ipcMain.handle('files:save-attachment', (_e, noteId: string, buffer: ArrayBuffer, filename: string) => {
    const dir = join(app.getPath('userData'), 'attachments', noteId)
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, filename)
    writeFileSync(filePath, Buffer.from(buffer))
    return filePath
  })

  ipcMain.handle('files:open-path', (_e, filePath: string) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('files:show-save-dialog', async (_e, defaultName: string, filters: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('files:export-note-pdf', async (_e, title: string, emoji: string, html: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `${sanitizeFileName(title)}.pdf`,
      filters: [{ name: 'PDF document', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false,
        webSecurity: false
      }
    })

    try {
      win.setTitle(title || 'Note')
      const tempHtmlPath = join(app.getPath('temp'), `${sanitizeFileName(title)}-${Date.now()}.html`)
      writeFileSync(tempHtmlPath, buildPdfHtml(title, emoji, html), 'utf8')
      await win.loadFile(tempHtmlPath)
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      })
      writeFileSync(result.filePath, pdf)
      try { unlinkSync(tempHtmlPath) } catch { /* ignore temp cleanup */ }
      return result.filePath
    } finally {
      win.destroy()
    }
  })

  ipcMain.handle('files:export-text-file', async (_e, defaultName: string, content: string, extension: string, typeName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `${sanitizeFileName(defaultName)}.${extension}`,
      filters: [{ name: typeName, extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return null
    writeFileSync(result.filePath, content, 'utf8')
    return result.filePath
  })

  ipcMain.handle('files:import-text-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Notes and documents', extensions: ['txt', 'md', 'markdown', 'html', 'htm', 'docx'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const extension = filePath.split('.').pop()?.toLowerCase()
    if (extension === 'docx') {
      const converted = await mammoth.convertToHtml({ path: filePath })
      return {
        name: filePath.split(/[\\/]/).pop() ?? 'Imported note',
        content: converted.value,
        format: 'html',
        warnings: converted.messages.map(message => message.message)
      }
    }
    return {
      name: filePath.split(/[\\/]/).pop() ?? 'Imported note',
      content: readFileSync(filePath, 'utf8'),
      format: extension === 'html' || extension === 'htm' ? 'html' : extension === 'md' || extension === 'markdown' ? 'markdown' : 'text'
    }
  })

  ipcMain.handle('files:export-local-backup', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `Notes Backup ${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'Notes backup', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return null

    const userData = app.getPath('userData')
    const tempDbPath = join(app.getPath('temp'), `notes-backup-${Date.now()}.db`)
    const zip = new AdmZip()
    await getDb().backup(tempDbPath)
    zip.addLocalFile(tempDbPath, '', 'notes.db')
    if (existsSync(join(userData, 'attachments'))) {
      zip.addLocalFolder(join(userData, 'attachments'), 'attachments')
    }
    zip.addFile('backup-info.json', Buffer.from(JSON.stringify({
      app: 'Notes',
      version: app.getVersion(),
      createdAt: new Date().toISOString()
    }, null, 2), 'utf8'))
    zip.writeZip(result.filePath)
    try { unlinkSync(tempDbPath) } catch { /* ignore temp cleanup */ }
    return result.filePath
  })

  ipcMain.handle('files:import-local-backup', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Notes backup', extensions: ['zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, cancelled: true }

    const zip = new AdmZip(result.filePaths[0])
    if (!zip.getEntry('notes.db')) return { ok: false, error: 'This zip does not contain a Notes backup database.' }
    const userData = app.getPath('userData')
    const tempRestore = join(app.getPath('temp'), `notes-restore-${Date.now()}`)
    mkdirSync(tempRestore, { recursive: true })
    zip.extractAllTo(tempRestore, true)

    try {
      closeDb()
      const dbPath = join(userData, 'notes.db')
      const attachmentsPath = join(userData, 'attachments')
      rmSync(dbPath, { force: true })
      rmSync(attachmentsPath, { recursive: true, force: true })
      mkdirSync(userData, { recursive: true })
      writeFileSync(dbPath, readFileSync(join(tempRestore, 'notes.db')))
      if (existsSync(join(tempRestore, 'attachments'))) {
        cpSync(join(tempRestore, 'attachments'), attachmentsPath, { recursive: true })
      }
    } finally {
      rmSync(tempRestore, { recursive: true, force: true })
    }

    app.relaunch()
    app.exit(0)
    return { ok: true, restartRequired: true }
  })
}
