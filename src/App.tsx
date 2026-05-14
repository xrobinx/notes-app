import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { useSettingsStore } from './store/settingsStore'
import { useNotesStore } from './store/notesStore'
import { useFoldersStore } from './store/foldersStore'
import { DesktopWidget, type WidgetType } from './components/widgets/DesktopWidget'
import { OnboardingModal } from './components/modals/OnboardingModal'
import { markReminderNotified, scheduleAllReminders } from './utils/reminderStorage'
import './styles/global.css'
import './styles/titlebar.css'

export function App() {
  const widgetType = new URLSearchParams(window.location.search).get('widget') as WidgetType | null

  if (widgetType) {
    return <DesktopWidget type={widgetType} />
  }

  return <MainApp />
}

function MainApp() {
  const { load: loadSettings, hasCompletedOnboarding, loaded, performanceMode, refreshSyncStatus } = useSettingsStore()
  const { loadNotes, selectNote, notes } = useNotesStore()
  const { load: loadFolders } = useFoldersStore()

  useEffect(() => {
    async function init() {
      await loadSettings()
      await loadFolders()
      await loadNotes(null)
      scheduleAllReminders()
    }
    init()
  }, [])

  useEffect(() => {
    return window.api.on.reminderFired(markReminderNotified)
  }, [])

  useEffect(() => {
    if (!loaded || performanceMode) return
    const interval = window.setInterval(() => {
      void refreshSyncStatus()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [loaded, performanceMode, refreshSyncStatus])

  // Auto-open last note or first note once notes are loaded
  useEffect(() => {
    if (notes.length === 0) return
    const settings = useSettingsStore.getState()
    const lastId = settings.lastOpenNoteId
    if (lastId && notes.find(n => n.id === lastId)) {
      selectNote(lastId)
    } else {
      selectNote(notes[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.length])

  return (
    <>
      <AppLayout />
      {loaded && !hasCompletedOnboarding && !notes.length && <OnboardingModal />}
    </>
  )
}
