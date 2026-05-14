import { createServer } from 'http'
import { AddressInfo } from 'net'
import { Readable } from 'stream'
import { shell, safeStorage } from 'electron'
import { app } from 'electron'
import { google } from 'googleapis'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import * as settingsRepo from '../database/settingsRepository'
import * as notesRepo from '../database/notesRepository'
import * as foldersRepo from '../database/foldersRepository'
import type { Note } from '../../src/types/index'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const PROFILE_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const SYNC_FOLDER_NAME = 'Notes App Sync - Protected'
const BACKUP_FOLDER_NAME = 'Encrypted Backups'
const SYNC_FILE_NAME = 'notes-sync.encrypted.json'

let syncPassphrase: string | null = null
let autoSyncTimer: NodeJS.Timeout | null = null
let autoSyncInFlight = false

interface SyncPayload {
  version: 1
  deviceId: string
  exportedAt: string
  notes: Note[]
  folders: ReturnType<typeof foldersRepo.listAllFoldersForSync>
  attachments?: SyncAttachment[]
}

interface SyncAttachment {
  key: string
  noteId: string
  fileName: string
  fileSize: number
  fileType: string
  data: string
}

function updateStatus(status: 'local' | 'synced' | 'syncing' | 'offline' | 'error', error: string | null = null): void {
  settingsRepo.setSetting('syncStatus', status)
  settingsRepo.setSetting('syncLastError', error)
}

export function getSyncStatus(): {
  syncMode: 'local' | 'googleDrive'
  syncStatus: 'local' | 'synced' | 'syncing' | 'offline' | 'error'
  syncLastError: string | null
  syncLastSyncedAt: string | null
  syncLastConflictCount: number
} {
  const settings = settingsRepo.getSettings()
  return {
    syncMode: settings.syncMode,
    syncStatus: settings.syncStatus,
    syncLastError: settings.syncLastError,
    syncLastSyncedAt: settings.syncLastSyncedAt,
    syncLastConflictCount: settings.syncLastConflictCount ?? 0,
  }
}

function getClientConfig(): { clientId: string; clientSecret: string } {
  const settings = settingsRepo.getSettings()
  const clientId = settings.googleClientId || process.env.GOOGLE_CLIENT_ID
  const clientSecret = settings.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Add your Google OAuth Client ID and Client Secret in Settings first.')
  }
  return { clientId, clientSecret }
}

function createOAuthClient(redirectUri = 'http://127.0.0.1'): any {
  const { clientId, clientSecret } = getClientConfig()
  const { OAuth2 } = google.auth
  return new OAuth2(clientId, clientSecret, redirectUri)
}

function getTokens(): object | null {
  const raw = (settingsRepo.getRawSetting('googleOAuthTokens') as object | null) ?? null
  return raw
}

function setTokens(tokens: object): void {
  settingsRepo.setRawSetting('googleOAuthTokens', tokens)
}

function getProtectedPassphrase(): string | null {
  const encrypted = settingsRepo.getRawSetting('syncProtectedPassphrase') as string | null
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

function storeProtectedPassphrase(passphrase: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    settingsRepo.setRawSetting('syncProtectedPassphrase', safeStorage.encryptString(passphrase).toString('base64'))
  }
}

function ensurePassphrase(): string {
  const passphrase = syncPassphrase ?? getProtectedPassphrase()
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Set your sync encryption passphrase in Settings first.')
  }
  return passphrase
}

function hasStoredPassphrase(): boolean {
  return Boolean(syncPassphrase ?? getProtectedPassphrase())
}

function getSalt(): string {
  const existing = settingsRepo.getRawSetting('syncEncryptionSalt') as string | null
  if (existing) return existing
  const salt = randomBytes(16).toString('base64')
  settingsRepo.setRawSetting('syncEncryptionSalt', salt)
  return salt
}

