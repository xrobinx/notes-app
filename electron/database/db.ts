import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { initializeSchema } from './schema'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = join(app.getPath('userData'), 'notes.db')
    _db = new Database(dbPath)
    initializeSchema(_db)
  }
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
