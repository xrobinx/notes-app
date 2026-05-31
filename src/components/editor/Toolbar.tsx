import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, CheckSquare, Quote,
  Code, Minus, Link2, Image, Paperclip,
  Highlighter, Palette, Table2, ChevronDown, Search, Languages, PenTool
} from 'lucide-react'
import { TableGrid } from './TableGrid'
import { HighlightPicker } from './HighlightPicker'
import { TextColorPicker } from './TextColorPicker'
import { useSettingsStore } from '../../store/settingsStore'
import { comboMatchesEvent, getShortcut, shortcutTitle } from '../../utils/shortcuts'
import { getTranslationLanguage, TRANSLATION_LANGUAGES } from '../../utils/languages'
import './Toolbar.css'

interface Props {
  editor: Editor
  noteId: string
  searchOpen?: boolean
  onToggleSearch?: () => void
}

type Popover = 'heading' | 'highlight' | 'textColor' | 'table' | 'link' | null

export function Toolbar({ editor, noteId, searchOpen, onToggleSearch }: Props) {
  const settings = useSettingsStore()
  const [popover, setPopover] = useState<Popover>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [textColor, setTextColor] = useState('#f5f5f7')
  const [highlightColor, setHighlightColor] = useState('#ffd60a')
  const [highlightOpacity, setHighlightOpacity] = useState(40)
  const [languageExpanded, setLanguageExpanded] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const highlightClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const togglePopover = (name: Popover) => {
    setPopover(prev => prev === name ? null : name)
  }

  const activeHeading = [1, 2, 3, 4, 5, 6].find(n => editor.isActive('heading', { level: n }))
  const headingLabel = activeHeading ? `H${activeHeading}` : 'H'

  const setHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) => {
    editor.chain().focus().setHeading({ level }).run()
    setPopover(null)
  }

  const insertTable = (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run()
    setPopover(null)
  }

  const buildHighlightColor = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${opacity / 100})`
  }

  const applyHighlight = (color: string, opacity = highlightOpacity) => {
    setHighlightColor(color)
    setHighlightOpacity(opacity)
    editor.chain().focus().setHighlight({ color: buildHighlightColor(color, opacity) }).run()
    setPopover(null)
  }

  const applyTextColor = (color: string) => {
    setTextColor(color)
    editor.chain().focus().setColor(color).run()
    setPopover(null)
  }

  const clearTextColor = () => {
    editor.chain().focus().unsetColor().run()
    setPopover(null)
  }

  const setTranslationLanguage = async (language: string) => {
    await settings.setSetting('translationLanguage', language)
    await window.api.language.refreshSpellchecker()
  }

  const applyCurrentHighlight = () => {
    editor.chain().focus().setHighlight({
      color: buildHighlightColor(highlightColor, highlightOpacity)
    }).run()
  }

  const clearHighlight = () => {
    editor.chain().focus().unsetHighlight().run()
    setPopover(null)
  }

  const ensureTrailingParagraph = () => {
    const lastChild = editor.state.doc.lastChild
    if (lastChild?.type.name === 'paragraph') return
    const paragraph = editor.state.schema.nodes.paragraph.create()
    const tr = editor.state.tr.insert(editor.state.doc.content.size, paragraph)
    editor.view.dispatch(tr)
  }

  const applyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`
      editor.chain().focus().setLink({ href: url }).run()
    }
    setLinkUrl('')
    setPopover(null)
  }

  const handleImageInsert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      if (file.size > 500 * 1024) {
        const buffer = await file.arrayBuffer()
        const savedPath = await window.api.files.saveAttachment(noteId, buffer, file.name)
        editor.chain().focus().setImage({ src: `file://${savedPath}`, alt: file.name }).run()
      } else {
        editor.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const savedPath = await window.api.files.saveAttachment(noteId, buffer, file.name)
    editor.chain().focus().insertContent({
      type: 'fileAttachment',
      attrs: {
        fileName: file.name,
        filePath: savedPath,
        fileSize: file.size,
        fileType: file.type,
      },
    }).run()
    e.target.value = ''
  }

  const isInsideTable = editor.isActive('table')
  const activeLanguage = getTranslationLanguage(settings.translationLanguage)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const insideEditor = Boolean(target?.closest?.('.tiptap-wrapper'))
      if (!insideEditor) return
      const shortcuts = settings.shortcuts
      const run = (id: string, action: () => void) => {
        if (!comboMatchesEvent(getShortcut(shortcuts, id), event)) return false
        event.preventDefault()
        action()
        return true
      }
      if (run('bold', () => editor.chain().focus().toggleBold().run())) return
      if (run('italic', () => editor.chain().focus().toggleItalic().run())) return
      if (run('underline', () => editor.chain().focus().toggleUnderline().run())) return
      if (run('strike', () => editor.chain().focus().toggleStrike().run())) return
      if (run('bulletList', () => editor.chain().focus().toggleBulletList().run())) return
      if (run('orderedList', () => editor.chain().focus().toggleOrderedList().run())) return
      if (run('checklist', () => editor.chain().focus().toggleTaskList().run())) return
      if (run('blockquote', () => editor.chain().focus().toggleBlockquote().run())) return
      if (run('codeBlock', () => { editor.chain().focus().toggleCodeBlock().run(); ensureTrailingParagraph() })) return
      if (run('insertTable', () => setPopover('table'))) return
      if (run('insertImage', () => imageInputRef.current?.click())) return
      run('attachFile', () => fileInputRef.current?.click())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, settings.shortcuts])

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div className="popover-anchor">
          <button
            className={`toolbar-btn text-color-btn ${editor.isActive('textStyle', { color: textColor }) ? 'active' : ''}`}
            onClick={() => applyTextColor(textColor)}
            onDoubleClick={() => setPopover('textColor')}
            title="Text color"
          >
            <Palette size={14} />
            <div className="text-color-dot" style={{ background: textColor }} />
          </button>
          {popover === 'textColor' && (
            <>
              <div className="popover" style={{ top: '100%', left: 0, marginTop: 6 }}>
                <TextColorPicker
                  selectedColor={textColor}
                  onPreview={setTextColor}
                  onApply={applyTextColor}
                  onClear={clearTextColor}
                />
              </div>
              <div className="popover-overlay" onClick={() => setPopover(null)} />
            </>
          )}
        </div>
        <div className="popover-anchor">
          <button
            className={`toolbar-btn heading-btn ${activeHeading ? 'active' : ''}`}
            onClick={() => togglePopover('heading')}
            title="Heading"
          >
            <span className="heading-h-icon">{headingLabel}</span>
            <ChevronDown size={10} className="heading-chevron" />
          </button>
          {popover === 'heading' && (
            <>
              <div className="popover scale-in heading-popover">
                <button
                  className={`heading-option ${!activeHeading ? 'active' : ''}`}
                  onClick={() => { editor.chain().focus().setParagraph().run(); setPopover(null) }}
                >
                  <span className="ho-label">Body</span>
                  <span className="ho-preview" style={{ fontSize: 14 }}>Normal text</span>
                </button>
                {([1, 2, 3, 4, 5, 6] as const).map(n => (
                  <button
                    key={n}
                    className={`heading-option ${activeHeading === n ? 'active' : ''}`}
                    onClick={() => setHeading(n)}
                  >
                    <span className="ho-label">H{n}</span>
                    <span className="ho-preview" style={{ fontSize: Math.max(10, 20 - n * 2) }}>
                      Heading {n}
                    </span>
                  </button>
                ))}
              </div>
              <div className="popover-overlay" onClick={() => setPopover(null)} />
            </>
          )}
        </div>
        <div
          className={`toolbar-language-picker ${languageExpanded ? 'expanded' : 'collapsed'}`}
          title={`Translate target: ${activeLanguage.label}. Double-click to ${languageExpanded ? 'collapse' : 'choose language'}.`}
          onDoubleClick={() => setLanguageExpanded(value => !value)}
        >
          <Languages size={13} />
          {languageExpanded && (
            <select
              value={settings.translationLanguage}
              onChange={event => void setTranslationLanguage(event.target.value)}
              onDoubleClick={event => {
                event.stopPropagation()
                setLanguageExpanded(false)
              }}
              aria-label="Translate language"
            >
              {TRANSLATION_LANGUAGES.map(language => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title={shortcutTitle('Bold', settings.shortcuts, 'bold')}><Bold size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title={shortcutTitle('Italic', settings.shortcuts, 'italic')}><Italic size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title={shortcutTitle('Underline', settings.shortcuts, 'underline')}><Underline size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()} title={shortcutTitle('Strikethrough', settings.shortcuts, 'strike')}><Strikethrough size={14} /></button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="popover-anchor">
          <button
            className={`toolbar-btn highlight-btn ${editor.isActive('highlight') ? 'active' : ''}`}
            onClick={() => {
              if (highlightClickTimer.current) clearTimeout(highlightClickTimer.current)
              highlightClickTimer.current = setTimeout(() => {
                applyCurrentHighlight()
                highlightClickTimer.current = null
              }, 180)
            }}
            onDoubleClick={() => {
              if (highlightClickTimer.current) clearTimeout(highlightClickTimer.current)
              highlightClickTimer.current = null
              setPopover('highlight')
            }}
            title="Highlight"
          >
            <Highlighter size={14} />
            <div
              className="highlight-color-dot"
              style={{ background: buildHighlightColor(highlightColor, highlightOpacity) }}
            />
          </button>
          {popover === 'highlight' && (
            <>
              <div className="popover" style={{ top: '100%', left: 0, marginTop: 6 }}>
                <HighlightPicker
                  selectedColor={highlightColor}
                  opacity={highlightOpacity}
                  onPreview={(color, opacity) => {
                    setHighlightColor(color)
                    setHighlightOpacity(opacity)
                  }}
                  onApply={applyHighlight}
                  onClear={clearHighlight}
                  onClose={() => setPopover(null)}
                />
              </div>
              <div className="popover-overlay" onClick={() => setPopover(null)} />
            </>
          )}
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title={shortcutTitle('Bullet list', settings.shortcuts, 'bulletList')}><List size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={shortcutTitle('Numbered list', settings.shortcuts, 'orderedList')}><ListOrdered size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('taskList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title={shortcutTitle('Checklist', settings.shortcuts, 'checklist')}><CheckSquare size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={shortcutTitle('Quote', settings.shortcuts, 'blockquote')}><Quote size={14} /></button>
        <button className={`toolbar-btn ${editor.isActive('code') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code"><Code size={14} /></button>
        <button
          className={`toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
          onClick={() => {
            editor.chain().focus().toggleCodeBlock().run()
            ensureTrailingParagraph()
          }}
          title={shortcutTitle('Code block', settings.shortcuts, 'codeBlock')}
        >
          <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{'{}'}</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="popover-anchor">
          <button
            className={`toolbar-btn ${isInsideTable ? 'active' : ''}`}
            onClick={() => togglePopover('table')}
            title={shortcutTitle('Insert table', settings.shortcuts, 'insertTable')}
          >
            <Table2 size={14} />
          </button>
          {popover === 'table' && !isInsideTable && (
            <>
              <div className="popover" style={{ top: '100%', left: 0, marginTop: 6 }}>
                <TableGrid onSelect={insertTable} onClose={() => setPopover(null)} />
              </div>
              <div className="popover-overlay" onClick={() => setPopover(null)} />
            </>
          )}
          {popover === 'table' && isInsideTable && (
            <>
              <div className="popover scale-in" style={{ top: '100%', left: 0, marginTop: 6 }}>
                <TableActions editor={editor} onClose={() => setPopover(null)} />
              </div>
              <div className="popover-overlay" onClick={() => setPopover(null)} />
            </>
          )}
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <div className="popover-anchor">
          <button
            className={`toolbar-btn ${editor.isActive('link') ? 'active' : ''}`}
            onClick={() => {
              const existing = editor.getAttributes('link').href || ''
              setLinkUrl(existing)
              togglePopover('link')
            }}
            title="Insert link"
          ><Link2 size={14} /></button>
          {popover === 'link' && (
            <>
              <div className="popover scale-in link-popover" style={{ top: '100%', left: 0, marginTop: 6 }}>
                <div className="link-popover-inner">
                  <input
                    autoFocus
                    className="link-input"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') applyLink()
                      if (e.key === 'Escape') setPopover(null)
                    }}
                  />
                  <button className="link-apply-btn" onClick={applyLink}>
                    {linkUrl.trim() ? 'Apply' : 'Remove'}
                  </button>
                </div>
              </div>
              <div className="popover-overlay" onClick={() => setPopover(null)} />
            </>
          )}
        </div>
      </div>

      <button className="toolbar-btn" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal divider"><Minus size={14} /></button>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${searchOpen ? 'active' : ''}`}
          onClick={onToggleSearch}
          title="Search this note"
        >
          <Search size={14} />
        </button>
        <button
          className="toolbar-btn"
          onClick={() => editor.chain().focus().insertFreeCanvas().run()}
          title="Insert sketch"
        >
          <PenTool size={14} />
        </button>
        <button className="toolbar-btn" onClick={() => imageInputRef.current?.click()} title={shortcutTitle('Insert image', settings.shortcuts, 'insertImage')}>
          <Image size={14} />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageInsert} />

        <button className="toolbar-btn" onClick={() => fileInputRef.current?.click()} title={shortcutTitle('Attach file', settings.shortcuts, 'attachFile')}>
          <Paperclip size={14} />
        </button>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileAttach} />
      </div>
    </div>
  )
}

