import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileText, ListChecks, Plus, StickyNote, Trash2, X } from 'lucide-react'
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

function createCheckEntry(text = ''): WidgetEntry {
  return { id: crypto.randomUUID(), type: 'check', text, done: false }
}

function migrateBlocks(blocks: LegacyBlock[]): WidgetEntry[] {
  const entries: WidgetEntry[] = []
  for (const block of blocks) {
    if (block.type === 'note') {
      entries.push(createTextEntry(block.text ?? ''))
    }
    if (block.type === 'checklist') {
      if (block.title && block.title !== 'Checklist') entries.push(createTextEntry(block.title))
      for (const item of block.items ?? []) {
        entries.push({ id: item.id || crypto.randomUUID(), type: 'check', text: item.text, done: item.done })
      }
    }
  }
  return entries.length ? entries : [createTextEntry()]
}

function loadWidgetEntries(): WidgetEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WidgetData
    if (Array.isArray(saved.entries) && saved.entries.length > 0) return saved.entries
    if (Array.isArray(saved.blocks) && saved.blocks.length > 0) return migrateBlocks(saved.blocks)
  } catch {
    // Ignore older or broken widget data.
  }
  return [createTextEntry()]
}

function autoSizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.max(42, element.scrollHeight)}px`
}

export function DesktopWidget(_props: { type: WidgetType }) {
  const settings = useSettingsStore()
  const language = getTranslationLanguage(settings.translationLanguage)
  const [entries, setEntries] = useState<WidgetEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const pendingFocusId = useRef<string | null>(null)
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
    setEntries(loadWidgetEntries())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }))
  }, [entries, loaded])

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

  return (
    <div className="desktop-widget notes-widget">
      <header className="widget-topbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="widget-title">
          <StickyNote size={16} />
          <span>Notes Widget</span>
        </div>
        <div className="widget-toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => insertEntry('check')} title="Add checklist row">
            <ListChecks size={14} />
            <span>List</span>
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
        <button onClick={() => insertEntry('text')}><FileText size={13} /> Note</button>
        <button onClick={() => insertEntry('check')}><ListChecks size={13} /> Checklist</button>
        <span>{wordCount} words</span>
      </footer>
    </div>
  )
}
