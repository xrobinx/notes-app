import { getDb } from './db'
import type { Settings } from '../../src/types/index'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { DEFAULT_SHORTCUTS } from '../../src/utils/shortcuts'

const DEFAULTS: Settings = {
  theme: 'dark',
  lastOpenNoteId: null,
  sidebarWidth: 220,
  noteListWidth: 280,
  sidebarCollapsed: false,
  noteListCollapsed: false,
  autoLockTimeout: 0,
  sortBy: 'updatedAt',
  viewMode: 'list',
  syncMode: 'local',
  syncStatus: 'local',
  googleEmail: null,
  googleClientId: null,
  googleClientSecret: null,
  syncLastError: null,
  syncLastSyncedAt: null,
  syncLastConflictCount: 0,
  syncEncryptionReady: false,
  nickname: null,
  hasCompletedOnboarding: false,
  showEditorStats: false,
  spellcheckEnabled: true,
  grammarHintsEnabled: true,
  performanceMode: false,
  translationLanguage: 'ms',
  shortcuts: DEFAULT_SHORTCUTS,
  startWidgetOnLogin: false,
  openWidgets: [],
  widgetBounds: {}
}

export function getSettings(): Settings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const result = { ...DEFAULTS }
  for (const row of rows) {
    try {
      const key = row.key as keyof Settings
      if (key in DEFAULTS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(result as any)[key] = JSON.parse(row.value)
      }
    } catch {
      // ignore parse errors
    }
  }
  return result
}

export function setSetting(key: keyof Settings, value: unknown): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
}

export function getRawSetting<T = unknown>(key: string): T | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export function setRawSetting(key: string, value: unknown): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
}

function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(passcode, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function verifyPasscode(passcode: string, stored: string | null): boolean {
  if (!/^\d{6}$/.test(passcode) || !stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(passcode, salt, 32)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function getGlobalPasscodeHash(): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('globalLockPasscodeHash') as { value: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.value) as string
  } catch {
    return null
  }
}

export function hasGlobalPasscode(): boolean {
  return Boolean(getGlobalPasscodeHash())
}

export function verifyGlobalPasscode(passcode: string): boolean {
  return verifyPasscode(passcode, getGlobalPasscodeHash())
}

export function setGlobalPasscode(passcode: string): boolean {
  if (!/^\d{6}$/.test(passcode)) return false
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('globalLockPasscodeHash', JSON.stringify(hashPasscode(passcode)))
  return true
}

export function resetGlobalPasscode(oldPasscode: string, newPasscode: string): boolean {
  if (!verifyGlobalPasscode(oldPasscode) || !/^\d{6}$/.test(newPasscode)) return false
  return setGlobalPasscode(newPasscode)
}