function keyFromPassphrase(passphrase: string, salt: string): Buffer {
  return scryptSync(passphrase, Buffer.from(salt, 'base64'), 32)
}

function makeVerifier(passphrase: string, salt: string): string {
  return scryptSync(`verify:${passphrase}`, Buffer.from(salt, 'base64'), 32).toString('base64')
}

function verifyPassphrase(passphrase: string, salt: string, verifier: string | null): boolean {
  if (!verifier) return true
  const expected = Buffer.from(verifier, 'base64')
  const actual = Buffer.from(makeVerifier(passphrase, salt), 'base64')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function encryptPayload(payload: SyncPayload): Buffer {
  const passphrase = ensurePassphrase()
  const salt = getSalt()
  const key = keyFromPassphrase(passphrase, salt)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const envelope = {
    version: 1,
    algorithm: 'aes-256-gcm+scrypt',
    salt,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    verifier: makeVerifier(passphrase, salt),
    ciphertext: ciphertext.toString('base64'),
  }
  return Buffer.from(JSON.stringify(envelope, null, 2), 'utf8')
}

function decryptPayload(buffer: Buffer): SyncPayload {
  const envelope = JSON.parse(buffer.toString('utf8'))
  const passphrase = ensurePassphrase()
  if (!verifyPassphrase(passphrase, envelope.salt, envelope.verifier ?? null)) {
    throw new Error('Sync passphrase is wrong.')
  }
  const key = keyFromPassphrase(passphrase, envelope.salt)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString('utf8')) as SyncPayload
}

async function getAuthedClient(): Promise<any> {
  const oauth = createOAuthClient()
  const tokens = getTokens()
  if (!tokens) throw new Error('Connect Google Drive first.')
  oauth.setCredentials(tokens)
  oauth.on('tokens', (newTokens: object) => {
    setTokens({ ...tokens, ...newTokens })
  })
  return oauth
}

async function findOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    parentId ? `'${parentId}' in parents` : undefined,
  ].filter(Boolean).join(' and ')
  const found = await drive.files.list({
    q,
    fields: 'files(id,name,createdTime)',
    orderBy: 'createdTime',
    spaces: 'drive',
  })
  const existing = found.data.files?.[0]?.id
  if (existing) return existing
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  })
  return created.data.id!
}

async function findFile(drive: any, name: string, parentId: string): Promise<{ id: string; name: string; modifiedTime?: string } | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
  const found = await drive.files.list({ q, fields: 'files(id,name,modifiedTime)', spaces: 'drive' })
  return found.data.files?.[0] ?? null
}

async function downloadFile(drive: any, fileId: string): Promise<Buffer> {
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  return Buffer.from(response.data as ArrayBuffer)
}

async function uploadBuffer(drive: any, parentId: string, name: string, buffer: Buffer, fileId?: string): Promise<string> {
  const media = { mimeType: 'application/json', body: ReadableFromBuffer(buffer) }
  if (fileId) {
    const updated = await drive.files.update({
      fileId,
      media,
      requestBody: { name },
      fields: 'id',
    })
    return updated.data.id!
  }
  const created = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media,
    fields: 'id',
  })
  return created.data.id!
}

function ReadableFromBuffer(buffer: Buffer): NodeJS.ReadableStream {
  return Readable.from(buffer)
}

function walkTiptapNodes(node: any, visit: (node: any) => void): void {
  if (!node || typeof node !== 'object') return
  visit(node)
  if (Array.isArray(node.content)) {
    for (const child of node.content) walkTiptapNodes(child, visit)
  }
}

function sanitizeFileName(value: string): string {
  return basename(value || 'Attachment').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'Attachment'
}

function attachmentKey(noteId: string, fileName: string, fileSize: number): string {
  return `${noteId}:${fileName}:${fileSize}`
}

