# Notes

A Windows notes app inspired by Apple Notes, built with Electron, React, TypeScript, TipTap, and SQLite.

## Features

- Offline-first notes stored locally on the computer
- Optional encrypted Google Drive sync
- Rich text editor with headings, lists, checklists, tables, code blocks, links, images, and attachments
- Lock notes with a 6 digit passcode
- Folders, pinned notes, smart sections, trash restore, and duplicate notes
- PDF export for individual notes
- Search across notes and inside the current note
- Desktop widget for quick notes, todos, and reminders
- Dark Windows-style theme

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Create the Windows installer:

```bash
npm run dist
```

The installer is created in `dist/`.

## Google Drive Sync

Google Drive sync is optional. Each user signs in with their own Google account, and notes are stored in that user's own Google Drive.

For development, add a Google OAuth Desktop client in the app Settings:

- Client ID
- Client Secret
- Sync password for encrypting Drive data

The app uses the Google Drive `drive.file` scope so it only works with files it creates or opens for this app.

## Publishing

This project is configured for GitHub Releases:

```json
"publish": {
  "provider": "github",
  "owner": "xrobinx",
  "repo": "notes-app"
}
```

To publish a release:

1. Create a GitHub repository named `notes-app`.
2. Push this project to that repository.
3. Run `npm run dist`.
4. Upload these files from `dist/` to a GitHub Release:
   - `Notes Setup 1.0.0.exe`
   - `Notes Setup 1.0.0.exe.blockmap`
   - `latest.yml`

Friends can download and run `Notes Setup 1.0.0.exe`.

## Important Notes

- The app is not code-signed yet, so Windows SmartScreen may warn users the first time they install it.
- Auto-update works only after releases are published properly on GitHub.
- Google OAuth should be published/verified in Google Cloud before sharing with many users.
