export interface StoredReminder {
  id: string
  text: string
  time: string
  dueAt?: string
  done: boolean
  repeat?: 'none' | 'daily' | 'weekly'
  completedAt?: string | null
  lastNotifiedAt?: string | null
}

const WIDGET_KEYS = ['notes-widget-all', 'notes-widget-reminder']
const REMINDER_CHANNEL = 'notes-reminders-channel'
let reminderChannel: BroadcastChannel | null = null

function getReminderChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!reminderChannel) reminderChannel = new BroadcastChannel(REMINDER_CHANNEL)
  return reminderChannel
}

function emitReminderChange(): void {
  window.dispatchEvent(new Event('notes-reminders-changed'))
  getReminderChannel()?.postMessage({ type: 'changed' })
}

export function readAllReminders(): StoredReminder[] {
  const seen = new Set<string>()
  const reminders: StoredReminder[] = []
  for (const key of WIDGET_KEYS) {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '{}') as { reminders?: StoredReminder[] }
      for (const reminder of data.reminders ?? []) {
        if (seen.has(reminder.id)) continue
        seen.add(reminder.id)
        reminders.push({ repeat: 'none', completedAt: null, lastNotifiedAt: null, ...reminder })
      }
    } catch {
      // Ignore broken widget data.
    }
  }
  return reminders.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
}

export function writeAllReminders(reminders: StoredReminder[]): void {
  const normalized = reminders.map(reminder => ({ repeat: 'none' as const, completedAt: null, lastNotifiedAt: null, ...reminder }))
  for (const key of WIDGET_KEYS) {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...data, reminders: normalized }))
    } catch {
      localStorage.setItem(key, JSON.stringify({ reminders: normalized }))
    }
  }
  emitReminderChange()
}

export function scheduleStoredReminder(reminder: StoredReminder): void {
  if (!reminder.dueAt || reminder.done) return
  const dueTime = new Date(reminder.dueAt).getTime()
  if (Number.isNaN(dueTime)) return
  if (dueTime <= Date.now() && reminder.lastNotifiedAt) return
  void window.api.widgets.scheduleReminder({ id: reminder.id, text: reminder.text, dueAt: reminder.dueAt })
}

export function scheduleAllReminders(): void {
  readAllReminders().forEach(scheduleStoredReminder)
}

export function removeReminder(id: string): void {
  void window.api.widgets.cancelReminder(id)
  writeAllReminders(readAllReminders().filter(reminder => reminder.id !== id))
}

export function markReminderNotified(id: string): void {
  const now = new Date().toISOString()
  writeAllReminders(readAllReminders().map(reminder => (
    reminder.id === id ? { ...reminder, lastNotifiedAt: now } : reminder
  )))
}

export function subscribeToReminderChanges(callback: () => void): () => void {
  const onWindowChange = () => callback()
  window.addEventListener('notes-reminders-changed', onWindowChange)
  const channel = getReminderChannel()
  const onMessage = (event: MessageEvent) => {
    if ((event.data as { type?: string })?.type === 'changed') callback()
  }
  channel?.addEventListener('message', onMessage)
  return () => {
    window.removeEventListener('notes-reminders-changed', onWindowChange)
    channel?.removeEventListener('message', onMessage)
  }
}
