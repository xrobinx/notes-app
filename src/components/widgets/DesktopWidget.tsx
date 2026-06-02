import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronRight,
  Clock3,
  ListChecks,
  Lock,
  NotebookText,
  Pin,
  Plus,
  RefreshCcw,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import type { Note } from '../../types'
import { getTranslationLanguage } from '../../utils/languages'
import {
  markReminderNotified,
  readAllReminders,
  removeReminder,
  scheduleStoredReminder,
  subscribeToReminderChanges,
  writeAllReminders,
  type StoredReminder,
} from '../../utils/reminderStorage'
import './DesktopWidget.css'

export type WidgetType = 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder' | 'all' | 'note' | 'todo'
type WidgetKind = 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder'

interface TodoItem {
  id: string
  text: string
  done: boolean
}

interface WidgetData {
  quickNoteId?: string | null
  quickText?: string
  pinnedNoteId?: string | null
  todos?: TodoItem[]
}

const kindForType: Record<WidgetType, WidgetKind> = {
  today: 'today',
  pinned: 'pinned',
  quick: 'quick',
  checklist: 'checklist',
  reminder: 'reminder',
  all: 'today',
  note: 'quick',
  todo: 'checklist',
}

const titles: Record<WidgetKind, string> = {
  today: 'Today',
  pinned: 'Pinned Note',
  quick: 'Quick Note',
  checklist: 'Checklist',
  reminder: 'Reminders',
}

function textToDoc(text: string) {
  const paragraphs = text.split(/\n{2,}/).map(block => ({
    type: 'paragraph',
    content: block
      ? [{ type: 'text', text: block.replace(/\n/g, ' ') }]
      : undefined,
  }))
  return { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] }
}

function notePreview(note?: Note | null): string {
  if (!note) return ''
  if (note.isLocked) return 'This note is locked.'
  return (note.plainText || 'No additional text yet.').replace(/\s+/g, ' ').trim()
}

