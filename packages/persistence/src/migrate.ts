import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const migrations = [
  { version: 1, name: '001_core.sql' },
  { version: 2, name: '002_public_v1.sql' },
  { version: 3, name: '003_canonical_profile_snapshots.sql' }
] as const;

export function applyCoreMigrations(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL);');
  for (const migration of migrations) {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(migration.version);
    if (applied) continue;
    const sourcePath = resolve(process.cwd(), 'packages/persistence/migrations', migration.name);
    const bundled = new URL(`../migrations/${migration.name}`, import.meta.url);
    if (migration.version === 1) {
      db.exec(readFileSync(existsSync(sourcePath) ? sourcePath : bundled, 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version,name,applied_at) VALUES (?,?,?)').run(migration.version, migration.name, new Date().toISOString());
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(existsSync(sourcePath) ? sourcePath : bundled, 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version,name,applied_at) VALUES (?,?,?)').run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
