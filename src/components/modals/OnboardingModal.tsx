import { useState } from 'react'
import { Cloud, HardDrive, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import './OnboardingModal.css'

export function OnboardingModal() {
  const settings = useSettingsStore()
  const [nickname, setNickname] = useState(settings.nickname ?? '')
  const [wantsSync, setWantsSync] = useState(false)
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [message, setMessage] = useState('')

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
    await settings.setSetting('nickname', cleanName)
    await settings.setSetting('hasCompletedOnboarding', true)
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
