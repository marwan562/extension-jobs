import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ApplicationState, AuditEvent, CandidateProfile, Job, JobCampaign } from '../../../packages/shared/src/domain.ts';
import { assertTransition } from '../../../packages/shared/src/validation.ts';

export class Store {
  private readonly db: DatabaseSync;
  constructor(path: string) { mkdirSync(dirname(path), { recursive: true }); this.db = new DatabaseSync(path); this.migrate(); }
  private migrate(): void {
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, state TEXT NOT NULL, submission_key TEXT UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, application_id TEXT, at TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, acquired_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_correlation_idx ON audit_events(correlation_id, at);`);
  }
  saveProfile(profile: CandidateProfile): void { this.db.prepare('INSERT INTO profiles VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(profile.id, JSON.stringify(profile), profile.updatedAt); }
  getProfile(id: string): CandidateProfile | undefined { const row = this.db.prepare('SELECT data FROM profiles WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as CandidateProfile : undefined; }
  listProfiles(): CandidateProfile[] { return (this.db.prepare('SELECT data FROM profiles ORDER BY updated_at DESC').all() as Array<{ data: string }>).map((r) => JSON.parse(r.data) as CandidateProfile); }
  saveCampaign(campaign: JobCampaign): void { this.db.prepare('INSERT INTO campaigns VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').run(campaign.id, JSON.stringify(campaign), campaign.updatedAt); }
  getCampaign(id: string): JobCampaign | undefined { const row = this.db.prepare('SELECT data FROM campaigns WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as JobCampaign : undefined; }
  listCampaigns(): JobCampaign[] { return (this.db.prepare('SELECT data FROM campaigns ORDER BY updated_at DESC').all() as Array<{ data: string }>).map((r) => JSON.parse(r.data) as JobCampaign); }
  saveJob(job: Job): boolean { try { this.db.prepare('INSERT INTO jobs VALUES (?, ?, ?)').run(job.id, job.fingerprint, JSON.stringify(job)); return true; } catch (e) { if (String(e).includes('UNIQUE')) return false; throw e; } }
  createApplication(id: string, jobId: string, data: Record<string, unknown>): void { this.db.prepare('INSERT INTO applications VALUES (?, ?, ?, NULL, ?)').run(id, jobId, 'DISCOVERED', JSON.stringify(data)); }
  transition(id: string, to: ApplicationState): void { const row = this.db.prepare('SELECT state FROM applications WHERE id=?').get(id) as { state: ApplicationState } | undefined; if (!row) throw new Error('Application not found'); assertTransition(row.state, to); this.db.prepare('UPDATE applications SET state=? WHERE id=?').run(to, id); }
  reserveSubmission(id: string, key: string): boolean { try { const result = this.db.prepare('UPDATE applications SET submission_key=? WHERE id=? AND submission_key IS NULL').run(key, id); return result.changes === 1; } catch (e) { if (String(e).includes('UNIQUE')) return false; throw e; } }
  audit(event: AuditEvent): void { this.db.prepare('INSERT INTO audit_events VALUES (?, ?, ?, ?, ?)').run(event.id, event.correlationId, event.applicationId ?? null, event.at, JSON.stringify(event)); }
  timeline(correlationId?: string): AuditEvent[] { const rows = correlationId ? this.db.prepare('SELECT data FROM audit_events WHERE correlation_id=? ORDER BY at').all(correlationId) : this.db.prepare('SELECT data FROM audit_events ORDER BY at DESC LIMIT 200').all(); return (rows as Array<{ data: string }>).map((r) => JSON.parse(r.data) as AuditEvent); }
  acquireLock(key: string): boolean { try { this.db.prepare('INSERT INTO locks VALUES (?, ?)').run(key, new Date().toISOString()); return true; } catch { return false; } }
  releaseLock(key: string): void { this.db.prepare('DELETE FROM locks WHERE key=?').run(key); }
  close(): void { this.db.close(); }
}
