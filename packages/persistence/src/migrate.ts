import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export function applyCoreMigrations(db: DatabaseSync, migrationFile = new URL('../migrations/001_core.sql', import.meta.url)): void {
  const sourcePath = resolve(process.cwd(), 'packages/persistence/migrations/001_core.sql');
  db.exec(readFileSync(existsSync(sourcePath) ? sourcePath : migrationFile, 'utf8'));
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version,name,applied_at) VALUES (1,?,?)').run('001_core.sql', new Date().toISOString());
}
