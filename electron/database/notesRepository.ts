import { randomUUID } from 'crypto'
import { scryptSync, timingSafeEqual, randomBytes } from 'crypto'
import { getDb } from './db'
import type { Note } from '../../src/types/index'
import { getRandomEmoji } from '../utils/emoji'
import { verifyGlobalPasscode } from './settingsRepository'

function extractTags(value: string): string[] {
  const matches = value.match(/(^|\s)#([\p{L}\p{N}_-]{2,40})/gu) ?? []
  return Array.from(new Set(matches.map(tag => tag.trim().slice(1).toLowerCase())))
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!/^\d{6}$/.test(password) || !stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 32)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function row2note(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    plainText: row.plain_text as string,
    emoji: row.emoji as string,
    folderId: row.folder_id as string | null,
    isPinned: row.is_pinned as number,
    isLocked: row.is_locked as number,
    lockPasswordHash: row.lock_password_hash as string | null,
    tags: row.tags as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: row.deleted_at as string | null,
    syncStatus: (row.sync_status as Note['syncStatus']) || 'local',
    sortOrder: row.sort_order as number
  }
}

function noteToDbValues(note: Note): unknown[] {
  return [
    note.id,
    note.title,
    note.body,
    note.plainText,
    note.emoji,
    note.folderId,
    note.folderId,
    note.isPinned,
    note.isLocked,
    note.lockPasswordHash,
    note.tags,
    note.createdAt,
    note.updatedAt,
    note.deletedAt,
    note.syncStatus,
    note.sortOrder ?? 0,
  ]
}

function row2history(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    noteId: row.note_id as string,
    title: row.title as string,
    body: row.body as string,
    plainText: row.plain_text as string,
    createdAt: row.created_at as string,
    reason: row.reason as string,
  }
}

function saveHistorySnapshot(note: Note, reason = 'autosave'): void {
  const db = getDb()
  const last = db.prepare('SELECT created_at FROM note_history WHERE note_id = ? ORDER BY created_at DESC LIMIT 1').get(note.id) as { created_at: string } | undefined
  if (last && Date.now() - new Date(last.created_at).getTime() < 120000) return
  db.prepare(`
    INSERT INTO note_history (id, note_id, title, body, plain_text, created_at, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), note.id, note.title, note.body, note.plainText, new Date().toISOString(), reason)
  db.prepare(`
    DELETE FROM note_history
    WHERE note_id = ?
      AND id NOT IN (
        SELECT id FROM note_history WHERE note_id = ? ORDER BY created_at DESC LIMIT 60
      )
  `).run(note.id, note.id)
}

export function createNote(folderId?: string | null): Note {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  const emoji = getRandomEmoji()
  const emptyBody = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph' }]
  })

  db.prepare(`
    INSERT INTO notes (id, title, body, plain_text, emoji, folder_id, original_folder_id, created_at, updated_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'New Note', emptyBody, '', emoji, folderId ?? null, folderId ?? null, now, now, Date.now())

  return row2note(db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown>)
}

export function listNotes(folderId?: string | null): Note[] {
  const db = getDb()
  let rows: unknown[]
  if (folderId === 'pinned') {
    rows = db.prepare(`
      SELECT * FROM notes WHERE deleted_at IS NULL AND is_pinned = 1
      ORDER BY sort_order ASC, updated_at DESC
    `).all()
  } else if (folderId === 'smart:attachments') {
    rows = db.prepare(`
      SELECT * FROM notes WHERE deleted_at IS NULL AND body LIKE '%fileAttachment%'
      ORDER BY sort_order ASC, updated_at DESC
    `).all()
  } else if (folderId === 'smart:checklists') {
    rows = db.prepare(`
      SELECT * FROM notes WHERE deleted_at IS NULL AND body LIKE '%taskList%'
      ORDER BY sort_order ASC, updated_at DESC
    `).all()
  } else if (folderId === 'smart:locked') {
    rows = db.prepare(`
      SELECT * FROM notes WHERE deleted_at IS NULL AND is_locked = 1
      ORDER BY sort_order ASC, updated_at DESC
    `).all()
  } else if (typeof folderId === 'string' && folderId.startsWith('tag:')) {
    const tag = folderId.slice(4).toLowerCase()
    rows = db.prepare(`
      SELECT * FROM notes WHERE deleted_at IS NULL AND tags LIKE ?
      ORDER BY sort_order ASC, updated_at DESC
    `).all(`%"${tag}"%`)
  } else if (folderId === undefined) {
    rows = db.prepare(`
      SELECT * FROM notes WHERE deleted_at IS NULL
      ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC
    `).all()
  } else {
    rows = db.prepare(`
      SELECT * FROM notes WHERE folder_id = ? AND deleted_at IS NULL
      ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC
    `).all(folderId)
  }
  return (rows as Record<string, unknown>[]).map(row2note)
}

export function listAllNotesForSync(): Note[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all() as Record<string, unknown>[]
  return rows.map(row2note)
}

export function getNote(id: string): Note | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? row2note(row) : null
}

