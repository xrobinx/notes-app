import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import { editorExtensions } from './extensions'
import { Toolbar } from './Toolbar'
import { TableGrowControls } from './TableGrowControls'
import { findFirstSearchMatch, findSearchMatches } from './extensions/SearchHighlight'
import { useNotesStore } from '../../store/notesStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { Note } from '../../types'
import { comboMatchesEvent, getShortcut } from '../../utils/shortcuts'
import { getTranslationLanguage } from '../../utils/languages'
import '../../styles/editor.css'
import './TipTapEditor.css'

const SAVE_DEBOUNCE_MS = 800

function extractPlainText(json: object): string {
  const parts: string[] = []
  function walk(node: Record<string, unknown>) {
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.content)) node.content.forEach(c => walk(c as Record<string, unknown>))
  }
  walk(json as Record<string, unknown>)
  return parts.join(' ')
}

interface Props {
  note: Note
  searchQuery: string
}

type SaveStatus = 'saved' | 'saving' | 'error'

export function TipTapEditor({ note, searchQuery }: Props) {
  const { updateNote } = useNotesStore()
  const settings = useSettingsStore()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentNoteId = useRef(note.id)
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [statsVisible, setStatsVisible] = useState(settings.showEditorStats)
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)

  const navigateToMatch = (match: { from: number; to: number }) => {
    if (!editor) return
    const selection = TextSelection.create(editor.state.doc, match.from, match.to)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    requestAnimationFrame(() => {
      const coords = editor.view.coordsAtPos(match.from)
      const container = contentEl
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      if (coords.top < containerRect.top || coords.bottom > containerRect.bottom) {
        container.scrollTop += coords.top - containerRect.top - 80
      }
    })
  }

  const saveEditorContent = async (targetNoteId: string, targetEditor = editor) => {
    if (!targetEditor) return
    setSaveStatus('saving')
    try {
      const json = targetEditor.getJSON()
      const plain = extractPlainText(json)
      await updateNote(targetNoteId, {
        body: JSON.stringify(json),
        plainText: plain
      })
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  const editor = useEditor({
    extensions: editorExtensions,
    content: (() => {
      try { return JSON.parse(note.body) } catch { return { type: 'doc', content: [{ type: 'paragraph' }] } }
    })(),
    editorProps: {
      attributes: { class: 'tiptap' },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (files && files.length > 0) {
          event.preventDefault()
          Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
              const reader = new FileReader()
              reader.onload = () => {
                const src = reader.result as string
                const node = view.state.schema.nodes.image.create({ src, alt: file.name, align: 'center' })
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
                view.dispatch(view.state.tr.insert(pos, node))
              }
              reader.readAsDataURL(file)
            } else {
              file.arrayBuffer().then(async buffer => {
                const savedPath = await window.api.files.saveAttachment(currentNoteId.current, buffer, file.name)
                const node = view.state.schema.nodes.fileAttachment.create({
                  fileName: file.name,
                  filePath: savedPath,
                  fileSize: file.size,
                  fileType: file.type,
                })
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
                view.dispatch(view.state.tr.insert(pos, node))
              })
            }
          })
          return true
        }
        return false
      },
      handleClick(view, _pos, event) {
        const link = (event.target as HTMLElement).closest?.('a[href^="file://"]') as HTMLAnchorElement | null
        if (link) {
          window.api.files.openPath(decodeURI(link.href.replace('file:///', '').replace('file://', '')))
          return true
        }

        if (event.target === view.dom) {
          const lastElement = Array.from(view.dom.children).at(-1) as HTMLElement | undefined
          if (lastElement && event.clientY > lastElement.getBoundingClientRect().bottom + 12) {
            const lastChild = view.state.doc.lastChild
            if (lastChild?.type.name !== 'paragraph') {
              const paragraph = view.state.schema.nodes.paragraph.create()
              view.dispatch(view.state.tr.insert(view.state.doc.content.size, paragraph))
              return true
            }
          }
        }

        return false
      },
      handlePaste(view, event) {
        if (event.shiftKey) {
          const text = event.clipboardData?.getData('text/plain')
          if (text) {
            event.preventDefault()
            view.dispatch(view.state.tr.insertText(text))
            return true
          }
        }

        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              const reader = new FileReader()
              reader.onload = () => {
                const src = reader.result as string
                const node = view.state.schema.nodes.image.create({ src, alt: 'Pasted image' })
                const tr = view.state.tr.replaceSelectionWith(node)
                view.dispatch(tr)
              }
              reader.readAsDataURL(file)
              return true
            }
          }
        }

        const html = event.clipboardData?.getData('text/html')
        if (html) {
          event.preventDefault()
          editor?.chain().focus().insertContent(cleanPastedHtml(html)).run()
          return true
        }

        return false
      }
    },
    onUpdate: ({ editor }) => {
      setSaveStatus('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        await saveEditorContent(currentNoteId.current, editor)
      }, SAVE_DEBOUNCE_MS)
    }
  })

  // Switch content when note changes
  useEffect(() => {
    if (!editor) return
    if (currentNoteId.current !== note.id) {
      // Flush pending save for old note
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void saveEditorContent(currentNoteId.current, editor)
      }
      currentNoteId.current = note.id
    }
    try {
      const newContent = JSON.parse(note.body)
      editor.commands.setContent(newContent, false)
    } catch {
      editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] }, false)
    }
  }, [note.id, editor])

  useEffect(() => {
    if (!editor) return

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      void saveEditorContent(currentNoteId.current, editor)
    }
  }, [editor, updateNote])

  useEffect(() => {
    if (!editor) return
    const language = getTranslationLanguage(settings.translationLanguage)
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          class: 'tiptap',
          lang: language.spellcheck,
          spellCheck: settings.spellcheckEnabled ? 'true' : 'false',
        },
      },
    })
  }, [editor, settings.spellcheckEnabled, settings.translationLanguage])

  useEffect(() => {
    setStatsVisible(settings.showEditorStats)
  }, [settings.showEditorStats])

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      if (comboMatchesEvent(getShortcut(settings.shortcuts, 'toggleStats'), event)) {
        event.preventDefault()
        const next = !useSettingsStore.getState().showEditorStats
        await settings.setSetting('showEditorStats', next)
        setStatsVisible(next)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.shortcuts, settings.showEditorStats])

  useEffect(() => {
    if (!editor) return

    editor.commands.setSearchHighlight(searchQuery)

    if (!searchQuery.trim()) return

    const firstMatch = findFirstSearchMatch(editor.state.doc, searchQuery)
    if (!firstMatch) return

    navigateToMatch(firstMatch)
  }, [editor, note.id, searchQuery])

  const effectiveSearchQuery = (searchOpen ? localSearchQuery : '') || searchQuery

  useEffect(() => {
    if (!editor) return
    editor.commands.setSearchHighlight(effectiveSearchQuery)
    if (!effectiveSearchQuery.trim()) return
    const matches = findSearchMatches(editor.state.doc, effectiveSearchQuery)
    if (matches.length === 0) return
    if (!localSearchQuery && !searchQuery) return
    const clamped = Math.min(activeMatchIndex, matches.length - 1)
    const match = matches[clamped]
    if (!localSearchQuery) navigateToMatch(match)
  }, [activeMatchIndex, editor, effectiveSearchQuery])

  if (!editor) return null

  const stats = getStats(editor.getText(), note)
  const matchCount = effectiveSearchQuery.trim() ? findSearchMatches(editor.state.doc, effectiveSearchQuery).length : 0
  const grammarHints = settings.grammarHintsEnabled ? getGrammarHints(editor.getText()) : []
  const syncStatus = settings.syncStatus === 'syncing' ? 'Syncing...' : settings.syncStatus === 'synced' ? 'Synced' : settings.syncStatus === 'error' ? 'Sync error' : settings.syncStatus === 'offline' ? 'Offline' : null
  const localStatus = saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save error' : 'Saved'

  return (
    <div className="tiptap-wrapper">
      <Toolbar
        editor={editor}
        noteId={note.id}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen(value => !value)}
      />
      {searchOpen && (
      <div className="editor-inline-search">
        <Search size={13} />
        <input
          autoFocus
          value={localSearchQuery}
          placeholder="Search this note"
          onChange={event => {
            setLocalSearchQuery(event.target.value)
            setActiveMatchIndex(0)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setSearchOpen(false)
              setLocalSearchQuery('')
              return
            }
            if (event.key !== 'Enter' || !matchCount) return
            event.preventDefault()
            const next = event.shiftKey
              ? (activeMatchIndex - 1 + matchCount) % matchCount
              : (activeMatchIndex + 1) % matchCount
            setActiveMatchIndex(next)
            const match = findSearchMatches(editor.state.doc, effectiveSearchQuery)[next]
            if (match) navigateToMatch(match)
          }}
        />
        {effectiveSearchQuery && <span>{matchCount ? activeMatchIndex + 1 : 0}/{matchCount}</span>}
        <button
          className="search-nav-button"
          disabled={!matchCount}
          onClick={() => {
            const next = (activeMatchIndex - 1 + matchCount) % matchCount
            setActiveMatchIndex(next)
            const match = findSearchMatches(editor.state.doc, effectiveSearchQuery)[next]
            if (match) navigateToMatch(match)
          }}
          title="Previous match"
        >
          <ChevronUp size={13} />
        </button>
        <button
          className="search-nav-button"
          disabled={!matchCount}
          onClick={() => {
            const next = (activeMatchIndex + 1) % matchCount
            setActiveMatchIndex(next)
            const match = findSearchMatches(editor.state.doc, effectiveSearchQuery)[next]
            if (match) navigateToMatch(match)
          }}
          title="Next match"
        >
          <ChevronDown size={13} />
        </button>
        {localSearchQuery && (
          <button onClick={() => setLocalSearchQuery('')} title="Clear note search">
            <X size={13} />
          </button>
        )}
      </div>
      )}
      <div className="tiptap-content" ref={setContentEl}>
        <EditorContent editor={editor} />
        <TableGrowControls editor={editor} container={contentEl} />
      </div>
      <footer
        className={`editor-stats-footer ${statsVisible ? 'is-visible' : ''}`}
        onMouseEnter={() => setStatsVisible(true)}
        onMouseLeave={() => setStatsVisible(settings.showEditorStats)}
      >
        <span>{localStatus}</span>
        {syncStatus && <span>{syncStatus}</span>}
        <span>{stats.words} words</span>
        <span>{stats.characters} chars</span>
        <span>{stats.readingTime} min read</span>
        <span>Created {stats.created}</span>
        <span>Edited {stats.edited}</span>
        {grammarHints.length > 0 && <span className="grammar-hint">{grammarHints[0]}</span>}
      </footer>
    </div>
  )
}

