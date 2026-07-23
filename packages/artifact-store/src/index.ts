import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Artifact } from '../../shared-contracts/src/index.ts';

export class ArtifactStore {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); mkdirSync(this.root, { recursive: true, mode: 0o700 }); chmodSync(this.root, 0o700); }
  put(kind: Artifact['kind'], mediaType: string, content: Uint8Array | string, extension: string, metadata: Record<string, unknown> = {}): Artifact {
    const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content); const sha256 = createHash('sha256').update(bytes).digest('hex'); const id = randomUUID();
    const directory = resolve(this.root, id); mkdirSync(directory, { mode: 0o700 }); const relativePath = `${id}/${kind}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`; const absolutePath = this.resolveRelative(relativePath); writeFileSync(absolutePath, bytes, { mode: 0o600 }); chmodSync(absolutePath, 0o600);
    const artifact: Artifact = { id, kind, mediaType, sha256, size: bytes.length, createdAt: new Date().toISOString() };
    writeFileSync(resolve(directory, 'metadata.json'), JSON.stringify({ ...artifact, relativePath, metadata }, null, 2), { mode: 0o600 }); return artifact;
  }
  read(id: string, extension: string, kind: Artifact['kind']): Buffer { return readFileSync(this.resolveRelative(`${id}/${kind}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`)); }
  resolveArtifact(id: string, kind: Artifact['kind'], extension: string): string { return this.resolveRelative(`${id}/${kind}.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}`); }
  remove(id: string): void { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid artifact ID'); const directory = this.resolveRelative(id); rmSync(directory, { recursive: true, force: false }); }
  private resolveRelative(relativePath: string): string { const target = resolve(this.root, relativePath); if (!target.startsWith(`${this.root}${sep}`)) throw new Error('Invalid artifact reference'); return target; }
}
