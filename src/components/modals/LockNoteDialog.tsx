import { useState } from 'react'
import { KeyRound, Lock, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import './LockNoteDialog.css'

interface Props {
  noteTitle: string
  onClose: () => void
  onUseGlobal: () => Promise<void>
  onUseNew: (passcode: string) => Promise<void>
}

export function LockNoteDialog({ noteTitle, onClose, onUseGlobal, onUseNew }: Props) {
  const hasGlobalPasscode = useSettingsStore(state => state.hasGlobalPasscode)
  const [mode, setMode] = useState<'global' | 'new'>(hasGlobalPasscode ? 'global' : 'new')
  const [passcode, setPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const cleanPasscode = (value: string) => value.replace(/\D/g, '').slice(0, 6)
  const isReady = mode === 'global' || (/^\d{6}$/.test(passcode) && passcode === confirmPasscode)

  const lockNote = async () => {
    if (!isReady || saving) {
      setMessage('Use a matching 6 digit passcode.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      if (mode === 'global') await onUseGlobal()
      else await onUseNew(passcode)
      onClose()
    } catch {
      setMessage('Could not lock this note.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lock-dialog-backdrop">
      <div className="lock-dialog scale-in">
        <header className="lock-dialog-header">
          <div className="lock-dialog-title">
            <span><Lock size={17} /></span>
            <div>
              <h3>Lock Note</h3>
              <p>{noteTitle || 'New Note'}</p>
            </div>
          </div>
          <button className="lock-dialog-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="lock-dialog-options">
          <button
            className={mode === 'global' ? 'active' : ''}
            disabled={!hasGlobalPasscode}
            onClick={() => setMode('global')}
          >
            <KeyRound size={15} />
            Global passcode
          </button>
          <button
            className={mode === 'new' ? 'active' : ''}
            onClick={() => setMode('new')}
          >
            <Lock size={15} />
            New passcode
          </button>
        </div>

        {mode === 'global' ? (
          <div className="lock-dialog-copy">
            This note will use the global 6 digit passcode from Settings.
          </div>
        ) : (
          <div className="lock-passcode-fields">
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              type="password"
              value={passcode}
              placeholder="6 digit passcode"
              onChange={event => {
                setPasscode(cleanPasscode(event.target.value))
                setMessage('')
              }}
            />
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              type="password"
              value={confirmPasscode}
              placeholder="Confirm passcode"
              onChange={event => {
                setConfirmPasscode(cleanPasscode(event.target.value))
                setMessage('')
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') lockNote()
              }}
            />
          </div>
        )}

        {!hasGlobalPasscode && mode === 'global' && (
          <div className="lock-dialog-message">Create a global passcode in Settings first.</div>
        )}
        {message && <div className="lock-dialog-message">{message}</div>}

        <footer className="lock-dialog-footer">
          <button className="lock-dialog-secondary" onClick={onClose}>Cancel</button>
          <button className="lock-dialog-primary" onClick={lockNote} disabled={!isReady || saving}>
            {saving ? 'Locking...' : 'Lock'}
          </button>
        </footer>
      </div>
    </div>
  )
}
