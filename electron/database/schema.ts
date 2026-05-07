import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 1

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      sort_order REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      original_parent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Note',
      body TEXT NOT NULL DEFAULT '{}',
      plain_text TEXT NOT NULL DEFAULT '',
      emoji TEXT NOT NULL DEFAULT '📝',
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      original_folder_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      lock_password_hash TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',
      last_synced_at TEXT,
      sort_order REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_history (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      plain_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reason TEXT NOT NULL DEFAULT 'autosave'
    );

    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned);
    CREATE INDEX IF NOT EXISTS idx_history_note ON note_history(note_id, created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts
      USING fts5(title, plain_text, content='notes', content_rowid='rowid');
  `)

  const noteColumns = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[]
  if (!noteColumns.some(column => column.name === 'sort_order')) {
    db.exec('ALTER TABLE notes ADD COLUMN sort_order REAL NOT NULL DEFAULT 0')
  }

  const folderColumns = db.prepare('PRAGMA table_info(folders)').all() as { name: string }[]
  if (!folderColumns.some(column => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE folders ADD COLUMN deleted_at TEXT')
  }
  if (!folderColumns.some(column => column.name === 'original_parent_id')) {
    db.exec('ALTER TABLE folders ADD COLUMN original_parent_id TEXT')
  }

  // FTS triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.rowid, old.title, old.plain_text);
      INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.rowid, old.title, old.plain_text);
    END;
  `)
}
