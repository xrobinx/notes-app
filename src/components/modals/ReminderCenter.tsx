import { useEffect, useState } from 'react'
import { Bell, Check, Clock3, RotateCcw, Trash2, X } from 'lucide-react'
import { readAllReminders, removeReminder, scheduleStoredReminder, subscribeToReminderChanges, writeAllReminders, type StoredReminder } from '../../utils/reminderStorage'
import './ReminderCenter.css'

function formatTimeLeft(dueAt?: string, done?: boolean): string {
  if (done) return 'Completed'
  if (!dueAt) return 'No time'
  const due = new Date(dueAt).getTime()
  if (Number.isNaN(due)) return 'No time'
  const diff = due - Date.now()
  if (diff <= -60000) return 'Overdue'
  if (diff <= 0) return 'Due now'
  const minutes = Math.ceil(diff / 60000)
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest ? `${hours}h ${rest}m left` : `${hours}h left`
  const days = Math.floor(hours / 24)
  const dayHours = hours % 24
  return dayHours ? `${days}d ${dayHours}h left` : `${days}d left`
}

export function ReminderCenter({ onClose }: { onClose: () => void }) {
  const [reminders, setReminders] = useState<StoredReminder[]>([])
  const [, setClockTick] = useState(0)

  const refresh = () => setReminders(readAllReminders())

  useEffect(() => {
    refresh()
    const unsubscribe = subscribeToReminderChanges(refresh)
    const interval = window.setInterval(() => setClockTick(value => value + 1), 30000)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  const save = (items: StoredReminder[]) => {
    setReminders(items)
    writeAllReminders(items)
    items.forEach(item => {
      if (item.done || !item.dueAt) void window.api.widgets.cancelReminder(item.id)
      else scheduleStoredReminder(item)
    })
  }

  const update = (id: string, patch: Partial<StoredReminder>) => {
    save(reminders.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  const snooze = (item: StoredReminder, minutes: number) => {
    const due = new Date(Date.now() + minutes * 60000)
    update(item.id, {
      done: false,
      dueAt: due.toISOString(),
      time: due.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
      completedAt: null,
      lastNotifiedAt: null,
    })
  }

  const complete = (item: StoredReminder) => {
    if (item.repeat === 'daily' || item.repeat === 'weekly') {
      const base = item.dueAt ? new Date(item.dueAt) : new Date()
      base.setDate(base.getDate() + (item.repeat === 'daily' ? 1 : 7))
      update(item.id, {
        dueAt: base.toISOString(),
        time: base.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
        done: false,
        lastNotifiedAt: null,
      })
      return
    }
    update(item.id, { done: true, completedAt: new Date().toISOString() })
  }

  return (
    <div className="reminder-center-backdrop" onMouseDown={onClose}>
      <section className="reminder-center scale-in" onMouseDown={event => event.stopPropagation()}>
        <header>
          <div>
            <Bell size={18} />
            <div>
              <h2>Reminder Center</h2>
              <p>All widget reminders in one place.</p>
            </div>
          </div>
          <button onClick={onClose} title="Close"><X size={16} /></button>
        </header>
        <div className="reminder-center-list">
          {reminders.length === 0 ? (
            <div className="reminder-center-empty">No reminders yet.</div>
          ) : reminders.map(item => (
            <article className={`reminder-center-item ${item.done ? 'done' : ''}`} key={item.id}>
              <button className="reminder-complete" onClick={() => complete(item)} title="Complete">
                {item.done ? <RotateCcw size={13} /> : <Check size={13} />}
              </button>
              <div className="reminder-center-copy">
                <strong>{item.text}</strong>
                <span><Clock3 size={12} /> {item.time || 'No time set'}</span>
                {item.completedAt && <small>Completed {new Date(item.completedAt).toLocaleString()}</small>}
              </div>
              <span className="reminder-time-left">{formatTimeLeft(item.dueAt, item.done)}</span>
              <select
                value={item.repeat ?? 'none'}
                onChange={event => update(item.id, { repeat: event.target.value as StoredReminder['repeat'] })}
              >
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <button onClick={() => snooze(item, 10)}>10m</button>
              <button onClick={() => snooze(item, 60)}>1h</button>
              <button className="danger" onClick={() => { removeReminder(item.id); refresh() }} title="Delete">
                <Trash2 size={13} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
