import { app, ipcMain } from 'electron'
import * as repo from '../database/settingsRepository'
import type { Settings } from '../../src/types/index'

const WIDGET_STARTUP_ARG = '--widget-startup'

function applyWidgetLoginSetting(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    args: enabled ? [WIDGET_STARTUP_ARG] : [],
  })
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => repo.getSettings())
  ipcMain.handle('settings:set', (_e, key: keyof Settings, value: unknown) => {
    repo.setSetting(key, value)
    if (key === 'startWidgetOnLogin') applyWidgetLoginSetting(Boolean(value))
  })
  ipcMain.handle('settings:global-passcode-status', () => repo.hasGlobalPasscode())
  ipcMain.handle('settings:set-global-passcode', (_e, passcode: string) => repo.setGlobalPasscode(passcode))
  ipcMain.handle('settings:reset-global-passcode', (_e, oldPasscode: string, newPasscode: string) => (
    repo.resetGlobalPasscode(oldPasscode, newPasscode)
  ))
  ipcMain.handle('settings:verify-global-passcode', (_e, passcode: string) => repo.verifyGlobalPasscode(passcode))
}

export function syncWidgetLoginSetting(): void {
  applyWidgetLoginSetting(repo.getSettings().startWidgetOnLogin)
}

export { WIDGET_STARTUP_ARG }
