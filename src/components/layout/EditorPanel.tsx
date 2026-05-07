import { useRef, useState, useEffect } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { TipTapEditor } from '../editor/TipTapEditor'
import { Download, History, Lock, LockOpen, Pencil, RotateCcw } from 'lucide-react'
import { generateHTML } from '@tiptap/html'
import './EditorPanel.css'
import { editorExtensions } from '../editor/extensions'
import { LockNoteDialog } from '../modals/LockNoteDialog'
import { useSettingsStore } from '../../store/settingsStore'
import { comboMatchesEvent, getShortcut, shortcutTitle } from '../../utils/shortcuts'
import type { NoteHistoryEntry } from '../../types'

const EMOJI_POOL = [
  '📝','📓','📔','📒','📕','📗','📘','📙','📚','📖',
  '✏️','🖊️','🖋️','💡','🔍','🔑','💎','⭐','🌟','✨',
  '🌈','🌙','☀️','🌿','🍀','🌸','🌺','🌻','🎨','🎯',
  '🎵','🎸','🏆','🚀','✈️','🌍','⚡','🦋','🐝','🦊',
  '🐶','🐱','🐻','🐼','🦉','🦅','🦜','🐬','🎭','🎬',
]

export function EditorPanel({ searchQuery }: { searchQuery: string }) {
  const { selectedNoteId, notes, unlockedNoteIds, updateNote, lockNote, lockNoteGlobal, unlockNote, removeNoteLock, markNoteUnlocked, getNoteHistory, restoreNoteHistory } = useNotesStore()
  const settings = useSettingsStore()
  const note = notes.find(n => n.id === selectedNoteId) ?? null
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [title, setTitle] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [unlockRemovePasscode, setUnlockRemovePasscode] = useState('')
  const [unlockRemoveError, setUnlockRemoveError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<NoteHistoryEntry[]>([])
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (note) setTitle(note.title)
    setUnlockPassword('')
    setUnlockError('')
    return () => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
    }
  }, [note?.id])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (!note) return
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
    titleSaveTimer.current = setTimeout(() => {
      updateNote(note.id, { title: val.trim() || 'New Note' })
    }, 600)
  }

  const handleTitleBlur = () => {
    if (note && title !== note.title) {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
      updateNote(note.id, { title: title || 'New Note' })
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  const exportCurrentNotePdf = async () => {
    if (!note) return
    try {
      const html = generateHTML(JSON.parse(note.body), editorExtensions)
      await window.api.files.exportNotePdf(note.title, note.emoji, html)
    } catch {
      alert('Could not export this note as PDF.')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!note) return
      if (comboMatchesEvent(getShortcut(settings.shortcuts, 'exportPdf'), event)) {
        event.preventDefault()
        void exportCurrentNotePdf()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [note?.id, note?.body, note?.title, settings.shortcuts])

  if (!note) {
    return (
      <div className="editor-panel editor-empty">
        <div className="editor-empty-state">
          <span style={{ fontSize: 48 }}>📝</span>
          <p>Select a note or create a new one</p>
          <NewNoteHint />
        </div>
      </div>
    )
  }

  const isLocked = note.isLocked === 1 && !unlockedNoteIds.includes(note.id)

  const tryUnlock = async (passcode: string) => {
    if (!/^\d{6}$/.test(passcode)) return
    const ok = await unlockNote(note.id, passcode)
    if (ok) {
      markNoteUnlocked(note.id)
      setUnlockPassword('')
      setUnlockError('')
    } else {
      setUnlockError('Wrong passcode')
    }
  }

  const lockWithNewPasscode = async (passcode: string) => {
    await lockNote(note.id, passcode)
  }

  const lockWithGlobalPasscode = async () => {
    await lockNoteGlobal(note.id)
  }

  const handleLockButton = () => {
    if (!note) return
    setUnlockRemovePasscode('')
    setUnlockRemoveError('')
    setLockDialogOpen(true)
  }

  const openHistory = async () => {
    if (!note) return
    setHistoryEntries(await getNoteHistory(note.id))
    setHistoryOpen(true)
  }

  const confirmRemoveLock = async (passcode: string) => {
    if (!note || !/^\d{6}$/.test(passcode)) return
    const ok = await removeNoteLock(note.id, passcode)
    if (ok) {
      setLockDialogOpen(false)
      setUnlockRemovePasscode('')
      setUnlockRemoveError('')
    } else {
      setUnlockRemoveError('Wrong passcode')
    }
  }

  if (isLocked) {
    return (
      <div className="editor-panel editor-locked-panel">
        <div className="editor-locked-preview">
          <div className="editor-locked-line wide" />
          <div className="editor-locked-line" />
          <div className="editor-locked-block" />
          <div className="editor-locked-line short" />
        </div>
        <div className="editor-empty-state editor-lock-state">
          <Lock size={34} />
          <p>This note is locked</p>
          <span className="editor-lock-copy">Enter the 6 digit passcode to view and edit it.</span>
          <input
            className="editor-unlock-input"
            inputMode="numeric"
            pattern="[0-9]*"
            type="password"
            value={unlockPassword}
            placeholder="6 digit passcode"
            onChange={event => {
              const nextPasscode = event.target.value.replace(/\D/g, '').slice(0, 6)
              setUnlockPassword(nextPasscode)
              setUnlockError('')
              if (nextPasscode.length === 6) void tryUnlock(nextPasscode)
            }}
            onKeyDown={async event => {
              if (event.key !== 'Enter') return
              void tryUnlock(unlockPassword)
            }}
          />
          <button
            className="editor-new-note-hint"
            onClick={() => void tryUnlock(unlockPassword)}
          >
            Unlock
          </button>
          {unlockError && <span className="editor-unlock-error">{unlockError}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="editor-panel">
      <div className="editor-workspace">
        <div className="editor-main">
          {/* Note header: emoji + title */}
          <div className="editor-header">
            <div className="editor-emoji-wrapper">
              <button
                className="editor-emoji-btn"
                onClick={() => setShowEmojiPicker(v => !v)}
                title="Change emoji"
              >
                <span className="editor-emoji">{note.emoji}</span>
              </button>
              {showEmojiPicker && (
                <>
                  <div className="emoji-picker-grid scale-in">
                    {EMOJI_POOL.map(e => (
                      <button
                        key={e}
                        className="emoji-option"
                        onClick={() => {
                          updateNote(note.id, { emoji: e })
                          setShowEmojiPicker(false)
                        }}
                      >{e}</button>
                    ))}
                  </div>
                  <div className="popover-overlay" onClick={() => setShowEmojiPicker(false)} />
                </>
              )}
            </div>

            <input
              className="editor-title"
              value={title}
              placeholder="Title"
              onChange={e => handleTitleChange(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
            />
            <button
              className={`editor-header-action editor-lock-toggle ${note.isLocked === 1 ? 'is-locked' : ''}`}
              onClick={handleLockButton}
              title={note.isLocked === 1 ? 'Remove note lock' : 'Lock this note'}
              aria-pressed={note.isLocked === 1}
            >
              {note.isLocked === 1 ? <Lock size={15} /> : <LockOpen size={15} />}
            </button>
            <button
              className="editor-header-action"
              onClick={openHistory}
              title="Version history"
            >
              <History size={15} />
            </button>
            <button
              className="editor-header-action"
              onClick={exportCurrentNotePdf}
              title={shortcutTitle('Export this note as PDF', settings.shortcuts, 'exportPdf')}
            >
              <Download size={15} />
            </button>
          </div>

          {/* Editor */}
          <TipTapEditor note={note} searchQuery={searchQuery} key={note.id} />
        </div>
      </div>
      {lockDialogOpen && note.isLocked !== 1 && (
        <LockNoteDialog
          noteTitle={note.title}
          onClose={() => setLockDialogOpen(false)}
          onUseGlobal={lockWithGlobalPasscode}
          onUseNew={lockWithNewPasscode}
        />
      )}
      {lockDialogOpen && note.isLocked === 1 && (
        <div className="lock-dialog-backdrop">
          <div className="lock-dialog scale-in">
            <LockOpen size={24} />
            <h3>Remove lock</h3>
            <p>Enter the 6 digit passcode to unlock this note permanently.</p>
            <input
              autoFocus
              inputMode="numeric"
              type="password"
              value={unlockRemovePasscode}
              placeholder="6 digit passcode"
              onChange={event => {
                const next = event.target.value.replace(/\D/g, '').slice(0, 6)
                setUnlockRemovePasscode(next)
                setUnlockRemoveError('')
                if (next.length === 6) void confirmRemoveLock(next)
              }}
            />
            {unlockRemoveError && <span className="editor-unlock-error">{unlockRemoveError}</span>}
            <div className="lock-dialog-actions">
              <button className="secondary" onClick={() => setLockDialogOpen(false)}>Cancel</button>
              <button onClick={() => void confirmRemoveLock(unlockRemovePasscode)}>Remove Lock</button>
            </div>
          </div>
        </div>
      )}
      {historyOpen && note && (
        <div className="note-history-panel scale-in">
          <header>
            <div>
              <strong>Note History</strong>
              <span>{historyEntries.length ? 'Restore an older saved version.' : 'No older versions saved yet.'}</span>
            </div>
            <button onClick={() => setHistoryOpen(false)}>Close</button>
          </header>
          <div className="note-history-list">
            {historyEntries.map(entry => (
              <div className="note-history-item" key={entry.id}>
                <div>
                  <strong>{entry.title || 'New Note'}</strong>
                  <span>{new Date(entry.createdAt).toLocaleString()} · {entry.reason}</span>
                  <p>{entry.plainText.slice(0, 120) || 'Empty note'}</p>
                </div>
                <button
                  onClick={async () => {
                    const restored = await restoreNoteHistory(note.id, entry.id)
                    if (restored) {
                      setTitle(restored.title)
                      setHistoryEntries(await getNoteHistory(note.id))
                    }
                  }}
                >
                  <RotateCcw size={13} /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NewNoteHint() {
  const { createNote, selectNote } = useNotesStore()
  return (
    <button
      className="editor-new-note-hint"
      onClick={async () => {
        const note = await createNote(null)
        selectNote(note.id)
      }}
    >
      <Pencil size={14} /> New Note
    </button>
  )
}