export function updateNote(id: string, patch: Partial<Note>): void {
  const db = getDb()
  const before = getNote(id)
  const fields: string[] = []
  const values: unknown[] = []

  if (patch.title !== undefined) { fields.push('title = ?'); values.push(patch.title) }
  if (patch.body !== undefined) { fields.push('body = ?'); values.push(patch.body) }
  if (patch.plainText !== undefined) { fields.push('plain_text = ?'); values.push(patch.plainText) }
  if (patch.emoji !== undefined) { fields.push('emoji = ?'); values.push(patch.emoji) }
  if (patch.folderId !== undefined) { fields.push('folder_id = ?'); values.push(patch.folderId) }
  if (patch.isPinned !== undefined) { fields.push('is_pinned = ?'); values.push(patch.isPinned) }
  if (patch.isLocked !== undefined) { fields.push('is_locked = ?'); values.push(patch.isLocked) }
  if (patch.lockPasswordHash !== undefined) { fields.push('lock_password_hash = ?'); values.push(patch.lockPasswordHash) }
  if (patch.tags !== undefined) { fields.push('tags = ?'); values.push(patch.tags) }
  if (patch.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(patch.sortOrder) }

  const tagText = `${patch.title ?? ''} ${patch.plainText ?? ''}`.trim()
  if (patch.tags === undefined && tagText) {
    fields.push('tags = ?')
    values.push(JSON.stringify(extractTags(tagText)))
  }

  if (fields.length === 0) return

  if (before && (
    (patch.title !== undefined && patch.title !== before.title) ||
    (patch.body !== undefined && patch.body !== before.body) ||
    (patch.plainText !== undefined && patch.plainText !== before.plainText)
  )) {
    saveHistorySnapshot(before)
  }

  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  fields.push('sync_status = ?')
  values.push('pending')
  values.push(id)

  db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function upsertNoteFromSync(note: Note): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO notes (
      id, title, body, plain_text, emoji, folder_id, original_folder_id,
      is_pinned, is_locked, lock_password_hash, tags, created_at, updated_at,
      deleted_at, sync_status, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      body = excluded.body,
      plain_text = excluded.plain_text,
      emoji = excluded.emoji,
      folder_id = excluded.folder_id,
      is_pinned = excluded.is_pinned,
      is_locked = excluded.is_locked,
      lock_password_hash = excluded.lock_password_hash,
      tags = excluded.tags,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      sync_status = excluded.sync_status,
      sort_order = excluded.sort_order
  `).run(...noteToDbValues(note))
}

export function duplicateNote(id: string): Note | null {
  const source = getNote(id)
  if (!source) return null
  const copy: Note = {
    ...source,
    id: randomUUID(),
    title: `${source.title || 'New Note'} (Copy)`,
    isPinned: 0,
    isLocked: source.isLocked,
    lockPasswordHash: source.lockPasswordHash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
    sortOrder: Date.now(),
  }
  upsertNoteFromSync(copy)
  return getNote(copy.id)
}

export function moveNote(id: string, folderId: string | null): void {
  updateNote(id, { folderId, sortOrder: Date.now() })
}

export function reorderNotes(noteIds: string[], folderId?: string | null): void {
  const db = getDb()
  const updateOrderOnly = db.prepare('UPDATE notes SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
  const updateFolderAndOrder = db.prepare('UPDATE notes SET sort_order = ?, folder_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
  const run = db.transaction(() => {
    noteIds.forEach((id, index) => {
      if (folderId === undefined) updateOrderOnly.run(index + 1, id)
      else updateFolderAndOrder.run(index + 1, folderId, id)
    })
  })
  run()
}

export function createConflictCopy(note: Note, suffix: string): void {
  saveHistorySnapshot(note, 'sync conflict')
  const copy: Note = {
    ...note,
    id: randomUUID(),
    title: `${note.title || 'New Note'} (${suffix})`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  }
  upsertNoteFromSync(copy)
}

export function listNoteHistory(noteId: string) {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM note_history
    WHERE note_id = ?
    ORDER BY created_at DESC
  `).all(noteId) as Record<string, unknown>[]
  return rows.map(row2history)
}

export function restoreNoteHistory(noteId: string, historyId: string): Note | null {
  const db = getDb()
  const note = getNote(noteId)
  const history = db.prepare('SELECT * FROM note_history WHERE id = ? AND note_id = ?').get(historyId, noteId) as Record<string, unknown> | undefined
  if (!note || !history) return null
  saveHistorySnapshot(note, 'before restore')
  db.prepare(`
    UPDATE notes
    SET title = ?, body = ?, plain_text = ?, updated_at = datetime('now'), sync_status = 'pending'
    WHERE id = ?
  `).run(history.title, history.body, history.plain_text, noteId)
  return getNote(noteId)
}

