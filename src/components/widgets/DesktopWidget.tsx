import { useEffect, useMemo, useState } from 'react'
import { Check, CheckSquare, GripVertical, ListChecks, Plus, StickyNote, Trash2, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { getTranslationLanguage } from '../../utils/languages'
import './DesktopWidget.css'

export type WidgetType = 'widget' | 'all' | 'note' | 'todo' | 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder'

type WidgetBlock =
  | { id: string; type: 'note'; text: string }
  | { id: string; type: 'checklist'; title: string; items: ChecklistItem[] }

interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

interface WidgetData {
  blocks: WidgetBlock[]
}

const STORAGE_KEY = 'notes-widget-main'

function createNoteBlock(): WidgetBlock {
  return { id: crypto.randomUUID(), type: 'note', text: '' }
}

function createChecklistBlock(): WidgetBlock {
  return { id: crypto.randomUUID(), type: 'checklist', title: 'Checklist', items: [] }
}

function loadWidgetData(): WidgetData {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<WidgetData>
    if (Array.isArray(saved.blocks) && saved.blocks.length > 0) return { blocks: saved.blocks }
  } catch {
    // Ignore old widget data.
  }
  return { blocks: [createNoteBlock()] }
}

export function DesktopWidget(_props: { type: WidgetType }) {
  const settings = useSettingsStore()
  const language = getTranslationLanguage(settings.translationLanguage)
  const [blocks, setBlocks] = useState<WidgetBlock[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({})
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  const wordCount = useMemo(() => {
    const words = blocks.flatMap(block => {
      if (block.type === 'note') return block.text.trim().split(/\s+/).filter(Boolean)
      return [block.title, ...block.items.map(item => item.text)].join(' ').trim().split(/\s+/).filter(Boolean)
    })
    return words.length
  }, [blocks])

  useEffect(() => {
    if (!settings.loaded) void settings.load()
  }, [settings])

  useEffect(() => {
    const data = loadWidgetData()
    setBlocks(data.blocks)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ blocks }))
  }, [blocks, loaded])

  const addBlock = (type: 'note' | 'checklist') => {
    setBlocks(items => [...items, type === 'note' ? createNoteBlock() : createChecklistBlock()])
  }

  const updateBlock = (id: string, patch: Partial<WidgetBlock>) => {
    setBlocks(items => items.map(block => block.id === id ? { ...block, ...patch } as WidgetBlock : block))
  }

  const deleteBlock = (id: string) => {
    setBlocks(items => {
      const next = items.filter(block => block.id !== id)
      return next.length ? next : [createNoteBlock()]
    })
  }

  const addChecklistItem = (block: Extract<WidgetBlock, { type: 'checklist' }>) => {
    const text = (newTaskText[block.id] ?? '').trim()
    if (!text) return
    updateBlock(block.id, {
      items: [...block.items, { id: crypto.randomUUID(), text, done: false }],
    })
    setNewTaskText(values => ({ ...values, [block.id]: '' }))
  }

  const updateChecklistItem = (
    block: Extract<WidgetBlock, { type: 'checklist' }>,
    itemId: string,
    patch: Partial<ChecklistItem>,
  ) => {
    updateBlock(block.id, {
      items: block.items.map(item => item.id === itemId ? { ...item, ...patch } : item),
    })
  }

  const deleteChecklistItem = (block: Extract<WidgetBlock, { type: 'checklist' }>, itemId: string) => {
    updateBlock(block.id, {
      items: block.items.filter(item => item.id !== itemId),
    })
  }

  const finishTaskEdit = (block: Extract<WidgetBlock, { type: 'checklist' }>, itemId: string) => {
    const text = editingText.trim()
    if (text) updateChecklistItem(block, itemId, { text })
    setEditingTaskId(null)
    setEditingText('')
  }

  return (
    <div className="desktop-widget notes-widget">
      <header className="widget-topbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="widget-title">
          <StickyNote size={15} />
          <span>Notes Widget</span>
        </div>
        <div className="widget-toolbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => addBlock('note')} title="Add writing block">
            <StickyNote size={14} />
            <span>Note</span>
          </button>
          <button onClick={() => addBlock('checklist')} title="Add checklist block">
            <ListChecks size={14} />
            <span>List</span>
          </button>
          <button className="icon-only" onClick={() => window.api.window.closeCurrent()} title="Close widget">
            <X size={14} />
          </button>
        </div>
      </header>

      <main className="widget-canvas">
        {blocks.map(block => (
          <section key={block.id} className={`widget-block widget-block-${block.type}`}>
            <div className="widget-block-handle">
              <GripVertical size={13} />
              <button onClick={() => deleteBlock(block.id)} title="Remove block">
                <Trash2 size={12} />
              </button>
            </div>

            {block.type === 'note' && (
              <textarea
                value={block.text}
                spellCheck={settings.spellcheckEnabled}
                lang={language.spellcheck}
                placeholder="Write here..."
                onChange={event => updateBlock(block.id, { text: event.target.value })}
              />
            )}

            {block.type === 'checklist' && (
              <div className="widget-checklist-block">
                <input
                  className="widget-checklist-title"
                  value={block.title}
                  spellCheck={settings.spellcheckEnabled}
                  lang={language.spellcheck}
                  onChange={event => updateBlock(block.id, { title: event.target.value })}
                />
                <div className="widget-checklist-items">
                  {block.items.map(item => (
                    <div key={item.id} className={`widget-task ${item.done ? 'done' : ''}`}>
                      <button
                        className="widget-task-check"
                        onClick={() => updateChecklistItem(block, item.id, { done: !item.done })}
                        title={item.done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {item.done && <Check size={11} />}
                      </button>
                      {editingTaskId === item.id ? (
                        <input
                          autoFocus
                          value={editingText}
                          spellCheck={settings.spellcheckEnabled}
                          lang={language.spellcheck}
                          onChange={event => setEditingText(event.target.value)}
                          onBlur={() => finishTaskEdit(block, item.id)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') finishTaskEdit(block, item.id)
                            if (event.key === 'Escape') setEditingTaskId(null)
                          }}
                        />
                      ) : (
                        <em onClick={() => { setEditingTaskId(item.id); setEditingText(item.text) }}>{item.text}</em>
                      )}
                      <button className="widget-task-delete" onClick={() => deleteChecklistItem(block, item.id)} title="Delete item">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="widget-add-task">
                  <CheckSquare size={14} />
                  <input
                    value={newTaskText[block.id] ?? ''}
                    spellCheck={settings.spellcheckEnabled}
                    lang={language.spellcheck}
                    placeholder="Add item"
                    onChange={event => setNewTaskText(values => ({ ...values, [block.id]: event.target.value }))}
                    onKeyDown={event => {
                      if (event.key === 'Enter') addChecklistItem(block)
                    }}
                  />
                  <button onClick={() => addChecklistItem(block)} title="Add item"><Plus size={13} /></button>
                </div>
              </div>
            )}
          </section>
        ))}
      </main>

      <footer className="widget-bottombar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => addBlock('note')}><StickyNote size={13} /> Note</button>
        <button onClick={() => addBlock('checklist')}><ListChecks size={13} /> Checklist</button>
        <span>{wordCount} words</span>
      </footer>
    </div>
  )
}
