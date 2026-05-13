import { useState } from 'react'
import { Cloud, HardDrive, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useNotesStore } from '../../store/notesStore'
import { getTemplatesForUse, NOTE_TEMPLATES, type NoteTemplate } from '../../utils/noteTemplates'
import './OnboardingModal.css'

export function OnboardingModal() {
  const settings = useSettingsStore()
  const { createNote, updateNote, selectNote } = useNotesStore()
  const [nickname, setNickname] = useState(settings.nickname ?? '')
  const [wantsSync, setWantsSync] = useState(false)
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [message, setMessage] = useState('')
  const [useCase, setUseCase] = useState('school')
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set(['class', 'study']))

  const toggleTemplate = (key: string) => {
    setSelectedTemplates(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const applyUseCase = (key: string) => {
    setUseCase(key)
    setSelectedTemplates(new Set(getTemplatesForUse(key).map(template => template.key)))
  }

  const createTemplateNote = async (template: NoteTemplate) => {
    const note = await createNote(null)
    await updateNote(note.id, {
      title: template.title,
      emoji: template.emoji,
      body: JSON.stringify(template.body),
      plainText: template.plainText,
    })
    return note.id
  }

  const finish = async () => {
    const cleanName = nickname.trim() || 'Friend'
    setMessage('')
    if (wantsSync) {
      if (syncPassphrase.length < 8) {
        setMessage('Use at least 8 characters for the sync password.')
        return
      }
      const result = await window.api.sync.setPassphrase(syncPassphrase)
      if (!result.ok) {
        setMessage(result.error ?? 'Could not save sync password.')
        return
      }
      await settings.setSetting('syncEncryptionReady', true)
    }
    let firstNoteId: string | null = null
    for (const template of NOTE_TEMPLATES.filter(item => selectedTemplates.has(item.key))) {
      const noteId = await createTemplateNote(template)
      if (!firstNoteId) firstNoteId = noteId
    }
    await settings.setSetting('nickname', cleanName)
    await settings.setSetting('hasCompletedOnboarding', true)
    if (firstNoteId) selectNote(firstNoteId)
  }

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card scale-in">
        <div className="onboarding-icon"><Sparkles size={22} /></div>
        <h1>Welcome to Notes</h1>
        <p>Make the app feel like yours first. Everything still works offline.</p>
        <label className="onboarding-label">
          Nickname
          <input
            autoFocus
            value={nickname}
            placeholder="What should we call you?"
            onChange={event => setNickname(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !wantsSync) void finish()
            }}
          />
        </label>
        <div className="onboarding-choice-row">
          <button className={!wantsSync ? 'active' : ''} onClick={() => setWantsSync(false)}>
            <HardDrive size={17} />
            Local only
          </button>
          <button className={wantsSync ? 'active' : ''} onClick={() => setWantsSync(true)}>
            <Cloud size={17} />
            Set up Drive later
          </button>
        </div>
        <div className="onboarding-section-title">What will you use it for?</div>
        <div className="onboarding-use-grid">
          {[
            ['school', 'School'],
            ['work', 'Work'],
            ['personal', 'Personal'],
            ['projects', 'Projects'],
          ].map(([key, label]) => (
            <button key={key} className={useCase === key ? 'active' : ''} onClick={() => applyUseCase(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="onboarding-section-title">Starter templates</div>
        <div className="onboarding-template-grid">
          {NOTE_TEMPLATES.map(template => (
            <button
              key={template.key}
              className={selectedTemplates.has(template.key) ? 'active' : ''}
              onClick={() => toggleTemplate(template.key)}
            >
              <strong>{template.emoji} {template.title}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </div>
        {wantsSync && (
          <label className="onboarding-label">
            Sync password
            <input
              type="password"
              value={syncPassphrase}
              placeholder="Protect encrypted Google Drive data"
              onChange={event => setSyncPassphrase(event.target.value)}
            />
          </label>
        )}
        {message && <div className="onboarding-message">{message}</div>}
        <button className="onboarding-primary" onClick={finish}>
          Start Notes
        </button>
      </div>
    </div>
  )
}
