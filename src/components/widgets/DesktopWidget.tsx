import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ExternalLink, FileText, ListChecks, StickyNote, Trash2, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { getTranslationLanguage } from '../../utils/languages'
import './DesktopWidget.css'

export type WidgetType = 'widget' | 'all' | 'note' | 'todo' | 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder'

type WidgetEntry =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'check'; text: string; done: boolean }

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

function createCheckEntry(text = '', done = false): WidgetEntry {
  return { id: crypto.randomUUID(), type: 'check', text, done }
}

function migrateBlocks(blocks: LegacyBlock[]): WidgetEntry[] {
  const entries: WidgetEntry[] = []
  for (const block of blocks) {
    if (block.type === 'note') entries.push(createTextEntry(block.text ?? ''))
    if (block.type === 'checklist') {
      if (block.title && block.title !== 'Checklist') entries.push(createTextEntry(block.title))
      for (const item of block.items ?? []) {
        entries.push({ id: item.id || crypto.randomUUID(), type: 'check', text: item.text, done: item.done })
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
  element.style.height = `${Math.max(42, element.scrollHeight)}px`
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

function tiptapFromEntries(entries: WidgetEntry[]) {
  const content: any[] = []
  let index = 0
  while (index < entries.length) {
    const entry = entries[index]
    if (entry.type === 'text') {
      content.push({
        type: 'paragraph',
        content: textNodesFromText(entry.text)
      })
      index += 1
      continue
    }

    const items: any[] = []
    while (index < entries.length && entries[index].type === 'check') {
      const item = entries[index] as Extract<WidgetEntry, { type: 'check' }>
      items.push({
        type: 'taskItem',
        attrs: { checked: item.done },
        content: [{
          type: 'paragraph',
          content: textNodesFromText(item.text)
        }]
      })
      index += 1
    }
    content.push({ type: 'taskList', content: items })
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
          entries.push(createCheckEntry(textFromNodes(item.content ?? []).trim(), Boolean(item.attrs?.checked)))
        }
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
    return entries.length ? entries : [createTextEntry()]
  } catch {
    return [createTextEntry()]
  }
}

function plainTextFromEntries(entries: WidgetEntry[]): string {
  return entries
    .map(entry => entry.type === 'check'
      ? `${entry.done ? '[x]' : '[ ]'} ${entry.text}`.trim()
      : entry.text)
    .join('\n')
    .trim()
}

function isEffectivelyEmpty(entries: WidgetEntry[]): boolean {
  return entries.every(entry => !entry.text.trim())
}

function patchFromEntries(entries: WidgetEntry[]) {
  return {
    body: JSON.stringify(tiptapFromEntries(entries)),
    plainText: plainTextFromEntries(entries),
  }
}

function serializeEntries(entries: WidgetEntry[]): string {
  return JSON.stringify(entries)
}

export function DesktopWidget(_props: { type: WidgetType }) {
  const settings = useSettingsStore()
  const language = getTranslationLanguage(settings.translationLanguage)
  const [entries, setEntries] = useState<WidgetEntry[]>([createTextEntry()])
  const [loaded, setLoaded] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState('Loading...')
  const widgetNoteId = useRef<string | null>(null)
  const pendingFocusId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedEntries = useRef('')
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>())
  const inputRefs = useRef(new Map<string, HTMLInputElement>())

  const wordCount = useMemo(() => (
    entries
      .map(entry => entry.text)
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length
  ), [entries])

  useEffect(() => {
    if (!settings.loaded) void settings.load()
  }, [settings])

  useEffect(() => {
    let cancelled = false
    async function loadWidgetNote() {
      const note = await window.api.widgets.loadNote()
      if (cancelled) return
      widgetNoteId.current = note.id
      let nextEntries = entriesFromTiptap(note.body)
      const legacyEntries = loadLegacyEntries()
      if (isEffectivelyEmpty(nextEntries) && legacyEntries.length > 0) {
        nextEntries = legacyEntries
        setSaveStatus('Migrating...')
        const saved = await window.api.widgets.saveNote(patchFromEntries(nextEntries))
        if (cancelled) return
        widgetNoteId.current = saved?.id ?? note.id
        localStorage.removeItem(STORAGE_KEY)
      }
      lastSavedEntries.current = serializeEntries(nextEntries)
      setEntries(nextEntries)
      setLoaded(true)
      setSaveStatus('Saved')
    }
    void loadWidgetNote()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const serialized = serializeEntries(entries)
    if (serialized === lastSavedEntries.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('Saving...')
    saveTimer.current = setTimeout(async () => {
      const saved = await window.api.widgets.saveNote(patchFromEntries(entries))
      if (saved) widgetNoteId.current = saved.id
      lastSavedEntries.current = serializeEntries(entries)
      setSaveStatus('Saved')
    }, 320)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [entries, loaded])

  useEffect(() => {
    return window.api.on.noteUpdated(async id => {
      if (!widgetNoteId.current || id !== widgetNoteId.current) return
      if (saveTimer.current) return
      const note = await window.api.widgets.loadNote()
      const nextEntries = entriesFromTiptap(note.body)
      const serialized = serializeEntries(nextEntries)
      if (serialized === lastSavedEntries.current) return
      lastSavedEntries.current = serialized
      setEntries(nextEntries)
      setSaveStatus('Saved')
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

  const insertEntry = (type: 'text' | 'check') => {
    const entry = type === 'text' ? createTextEntry() : createCheckEntry()
    pendingFocusId.current = entry.id
    setEntries(current => {
      const activeIndex = activeEntryId ? current.findIndex(item => item.id === activeEntryId) : -1
      const next = [...current]
      next.splice(activeIndex >= 0 ? activeIndex + 1 : next.length, 0, entry)
      return next
    })
  }

  const updateEntry = (id: string, patch: Partial<WidgetEntry>) => {
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...patch } as WidgetEntry : entry))
  }

  const deleteEntry = (id: string) => {
    setEntries(current => {
      const next = current.filter(entry => entry.id !== id)
      return next.length ? next : [createTextEntry()]
    })
  }

  const splitTextIntoChecklist = (entry: Extract<WidgetEntry, { type: 'text' }>) => {
    const lines = entry.text.split('\n').map(line => line.trim()).filter(Boolean)
    const checks = lines.length ? lines.map(line => createCheckEntry(line)) : [createCheckEntry()]
    pendingFocusId.current = checks[0].id
    setEntries(current => current.flatMap(item => item.id === entry.id ? checks : [item]))
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
        return copy
      })
    }
    if (event.key === 'Backspace' && !entry.text) {
      event.preventDefault()
      deleteEntry(entry.id)
    }
  }

  const openInNotes = () => {
    if (widgetNoteId.current) void window.api.widgets.openNote(widgetNoteId.current)
  }

  return (
    <div className="desktop-widget notes-widget">
      <header
        className="widget-topbar"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onDoubleClick={event => event.preventDefault()}
      >
        <div className="widget-title">
          <StickyNote size={16} />
          <span>Notes Widget</span>
        </div>
        <div className="widget-toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => insertEntry('text')} title="Add note row" disabled={!loaded}>
            <FileText size={14} />
            <span>Note</span>
          </button>
          <button onClick={() => insertEntry('check')} title="Add checklist row" disabled={!loaded}>
            <ListChecks size={14} />
            <span>Checklist</span>
          </button>
          <button className="icon-only" onClick={openInNotes} title="Open in Notes" disabled={!loaded}>
            <ExternalLink size={14} />
          </button>
          <button className="icon-only" onClick={() => window.api.window.closeCurrent()} title="Close widget">
            <X size={14} />
          </button>
        </div>
      </header>

      <main className="widget-sheet">
        {entries.map((entry, index) => {
          const previous = entries[index - 1]
          const showDivider = Boolean(previous && previous.type !== entry.type)
          if (entry.type === 'text') {
            return (
              <div key={entry.id} className={`widget-entry widget-text-entry ${showDivider ? 'has-divider' : ''}`}>
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
                  placeholder="Type anything here..."
                  onFocus={() => setActiveEntryId(entry.id)}
                  onInput={event => autoSizeTextarea(event.currentTarget)}
                  onChange={event => updateEntry(entry.id, { text: event.target.value })}
                  onKeyDown={event => handleTextKeyDown(event, entry)}
                />
                <button className="widget-entry-delete" onClick={() => deleteEntry(entry.id)} title="Delete text">
                  <Trash2 size={12} />
                </button>
              </div>
            )
          }

          return (
            <div key={entry.id} className={`widget-entry widget-check-entry ${showDivider ? 'has-divider' : ''}`}>
              <button
                className="widget-check-toggle"
                onClick={() => updateEntry(entry.id, { done: !entry.done })}
                title={entry.done ? 'Mark incomplete' : 'Mark complete'}
              >
                {entry.done && <Check size={12} />}
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
              <button className="widget-entry-delete" onClick={() => deleteEntry(entry.id)} title="Delete item">
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </main>

      <footer className="widget-bottombar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span>{saveStatus}</span>
        <span>{wordCount} words</span>
      </footer>
    </div>
  )
}
