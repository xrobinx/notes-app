import { ipcMain } from 'electron'
import * as repo from '../database/foldersRepository'
import { scheduleAutoSync } from '../sync/driveSync'
import type { Folder } from '../../src/types/index'

export function registerFoldersIpc(): void {
  ipcMain.handle('folders:list', () => repo.listFolders())
  ipcMain.handle('folders:trash', () => repo.listDeletedFolders())
  ipcMain.handle('folders:delete-info', (_e, id: string) => repo.getFolderDeleteInfo(id))
  ipcMain.handle('folders:create', (_e, name: string, parentId?: string | null) => {
    const folder = repo.createFolder(name, parentId)
    scheduleAutoSync()
    return folder
  })
  ipcMain.handle('folders:update', (_e, id: string, data: Partial<Folder>) => {
    repo.updateFolder(id, data)
    scheduleAutoSync()
  })
  ipcMain.handle('folders:delete', (_e, id: string) => {
    repo.deleteFolder(id)
    scheduleAutoSync()
  })
  ipcMain.handle('folders:restore', (_e, id: string) => {
    repo.restoreFolder(id)
    scheduleAutoSync()
  })
  ipcMain.handle('folders:permanent-delete', (_e, id: string) => {
    repo.permanentDeleteFolder(id)
    scheduleAutoSync()
  })
  ipcMain.handle('folders:move', (_e, id: string, parentId?: string | null) => {
    repo.moveFolder(id, parentId ?? null)
    scheduleAutoSync()
  })
  ipcMain.handle('folders:reorder', (_e, folderIds: string[], parentId?: string | null) => {
    repo.reorderFolders(folderIds, parentId)
    scheduleAutoSync()
  })
}
