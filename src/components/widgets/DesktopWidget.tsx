import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CalendarClock, Check, CheckSquare, ListChecks, StickyNote, Trash2, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { getTranslationLanguage } from '../../utils/languages'
import { markReminderNotified, readAllReminders, removeReminder, scheduleStoredReminder, subscribeToReminderChanges, writeAllReminders } from '../../utils/reminderStorage'
import './DesktopWidget.css'

export type WidgetType = 'all' | 'note' | 'todo' | 'reminder'

interface TodoItem {
  id: string
  text: string
  done: boolean
}

interface ReminderItem {
  id: string
  text: string
  time: string
  dueAt?: string
  done: boolean
}

interface Props {
  type: WidgetType
}

const labels: Record<WidgetType, string> = {
  all: 'Notes Widget',
  note: 'Quick Note',
  todo: 'Todo List',
  reminder: 'Reminders',
}

const modeLabels: Record<Exclude<WidgetType, 'all'>, string> = {
  note: 'Typed note',
  todo: 'Checklist',
  reminder: 'Reminder',
}

export function DesktopWidget({ type }: Props) {
  const settings = useSettingsStore()
  const storageKey = useMemo(() => `notes-widget-${type}`, [type])
  const [mode, setMode] = useState<Exclude<WidgetType, 'all'>>(type === 'all' ? 'note' : type)
  const [note, setNote] = useState('')
  const [todoText, setTodoText] = useState('')
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [reminderText, setReminderText] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('')
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const remindersFromExternal = useRef(false)
  const language = getTranslationLanguage(settings.translationLanguage)

  useEffect(() => {
    if (!settings.loaded) void settings.load()
  }, [settings])

  useEffect(() => {
    return window.api.on.reminderFired(markReminderNotified)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        setNote(data.note ?? '')
        setTodos(data.todos ?? [])
        setReminders(type === 'reminder' || type === 'all' ? readAllReminders() : data.reminders ?? [])
      } catch {
        // Ignore older or broken widget data.
      }
    } else if (type === 'reminder' || type === 'all') {
      setReminders(readAllReminders())
    }
    setLoaded(true)
  }, [storageKey, type])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(storageKey, JSON.stringify({ note, todos, reminders }))
    if (type === 'reminder' || type === 'all') {
      if (remindersFromExternal.current) {
        remindersFromExternal.current = false
      } else {
        writeAllReminders(reminders)
      }
    }
  }, [storageKey, note, todos, reminders, loaded, type])

  useEffect(() => {
    if (type !== 'reminder' && type !== 'all') return undefined
    return subscribeToReminderChanges(() => {
      remindersFromExternal.current = true
      setReminders(readAllReminders())
    })
  }, [type])

  useEffect(() => {
    reminders.forEach(item => {
      scheduleStoredReminder(item)
    })
  }, [reminders])

  const addTodo = () => {
    const text = todoText.trim()
    if (!text) return
    setTodos(items => [{ id: crypto.randomUUID(), text, done: false }, ...items])
    setTodoText('')
  }

  const addReminder = () => {
    const text = reminderText.trim()
    if (!text) return
    if (!reminderDate || !reminderTime) return
    const dueAt = new Date(`${reminderDate}T${reminderTime}`).toISOString()
    const dateTime = new Date(dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    const reminder = { id: crypto.randomUUID(), text, time: dateTime, dueAt, done: false }
    setReminders(items => [reminder, ...items])
    void window.api.widgets.scheduleReminder({ id: reminder.id, text, dueAt })
    setReminderText('')
    setReminderDate('')
    setReminderTime('')
    setReminderPickerOpen(false)
  }

  const showModeTabs = type === 'all'
  const titleLabel = showModeTabs ? modeLabels[mode] : labels[type]
  const finishTodoEdit = (id: string) => {
    const text = editText.trim()
    if (text) setTodos(items => items.map(item => item.id === id ? { ...item, text } : item))
    setEditingTodoId(null)
    setEditText('')
  }
  const finishReminderEdit = (id: string) => {
    const text = editText.trim()
    if (text) {
      setReminders(items => items.map(item => item.id === id ? { ...item, text } : item))
      const reminder = reminders.find(item => item.id === id)
      if (reminder?.dueAt) void window.api.widgets.scheduleReminder({ id, text, dueAt: reminder.dueAt })
    }
    setEditingReminderId(null)
    setEditText('')
  }

  return (
    <div className="desktop-widget">
      <header className="widget-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="widget-title">
          {mode === 'todo' ? <ListChecks size={15} /> : mode === 'reminder' ? <Bell size={15} /> : <StickyNote size={15} />}
          <span>{titleLabel}</span>
        </div>
        <div className="widget-mode-tabs" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {showModeTabs && (
            <>
              <button className={mode === 'note' ? 'active' : ''} onClick={() => setMode('note')} title="Typed note">
                <StickyNote size={14} />
              </button>
              <button className={mode === 'todo' ? 'active' : ''} onClick={() => setMode('todo')} title="Todo list">
                <CheckSquare size={14} />
              </button>
              <button className={mode === 'reminder' ? 'active' : ''} onClick={() => setMode('reminder')} title="Reminders">
                <CalendarClock size={14} />
              </button>
            </>
          )}
        </div>
        <button
          className="widget-close"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => window.api.window.closeCurrent()}
          title="Close widget"
        >
          <X size={14} />
        </button>
      </header>

      <main className="widget-body">
        {mode === 'note' && (
          <section className="widget-surface widget-note-surface">
            <textarea
              className="widget-note-input"
              value={note}
              spellCheck={settings.spellcheckEnabled}
              lang={language.spellcheck}
              placeholder="Write anything..."
              onChange={event => setNote(event.target.value)}
            />
          </section>
        )}

        {mode === 'todo' && (
          <section className="widget-surface">
            <div className="widget-entry-row">
              <button className="widget-checkbox-button" onClick={addTodo} title="Add task">
                <CheckSquare size={15} />
              </button>
              <input
                value={todoText}
                spellCheck={settings.spellcheckEnabled}
                lang={language.spellcheck}
                placeholder="New checklist item"
                onChange={event => setTodoText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addTodo()
                }}
              />
            </div>
            <div className="widget-list">
              {todos.map(item => (
                <div
                  key={item.id}
                  className={`widget-check-item ${item.done ? 'done' : ''}`}
                >
                  <button
                    className="widget-item-toggle"
                    onClick={() => setTodos(items => items.map(todo => todo.id === item.id ? { ...todo, done: !todo.done } : todo))}
                    title={item.done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {item.done && <Check size={11} />}
                  </button>
                  {editingTodoId === item.id ? (
                    <input
                      className="widget-item-edit"
                      autoFocus
                      value={editText}
                      spellCheck={settings.spellcheckEnabled}
                      lang={language.spellcheck}
                      onChange={event => setEditText(event.target.value)}
                      onBlur={() => finishTodoEdit(item.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') finishTodoEdit(item.id)
                        if (event.key === 'Escape') setEditingTodoId(null)
                      }}
                    />
                  ) : (
                    <em
                      onClick={() => {
                        setEditingTodoId(item.id)
                        setEditText(item.text)
                      }}
                    >
                      {item.text}
                    </em>
                  )}
                  <button
                    className="widget-item-delete"
                    onClick={() => setTodos(items => items.filter(todo => todo.id !== item.id))}
                    title="Delete task"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {mode === 'reminder' && (
          <section className="widget-surface">
            <div className="widget-entry-row reminder-entry">
              <button className="widget-checkbox-button" onClick={() => setReminderPickerOpen(value => !value)} title="Choose date and time">
                <CalendarClock size={15} />
              </button>
              <input
                value={reminderText}
                spellCheck={settings.spellcheckEnabled}
                lang={language.spellcheck}
                placeholder="New reminder"
                onChange={event => setReminderText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addReminder()
                }}
              />
              {reminderPickerOpen && (
                <div className="widget-reminder-popover">
                  <div className="widget-popover-title">
                    <CalendarClock size={14} />
                    <span>Reminder time</span>
                  </div>
                  <label>
                    Date
                    <input type="date" value={reminderDate} onChange={event => setReminderDate(event.target.value)} />
                  </label>
                  <label>
                    Time
                    <input type="time" value={reminderTime} onChange={event => setReminderTime(event.target.value)} />
                  </label>
                  <button onClick={addReminder}>Save Reminder</button>
                </div>
              )}
            </div>
            <div className="widget-list">
              {reminders.map(item => (
                <div
                  key={item.id}
                  className={`widget-check-item ${item.done ? 'done' : ''}`}
                >
                  <button
                    className="widget-item-toggle"
                    onClick={() => setReminders(items => items.map(reminder => reminder.id === item.id ? { ...reminder, done: !reminder.done } : reminder))}
                    title={item.done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {item.done && <Check size={11} />}
                  </button>
                  {editingReminderId === item.id ? (
                    <input
                      className="widget-item-edit"
                      autoFocus
                      value={editText}
                      spellCheck={settings.spellcheckEnabled}
                      lang={language.spellcheck}
                      onChange={event => setEditText(event.target.value)}
                      onBlur={() => finishReminderEdit(item.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') finishReminderEdit(item.id)
                        if (event.key === 'Escape') setEditingReminderId(null)
                      }}
                    />
                  ) : (
                    <em
                      onClick={() => {
                        setEditingReminderId(item.id)
                        setEditText(item.text)
                      }}
                    >
                      {item.text}
                    </em>
                  )}
                  {item.time && <strong>{item.time}</strong>}
                  <button
                    className="widget-item-delete"
                    onClick={() => {
                      removeReminder(item.id)
                      setReminders(readAllReminders())
                    }}
                    title="Delete reminder"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