function collectAttachments(notes: Note[]): SyncAttachment[] {
  const attachments = new Map<string, SyncAttachment>()
  for (const note of notes) {
    let parsed: any
    try { parsed = JSON.parse(note.body) } catch { continue }
    walkTiptapNodes(parsed, node => {
      if (node.type !== 'fileAttachment') return
      const attrs = node.attrs ?? {}
      const filePath = attrs.filePath as string | undefined
      const fileName = sanitizeFileName((attrs.fileName as string | undefined) ?? filePath ?? 'Attachment')
      const fileSize = Number(attrs.fileSize ?? 0)
      if (!filePath || !existsSync(filePath)) return
      const key = attachmentKey(note.id, fileName, fileSize)
      if (attachments.has(key)) return
      attachments.set(key, {
        key,
        noteId: note.id,
        fileName,
        fileSize,
        fileType: (attrs.fileType as string | undefined) ?? '',
        data: readFileSync(filePath).toString('base64'),
      })
    })
  }
  return Array.from(attachments.values())
}

function restorePayloadAttachments(payload: SyncPayload): Map<string, string> {
  const restored = new Map<string, string>()
  for (const attachment of payload.attachments ?? []) {
    const fileName = sanitizeFileName(attachment.fileName)
    const dir = join(app.getPath('userData'), 'attachments', attachment.noteId)
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, fileName)
    writeFileSync(filePath, Buffer.from(attachment.data, 'base64'))
    restored.set(attachment.key, filePath)
  }
  return restored
}

function rewriteAttachmentPaths(note: Note, restored: Map<string, string>): Note {
  let parsed: any
  try { parsed = JSON.parse(note.body) } catch { return note }
  let changed = false
  walkTiptapNodes(parsed, node => {
    if (node.type !== 'fileAttachment') return
    const attrs = node.attrs ?? {}
    const fileName = sanitizeFileName((attrs.fileName as string | undefined) ?? 'Attachment')
    const fileSize = Number(attrs.fileSize ?? 0)
    const key = attachmentKey(note.id, fileName, fileSize)
    const localPath = restored.get(key)
    if (!localPath) return
    node.attrs = { ...attrs, filePath: localPath }
    changed = true
  })
  return changed ? { ...note, body: JSON.stringify(parsed) } : note
}

function exportLocalPayload(): SyncPayload {
  const settings = settingsRepo.getSettings()
  let deviceId = settingsRepo.getRawSetting('syncDeviceId') as string | null
  if (!deviceId) {
    deviceId = randomUUID()
    settingsRepo.setRawSetting('syncDeviceId', deviceId)
  }
  const notes = notesRepo.listAllNotesForSync()
  return {
    version: 1,
    deviceId,
    exportedAt: new Date().toISOString(),
    notes,
    folders: foldersRepo.listAllFoldersForSync(),
    attachments: collectAttachments(notes),
  }
}

function isAfter(value: string | null | undefined, other: string | null | undefined): boolean {
  if (!value) return false
  if (!other) return true
  return new Date(value).getTime() > new Date(other).getTime()
}

function noteContentDiffers(a: Note, b: Note): boolean {
  return a.title !== b.title || a.body !== b.body || a.plainText !== b.plainText || a.deletedAt !== b.deletedAt
}

function mergeRemotePayload(remote: SyncPayload): void {
  const lastSyncAt = settingsRepo.getSettings().syncLastSyncedAt
  const restoredAttachments = restorePayloadAttachments(remote)
  const localNotes = new Map(notesRepo.listAllNotesForSync().map(note => [note.id, note]))
  let conflictCount = 0
  for (const rawRemoteNote of remote.notes) {
    const remoteNote = rewriteAttachmentPaths(rawRemoteNote, restoredAttachments)
    const local = localNotes.get(remoteNote.id)
    if (!local) {
      notesRepo.upsertNoteFromSync({ ...remoteNote, syncStatus: 'synced' })
      continue
    }

    if (isAfter(remoteNote.updatedAt, local.updatedAt)) {
      if (isAfter(local.updatedAt, lastSyncAt) && noteContentDiffers(local, remoteNote)) {
        notesRepo.createConflictCopy(local, 'Local conflict copy')
        conflictCount += 1
      }
      notesRepo.upsertNoteFromSync({ ...remoteNote, syncStatus: 'synced' })
    }
  }

  const localFolders = new Set(foldersRepo.listAllFoldersForSync().map(folder => folder.id))
  for (const folder of remote.folders) {
    if (!localFolders.has(folder.id)) foldersRepo.upsertFolderFromSync(folder)
  }
  settingsRepo.setSetting('syncLastConflictCount', conflictCount)
}

