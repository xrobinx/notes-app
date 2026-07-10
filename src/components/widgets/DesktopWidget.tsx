import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flag, Flame, Image as ImageIcon, ListChecks, Trash2, Type, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { getTranslationLanguage } from '../../utils/languages'
import type { Note } from '../../types'
import './DesktopWidget.css'

export type WidgetType = 'widget' | 'all' | 'note' | 'todo' | 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder'

type Stroke = { id: string; points: [number, number][] }
type WidgetEntry =
  | { id: string; type: 'text'; text: string }
  | {
      id: string
      type: 'check'
      text: string
      done: boolean
      daily?: boolean
      priority?: boolean
      streak?: number
      lastCompletedDate?: string | null
      lastResetDate?: string | null
    }
  | { id: string; type: 'image'; src: string; alt: string }
  | { id: string; type: 'sketch'; strokes: Stroke[]; height: number }

interface LegacyChecklistItem {
  id: string
  text: string
  done: boolean
}

interface LegacyBlock {
  id: string
  type: 'note' | 'checklist'
  text?: string
  title?: string
  items?: LegacyChecklistItem[]
}

interface WidgetData {
  entries?: WidgetEntry[]
  blocks?: LegacyBlock[]
}

const STORAGE_KEY = 'notes-widget-main'
function createTextEntry(text = ''): WidgetEntry {
  return { id: crypto.randomUUID(), type: 'text', text }
}

type CheckEntry = Extract<WidgetEntry, { type: 'check' }>

function createCheckEntry(text = '', done = false, meta: Partial<CheckEntry> = {}): WidgetEntry {
  return {
    id: meta.id || crypto.randomUUID(),
    type: 'check',
    text,
    done,
    daily: Boolean(meta.daily),
    priority: Boolean(meta.priority),
    streak: Math.max(0, Number(meta.streak ?? 0)),
    lastCompletedDate: meta.lastCompletedDate ?? null,
    lastResetDate: meta.lastResetDate ?? null,
  }
}

function createImageEntry(src: string, alt = 'Image'): WidgetEntry {
  return { id: crypto.randomUUID(), type: 'image', src, alt }
}

function createSketchEntry(strokes: Stroke[] = [], height = 190): WidgetEntry {
  return { id: crypto.randomUUID(), type: 'sketch', strokes, height }
}

function migrateBlocks(blocks: LegacyBlock[]): WidgetEntry[] {
  const entries: WidgetEntry[] = []
  for (const block of blocks) {
    if (block.type === 'note') entries.push(createTextEntry(block.text ?? ''))
    if (block.type === 'checklist') {
      if (block.title && block.title !== 'Checklist') entries.push(createTextEntry(block.title))
      for (const item of block.items ?? []) {
        entries.push(createCheckEntry(item.text, item.done, { id: item.id || crypto.randomUUID() }))
      }
    }
  }
  return entries
}

function loadLegacyEntries(): WidgetEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WidgetData
    if (Array.isArray(saved.entries) && saved.entries.length > 0) return saved.entries
    if (Array.isArray(saved.blocks) && saved.blocks.length > 0) return migrateBlocks(saved.blocks)
  } catch {
    // Ignore older or broken widget data.
  }
  return []
}

function autoSizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.max(70, element.scrollHeight)}px`
}

function textNodesFromText(text: string) {
  const lines = text.split('\n')
  return lines.flatMap((line, index) => {
    const nodes = line ? [{ type: 'text', text: line }] : []
    if (index < lines.length - 1) nodes.push({ type: 'hardBreak' })
    return nodes
  })
}

function textFromNodes(nodes: any[] = []): string {
  let text = ''
  for (const node of nodes) {
    if (node.type === 'text') text += node.text ?? ''
    else if (node.type === 'hardBreak') text += '\n'
    else if (Array.isArray(node.content)) text += textFromNodes(node.content)
  }
  return text
}

function parseStrokes(value: unknown): Stroke[] {
  if (Array.isArray(value)) return value as Stroke[]
  if (typeof value !== 'string') return []
  try { return JSON.parse(value) as Stroke[] } catch { return [] }
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateKeyOffset(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function normalizeDailyEntries(entries: WidgetEntry[]): WidgetEntry[] {
  const today = localDateKey()
  const yesterday = dateKeyOffset(-1)
  return entries.map(entry => {
    if (entry.type !== 'check' || !entry.daily) return entry
    const lastCompletedDate = entry.lastCompletedDate ?? null
    const missedStreak = Boolean(lastCompletedDate && lastCompletedDate !== today && lastCompletedDate !== yesterday)
    return {
      ...entry,
      done: lastCompletedDate === today,
      streak: missedStreak ? 0 : Math.max(0, Number(entry.streak ?? 0)),
      lastResetDate: today,
    }
  })
}

function completeDailyEntry(entry: CheckEntry, done: boolean): CheckEntry {
  if (!entry.daily) return { ...entry, done }

  const today = localDateKey()
  const yesterday = dateKeyOffset(-1)
  if (done) {
    const alreadyCompletedToday = entry.lastCompletedDate === today
    const continuesStreak = entry.lastCompletedDate === yesterday
    return {
      ...entry,
      done: true,
      streak: alreadyCompletedToday ? Math.max(1, entry.streak ?? 1) : continuesStreak ? Math.max(0, entry.streak ?? 0) + 1 : 1,
      lastCompletedDate: today,
      lastResetDate: today,
    }
  }

  if (entry.lastCompletedDate !== today) {
    return { ...entry, done: false, lastResetDate: today }
  }

  const nextStreak = Math.max(0, Number(entry.streak ?? 0) - 1)
  return {
    ...entry,
    done: false,
    streak: nextStreak,
    lastCompletedDate: nextStreak > 0 ? yesterday : null,
    lastResetDate: today,
  }
}

function reorderChecklistRuns(entries: WidgetEntry[]): WidgetEntry[] {
  const next: WidgetEntry[] = []
  let index = 0

  while (index < entries.length) {
    const entry = entries[index]
    if (entry.type !== 'check') {
      next.push(entry)
      index += 1
      continue
    }

    const run: Extract<WidgetEntry, { type: 'check' }>[] = []
    while (index < entries.length && entries[index].type === 'check') {
      run.push(entries[index] as Extract<WidgetEntry, { type: 'check' }>)
      index += 1
    }
    next.push(
      ...run.filter(item => !item.done && item.priority),
      ...run.filter(item => !item.done && !item.priority),
      ...run.filter(item => item.done && item.priority),
      ...run.filter(item => item.done && !item.priority),
    )
  }

  return next
}

function tiptapFromEntries(entries: WidgetEntry[]) {
  const content: any[] = []
  let index = 0
  while (index < entries.length) {
    const entry = entries[index]
    if (entry.type === 'text') {
      content.push({ type: 'paragraph', content: textNodesFromText(entry.text) })
      index += 1
      continue
    }

    if (entry.type === 'check') {
      const items: any[] = []
      while (index < entries.length && entries[index].type === 'check') {
        const item = entries[index] as Extract<WidgetEntry, { type: 'check' }>
        items.push({
          type: 'taskItem',
          attrs: {
            checked: item.done,
            daily: Boolean(item.daily),
            priority: Boolean(item.priority),
            streak: Math.max(0, Number(item.streak ?? 0)),
            lastCompletedDate: item.lastCompletedDate ?? null,
            lastResetDate: item.lastResetDate ?? null,
          },
          content: [{ type: 'paragraph', content: textNodesFromText(item.text) }],
        })
        index += 1
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    if (entry.type === 'image') {
      content.push({
        type: 'image',
        attrs: { src: entry.src, alt: entry.alt, align: 'center', width: '100%', radius: 6 },
      })
      index += 1
      continue
    }

    content.push({
      type: 'freeCanvas',
      attrs: { strokes: JSON.stringify(entry.strokes), height: entry.height, width: 0, items: '[]' },
    })
    index += 1
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function entriesFromTiptap(body: string): WidgetEntry[] {
  try {
    const doc = JSON.parse(body)
    const entries: WidgetEntry[] = []
    for (const node of doc.content ?? []) {
      if (node.type === 'taskList') {
        for (const item of node.content ?? []) {
          entries.push(createCheckEntry(textFromNodes(item.content ?? []).trim(), Boolean(item.attrs?.checked), {
            daily: Boolean(item.attrs?.daily),
            priority: Boolean(item.attrs?.priority),
            streak: Number(item.attrs?.streak ?? 0),
            lastCompletedDate: typeof item.attrs?.lastCompletedDate === 'string' ? item.attrs.lastCompletedDate : null,
            lastResetDate: typeof item.attrs?.lastResetDate === 'string' ? item.attrs.lastResetDate : null,
          }))
        }
        continue
      }

      if (node.type === 'image') {
        const src = node.attrs?.src
        if (typeof src === 'string' && src) entries.push(createImageEntry(src, node.attrs?.alt || 'Image'))
        continue
      }

      if (node.type === 'freeCanvas') {
        entries.push(createSketchEntry(parseStrokes(node.attrs?.strokes), Number(node.attrs?.height || 190)))
        continue
      }

      if (node.type === 'bulletList' || node.type === 'orderedList') {
        for (const item of node.content ?? []) {
          const text = textFromNodes(item.content ?? []).trim()
          if (text) entries.push(createTextEntry(text))
        }
        continue
      }

      const text = textFromNodes(node.content ?? [])
      if (text.trim() || node.type === 'paragraph') entries.push(createTextEntry(text))
    }
    return entries.length ? reorderChecklistRuns(entries) : [createTextEntry()]
  } catch {
    return [createTextEntry()]
  }
}

function plainTextFromEntries(entries: WidgetEntry[]): string {
  return entries
    .map(entry => {
      if (entry.type === 'check') return `${entry.done ? '[x]' : '[ ]'} ${entry.text}`.trim()
      if (entry.type === 'image') return `[Image: ${entry.alt}]`
      if (entry.type === 'sketch') return '[Sketch]'
      return entry.text
    })
    .join('\n')
    .trim()
}

function isEffectivelyEmpty(entries: WidgetEntry[]): boolean {
  return entries.every(entry => entry.type === 'text' ? !entry.text.trim() : entry.type === 'check' ? !entry.text.trim() : false)
}

function patchFromState(title: string, entries: WidgetEntry[]) {
  return {
    title: title.trim() || 'Note Title',
    body: JSON.stringify(tiptapFromEntries(entries)),
    plainText: plainTextFromEntries(entries),
  }
}

function formatDate(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date()
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function DesktopWidget(_props: { type: WidgetType }) {
  const settings = useSettingsStore()
  const language = getTranslationLanguage(settings.translationLanguage)
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('Note Title')
  const [entries, setEntries] = useState<WidgetEntry[]>([createTextEntry()])
  const [loaded, setLoaded] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const widgetNoteId = useRef<string | null>(null)
  const pendingFocusId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedState = useRef('')
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const drawingEntryId = useRef<string | null>(null)
  const taskActionTimers = useRef(new Map<string, number>())

  useEffect(() => {
    if (!settings.loaded) void settings.load()
  }, [settings])

  useEffect(() => {
    return () => {
      for (const timer of taskActionTimers.current.values()) clearTimeout(timer)
      taskActionTimers.current.clear()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadWidgetNote() {
      const loadedNote = await window.api.widgets.loadNote()
      if (cancelled) return
      widgetNoteId.current = loadedNote.id
      void window.api.widgets.cancelReminder(`widget-${loadedNote.id}`)
      setNote(loadedNote)
      setTitle(loadedNote.title || 'Note Title')

      let nextEntries = entriesFromTiptap(loadedNote.body)
      const legacyEntries = loadLegacyEntries()
      if (isEffectivelyEmpty(nextEntries) && legacyEntries.length > 0) {
        nextEntries = legacyEntries
        const saved = await window.api.widgets.saveNote(patchFromState(loadedNote.title || 'Note Title', nextEntries))
        if (cancelled) return
        if (saved) setNote(saved)
        widgetNoteId.current = saved?.id ?? loadedNote.id
        localStorage.removeItem(STORAGE_KEY)
      }
      const beforeDailyReset = JSON.stringify(nextEntries)
      nextEntries = normalizeDailyEntries(nextEntries)
      if (beforeDailyReset !== JSON.stringify(nextEntries)) {
        const saved = await window.api.widgets.saveNote(patchFromState(loadedNote.title || 'Note Title', nextEntries))
        if (cancelled) return
        if (saved) setNote(saved)
      }
      lastSavedState.current = JSON.stringify({ title: loadedNote.title || 'Note Title', entries: nextEntries })
      setEntries(nextEntries)
      setLoaded(true)
    }
    void loadWidgetNote()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const serialized = JSON.stringify({ title, entries })
    if (serialized === lastSavedState.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const saved = await window.api.widgets.saveNote(patchFromState(title, entries))
      if (saved) {
        widgetNoteId.current = saved.id
        setNote(saved)
      }
      lastSavedState.current = JSON.stringify({ title, entries })
    }, 320)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [title, entries, loaded])

  useEffect(() => {
    if (!loaded) return
    const interval = window.setInterval(() => {
      setEntries(current => {
        const next = normalizeDailyEntries(current)
        return JSON.stringify(next) === JSON.stringify(current) ? current : reorderChecklistRuns(next)
      })
    }, 60000)
    return () => window.clearInterval(interval)
  }, [loaded])

  useEffect(() => {
    return window.api.on.noteUpdated(async id => {
      if (!widgetNoteId.current || id !== widgetNoteId.current) return
      if (saveTimer.current) return
      const latest = await window.api.widgets.loadNote()
      const nextEntries = normalizeDailyEntries(entriesFromTiptap(latest.body))
      const nextTitle = latest.title || 'Note Title'
      const serialized = JSON.stringify({ title: nextTitle, entries: nextEntries })
      if (serialized === lastSavedState.current) return
      lastSavedState.current = serialized
      setNote(latest)
      setTitle(nextTitle)
      setEntries(nextEntries)
    })
  }, [])

  useEffect(() => {
    const id = pendingFocusId.current
    if (!id) return
    pendingFocusId.current = null
    requestAnimationFrame(() => {
      const target = textRefs.current.get(id) ?? inputRefs.current.get(id)
      target?.focus()
      if (target instanceof HTMLTextAreaElement) autoSizeTextarea(target)
    })
  }, [entries])

  const wordCount = useMemo(() => (
    entries
      .map(entry => entry.type === 'text' || entry.type === 'check' ? entry.text : '')
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length
  ), [entries])

  const totalStreak = useMemo(() => (
    entries.reduce((total, entry) => (
      entry.type === 'check' && entry.daily ? total + Math.max(0, Number(entry.streak ?? 0)) : total
    ), 0)
  ), [entries])

  const insertEntry = (type: 'text' | 'check') => {
    const entry = type === 'text' ? createTextEntry() : createCheckEntry()
    pendingFocusId.current = entry.id
    setActiveEntryId(entry.id)
    setEntries(current => {
      const activeIndex = activeEntryId ? current.findIndex(item => item.id === activeEntryId) : -1
      const next = [...current]
      next.splice(activeIndex >= 0 ? activeIndex + 1 : next.length, 0, entry)
      return reorderChecklistRuns(next)
    })
  }

  const insertImageFiles = async (files: FileList | File[]) => {
    const images = Array.from(files).filter(file => file.type.startsWith('image/'))
    if (!images.length) return
    const entriesToAdd = await Promise.all(images.map(async file => createImageEntry(await fileToDataUrl(file), file.name)))
    setActiveEntryId(entriesToAdd.at(-1)?.id ?? null)
    setEntries(current => [...current, ...entriesToAdd])
  }

  const updateEntry = (id: string, patch: Partial<WidgetEntry>) => {
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...patch } as WidgetEntry : entry))
  }

  const updateCheckDone = (id: string, done: boolean) => {
    setEntries(current => reorderChecklistRuns(current.map(entry => (
      entry.id === id && entry.type === 'check' ? completeDailyEntry(entry, done) : entry
    ))))
  }

  const toggleDailyTask = (id: string) => {
    const today = localDateKey()
    setEntries(current => reorderChecklistRuns(current.map(entry => {
      if (entry.id !== id || entry.type !== 'check') return entry
      if (entry.daily) {
        return completeDailyEntry(entry, true)
      }
      return {
        ...entry,
        daily: true,
        streak: entry.done ? 1 : 0,
        lastCompletedDate: entry.done ? today : null,
        lastResetDate: today,
      }
    })))
  }

  const removeDailyTask = (id: string) => {
    setEntries(current => reorderChecklistRuns(current.map(entry => {
      if (entry.id !== id || entry.type !== 'check' || !entry.daily) return entry
      return {
        ...entry,
        daily: false,
        streak: 0,
        lastCompletedDate: null,
        lastResetDate: null,
      }
    })))
  }

  const togglePriorityTask = (id: string, keepDaily = false) => {
    const today = localDateKey()
    setEntries(current => reorderChecklistRuns(current.map(entry => {
      if (entry.id !== id || entry.type !== 'check') return entry
      const priority = keepDaily ? true : !entry.priority
      return {
        ...entry,
        priority,
        daily: keepDaily ? true : entry.daily,
        streak: keepDaily && entry.done && !entry.daily ? 1 : entry.streak,
        lastCompletedDate: keepDaily && entry.done && !entry.daily ? today : entry.lastCompletedDate ?? null,
        lastResetDate: keepDaily ? today : entry.lastResetDate ?? null,
      }
    })))
  }

  const handleTaskActionClick = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation()
    const existing = taskActionTimers.current.get(id)
    if (existing) clearTimeout(existing)
    if (event.shiftKey) {
      taskActionTimers.current.delete(id)
      removeDailyTask(id)
      return
    }
    const timer = window.setTimeout(() => {
      taskActionTimers.current.delete(id)
      toggleDailyTask(id)
    }, 220)
    taskActionTimers.current.set(id, timer)
  }

  const handleTaskActionDoubleClick = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const existing = taskActionTimers.current.get(id)
    if (existing) clearTimeout(existing)
    taskActionTimers.current.delete(id)
    togglePriorityTask(id, event.shiftKey)
  }

  const deleteEntry = (id: string) => {
    setEntries(current => {
      const next = current.filter(entry => entry.id !== id)
      return next.length ? next : [createTextEntry()]
    })
    if (activeEntryId === id) setActiveEntryId(null)
  }

  const deleteActive = () => {
    if (activeEntryId) {
      deleteEntry(activeEntryId)
    }
  }

  const splitTextIntoChecklist = (entry: Extract<WidgetEntry, { type: 'text' }>) => {
    const lines = entry.text.split('\n').map(line => line.trim()).filter(Boolean)
    const checks = lines.length ? lines.map(line => createCheckEntry(line)) : [createCheckEntry()]
    pendingFocusId.current = checks[0].id
    setEntries(current => reorderChecklistRuns(current.flatMap(item => item.id === entry.id ? checks : [item])))
  }

  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, entry: Extract<WidgetEntry, { type: 'text' }>) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'l') return
    event.preventDefault()
    splitTextIntoChecklist(entry)
  }

  const handleCheckKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, entry: Extract<WidgetEntry, { type: 'check' }>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const next = createCheckEntry()
      pendingFocusId.current = next.id
      setEntries(current => {
        const index = current.findIndex(item => item.id === entry.id)
        const copy = [...current]
        copy.splice(index + 1, 0, next)
        return reorderChecklistRuns(copy)
      })
    }
    if (event.key === 'Backspace' && !entry.text) {
      event.preventDefault()
      deleteEntry(entry.id)
    }
  }

  const handleSketchPointerDown = (event: React.PointerEvent<HTMLDivElement>, entry: Extract<WidgetEntry, { type: 'sketch' }>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    const stroke: Stroke = { id: crypto.randomUUID(), points: [point] }
    drawingEntryId.current = entry.id
    updateEntry(entry.id, { strokes: [...entry.strokes, stroke] })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSketchPointerMove = (event: React.PointerEvent<HTMLDivElement>, entry: Extract<WidgetEntry, { type: 'sketch' }>) => {
    if (drawingEntryId.current !== entry.id) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    const strokes = [...entry.strokes]
    const last = strokes.at(-1)
    if (!last) return
    const previous = last.points.at(-1)
    if (previous && Math.hypot(previous[0] - point[0], previous[1] - point[1]) < 2) return
    strokes[strokes.length - 1] = { ...last, points: [...last.points, point] }
    updateEntry(entry.id, { strokes })
  }

  const handleSketchPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    drawingEntryId.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="desktop-widget notes-widget-card" onDoubleClick={event => event.preventDefault()}>
      <header className="widget-card-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="widget-card-title-block" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <input
            value={title}
            spellCheck={settings.spellcheckEnabled}
            placeholder="Note Title"
            onFocus={() => setActiveEntryId(null)}
            onDoubleClick={() => widgetNoteId.current && window.api.widgets.openNote(widgetNoteId.current)}
            onChange={event => setTitle(event.target.value)}
          />
          <span>Last update: {formatDate(note?.updatedAt)}</span>
        </div>
        <div className="widget-header-actions" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className={`widget-streak-total ${totalStreak > 0 ? 'hot' : ''}`} title="Total daily streak">
            <Flame size={14} />
            <span>{totalStreak}</span>
          </div>
          <button className="widget-close-btn" onClick={() => window.api.window.closeCurrent()} title="Close widget">
            <X size={13} />
          </button>
        </div>
      </header>

      <main
        className="widget-card-body"
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          void insertImageFiles(event.dataTransfer.files)
        }}
      >
        {entries.map(entry => {
          const active = activeEntryId === entry.id
          if (entry.type === 'text') {
            return (
              <section key={entry.id} className={`widget-card-entry text ${active ? 'active' : ''}`} onClick={() => setActiveEntryId(entry.id)}>
                <textarea
                  ref={element => {
                    if (element) {
                      textRefs.current.set(entry.id, element)
                      autoSizeTextarea(element)
                    } else {
                      textRefs.current.delete(entry.id)
                    }
                  }}
                  value={entry.text}
                  spellCheck={settings.spellcheckEnabled}
                  lang={language.spellcheck}
                  placeholder="Write something..."
                  onFocus={() => setActiveEntryId(entry.id)}
                  onInput={event => autoSizeTextarea(event.currentTarget)}
                  onChange={event => updateEntry(entry.id, { text: event.target.value })}
                  onKeyDown={event => handleTextKeyDown(event, entry)}
                />
              </section>
            )
          }

          if (entry.type === 'check') {
            return (
              <section key={entry.id} className={`widget-card-entry check ${entry.done ? 'done' : ''} ${entry.daily ? 'daily' : ''} ${entry.priority ? 'priority' : ''} ${active ? 'active' : ''}`} onClick={() => setActiveEntryId(entry.id)}>
                <button className="widget-check-box" onClick={() => updateCheckDone(entry.id, !entry.done)}>
                  {entry.done && <Check size={11} />}
                </button>
                <input
                  ref={element => {
                    if (element) inputRefs.current.set(entry.id, element)
                    else inputRefs.current.delete(entry.id)
                  }}
                  value={entry.text}
                  spellCheck={settings.spellcheckEnabled}
                  lang={language.spellcheck}
                  placeholder="List item"
                  onFocus={() => setActiveEntryId(entry.id)}
                  onChange={event => updateEntry(entry.id, { text: event.target.value })}
                  onKeyDown={event => handleCheckKeyDown(event, entry)}
                />
                <button
                  className={`widget-task-toggle ${entry.daily ? 'daily' : ''} ${entry.priority ? 'priority' : ''}`}
                  onClick={event => handleTaskActionClick(event, entry.id)}
                  onDoubleClick={event => handleTaskActionDoubleClick(event, entry.id)}
                  title={entry.priority
                    ? entry.daily ? entry.done ? 'Priority daily task completed today. Shift+click to stop repeating' : 'Complete priority daily task. Shift+click to stop repeating' : 'Priority task. Click to add daily repeat'
                    : entry.daily ? entry.done ? 'Daily task completed today. Shift+click to stop repeating' : 'Complete daily task. Shift+click to stop repeating' : 'Click for daily, double-click for priority'}
                >
                  {entry.priority && <Flag size={12} />}
                  {entry.daily && <Flame size={12} />}
                  {!entry.priority && !entry.daily && <Flame size={12} />}
                  {entry.daily && <span>{Math.max(0, Number(entry.streak ?? 0))}</span>}
                </button>
              </section>
            )
          }

          if (entry.type === 'image') {
            return (
              <section key={entry.id} className={`widget-card-entry image ${active ? 'active' : ''}`} onClick={() => setActiveEntryId(entry.id)}>
                <img src={entry.src} alt={entry.alt} draggable={false} />
              </section>
            )
          }

          return (
            <section key={entry.id} className={`widget-card-entry sketch ${active ? 'active' : ''}`} onClick={() => setActiveEntryId(entry.id)}>
              <div
                className="widget-sketch-surface"
                style={{ height: entry.height }}
                onPointerDown={event => handleSketchPointerDown(event, entry)}
                onPointerMove={event => handleSketchPointerMove(event, entry)}
                onPointerUp={handleSketchPointerUp}
                onPointerCancel={handleSketchPointerUp}
              >
                <svg width="100%" height="100%">
                  {entry.strokes.map(stroke => (
                    <polyline
                      key={stroke.id}
                      points={stroke.points.map(point => point.join(',')).join(' ')}
                      fill="none"
                      stroke="#111111"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </svg>
              </div>
            </section>
          )
        })}
      </main>

      <footer className="widget-card-toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => insertEntry('text')} disabled={!loaded} title="Add text"><Type size={14} /></button>
        <button onClick={() => insertEntry('check')} disabled={!loaded} title="Add checklist"><ListChecks size={14} /></button>
        <button onClick={() => fileInputRef.current?.click()} disabled={!loaded} title="Add image"><ImageIcon size={14} /></button>
        <span className="widget-card-meta">{wordCount} words</span>
        <button className="danger" onClick={deleteActive} disabled={!loaded} title="Delete selected block"><Trash2 size={14} /></button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={event => {
            if (event.target.files) void insertImageFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </footer>
    </div>
  )
}
