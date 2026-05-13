export interface StoredReminder {
  id: string
  text: string
  time: string
  dueAt?: string
  done: boolean
  repeat?: 'none' | 'daily' | 'weekly'
  completedAt?: string | null
}

const WIDGET_KEYS = ['notes-widget-all', 'notes-widget-reminder']

export function readAllReminders(): StoredReminder[] {
  const seen = new Set<string>()
  const reminders: StoredReminder[] = []
  for (const key of WIDGET_KEYS) {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '{}') as { reminders?: StoredReminder[] }
      for (const reminder of data.reminders ?? []) {
        if (seen.has(reminder.id)) continue
        seen.add(reminder.id)
        reminders.push({ repeat: 'none', completedAt: null, ...reminder })
      }
    } catch {
      // Ignore broken widget data.
    }
  }
  return reminders.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
}

export function writeAllReminders(reminders: StoredReminder[]): void {
  for (const key of WIDGET_KEYS) {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...data, reminders }))
    } catch {
      localStorage.setItem(key, JSON.stringify({ reminders }))
    }
  }
  window.dispatchEvent(new Event('notes-reminders-changed'))
}

export function scheduleStoredReminder(reminder: StoredReminder): void {
  if (!reminder.dueAt || reminder.done) return
  void window.api.widgets.scheduleReminder({ id: reminder.id, text: reminder.text, dueAt: reminder.dueAt })
}

export function scheduleAllReminders(): void {
  readAllReminders().forEach(scheduleStoredReminder)
}
