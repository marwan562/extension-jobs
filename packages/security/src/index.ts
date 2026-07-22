import { createHash, timingSafeEqual } from 'node:crypto';

const secretKey = /^(authorization|cookie|cookies|set-cookie|api[_-]?key|token|approvalToken|pairingCode|password|rawHtml|resumeText|cdpEndpoint|browserProfileReference|chromeProfilePath|filePath|stack|trace)$/i;
const auditPiiKey = /^(email|emailAddress|phone|phoneNumber|mobile)$/i;
const localPath = /(?:\/(?:Users|home|private|tmp)\/|[A-Za-z]:\\)[^\s]+/g;
const bearer = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

export function sanitizeDiagnostics(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(bearer, 'Bearer [REDACTED]').replace(localPath, '[LOCAL_PATH]');
  if (Array.isArray(value)) return value.map(sanitizeDiagnostics);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, secretKey.test(key) ? '[REDACTED]' : sanitizeDiagnostics(item)]));
}
export const sanitizeToolOutput = sanitizeDiagnostics;
export const sanitizeLogEvent = sanitizeDiagnostics;
export function sanitizeAuditDetail(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditDetail);
  if (!value || typeof value !== 'object') return sanitizeDiagnostics(value);
  const source = value as Record<string, unknown>; const answerLike = typeof source.label === 'string' && Object.hasOwn(source, 'value');
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, secretKey.test(key) || auditPiiKey.test(key) || (answerLike && key === 'value') ? '[REDACTED]' : sanitizeAuditDetail(item)]));
}

export function hashSecret(secret: string): string { return createHash('sha256').update(secret).digest('hex'); }
export function secureHashEquals(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'hex'); const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertLoopbackUrl(value: string, allowedPorts?: readonly number[]): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Only loopback HTTP URLs are allowed');
  if (url.username || url.password) throw new Error('Credentials are not allowed in local URLs');
  if (allowedPorts?.length && !allowedPorts.includes(Number(url.port))) throw new Error('Loopback port is not allowed');
  return url;
}

export function assertLoopbackCdpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Only loopback CDP URLs are allowed');
  if (url.username || url.password) throw new Error('Credentials are not allowed in CDP URLs');
  return url;
}

export function assertWuzzufUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['wuzzuf.net', 'www.wuzzuf.net'].includes(url.hostname.toLowerCase()) || url.username || url.password) throw new Error('Unsupported Wuzzuf URL');
  return url;
}