function TableActions({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [cellColor, setCellColor] = useState('#ffd60a')
  const [cellOpacity, setCellOpacity] = useState(24)
  const tableColors = ['#ffd60a', '#ff453a', '#bf5af2', '#0a84ff', '#32d74b', '#64d2ff', '#ffffff', '#8e8e93']

  const buildCellColor = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${opacity / 100})`
  }

  const btn = (label: string, action: () => void) => (
    <button key={label} className="table-action-btn" onClick={() => { action(); onClose() }}>
      {label}
    </button>
  )

  return (
    <div className="table-actions-popup">
      <div className="table-actions-group">
        <div className="table-actions-label">Rows</div>
        {btn('Add row above', () => editor.chain().focus().addRowBefore().run())}
        {btn('Add row below', () => editor.chain().focus().addRowAfter().run())}
        {btn('Delete row', () => editor.chain().focus().deleteRow().run())}
      </div>
      <div className="table-actions-divider" />
      <div className="table-actions-group">
        <div className="table-actions-label">Columns</div>
        {btn('Add column left', () => editor.chain().focus().addColumnBefore().run())}
        {btn('Add column right', () => editor.chain().focus().addColumnAfter().run())}
        {btn('Delete column', () => editor.chain().focus().deleteColumn().run())}
      </div>
      <div className="table-actions-divider" />
      <div className="table-actions-group">
        <div className="table-actions-label">Cell color</div>
        <div className="table-cell-color-row">
          {tableColors.map(color => (
            <button
              key={color}
              className={`table-cell-color-swatch ${cellColor === color ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => setCellColor(color)}
              title={color}
            />
          ))}
        </div>
        <div className="table-cell-opacity-row">
          <span>Opacity</span>
          <input
            type="range"
            min="10"
            max="80"
            value={cellOpacity}
            onChange={event => setCellOpacity(Number(event.target.value))}
          />
          <span>{cellOpacity}%</span>
        </div>
        <button
          className="table-action-btn"
          onClick={() => {
            editor.chain().focus().setCellAttribute('backgroundColor', buildCellColor(cellColor, cellOpacity)).run()
            onClose()
          }}
        >
          Apply cell color
        </button>
        <button
          className="table-action-btn"
          onClick={() => {
            editor.chain().focus().setCellAttribute('backgroundColor', null).run()
            onClose()
          }}
        >
          Clear cell color
        </button>
      </div>
      <div className="table-actions-divider" />
      <div className="table-actions-group">
        {btn('Toggle header row', () => editor.chain().focus().toggleHeaderRow().run())}
        {btn('Merge cells', () => editor.chain().focus().mergeCells().run())}
        {btn('Split cell', () => editor.chain().focus().splitCell().run())}
        <button className="table-action-btn danger" onClick={() => { editor.chain().focus().deleteTable().run(); onClose() }}>
          Delete table
        </button>
      </div>
    </div>
  )
}
