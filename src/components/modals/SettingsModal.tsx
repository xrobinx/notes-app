import { useMemo, useState } from 'react'
import { generateHTML } from '@tiptap/html'
import { Check, Cloud, Download, FileInput, HardDrive, KeyRound, Keyboard, Moon, StickyNote, Sun, X } from 'lucide-react'
import { useNotesStore } from '../../store/notesStore'
import { useSettingsStore } from '../../store/settingsStore'
import { editorExtensions } from '../editor/extensions'
import { DEFAULT_SHORTCUTS, eventToCombo, SHORTCUT_DEFINITIONS } from '../../utils/shortcuts'
import './SettingsModal.css'

interface Props {
  onClose: () => void
}

const MISSING_FEATURES = [
  'Smart folders, tag browser, and advanced search filters',
  'Import from Apple Notes, Evernote, OneNote, Markdown, HTML, and Word',
  'Export to Markdown, HTML, plain text, Word, and image',
  'Link previews, sketches, image markup, OCR, and collaboration',
  'Windows Widget Board integration and taskbar jump list',
  'Accessibility polish, shortcut editor, installer icon, and auto-updates',
]

export function SettingsModal({ onClose }: Props) {
  const settings = useSettingsStore()
  const { notes, selectedNoteId, createNote, updateNote, selectNote } = useNotesStore()
  const selectedNote = notes.find(note => note.id === selectedNoteId) ?? null
  const [message, setMessage] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [oldPasscode, setOldPasscode] = useState('')
  const [newPasscode, setNewPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId ?? '')
  const [googleClientSecret, setGoogleClientSecret] = useState(settings.googleClientSecret ?? '')
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [showAdvancedSync, setShowAdvancedSync] = useState(!settings.googleClientId || !settings.googleClientSecret)
  const [nickname, setNickname] = useState(settings.nickname ?? '')
  const [shortcutSearch, setShortcutSearch] = useState('')
  const [capturingShortcutId, setCapturingShortcutId] = useState<string | null>(null)
  const [backups, setBackups] = useState<Array<{ id: string; name: string; modifiedTime?: string; size?: string }>>([])
  const [loadingBackups, setLoadingBackups] = useState(false)

  const syncLabel = useMemo(() => {
    if (settings.syncMode === 'googleDrive') return settings.googleEmail ?? 'Google Drive connected'
    return 'Local only'
  }, [settings.googleEmail, settings.syncMode])

  const exportPdf = async () => {
    if (!selectedNote) return
    setIsExporting(true)
    setMessage('')

    try {
      const content = JSON.parse(selectedNote.body)
      const html = generateHTML(content, editorExtensions)
      const path = await window.api.files.exportNotePdf(selectedNote.title, selectedNote.emoji, html)
      setMessage(path ? `Exported PDF to ${path}` : 'PDF export cancelled.')
    } catch {
      setMessage('Could not export this note. Try reopening it and exporting again.')
    } finally {
      setIsExporting(false)
    }
  }

  const getSelectedContent = () => {
    if (!selectedNote) return null
    const content = JSON.parse(selectedNote.body)
    const html = generateHTML(content, editorExtensions)
    return { content, html }
  }

  const exportFormat = async (format: 'md' | 'html' | 'txt' | 'doc') => {
    if (!selectedNote) return
    setMessage('')
    try {
      const selected = getSelectedContent()
      if (!selected) return
      const content = format === 'html'
        ? selected.html
        : format === 'txt'
          ? selectedNote.plainText
          : format === 'doc'
            ? `<!doctype html><html><body><h1>${selectedNote.emoji} ${selectedNote.title}</h1>${selected.html}</body></html>`
            : tiptapToMarkdown(selected.content)
      const label = format === 'doc' ? 'Word-compatible HTML document' : `${format.toUpperCase()} note`
      const path = await window.api.files.exportTextFile(selectedNote.title, content, format, label)
      setMessage(path ? `Exported to ${path}` : 'Export cancelled.')
    } catch {
      setMessage('Could not export this format.')
    }
  }

  const importNote = async () => {
    setMessage('')
    const imported = await window.api.files.importTextFile()
    if (!imported) {
      setMessage('Import cancelled.')
      return
    }
    const title = imported.name.replace(/\.[^.]+$/, '') || 'Imported note'
    const note = await createNote(null)
    const contentDoc = imported.format === 'html'
      ? htmlToTiptap(imported.content)
      : textToTiptap(imported.content)
    await updateNote(note.id, {
      title,
      body: JSON.stringify(contentDoc),
      plainText: imported.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    })
    selectNote(note.id)
    setMessage(`Imported ${imported.name}${imported.warnings?.length ? ` with ${imported.warnings.length} warning(s)` : ''}`)
  }

  const exportLocalBackup = async () => {
    setMessage('')
    const path = await window.api.files.exportLocalBackup()
    setMessage(path ? `Full local backup saved to ${path}` : 'Backup export cancelled.')
  }

  const importLocalBackup = async () => {
    setMessage('')
    if (!confirm('Importing a backup replaces local notes and attachments on this computer. Continue?')) return
    const result = await window.api.files.importLocalBackup()
    if (result.cancelled) {
      setMessage('Backup import cancelled.')
      return
    }
    if (!result.ok) {
      setMessage(result.error ?? 'Could not import this backup.')
      return
    }
    setMessage('Backup imported. Notes is restarting.')
  }

  const connectGoogle = async () => {
    setMessage('')
    const hasTypedCredentials = Boolean(googleClientId.trim() || googleClientSecret.trim())
    const hasCompleteTypedCredentials = Boolean(googleClientId.trim() && googleClientSecret.trim())
    const hasStoredCredentials = Boolean(settings.googleClientId && settings.googleClientSecret)

    if (!syncPassphrase.trim() && !settings.syncEncryptionReady) {
      setMessage('Add and save a sync password first. Google Drive sync is always encrypted.')
      return
    }

    if (hasTypedCredentials && !hasCompleteTypedCredentials) {
      setMessage('Paste both the Google OAuth Client ID and Client Secret.')
      setShowAdvancedSync(true)
      return
    }

    if (!hasStoredCredentials && !hasCompleteTypedCredentials) {
      setMessage('Add your Google OAuth Client ID and Client Secret in Advanced setup first.')
      setShowAdvancedSync(true)
      return
    }

    if (hasCompleteTypedCredentials) {
      const saved = await window.api.sync.saveConfig(googleClientId, googleClientSecret)
      if (!saved.ok) {
        setMessage(saved.error ?? 'Could not save Google OAuth config.')
        return
      }
      await settings.setSetting('googleClientId', googleClientId)
      await settings.setSetting('googleClientSecret', googleClientSecret)
    }

    if (syncPassphrase.trim()) {
      const passResult = await window.api.sync.setPassphrase(syncPassphrase)
      if (!passResult.ok) {
        setMessage(passResult.error ?? 'Could not set sync encryption passphrase.')
        return
      }
      await settings.setSetting('syncEncryptionReady', true)
    }

    const result = await window.api.sync.connectGoogleDrive()
    if (result.ok) {
      await settings.setSetting('syncMode', 'googleDrive')
      await settings.setSetting('syncStatus', 'synced')
      await settings.setSetting('googleEmail', result.email ?? null)
      await settings.setSetting('syncLastError', null)
      await settings.setSetting('syncLastSyncedAt', new Date().toISOString())
      setMessage('Google Drive connected and encrypted sync completed automatically.')
    } else {
      await settings.setSetting('syncStatus', 'error')
      await settings.setSetting('syncLastError', result.error ?? null)
      setMessage(result.error ?? 'Google Drive sign-in is not ready yet.')
    }
  }

  const disconnectGoogle = async () => {
    await window.api.sync.disconnectGoogleDrive()
    await settings.setSetting('syncMode', 'local')
    await settings.setSetting('syncStatus', 'local')
    await settings.setSetting('googleEmail', null)
    setMessage('Cloud sync is off. Notes are stored locally on this PC.')
  }

  const saveSyncPassphrase = async () => {
    const result = await window.api.sync.setPassphrase(syncPassphrase)
    if (result.ok) {
      await settings.setSetting('syncEncryptionReady', true)
      setMessage('Encryption passphrase saved for this computer.')
    } else {
      setMessage(result.error ?? 'Could not save encryption passphrase.')
    }
  }

  const syncNow = async () => {
    setIsSyncing(true)
    setMessage('')
    try {
      if (syncPassphrase.trim()) {
        const passResult = await window.api.sync.setPassphrase(syncPassphrase)
        if (!passResult.ok) {
          setMessage(passResult.error ?? 'Could not set sync encryption passphrase.')
          return
        }
        await settings.setSetting('syncEncryptionReady', true)
      }
      await settings.setSetting('syncStatus', 'syncing')
      const result = await window.api.sync.runNow()
      if (result.ok) {
        await settings.setSetting('syncStatus', 'synced')
        await settings.setSetting('syncLastError', null)
        await settings.setSetting('syncLastSyncedAt', new Date().toISOString())
        setMessage(result.message ?? 'Encrypted Google Drive sync complete.')
      } else {
        await settings.setSetting('syncStatus', 'error')
        await settings.setSetting('syncLastError', result.error ?? null)
        setMessage(result.error ?? 'Sync failed.')
      }
    } finally {
      setIsSyncing(false)
    }
  }

  const loadBackups = async () => {
    setLoadingBackups(true)
    setMessage('')
    try {
      const result = await window.api.sync.listBackups()
      if (result.ok) {
        setBackups(result.backups ?? [])
        setMessage(result.backups?.length ? 'Backups loaded.' : 'No encrypted backups found yet.')
      } else {
        setMessage(result.error ?? 'Could not load backups.')
      }
    } finally {
      setLoadingBackups(false)
      await settings.refreshSyncStatus()
    }
  }

  const restoreBackup = async (fileId: string) => {
    setMessage('')
    const result = await window.api.sync.restoreBackup(fileId)
    if (result.ok) {
      setMessage(result.message ?? 'Backup restored.')
    } else {
      setMessage(result.error ?? 'Could not restore backup.')
    }
    await settings.refreshSyncStatus()
  }

  const cleanPasscode = (value: string) => value.replace(/\D/g, '').slice(0, 6)

  const updateShortcut = async (shortcutId: string, combo: string) => {
    const currentShortcuts = { ...DEFAULT_SHORTCUTS, ...(settings.shortcuts ?? {}) }
    const conflicting = Object.entries(currentShortcuts).find(([id, value]) => id !== shortcutId && value.toLowerCase() === combo.toLowerCase())
    if (conflicting && !confirm(`${combo} is already used by ${getShortcutLabel(conflicting[0])}. Replace it?`)) {
      setCapturingShortcutId(null)
      return
    }
    if (conflicting) currentShortcuts[conflicting[0]] = ''
    currentShortcuts[shortcutId] = combo
    await settings.setSetting('shortcuts', currentShortcuts)
    setCapturingShortcutId(null)
  }

  const saveGlobalPasscode = async () => {
    setMessage('')
    if (!/^\d{6}$/.test(newPasscode) || newPasscode !== confirmPasscode) {
      setMessage('Use a matching 6 digit passcode.')
      return
    }
    const ok = settings.hasGlobalPasscode
      ? await settings.resetGlobalPasscode(oldPasscode, newPasscode)
      : await settings.setGlobalPasscode(newPasscode)

    if (ok) {
      setOldPasscode('')
      setNewPasscode('')
      setConfirmPasscode('')
      setMessage(settings.hasGlobalPasscode ? 'Global passcode updated.' : 'Global passcode created.')
    } else {
      setMessage(settings.hasGlobalPasscode ? 'Old passcode is wrong.' : 'Could not create the passcode.')
    }
  }

  return (
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div className="settings-modal scale-in" onMouseDown={event => event.stopPropagation()}>
        <header className="settings-header">
          <div>
            <h2>Settings</h2>
            <p>Theme, sync, export, and what is still on the roadmap.</p>
          </div>
          <button className="settings-icon-btn" onClick={onClose} title="Close settings">
            <X size={18} />
          </button>
        </header>

        <section className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <div className="settings-profile-row">
            <input
              value={nickname}
              placeholder="Nickname"
              onChange={event => setNickname(event.target.value)}
              onBlur={() => settings.setSetting('nickname', nickname.trim() || null)}
            />
          </div>
          <div className="settings-segmented">
            <button className={settings.theme === 'light' ? 'active' : ''} onClick={() => settings.setSetting('theme', 'light')}>
              <Sun size={15} /> Light
            </button>
            <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => settings.setSetting('theme', 'dark')}>
              <Moon size={15} /> Dark
            </button>
            <button className={settings.theme === 'auto' ? 'active' : ''} onClick={() => settings.setSetting('theme', 'auto')}>
              <Check size={15} /> Auto
            </button>
          </div>
          <div className="settings-toggle-row">
            <label><input type="checkbox" checked={settings.showEditorStats} onChange={event => settings.setSetting('showEditorStats', event.target.checked)} /> Show note stats</label>
            <label><input type="checkbox" checked={settings.spellcheckEnabled} onChange={event => settings.setSetting('spellcheckEnabled', event.target.checked)} /> Spellcheck</label>
            <label><input type="checkbox" checked={settings.grammarHintsEnabled} onChange={event => settings.setSetting('grammarHintsEnabled', event.target.checked)} /> Grammar hints</label>
            <label><input type="checkbox" checked={settings.performanceMode} onChange={event => settings.setSetting('performanceMode', event.target.checked)} /> Performance mode</label>
          </div>
          {settings.performanceMode && (
            <div className="settings-sync-note">
              Performance mode reduces memory use by disabling widget opening/restoring, grammar hints, animations, auto-sync polling, and sync status polling.
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Cloud Sync</div>
          <div className="settings-card-row">
            <div className="settings-card-icon">
              {settings.syncMode === 'googleDrive' ? <Cloud size={18} /> : <HardDrive size={18} />}
            </div>
            <div className="settings-card-copy">
              <strong>{syncLabel}</strong>
              <span>
                {settings.syncMode === 'googleDrive'
                  ? 'Notes are marked for encrypted, protected Google Drive sync.'
                  : 'Everything works offline and stays on this computer.'}
              </span>
            </div>
            <button className="settings-action-btn" onClick={connectGoogle}>
              Sign in with Google
            </button>
            <button className="settings-action-btn" onClick={syncNow} disabled={settings.syncMode !== 'googleDrive' || !settings.syncEncryptionReady || isSyncing}>
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            {settings.syncMode === 'googleDrive' && (
              <button className="settings-secondary-btn" onClick={disconnectGoogle}>
                Disconnect
              </button>
            )}
          </div>
          <div className="settings-sync-simple">
            <input
              value={syncPassphrase}
              placeholder={settings.syncEncryptionReady ? 'Sync password is set' : 'Sync password for encrypted Drive data'}
              type="password"
              onChange={event => setSyncPassphrase(event.target.value)}
            />
            <button className="settings-secondary-btn" onClick={saveSyncPassphrase}>
              Save Sync Password
            </button>
          </div>
          <button className="settings-advanced-toggle" onClick={() => setShowAdvancedSync(value => !value)}>
            {showAdvancedSync ? 'Hide advanced setup' : 'Advanced setup'}
          </button>
          {showAdvancedSync && (
            <div className="settings-sync-grid">
              <input
                value={googleClientId}
                placeholder="Google OAuth Client ID"
                onChange={event => setGoogleClientId(event.target.value)}
              />
              <input
                value={googleClientSecret}
                placeholder="Google OAuth Client Secret"
                type="password"
                onChange={event => setGoogleClientSecret(event.target.value)}
              />
            </div>
          )}
          <div className="settings-sync-note">
            Drive data is encrypted before upload and stored in Google Drive's hidden app data area. Backups stay versioned there so users cannot accidentally delete the sync files from My Drive.
            {settings.syncLastSyncedAt && <span> Last sync: {new Date(settings.syncLastSyncedAt).toLocaleString()}.</span>}
            {typeof settings.syncLastConflictCount === 'number' && settings.syncLastConflictCount > 0 && <span> {settings.syncLastConflictCount} conflict copy created.</span>}
            {settings.syncLastError && <span className="settings-sync-error"> {settings.syncLastError}</span>}
          </div>
          {settings.syncMode === 'googleDrive' && (
            <div className="settings-backup-box">
              <div className="settings-card-row">
                <div className="settings-card-copy">
                  <strong>Encrypted backup recovery</strong>
                  <span>Restore a Drive backup if sync or editing goes wrong.</span>
                </div>
                <button className="settings-secondary-btn" onClick={loadBackups} disabled={loadingBackups}>
                  {loadingBackups ? 'Loading...' : 'Load Backups'}
                </button>
              </div>
              {backups.length > 0 && (
                <div className="settings-backup-list">
                  {backups.map(backup => (
                    <button key={backup.id} onClick={() => restoreBackup(backup.id)}>
                      <span>{backup.name}</span>
                      <small>{backup.modifiedTime ? new Date(backup.modifiedTime).toLocaleString() : 'Encrypted backup'}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Password</div>
          <div className="settings-card-row">
            <div className="settings-card-icon"><KeyRound size={18} /></div>
            <div className="settings-card-copy">
              <strong>{settings.hasGlobalPasscode ? 'Global passcode is set' : 'Create global passcode'}</strong>
              <span>Use one 6 digit passcode when locking notes, or choose a custom passcode per note.</span>
            </div>
          </div>
          <div className="settings-password-grid">
            {settings.hasGlobalPasscode && (
              <input
                inputMode="numeric"
                type="password"
                value={oldPasscode}
                placeholder="Old passcode"
                onChange={event => setOldPasscode(cleanPasscode(event.target.value))}
              />
            )}
            <input
              inputMode="numeric"
              type="password"
              value={newPasscode}
              placeholder="New 6 digit passcode"
              onChange={event => setNewPasscode(cleanPasscode(event.target.value))}
            />
            <input
              inputMode="numeric"
              type="password"
              value={confirmPasscode}
              placeholder="Confirm passcode"
              onChange={event => setConfirmPasscode(cleanPasscode(event.target.value))}
              onKeyDown={event => {
                if (event.key === 'Enter') saveGlobalPasscode()
              }}
            />
            <button className="settings-action-btn" onClick={saveGlobalPasscode}>
              {settings.hasGlobalPasscode ? 'Reset Passcode' : 'Set Passcode'}
            </button>
          </div>
          <div className="settings-auto-lock-row">
            <label>
              Auto-lock unlocked notes after
              <select
                value={settings.autoLockTimeout}
                onChange={event => settings.setSetting('autoLockTimeout', Number(event.target.value))}
              >
                <option value={0}>Never</option>
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Export</div>
          <div className="settings-card-row">
            <div className="settings-card-icon"><Download size={18} /></div>
            <div className="settings-card-copy">
              <strong>Export selected note as PDF</strong>
              <span>Preserves headings, code blocks, tables, images, highlights, and attachments.</span>
            </div>
            <button className="settings-action-btn" onClick={exportPdf} disabled={!selectedNote || isExporting}>
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
          <div className="settings-format-row">
            <button onClick={() => exportFormat('md')} disabled={!selectedNote}>Markdown</button>
            <button onClick={() => exportFormat('html')} disabled={!selectedNote}>HTML</button>
            <button onClick={() => exportFormat('txt')} disabled={!selectedNote}>Plain Text</button>
            <button onClick={() => exportFormat('doc')} disabled={!selectedNote}>Word</button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Backup / Restore</div>
          <div className="settings-card-row">
            <div className="settings-card-icon"><HardDrive size={18} /></div>
            <div className="settings-card-copy">
              <strong>Full local backup</strong>
              <span>Export or restore all local notes, settings, and attachments as one .zip file.</span>
            </div>
            <button className="settings-action-btn" onClick={exportLocalBackup}>
              Export .zip
            </button>
            <button className="settings-secondary-btn" onClick={importLocalBackup}>
              Import .zip
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Import</div>
          <div className="settings-card-row">
            <div className="settings-card-icon"><FileInput size={18} /></div>
            <div className="settings-card-copy">
              <strong>Import text, Markdown, or HTML</strong>
              <span>Creates a new note from a local file.</span>
            </div>
            <button className="settings-action-btn" onClick={importNote}>
              Import
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Desktop Widgets</div>
          <div className="settings-card-row">
            <div className="settings-card-icon"><StickyNote size={18} /></div>
            <div className="settings-card-copy">
              <strong>Notes desktop widget</strong>
              <span>Open one small notes surface with writing blocks and checklist blocks.</span>
            </div>
            <button disabled={settings.performanceMode} className="settings-action-btn" onClick={() => window.api.widgets.open('widget')}>Open Widget</button>
          </div>
          {settings.performanceMode && <div className="settings-sync-note">Widgets are off while Performance mode is enabled.</div>}
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Shortcuts</div>
          <div className="settings-card-row">
            <div className="settings-card-icon"><Keyboard size={18} /></div>
            <div className="settings-card-copy">
              <strong>Shortcut map</strong>
              <span>Search, reassign, and reset keyboard shortcuts. Hover tooltips use these same keys.</span>
            </div>
            <button className="settings-secondary-btn" onClick={() => settings.setSetting('shortcuts', DEFAULT_SHORTCUTS)}>
              Reset
            </button>
          </div>
          <input
            className="settings-shortcut-search"
            value={shortcutSearch}
            placeholder="Search shortcuts"
            onChange={event => setShortcutSearch(event.target.value)}
          />
          <div className="settings-shortcut-list">
            {SHORTCUT_DEFINITIONS
              .filter(shortcut => `${shortcut.group} ${shortcut.label} ${shortcut.defaultCombo}`.toLowerCase().includes(shortcutSearch.toLowerCase()))
              .map(shortcut => {
                const combo = settings.shortcuts?.[shortcut.id] || shortcut.defaultCombo
                const isCapturing = capturingShortcutId === shortcut.id
                return (
                  <button
                    key={shortcut.id}
                    className={`settings-shortcut-item ${isCapturing ? 'capturing' : ''}`}
                    onClick={() => setCapturingShortcutId(shortcut.id)}
                    onKeyDown={event => {
                      if (!isCapturing) return
                      event.preventDefault()
                      if (event.key === 'Escape') {
                        setCapturingShortcutId(null)
                        return
                      }
                      const nextCombo = eventToCombo(event)
                      if (nextCombo) void updateShortcut(shortcut.id, nextCombo)
                    }}
                  >
                    <span>
                      <strong>{shortcut.label}</strong>
                      <small>{shortcut.group}</small>
                    </span>
                    <kbd>{isCapturing ? 'Press keys...' : combo || 'Unassigned'}</kbd>
                  </button>
                )
              })}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-title">Missing From The Full Apple Notes List</div>
          <ul className="settings-roadmap">
            {MISSING_FEATURES.map(item => <li key={item}>{item}</li>)}
          </ul>
        </section>

        {message && <div className="settings-message">{message}</div>}
      </div>
    </div>
  )
}

function getShortcutLabel(id: string) {
  return SHORTCUT_DEFINITIONS.find(shortcut => shortcut.id === id)?.label ?? id
}

function textToTiptap(content: string) {
  const text = content.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  const paragraphs = text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
  return {
    type: 'doc',
    content: (paragraphs.length ? paragraphs : ['']).map(paragraph => ({
      type: 'paragraph',
      content: paragraph ? [{ type: 'text', text: paragraph }] : undefined,
    })),
  }
}

function htmlToTiptap(content: string) {
  const doc = new DOMParser().parseFromString(content, 'text/html')
  const nodes = Array.from(doc.body.children).map(elementToTiptap).filter(Boolean)
  return {
    type: 'doc',
    content: nodes.length ? nodes : [{ type: 'paragraph' }],
  }
}

function inlineContent(element: Element) {
  const parts: any[] = []
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) parts.push({ type: 'text', text })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const children = inlineContent(el)
    const markType = el.tagName.toLowerCase()
    if (['strong', 'b'].includes(markType)) children.forEach(child => child.marks = [...(child.marks ?? []), { type: 'bold' }])
    if (['em', 'i'].includes(markType)) children.forEach(child => child.marks = [...(child.marks ?? []), { type: 'italic' }])
    if (markType === 'u') children.forEach(child => child.marks = [...(child.marks ?? []), { type: 'underline' }])
    if (markType === 'a') children.forEach(child => child.marks = [...(child.marks ?? []), { type: 'link', attrs: { href: el.getAttribute('href') ?? '' } }])
    parts.push(...children)
  })
  return parts
}

function elementToTiptap(element: Element): any {
  const tag = element.tagName.toLowerCase()
  if (/h[1-6]/.test(tag)) {
    return { type: 'heading', attrs: { level: Number(tag[1]) }, content: inlineContent(element) }
  }
  if (tag === 'blockquote') return { type: 'blockquote', content: [{ type: 'paragraph', content: inlineContent(element) }] }
  if (tag === 'ul' || tag === 'ol') {
    return {
      type: tag === 'ul' ? 'bulletList' : 'orderedList',
      content: Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'li').map(li => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inlineContent(li) }],
      })),
    }
  }
  if (tag === 'table') {
    return {
      type: 'table',
      content: Array.from(element.querySelectorAll('tr')).map(row => ({
        type: 'tableRow',
        content: Array.from(row.children).map(cell => ({
          type: cell.tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell',
          content: [{ type: 'paragraph', content: inlineContent(cell) }],
        })),
      })),
    }
  }
  if (tag === 'pre') {
    return { type: 'codeBlock', content: [{ type: 'text', text: element.textContent ?? '' }] }
  }
  if (tag === 'hr') return { type: 'horizontalRule' }
  if (tag === 'img') {
    return { type: 'image', attrs: { src: element.getAttribute('src') ?? '', alt: element.getAttribute('alt') ?? '' } }
  }
  return { type: 'paragraph', content: inlineContent(element) }
}

