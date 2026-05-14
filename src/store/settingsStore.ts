import { create } from 'zustand'
import type { Settings } from '../types'
import { DEFAULT_SHORTCUTS } from '../utils/shortcuts'

interface SettingsState extends Settings {
  loaded: boolean
  hasGlobalPasscode: boolean
  load: () => Promise<void>
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
  refreshGlobalPasscode: () => Promise<void>
  setGlobalPasscode: (passcode: string) => Promise<boolean>
  resetGlobalPasscode: (oldPasscode: string, newPasscode: string) => Promise<boolean>
  refreshSyncStatus: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
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
  openWidgets: [],
  widgetBounds: {},
  loaded: false,
  hasGlobalPasscode: false,

  load: async () => {
    const [settings, hasGlobalPasscode] = await Promise.all([
      window.api.settings.get(),
      window.api.settings.hasGlobalPasscode()
    ])
    set({
      ...settings,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(settings.shortcuts ?? {}) },
      hasGlobalPasscode,
      loaded: true
    })
    // Apply theme
    applyTheme(settings.theme)
    applyPerformanceMode(settings.performanceMode)
    window.api.on.themeChange((isDark) => {
      const st = useSettingsStore.getState()
      if (st.theme === 'auto') {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
      }
    })
  },

  setSetting: async (key, value) => {
    await window.api.settings.set(key, value)
    set({ [key]: value } as Partial<SettingsState>)
    if (key === 'theme') applyTheme(value as Settings['theme'])
    if (key === 'performanceMode') applyPerformanceMode(Boolean(value))
  },

  refreshGlobalPasscode: async () => {
    const hasGlobalPasscode = await window.api.settings.hasGlobalPasscode()
    set({ hasGlobalPasscode })
  },

  setGlobalPasscode: async (passcode) => {
    const ok = await window.api.settings.setGlobalPasscode(passcode)
    if (ok) set({ hasGlobalPasscode: true })
    return ok
  },

  resetGlobalPasscode: async (oldPasscode, newPasscode) => {
    const ok = await window.api.settings.resetGlobalPasscode(oldPasscode, newPasscode)
    if (ok) set({ hasGlobalPasscode: true })
    return ok
  },

  refreshSyncStatus: async () => {
    const status = await window.api.sync.status()
    set(status)
  }
}))

function applyTheme(theme: Settings['theme']) {
  if (theme === 'auto') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

function applyPerformanceMode(enabled: boolean) {
  document.documentElement.toggleAttribute('data-performance-mode', enabled)
}
