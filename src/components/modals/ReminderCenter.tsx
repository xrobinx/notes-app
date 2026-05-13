import { useEffect, useState } from 'react'
import { Bell, Check, Clock3, RotateCcw, Trash2, X } from 'lucide-react'
import { readAllReminders, scheduleStoredReminder, writeAllReminders, type StoredReminder } from '../../utils/reminderStorage'
import './ReminderCenter.css'

export function ReminderCenter({ onClose }: { onClose: () => void }) {
  const [reminders, setReminders] = useState<StoredReminder[]>([])

  const refresh = () => setReminders(readAllReminders())

  useEffect(() => {
    refresh()
    window.addEventListener('notes-reminders-changed', refresh)
    return () => window.removeEventListener('notes-reminders-changed', refresh)
  }, [])

  const save = (items: StoredReminder[]) => {
    setReminders(items)
    writeAllReminders(items)
    items.forEach(scheduleStoredReminder)
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
              <button className="danger" onClick={() => save(reminders.filter(reminder => reminder.id !== item.id))} title="Delete">
                <Trash2 size={13} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