function tiptapToMarkdown(node: any): string {
  if (!node) return ''
  if (node.type === 'text') {
    let text = node.text ?? ''
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `**${text}**`
      if (mark.type === 'italic') text = `_${text}_`
      if (mark.type === 'code') text = `\`${text}\``
      if (mark.type === 'link') text = `[${text}](${mark.attrs?.href ?? ''})`
    }
    return text
  }

  const children = (node.content ?? []).map(tiptapToMarkdown).join('')
  if (node.type === 'doc') return (node.content ?? []).map(tiptapToMarkdown).join('\n')
  if (node.type === 'paragraph') return `${children}\n`
  if (node.type === 'heading') return `${'#'.repeat(node.attrs?.level ?? 1)} ${children}\n`
  if (node.type === 'bulletList') return `${(node.content ?? []).map((item: any) => `- ${tiptapToMarkdown(item).trim()}`).join('\n')}\n`
  if (node.type === 'orderedList') return `${(node.content ?? []).map((item: any, index: number) => `${index + 1}. ${tiptapToMarkdown(item).trim()}`).join('\n')}\n`
  if (node.type === 'listItem') return children
  if (node.type === 'blockquote') return `> ${children.trim()}\n`
  if (node.type === 'codeBlock') return `\`\`\`\n${children}\n\`\`\`\n`
  if (node.type === 'horizontalRule') return '\n---\n'
  if (node.type === 'image') return `![${node.attrs?.alt ?? 'image'}](${node.attrs?.src ?? ''})\n`
  if (node.type === 'fileAttachment') return `[Attachment: ${node.attrs?.fileName ?? 'file'}](${node.attrs?.filePath ?? ''})\n`
  return children
}