function greeting(name?: string | null): string {
  const hour = new Date().getHours()
  const prefix = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${prefix}, ${name}` : prefix
}

function formatTimeLeft(dueAt?: string, done?: boolean): string {
  if (done) return 'Done'
  if (!dueAt) return ''
  const diff = new Date(dueAt).getTime() - Date.now()
  if (Number.isNaN(diff)) return ''
  if (diff <= 0) return 'Due now'
  const minutes = Math.ceil(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.ceil(hours / 24)
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `${days}d`
  return new Date(dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function dateInputValue(value?: string): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function timeInputValue(value?: string): string {
  if (!value) return ''
  return value.slice(11, 16)
}

export function DesktopWidget({ type }: { type: WidgetType }) {
  const settings = useSettingsStore()
  const kind = kindForType[type] ?? 'today'
  const storageKey = useMemo(() => `notes-widget-${kind}`, [kind])
  const quickStorageKey = 'notes-widget-quick'
  const [notes, setNotes] = useState<Note[]>([])
  const [data, setData] = useState<WidgetData>({})
  const [quickText, setQuickText] = useState('')
  const [todoText, setTodoText] = useState('')
  const [reminderText, setReminderText] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('')
  const [reminders, setReminders] = useState<StoredReminder[]>([])
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const quickSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remindersFromExternal = useRef(false)
  const language = getTranslationLanguage(settings.translationLanguage)

  const pinnedNotes = notes.filter(note => note.isPinned && !note.deletedAt)
  const unlockedNotes = notes.filter(note => !note.deletedAt)
  const selectedPinnedNote = unlockedNotes.find(note => note.id === data.pinnedNoteId)
    ?? pinnedNotes[0]
    ?? unlockedNotes[0]
  const recentNote = unlockedNotes.find(note => note.id !== selectedPinnedNote?.id) ?? unlockedNotes[0]
  const upcomingReminders = reminders.filter(item => !item.done).slice(0, 4)
  const todos = data.todos ?? []

  useEffect(() => {
    if (!settings.loaded) void settings.load()
  }, [settings])

  useEffect(() => window.api.on.reminderFired(markReminderNotified), [])

  const refreshNotes = async () => {
    const all = await window.api.notes.list()
    setNotes(all)
  }

  useEffect(() => {
    let cancelled = false
    async function loadWidget() {
      let saved: WidgetData = {}
      let quickSaved: WidgetData = {}
      try { saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as WidgetData } catch { saved = {} }
      try { quickSaved = JSON.parse(localStorage.getItem(quickStorageKey) ?? '{}') as WidgetData } catch { quickSaved = {} }
      if (cancelled) return
      setData({ ...saved, quickNoteId: saved.quickNoteId ?? quickSaved.quickNoteId ?? null })
      setQuickText(saved.quickText ?? quickSaved.quickText ?? '')
      setReminders(readAllReminders())
      await refreshNotes()
      const quickNoteId = saved.quickNoteId ?? quickSaved.quickNoteId
      if (quickNoteId) {
        const note = await window.api.notes.get(quickNoteId)
        if (!cancelled && note) setQuickText(note.plainText || quickSaved.quickText || '')
      }
      if (!cancelled) setLoaded(true)
    }
    void loadWidget()
    return () => { cancelled = true }
  }, [storageKey])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(storageKey, JSON.stringify({ ...data, quickText }))
    if (kind !== 'quick') {
      const quickSaved = JSON.parse(localStorage.getItem(quickStorageKey) ?? '{}') as WidgetData
      localStorage.setItem(quickStorageKey, JSON.stringify({ ...quickSaved, quickText, quickNoteId: data.quickNoteId ?? quickSaved.quickNoteId ?? null }))
    }
  }, [data, kind, loaded, quickText, storageKey])

  useEffect(() => {
    if (!loaded) return
    if (quickSaveTimer.current) clearTimeout(quickSaveTimer.current)
    quickSaveTimer.current = setTimeout(async () => {
      const text = quickText.trim()
      if (!text) return
      const title = text.split('\n')[0].trim().slice(0, 60) || 'Quick Note'
      const plainText = quickText.trim()
      let noteId = data.quickNoteId ?? null
      if (!noteId) {
        const note = await window.api.notes.create(null)
        noteId = note.id
        setData(current => ({ ...current, quickNoteId: note.id }))
      }
      await window.api.notes.update(noteId, {
        title,
        plainText,
        body: JSON.stringify(textToDoc(quickText)),
      })
      await refreshNotes()
    }, 700)
    return () => {
      if (quickSaveTimer.current) clearTimeout(quickSaveTimer.current)
    }
  }, [data.quickNoteId, loaded, quickText])

  useEffect(() => subscribeToReminderChanges(() => {
    remindersFromExternal.current = true
    setReminders(readAllReminders())
  }), [])

  useEffect(() => {
    if (!loaded) return
    if (remindersFromExternal.current) {
      remindersFromExternal.current = false
      return
    }
    writeAllReminders(reminders)
    reminders.forEach(scheduleStoredReminder)
  }, [loaded, reminders])

  const openNote = (note?: Note | null) => {
    if (!note) return
    void window.api.widgets.openNote(note.id)
  }

  const cyclePinnedNote = () => {
    const candidates = pinnedNotes.length ? pinnedNotes : unlockedNotes
    if (candidates.length === 0) return
    const currentIndex = Math.max(0, candidates.findIndex(note => note.id === selectedPinnedNote?.id))
    const next = candidates[(currentIndex + 1) % candidates.length]
    setData(current => ({ ...current, pinnedNoteId: next.id }))
  }

  const addTodo = () => {
    const text = todoText.trim()
    if (!text) return
    setData(current => ({
      ...current,
      todos: [{ id: crypto.randomUUID(), text, done: false }, ...(current.todos ?? [])],
    }))
    setTodoText('')
  }

  const updateTodo = (id: string, patch: Partial<TodoItem>) => {
    setData(current => ({
      ...current,
      todos: (current.todos ?? []).map(item => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  const deleteTodo = (id: string) => {
    setData(current => ({ ...current, todos: (current.todos ?? []).filter(item => item.id !== id) }))
  }

  const finishTodoEdit = (id: string) => {
    const text = editText.trim()
    if (text) updateTodo(id, { text })
    setEditingTodoId(null)
    setEditText('')
  }

  const saveReminder = (id?: string) => {
    const text = reminderText.trim()
    if (!text || !reminderDate || !reminderTime) return
    const dueAt = new Date(`${reminderDate}T${reminderTime}`).toISOString()
    const time = new Date(dueAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    if (id) {
      setReminders(items => items.map(item => item.id === id ? { ...item, text, dueAt, time, done: false, lastNotifiedAt: null } : item))
    } else {
      setReminders(items => [{ id: crypto.randomUUID(), text, dueAt, time, done: false, repeat: 'none', completedAt: null, lastNotifiedAt: null }, ...items])
    }
    setReminderText('')
    setReminderDate('')
    setReminderTime('')
    setEditingReminderId(null)
    setPickerOpen(false)
  }

  const startReminderEdit = (item: StoredReminder) => {
    setEditingReminderId(item.id)
    setReminderText(item.text)
    setReminderDate(dateInputValue(item.dueAt))
    setReminderTime(timeInputValue(item.dueAt))
    setPickerOpen(true)
  }

  const completeReminder = (item: StoredReminder) => {
    setReminders(items => items.map(reminder => (
      reminder.id === item.id ? { ...reminder, done: !reminder.done, completedAt: reminder.done ? null : new Date().toISOString() } : reminder
    )))
  }

  return (
    <div className={`desktop-widget apple-widget widget-${kind}`}>
      <header className="widget-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="widget-title">
          {kind === 'today' && <NotebookText size={15} />}
          {kind === 'pinned' && <Pin size={15} />}
          {kind === 'quick' && <StickyNote size={15} />}
          {kind === 'checklist' && <ListChecks size={15} />}
          {kind === 'reminder' && <Bell size={15} />}
          <span>{titles[kind]}</span>
        </div>
        <div className="widget-header-actions" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {(kind === 'pinned' || kind === 'today') && (
            <button onClick={cyclePinnedNote} title="Show another note"><RefreshCcw size={13} /></button>
          )}
          <button onClick={() => window.api.window.closeCurrent()} title="Close widget"><X size={14} /></button>
        </div>
      </header>

      <main className="widget-body">
        {kind === 'today' && (
          <section className="widget-stack">
            <div className="widget-greeting">{greeting(settings.nickname)}</div>
            <button className="widget-note-preview hero" onDoubleClick={() => openNote(selectedPinnedNote)} onClick={() => openNote(selectedPinnedNote)}>
              <span className="widget-note-emoji">{selectedPinnedNote?.emoji ?? '📝'}</span>
              <div>
                <strong>{selectedPinnedNote?.title ?? 'No pinned note yet'}</strong>
                <p>{notePreview(selectedPinnedNote) || 'Pin a note to show it here.'}</p>
              </div>
              <ChevronRight size={14} />
            </button>
            <div className="widget-mini-grid">
              <div className="widget-mini-card">
                <span>Next</span>
                <strong>{upcomingReminders[0]?.text ?? 'No reminders'}</strong>
                <small>{formatTimeLeft(upcomingReminders[0]?.dueAt, upcomingReminders[0]?.done)}</small>
              </div>
              <button className="widget-mini-card clickable" onClick={() => openNote(recentNote)}>
                <span>Recent</span>
                <strong>{recentNote?.title ?? 'No notes'}</strong>
                <small>{recentNote ? new Date(recentNote.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</small>
              </button>
            </div>
            <QuickNoteCard
              quickText={quickText}
              setQuickText={setQuickText}
              spellcheck={settings.spellcheckEnabled}
              lang={language.spellcheck}
              compact
            />
          </section>
        )}

        {kind === 'pinned' && (
          <section className="widget-stack">
            <button className={`widget-note-preview full ${selectedPinnedNote?.isLocked ? 'locked' : ''}`} onClick={() => openNote(selectedPinnedNote)} onDoubleClick={() => openNote(selectedPinnedNote)}>
              <span className="widget-note-emoji">{selectedPinnedNote?.emoji ?? '📌'}</span>
              <div>
                <strong>{selectedPinnedNote?.title ?? 'Choose a pinned note'}</strong>
                <p>{notePreview(selectedPinnedNote) || 'Pin a note in the app, then it appears here.'}</p>
              </div>
              {selectedPinnedNote?.isLocked ? <Lock size={15} /> : <ChevronRight size={15} />}
            </button>
            <div className="widget-recent-list">
              {(pinnedNotes.length ? pinnedNotes : unlockedNotes).slice(0, 4).map(note => (
                <button key={note.id} className={note.id === selectedPinnedNote?.id ? 'active' : ''} onClick={() => setData(current => ({ ...current, pinnedNoteId: note.id }))} onDoubleClick={() => openNote(note)}>
                  <span>{note.emoji}</span>
                  <em>{note.title}</em>
                </button>
              ))}
            </div>
          </section>
        )}

        {kind === 'quick' && (
          <QuickNoteCard
            quickText={quickText}
            setQuickText={setQuickText}
            spellcheck={settings.spellcheckEnabled}
            lang={language.spellcheck}
          />
        )}

        {kind === 'checklist' && (
          <section className="widget-stack">
            <div className="widget-entry-row apple-entry">
              <CheckSquare size={15} />
              <input
                value={todoText}
                spellCheck={settings.spellcheckEnabled}
                lang={language.spellcheck}
                placeholder="Add checklist item"
                onChange={event => setTodoText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') addTodo()
                }}
              />
              <button onClick={addTodo} title="Add task"><Plus size={14} /></button>
            </div>
            <div className="widget-list apple-list">
              {todos.length === 0 && <div className="widget-empty">No checklist items yet.</div>}
              {todos.map(item => (
                <div key={item.id} className={`widget-check-item ${item.done ? 'done' : ''}`}>
                  <button className="widget-item-toggle" onClick={() => updateTodo(item.id, { done: !item.done })}>{item.done && <Check size={11} />}</button>
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
                    <em onClick={() => { setEditingTodoId(item.id); setEditText(item.text) }}>{item.text}</em>
                  )}
                  <button className="widget-item-delete" onClick={() => deleteTodo(item.id)}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {kind === 'reminder' && (
          <section className="widget-stack">
            <div className="widget-entry-row apple-entry">
              <CalendarClock size={15} />
              <input
                value={reminderText}
                spellCheck={settings.spellcheckEnabled}
                lang={language.spellcheck}
                placeholder="New reminder"
                onChange={event => setReminderText(event.target.value)}
                onFocus={() => setPickerOpen(true)}
              />
              <button onClick={() => editingReminderId ? saveReminder(editingReminderId) : saveReminder()} title="Save reminder"><Plus size={14} /></button>
            </div>
            {pickerOpen && (
              <div className="widget-reminder-popover apple-popover">
                <label>Date <input type="date" value={reminderDate} onChange={event => setReminderDate(event.target.value)} /></label>
                <label>Time <input type="time" value={reminderTime} onChange={event => setReminderTime(event.target.value)} /></label>
                <button onClick={() => editingReminderId ? saveReminder(editingReminderId) : saveReminder()}>
                  {editingReminderId ? 'Update' : 'Save'}
                </button>
              </div>
            )}
            <div className="widget-list apple-list">
              {reminders.length === 0 && <div className="widget-empty">No reminders yet.</div>}
              {reminders.map(item => (
                <div key={item.id} className={`widget-check-item reminder-item ${item.done ? 'done' : ''}`}>
                  <button className="widget-item-toggle" onClick={() => completeReminder(item)}>{item.done && <Check size={11} />}</button>
                  <em onClick={() => startReminderEdit(item)}>{item.text}</em>
                  <strong><Clock3 size={11} /> {formatTimeLeft(item.dueAt, item.done)}</strong>
                  <button className="widget-item-delete" onClick={() => { removeReminder(item.id); setReminders(readAllReminders()) }}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function QuickNoteCard({
  quickText,
  setQuickText,
  spellcheck,
  lang,
  compact = false,
}: {
  quickText: string
  setQuickText: (value: string) => void
  spellcheck: boolean
  lang: string
  compact?: boolean
}) {
  return (
    <section className={`widget-quick-card ${compact ? 'compact' : ''}`}>
      <div className="widget-paper-lines" />
      <textarea
        value={quickText}
        spellCheck={spellcheck}
        lang={lang}
        placeholder="Write a quick note..."
        onChange={event => setQuickText(event.target.value)}
      />
      <small>{quickText.trim() ? 'Saved automatically' : 'Click and start typing'}</small>
    </section>
  )
}
