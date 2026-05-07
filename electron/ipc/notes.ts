import { ipcMain } from 'electron'
import * as repo from '../database/notesRepository'
import { scheduleAutoSync } from '../sync/driveSync'
import type { Note } from '../../src/types/index'

export function registerNotesIpc(): void {
  ipcMain.handle('notes:list', (_e, folderId?: string | null) => repo.listNotes(folderId))
  ipcMain.handle('notes:get', (_e, id: string) => repo.getNote(id))
  ipcMain.handle('notes:create', (_e, folderId?: string | null) => {
    const note = repo.createNote(folderId)
    scheduleAutoSync()
    return note
  })
  ipcMain.handle('notes:update', (_e, id: string, patch: Partial<Note>) => {
    repo.updateNote(id, patch)
    scheduleAutoSync()
  })
  ipcMain.handle('notes:delete', (_e, id: string) => {
    repo.softDeleteNote(id)
    scheduleAutoSync()
  })
  ipcMain.handle('notes:restore', (_e, id: string) => {
    repo.restoreNote(id)
    scheduleAutoSync()
  })
  ipcMain.handle('notes:permanent-delete', (_e, id: string) => {
    repo.permanentDeleteNote(id)
    scheduleAutoSync()
  })
  ipcMain.handle('notes:search', (_e, query: string) => repo.searchNotes(query))
  ipcMain.handle('notes:search-advanced', (_e, query: string, filters: Parameters<typeof repo.searchNotesAdvanced>[1]) => repo.searchNotesAdvanced(query, filters))
  ipcMain.handle('notes:history', (_e, noteId: string) => repo.listNoteHistory(noteId))
  ipcMain.handle('notes:restore-history', (_e, noteId: string, historyId: string) => {
    const note = repo.restoreNoteHistory(noteId, historyId)
    if (note) scheduleAutoSync()
    return note
  })
  ipcMain.handle('notes:trash', () => repo.getTrash())
  ipcMain.handle('notes:empty-trash', () => {
    repo.emptyTrash()
    scheduleAutoSync()
  })
  ipcMain.handle('notes:tags', () => repo.listTags())
  ipcMain.handle('notes:lock', (_e, id: string, password: string) => {
    repo.lockNote(id, password)
    scheduleAutoSync()
    return repo.getNote(id)
  })
  ipcMain.handle('notes:lock-global', (_e, id: string) => {
    repo.lockNoteWithGlobalPasscode(id)
    scheduleAutoSync()
    return repo.getNote(id)
  })
  ipcMain.handle('notes:unlock', (_e, id: string, password: string) => repo.unlockNote(id, password))
  ipcMain.handle('notes:remove-lock', (_e, id: string, password?: string) => {
    const ok = repo.removeNoteLock(id, password)
    if (ok) scheduleAutoSync()
    return ok ? repo.getNote(id) : null
  })
  ipcMain.handle('notes:duplicate', (_e, id: string) => {
    const note = repo.duplicateNote(id)
    scheduleAutoSync()
    return note
  })
  ipcMain.handle('notes:move', (_e, id: string, folderId?: string | null) => {
    repo.moveNote(id, folderId ?? null)
    scheduleAutoSync()
  })
  ipcMain.handle('notes:reorder', (_e, noteIds: string[], folderId?: string | null) => {
    repo.reorderNotes(noteIds, folderId)
    scheduleAutoSync()
  })
}