function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  mergeConsecutiveTables(doc)
  doc.querySelectorAll('*').forEach(element => {
    element.removeAttribute('style')
    element.removeAttribute('class')
    element.removeAttribute('id')
    element.removeAttribute('lang')
    element.removeAttribute('width')
    element.removeAttribute('height')
  })
  doc.querySelectorAll('script,style,meta,link').forEach(element => element.remove())
  return doc.body.innerHTML
}

function mergeConsecutiveTables(doc: Document): void {
  let changed = true
  while (changed) {
    changed = false
    const tables = Array.from(doc.body.querySelectorAll('table'))
    for (const table of tables) {
      const next = nextMeaningfulElement(table)
      if (!next || next.tagName.toLowerCase() !== 'table') continue
      const firstCols = table.querySelector('tr')?.children.length ?? 0
      const nextCols = next.querySelector('tr')?.children.length ?? 0
      if (firstCols === 0 || firstCols !== nextCols) continue
      const targetBody = table.querySelector('tbody') ?? table
      const sourceRows = Array.from(next.querySelectorAll('tr'))
      for (const row of sourceRows) targetBody.appendChild(row)
      next.remove()
      changed = true
      break
    }
  }
}

function nextMeaningfulElement(element: Element): Element | null {
  let node = element.nextSibling
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const candidate = node as Element
      if (candidate.tagName.toLowerCase() === 'br') {
        node = node.nextSibling
        continue
      }
      if (candidate.textContent?.trim() === '' && !candidate.querySelector('table')) {
        node = node.nextSibling
        continue
      }
      return candidate
    }
    if (node.textContent?.trim()) return null
    node = node.nextSibling
  }
  return null
}

function getStats(text: string, note: Note) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const characters = text.length
  return {
    words,
    characters,
    readingTime: Math.max(1, Math.ceil(words / 220)),
    created: new Date(note.createdAt).toLocaleDateString(),
    edited: new Date(note.updatedAt).toLocaleString(),
  }
}

function getGrammarHints(text: string): string[] {
  const hints: string[] = []
  if (/\b(\w+)\s+\1\b/i.test(text)) hints.push('Repeated word found')
  if (/\s{2,}/.test(text)) hints.push('Extra spaces found')
  if (text.split(/[.!?]/).some(sentence => sentence.trim().split(/\s+/).length > 32)) hints.push('Long sentence found')
  if (/\b(very|really|basically|actually)\b/i.test(text)) hints.push('Consider tightening filler words')
  return hints
}