export function setSyncConfig(clientId: string, clientSecret: string): void {
  settingsRepo.setSetting('googleClientId', clientId.trim())
  settingsRepo.setSetting('googleClientSecret', clientSecret.trim())
}

export function setEncryptionPassphrase(passphrase: string): { ok: boolean; error?: string } {
  if (passphrase.length < 8) {
    return { ok: false, error: 'Use at least 8 characters for the encryption passphrase.' }
  }
  const salt = getSalt()
  const verifier = settingsRepo.getRawSetting('syncEncryptionVerifier') as string | null
  if (verifier && !verifyPassphrase(passphrase, salt, verifier)) {
    return { ok: false, error: 'That passphrase does not match the existing encrypted sync data.' }
  }
  settingsRepo.setRawSetting('syncEncryptionVerifier', makeVerifier(passphrase, salt))
  syncPassphrase = passphrase
  storeProtectedPassphrase(passphrase)
  settingsRepo.setSetting('syncEncryptionReady', true)
  return { ok: true }
}

export async function connectGoogleDrive(): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    ensurePassphrase()
    updateStatus('syncing')
    const server = createServer()
    const redirectUri = await new Promise<string>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo
        resolve(`http://127.0.0.1:${address.port}/oauth2callback`)
      })
    })
    const oauth = createOAuthClient(redirectUri)
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE, PROFILE_SCOPE],
    })
    await shell.openExternal(authUrl)

    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close()
        reject(new Error('Google sign-in timed out.'))
      }, 120000)
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '', redirectUri)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        if (error || !code) {
          res.end('Google sign-in failed. You can close this tab.')
          clearTimeout(timeout)
          server.close()
          reject(new Error(error ?? 'Google did not return an auth code.'))
          return
        }
        res.end('Notes is connected to Google Drive. You can close this tab.')
        clearTimeout(timeout)
        server.close()
        resolve(code)
      })
    })

    const tokenResponse = await oauth.getToken(code)
    oauth.setCredentials(tokenResponse.tokens)
    setTokens(tokenResponse.tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth })
    const user = await oauth2.userinfo.get()
    settingsRepo.setSetting('syncMode', 'googleDrive')
    settingsRepo.setSetting('googleEmail', user.data.email ?? null)
    settingsRepo.setSetting('syncLastError', null)
    const syncResult = await syncNow()
    if (!syncResult.ok) {
      return { ok: false, error: syncResult.error ?? 'Google connected, but encrypted sync failed.' }
    }
    return { ok: true, email: user.data.email ?? undefined }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google sign-in failed.'
    updateStatus('error', message)
    return { ok: false, error: message }
  }
}

export function disconnectGoogleDrive(): { ok: boolean } {
  settingsRepo.setSetting('syncMode', 'local')
  settingsRepo.setSetting('syncStatus', 'local')
  settingsRepo.setSetting('googleEmail', null)
  settingsRepo.setRawSetting('googleOAuthTokens', null)
  return { ok: true }
}

