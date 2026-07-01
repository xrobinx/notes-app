# iOS/iPadOS Build And Release

This repo now has a Capacitor iOS target next to the Windows Electron app. Windows stays the same. iPhone/iPad builds use the React mobile shell, local offline storage, the same TipTap editor, lock/passcode flow, attachments, export/share paths, and the same encrypted-sync API shape.

## Local Commands

```bash
npm run mobile:build
npm run ios:sync
npm run ios:open
```

`ios:open` needs macOS with Xcode. On Windows, use GitHub Actions.

## Required Accounts

- Apple Developer Program account for TestFlight and App Store signing.
- App Store Connect API key.
- Google Cloud iOS OAuth client for Google Drive sync.

Friends do not use your Drive. They sign in with their own Google account. Your OAuth client only identifies the app.

## GitHub Secrets

Add these in GitHub repository settings:

- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY` as base64 text
- `IOS_BUNDLE_ID`, optional, default is `com.notesapp.ios`
- `MATCH_GIT_URL`, optional signing certificate repo
- `MATCH_PASSWORD`, optional if using match
- `GOOGLE_IOS_CLIENT_ID`
- `GOOGLE_IOS_REVERSED_CLIENT_ID`

The workflow is `.github/workflows/ios-testflight.yml`. Run it manually or push a tag like `ios-v1.0.0`.

## Google iOS OAuth

Create a separate Google OAuth client:

1. Google Cloud Console -> APIs & Services -> Credentials.
2. Create OAuth client -> iOS.
3. Bundle ID: `com.notesapp.ios` unless you changed it.
4. Copy the iOS client ID into `GOOGLE_IOS_CLIENT_ID`.
5. Copy the reversed client ID into `GOOGLE_IOS_REVERSED_CLIENT_ID`.

Drive data should use the app-data scope and encrypted payloads. The Windows sync format is `aes-256-gcm+scrypt`; the iOS code keeps that sync entry point separated so the native callback and token storage can be completed without changing note data.

## First TestFlight Path

1. Push the repo to GitHub.
2. Add the secrets above.
3. Open Actions -> iOS TestFlight -> Run workflow.
4. When the build appears in App Store Connect, add yourself as an internal tester.
5. Install from TestFlight on iPhone and iPad.

## Current Native Follow-Ups

- Add the Swift files from `ios-native/` into Xcode targets:
  - `NotesAppIntents.swift` for Shortcuts/Siri/widget deep links.
  - `NotesWidget.swift` for WidgetKit snapshots.
  - `PencilSketchPlugin.swift` for native PencilKit editing.
- Finish the native Google OAuth callback/token exchange after the iOS client is created.
- Move the mobile JSON store to the included Capacitor SQLite plugin once the first TestFlight build is stable.
- Add a Keychain-backed secure storage plugin for OAuth tokens and sync passphrase.
- Register the native PencilKit bridge in the iOS app target once the Swift file is added in Xcode.
