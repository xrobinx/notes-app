import { randomUUID } from 'crypto'
import { getDb } from './db'
import type { Folder } from '../../src/types/index'

function row2folder(row: Record<string, unknown>): Folder {
  return {
    id: row.id as string,
    name: row.name as string,
    parentId: row.parent_id as string | null,
    sortOrder: row.sort_order as number,
    deletedAt: row.deleted_at as string | null,
    originalParentId: row.original_parent_id as string | null,
  }
}

interface SyncFolder extends Folder {
  createdAt?: string
  updatedAt?: string
}

export function listFolders(): Folder[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC').all() as Record<string, unknown>[]
  const flat = rows.map(row2folder)
  return buildTree(flat)
}

export function listAllFoldersForSync(): SyncFolder[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM folders ORDER BY sort_order ASC, name ASC').all() as Record<string, unknown>[]
  return rows.map(row => ({
    ...row2folder(row),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }))
}

function buildTree(folders: Folder[], parentId: string | null = null): Folder[] {
  return folders
    .filter(f => f.parentId === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }))
}

function descendantIds(id: string): string[] {
  const db = getDb()
  const ids = [id]
  const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(id) as { id: string }[]
  for (const child of children) ids.push(...descendantIds(child.id))
  return ids
}

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(',')
}

export function getFolderDeleteInfo(id: string): { id: string; name: string; noteCount: number; folderCount: number } | null {
  const db = getDb()
  const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined
  if (!folder) return null
  const ids = descendantIds(id)
  const noteCount = (db.prepare(`SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL AND folder_id IN (${placeholders(ids)})`).get(...ids) as { count: number }).count
  return {
    id,
    name: folder.name as string,
    noteCount,
    folderCount: Math.max(0, ids.length - 1),
  }
}

export function createFolder(name: string, parentId?: string | null): Folder {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(id, name, parentId ?? null, now, now)
  return row2folder(db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Record<string, unknown>)
}

export function updateFolder(id: string, data: Partial<Folder>): void {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.parentId !== undefined) { fields.push('parent_id = ?'); values.push(data.parentId) }
  if (data.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(data.sortOrder) }
  if (fields.length === 0) return
  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  db.prepare(`UPDATE folders SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function moveFolder(id: string, parentId: string | null): void {
  if (id === parentId) return
  updateFolder(id, { parentId, sortOrder: Date.now() })
}

export function reorderFolders(folderIds: string[], parentId?: string | null): void {
  const db = getDb()
  const updateOrderOnly = db.prepare('UPDATE folders SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
  const updateParentAndOrder = db.prepare('UPDATE folders SET sort_order = ?, parent_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
  const run = db.transaction(() => {
    folderIds.forEach((id, index) => {
      if (parentId === undefined) updateOrderOnly.run(index + 1, id)
      else if (id !== parentId) updateParentAndOrder.run(index + 1, parentId, id)
    })
  })
  run()
}

export function deleteFolder(id: string): void {
  const db = getDb()
  const ids = descendantIds(id)
  const now = new Date().toISOString()
  const folderUpdate = db.prepare('UPDATE folders SET deleted_at = ?, original_parent_id = COALESCE(original_parent_id, parent_id), updated_at = ? WHERE id = ?')
  const noteUpdate = db.prepare('UPDATE notes SET deleted_at = ?, original_folder_id = COALESCE(original_folder_id, folder_id), updated_at = ? WHERE deleted_at IS NULL AND folder_id = ?')
  const run = db.transaction(() => {
    for (const folderId of ids) {
      folderUpdate.run(now, now, folderId)
      noteUpdate.run(now, now, folderId)
    }
  })
  run()
}

export function listDeletedFolders(): Folder[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT f.* FROM folders f
    LEFT JOIN folders p ON p.id = f.parent_id
    WHERE f.deleted_at IS NOT NULL
      AND (f.parent_id IS NULL OR p.deleted_at IS NULL)
    ORDER BY f.deleted_at DESC
  `).all() as Record<string, unknown>[]
  return rows.map(row => {
    const folder = row2folder(row)
    const info = getDeletedFolderInfo(folder.id)
    return { ...folder, ...info }
  })
}

function getDeletedFolderInfo(id: string): { noteCount: number; folderCount: number } {
  const db = getDb()
  const ids = descendantIds(id)
  const noteCount = (db.prepare(`SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL AND original_folder_id IN (${placeholders(ids)})`).get(...ids) as { count: number }).count
  return { noteCount, folderCount: Math.max(0, ids.length - 1) }
}

export function restoreFolder(id: string): void {
  const db = getDb()
  const ids = descendantIds(id)
  const now = new Date().toISOString()
  const restoreFolderStmt = db.prepare(`
    UPDATE folders
    SET deleted_at = NULL,
        parent_id = original_parent_id,
        original_parent_id = NULL,
        updated_at = ?
    WHERE id = ?
  `)
  const restoreNotesStmt = db.prepare(`
    UPDATE notes
    SET deleted_at = NULL,
        folder_id = original_folder_id,
        updated_at = ?
    WHERE original_folder_id = ?
  `)
  const run = db.transaction(() => {
    for (const folderId of ids) restoreFolderStmt.run(now, folderId)
    for (const folderId of ids) restoreNotesStmt.run(now, folderId)
  })
  run()
}

export function permanentDeleteFolder(id: string): void {
  const db = getDb()
  const ids = descendantIds(id)
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM notes WHERE original_folder_id IN (${placeholders(ids)})`).run(...ids)
    db.prepare(`DELETE FROM folders WHERE id IN (${placeholders(ids)})`).run(...ids)
  })
  run()
}

export function upsertFolderFromSync(folder: SyncFolder): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at, deleted_at, original_parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      parent_id = excluded.parent_id,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at,
      original_parent_id = excluded.original_parent_id
  `).run(
    folder.id,
    folder.name,
    folder.parentId,
    folder.sortOrder,
    folder.createdAt ?? new Date().toISOString(),
    folder.updatedAt ?? new Date().toISOString(),
    folder.deletedAt ?? null,
    folder.originalParentId ?? null,
  )
}