export async function syncNow(): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    updateStatus('syncing')
    const auth = await getAuthedClient()
    ensurePassphrase()
    const drive = google.drive({ version: 'v3', auth })
    const rootFolderId = await findOrCreateFolder(drive, SYNC_FOLDER_NAME)
    const backupFolderId = await findOrCreateFolder(drive, BACKUP_FOLDER_NAME, rootFolderId)
    const remoteFile = await findFile(drive, SYNC_FILE_NAME, rootFolderId)

    if (remoteFile) {
      const remoteBuffer = await downloadFile(drive, remoteFile.id)
      const remotePayload = decryptPayload(remoteBuffer)
      mergeRemotePayload(remotePayload)
      await uploadBuffer(
        drive,
        backupFolderId,
        `notes-sync-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.encrypted.json`,
        remoteBuffer,
      )
    }

    const mergedPayload = exportLocalPayload()
    const encrypted = encryptPayload(mergedPayload)
    const fileId = await uploadBuffer(drive, rootFolderId, SYNC_FILE_NAME, encrypted, remoteFile?.id)
    notesRepo.markAllSynced(mergedPayload.exportedAt)
    settingsRepo.setRawSetting('googleDriveSyncFileId', fileId)
    settingsRepo.setSetting('syncMode', 'googleDrive')
    settingsRepo.setSetting('syncStatus', 'synced')
    settingsRepo.setSetting('syncLastSyncedAt', mergedPayload.exportedAt)
    settingsRepo.setSetting('syncLastError', null)
    return { ok: true, message: `Synced ${mergedPayload.notes.length} notes with encrypted Google Drive storage.` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.'
    updateStatus('error', message)
    return { ok: false, error: message }
  }
}

async function getDriveAndFolders(): Promise<{ drive: any; rootFolderId: string; backupFolderId: string }> {
  const auth = await getAuthedClient()
  ensurePassphrase()
  const drive = google.drive({ version: 'v3', auth })
  const rootFolderId = await findOrCreateFolder(drive, SYNC_FOLDER_NAME)
  const backupFolderId = await findOrCreateFolder(drive, BACKUP_FOLDER_NAME, rootFolderId)
  return { drive, rootFolderId, backupFolderId }
}

export async function listBackups(): Promise<{ ok: boolean; backups?: Array<{ id: string; name: string; modifiedTime?: string; size?: string }>; error?: string }> {
  try {
    updateStatus('syncing')
    const { drive, backupFolderId } = await getDriveAndFolders()
    const response = await drive.files.list({
      q: `'${backupFolderId}' in parents and trashed=false and name contains 'notes-sync-backup-'`,
      fields: 'files(id,name,modifiedTime,size)',
      orderBy: 'modifiedTime desc',
      spaces: 'drive',
      pageSize: 20,
    })
    updateStatus('synced')
    return { ok: true, backups: response.data.files ?? [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not list backups.'
    updateStatus('error', message)
    return { ok: false, error: message }
  }
}

export async function restoreBackup(fileId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    updateStatus('syncing')
    const { drive } = await getDriveAndFolders()
    const backupBuffer = await downloadFile(drive, fileId)
    const backupPayload = decryptPayload(backupBuffer)
    mergeRemotePayload(backupPayload)
    const result = await syncNow()
    if (!result.ok) return result
    return { ok: true, message: `Restored encrypted backup from ${new Date(backupPayload.exportedAt).toLocaleString()}.` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore backup.'
    updateStatus('error', message)
    return { ok: false, error: message }
  }
}

export function scheduleAutoSync(delayMs = 2500): void {
  const settings = settingsRepo.getSettings()
  if (settings.performanceMode) return
  if (settings.syncMode !== 'googleDrive' || !getTokens() || !hasStoredPassphrase()) return
  if (autoSyncTimer) clearTimeout(autoSyncTimer)
  autoSyncTimer = setTimeout(async () => {
    if (autoSyncInFlight) {
      scheduleAutoSync(delayMs)
      return
    }
    autoSyncInFlight = true
    try {
      await syncNow()
    } finally {
      autoSyncInFlight = false
    }
  }, delayMs)
}
