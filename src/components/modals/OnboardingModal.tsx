import { useState } from 'react'
import { Cloud, HardDrive, KeyRound, Lock, ShieldCheck, X } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import './OnboardingModal.css'

export function OnboardingModal() {
  const settings = useSettingsStore()
  const [nickname, setNickname] = useState(settings.nickname ?? '')
  const [syncPassphrase, setSyncPassphrase] = useState('')
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId ?? '')
  const [googleClientSecret, setGoogleClientSecret] = useState(settings.googleClientSecret ?? '')
  const [showAdvanced, setShowAdvanced] = useState(!settings.googleClientId || !settings.googleClientSecret)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [message, setMessage] = useState('')

  const saveNameAndFinish = async () => {
    await settings.setSetting('nickname', nickname.trim() || 'Friend')
    await settings.setSetting('hasCompletedOnboarding', true)
  }

  const continueOffline = async () => {
    setMessage('')
    await settings.setSetting('syncMode', 'local')
    await settings.setSetting('syncStatus', 'local')
    await saveNameAndFinish()
  }

  const connectGoogle = async (useAnotherAccount = false) => {
    setMessage('')
    setIsConnecting(true)
    try {
      const typedClientId = googleClientId.trim()
      const typedClientSecret = googleClientSecret.trim()
      const hasTypedCredentials = Boolean(typedClientId || typedClientSecret)
      const hasCompleteTypedCredentials = Boolean(typedClientId && typedClientSecret)
      const hasStoredCredentials = Boolean(settings.googleClientId && settings.googleClientSecret)

      if (!settings.syncEncryptionReady && syncPassphrase.length < 8) {
        setMessage('Choose a sync password with at least 8 characters first.')
        return
      }

      if (hasTypedCredentials && !hasCompleteTypedCredentials) {
        setShowAdvanced(true)
        setMessage('Paste both the Google OAuth Client ID and Client Secret.')
        return
      }

      if (!hasStoredCredentials && !hasCompleteTypedCredentials) {
        setShowAdvanced(true)
        setMessage('Add the Google OAuth Desktop client details once, then Get started will open Google sign-in.')
        return
      }

      if (hasCompleteTypedCredentials) {
        const saved = await window.api.sync.saveConfig(typedClientId, typedClientSecret)
        if (!saved.ok) {
          setMessage(saved.error ?? 'Could not save Google OAuth setup.')
          return
        }
        await settings.setSetting('googleClientId', typedClientId)
        await settings.setSetting('googleClientSecret', typedClientSecret)
      }

      if (!settings.syncEncryptionReady || syncPassphrase.trim()) {
        const passResult = await window.api.sync.setPassphrase(syncPassphrase)
        if (!passResult.ok) {
          setMessage(passResult.error ?? 'Could not save the sync password.')
          return
        }
        await settings.setSetting('syncEncryptionReady', true)
      }

      if (useAnotherAccount && settings.syncMode === 'googleDrive') {
        await window.api.sync.disconnectGoogleDrive()
        await settings.setSetting('syncMode', 'local')
        await settings.setSetting('googleEmail', null)
      }

      await settings.setSetting('syncStatus', 'syncing')
      const result = await window.api.sync.connectGoogleDrive()
      if (!result.ok) {
        await settings.setSetting('syncStatus', 'error')
        await settings.setSetting('syncLastError', result.error ?? null)
        setMessage(result.error ?? 'Google sign-in did not finish.')
        return
      }

      await settings.setSetting('nickname', nickname.trim() || 'Friend')
      await settings.setSetting('syncMode', 'googleDrive')
      await settings.setSetting('syncStatus', 'synced')
      await settings.setSetting('googleEmail', result.email ?? null)
      await settings.setSetting('syncLastError', null)
      await settings.setSetting('syncLastSyncedAt', new Date().toISOString())
      await settings.setSetting('hasCompletedOnboarding', true)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-card sync-onboarding-card scale-in">
        <button className="onboarding-close" onClick={continueOffline} title="Keep using offline">
          <X size={18} />
        </button>

        <div className="sync-onboarding-copy">
          <div className="sync-onboarding-badge">
            <ShieldCheck size={17} />
            Private by default
          </div>
          <h1>Back up your notes and sync across devices.</h1>
          <p>
            Sign in with your own Google Drive account. Notes are encrypted on this PC before they are uploaded.
          </p>
          <button className="onboarding-link" onClick={() => setShowPrivacy(value => !value)}>
            Privacy details
          </button>
        </div>

        <div className="sync-illustration" aria-hidden="true">
          <div className="sync-leaf one" />
          <div className="sync-leaf two" />
          <div className="sync-laptop">
            <div className="sync-laptop-sidebar">
              <span />
              <span />
            </div>
            <div className="sync-laptop-note" />
          </div>
          <div className="sync-phone">
            <span />
            <span />
          </div>
          <div className="sync-shadow" />
        </div>

        <div className="sync-onboarding-form">
          <label className="onboarding-label compact">
            Nickname
            <input
              autoFocus
              value={nickname}
              placeholder="What should we call you?"
              onChange={event => setNickname(event.target.value)}
            />
          </label>

          <label className="onboarding-label compact">
            Sync password
            <div className="onboarding-password-wrap">
              <KeyRound size={15} />
              <input
                type="password"
                value={syncPassphrase}
                placeholder={settings.syncEncryptionReady ? 'Encryption password already saved' : 'Private password for encrypted Drive data'}
                onChange={event => setSyncPassphrase(event.target.value)}
              />
            </div>
          </label>

          {showAdvanced && (
            <div className="onboarding-advanced">
              <label className="onboarding-label compact">
                Google OAuth Client ID
                <input
                  value={googleClientId}
                  placeholder="Desktop OAuth Client ID"
                  onChange={event => setGoogleClientId(event.target.value)}
                />
              </label>
              <label className="onboarding-label compact">
                Google OAuth Client Secret
                <input
                  value={googleClientSecret}
                  type="password"
                  placeholder="Desktop OAuth Client Secret"
                  onChange={event => setGoogleClientSecret(event.target.value)}
                />
              </label>
            </div>
          )}

          {showPrivacy && (
            <div className="onboarding-privacy">
              <div><Lock size={14} /> Your notes are encrypted before upload.</div>
              <div><Cloud size={14} /> Files stay in the signed-in user&apos;s hidden Google Drive app data.</div>
              <div><HardDrive size={14} /> You can skip this and keep everything offline.</div>
            </div>
          )}

          {message && <div className="onboarding-message">{message}</div>}

          <button className="onboarding-primary" onClick={() => connectGoogle(false)} disabled={isConnecting}>
            {isConnecting ? 'Opening Google sign-in...' : 'Get started with Google Drive'}
            {settings.googleEmail && <span>as {settings.googleEmail}</span>}
          </button>

          <button className="onboarding-secondary-link" onClick={() => connectGoogle(true)} disabled={isConnecting}>
            Use another account
          </button>

          <button className="onboarding-secondary-link muted" onClick={continueOffline} disabled={isConnecting}>
            Keep using offline
          </button>
        </div>
      </div>
    </div>
  )
}
