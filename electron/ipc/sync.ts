import { ipcMain } from 'electron'
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  getSyncStatus,
  listBackups,
  restoreBackup,
  setEncryptionPassphrase,
  setSyncConfig,
  syncNow,
} from '../sync/driveSync'

export function registerSyncIpc(): void {
  ipcMain.handle('sync:save-config', (_event, clientId: string, clientSecret: string) => {
    setSyncConfig(clientId, clientSecret)
    return { ok: true }
  })

  ipcMain.handle('sync:set-passphrase', (_event, passphrase: string) => {
    return setEncryptionPassphrase(passphrase)
  })

  ipcMain.handle('sync:connect-google', async () => {
    return connectGoogleDrive()
  })

  ipcMain.handle('sync:run', async () => {
    return syncNow()
  })

  ipcMain.handle('sync:status', () => getSyncStatus())

  ipcMain.handle('sync:list-backups', async () => {
    return listBackups()
  })

  ipcMain.handle('sync:restore-backup', async (_event, fileId: string) => {
    return restoreBackup(fileId)
  })

  ipcMain.handle('sync:disconnect-google', () => {
    return disconnectGoogleDrive()
  })
}
