import { ipcMain } from 'electron'
import * as repo from '../database/settingsRepository'
import type { Settings } from '../../src/types/index'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => repo.getSettings())
  ipcMain.handle('settings:set', (_e, key: keyof Settings, value: unknown) => repo.setSetting(key, value))
  ipcMain.handle('settings:global-passcode-status', () => repo.hasGlobalPasscode())
  ipcMain.handle('settings:set-global-passcode', (_e, passcode: string) => repo.setGlobalPasscode(passcode))
  ipcMain.handle('settings:reset-global-passcode', (_e, oldPasscode: string, newPasscode: string) => (
    repo.resetGlobalPasscode(oldPasscode, newPasscode)
  ))
  ipcMain.handle('settings:verify-global-passcode', (_e, passcode: string) => repo.verifyGlobalPasscode(passcode))
}