export function markAllSynced(syncTime: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE notes
    SET sync_status = 'synced', last_synced_at = ?
    WHERE sync_status IN ('local', 'pending', 'conflict', 'synced')
  `).run(syncTime)
}

export function listTags(): { name: string; noteCount: number }[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT tags FROM notes WHERE deleted_at IS NULL AND tags != '[]'
  `).all() as { tags: string }[]
  const counts = new Map<string, number>()
  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags) as string[]
      for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    } catch {
      // ignore malformed tag rows
    }
  }
  return Array.from(counts.entries())
    .map(([name, noteCount]) => ({ name, noteCount }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function lockNote(id: string, password: string): void {
  if (!/^\d{6}$/.test(password)) throw new Error('Passcode must be 6 digits')
  const db = getDb()
  db.prepare(`
    UPDATE notes
    SET is_locked = 1, lock_password_hash = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(hashPassword(password), id)
}

export function lockNoteWithGlobalPasscode(id: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE notes
    SET is_locked = 1, lock_password_hash = 'global', updated_at = datetime('now')
    WHERE id = ?
  `).run(id)
}

export function unlockNote(id: string, password: string): boolean {
  const note = getNote(id)
  if (note?.lockPasswordHash === 'global') return verifyGlobalPasscode(password)
  return verifyPassword(password, note?.lockPasswordHash ?? null)
}

export function removeNoteLock(id: string, password?: string): boolean {
  const note = getNote(id)
  if (!note || note.isLocked !== 1) return true
  if (note.lockPasswordHash === 'global') {
    if (!password || !verifyGlobalPasscode(password)) return false
  } else if (!password || !verifyPassword(password, note.lockPasswordHash)) {
    return false
  }
  const db = getDb()
  db.prepare(`
    UPDATE notes
    SET is_locked = 0, lock_password_hash = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(id)
  return true
}

export function softDeleteNote(id: string): void {
  const db = getDb()
  db.prepare(`UPDATE notes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id)
}

export function restoreNote(id: string): void {
  const db = getDb()
  // Restore to original folder if it still exists, else null
  db.prepare(`
    UPDATE notes
    SET deleted_at = NULL,
        folder_id = CASE
          WHEN original_folder_id IS NOT NULL AND EXISTS (SELECT 1 FROM folders WHERE id = original_folder_id AND deleted_at IS NULL)
          THEN original_folder_id
          ELSE NULL
        END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(id)
}

export function permanentDeleteNote(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function getTrash(): Note[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM notes
    WHERE deleted_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM folders
        WHERE folders.id = notes.original_folder_id
          AND folders.deleted_at IS NOT NULL
      )
    ORDER BY deleted_at DESC
  `).all() as Record<string, unknown>[]
  return rows.map(row2note)
}

export function emptyTrash(): void {
  const db = getDb()
  db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL').run()
}

export function emptyOldTrash(): void {
  const db = getDb()
  db.prepare(`DELETE FROM notes WHERE deleted_at < datetime('now', '-30 days')`).run()
}

export function searchNotes(query: string): Note[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT notes.* FROM notes_fts
    JOIN notes ON notes.rowid = notes_fts.rowid
    WHERE notes_fts MATCH ? AND notes.deleted_at IS NULL
    ORDER BY rank
  `).all(query + '*') as Record<string, unknown>[]
  return rows.map(row2note)
}

export function searchNotesAdvanced(query: string, filters: {
  folderId?: string | null
  locked?: boolean
  attachments?: boolean
  checklists?: boolean
  dateRange?: 'today' | 'week' | 'month' | null
} = {}): Note[] {
  const db = getDb()
  const clauses = ['notes.deleted_at IS NULL']
  const values: unknown[] = []

  if (query.trim()) {
    clauses.unshift('notes_fts MATCH ?')
    values.push(`${query.trim()}*`)
  }
  if (filters.folderId) {
    clauses.push('notes.folder_id = ?')
    values.push(filters.folderId)
  }
  if (filters.locked) clauses.push('notes.is_locked = 1')
  if (filters.attachments) clauses.push("notes.body LIKE '%fileAttachment%'")
  if (filters.checklists) clauses.push("notes.body LIKE '%taskList%'")
  if (filters.dateRange === 'today') clauses.push("notes.updated_at >= datetime('now', '-1 day')")
  if (filters.dateRange === 'week') clauses.push("notes.updated_at >= datetime('now', '-7 days')")
  if (filters.dateRange === 'month') clauses.push("notes.updated_at >= datetime('now', '-30 days')")

  const sql = query.trim()
    ? `SELECT notes.* FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid WHERE ${clauses.join(' AND ')} ORDER BY rank`
    : `SELECT notes.* FROM notes WHERE ${clauses.join(' AND ')} ORDER BY notes.updated_at DESC`

  const rows = db.prepare(sql).all(...values) as Record<string, unknown>[]
  return rows.map(row2note)
}
