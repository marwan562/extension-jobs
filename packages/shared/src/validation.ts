import { applicationStates, type ApplicationState, type JobCampaign, type Schedule } from './domain.ts';

export class ValidationError extends Error {}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Expected an object');
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ValidationError(`Invalid ${field}`);
  return value.trim();
}

export function stringArray(value: unknown, field: string, max = 20): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((v) => typeof v !== 'string' || v.length > 200)) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return value.map((v) => v.trim()).filter(Boolean);
}

export function validateTimezone(timezone: string): string {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new ValidationError('Invalid IANA timezone'); }
  return timezone;
}

export function validateCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new ValidationError('Cron must have five fields');
  const allowed = /^[\d*,\-/]+$/;
  if (parts.some((part) => !allowed.test(part))) throw new ValidationError('Unsupported cron expression');
  return cron.trim();
}

export function parseFriendlySchedule(text: string, timezone: string): Schedule {
  const normalized = text.toLowerCase().trim();
  validateTimezone(timezone);
  const time = normalized.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!time) throw new ValidationError('A schedule time is required');
  let hour = Number(time[1]);
  const minute = Number(time[2] ?? 0);
  if (time[3] === 'pm' && hour < 12) hour += 12;
  if (time[3] === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) throw new ValidationError('Invalid schedule time');
  const weekdays = /weekday|monday.*friday/.test(normalized);
  const daily = /every day|daily/.test(normalized);
  if (!weekdays && !daily) throw new ValidationError('Supported friendly schedules are daily or weekdays');
  return {
    cron: `${minute} ${hour} * * ${weekdays ? '1-5' : '*'}`,
    timezone,
    friendly: weekdays ? 'Every Monday–Friday' : 'Every day',
    missedRunPolicy: 'skip',
    maximumRuntimeMinutes: 30
  };
}

export function schedulePreview(campaign: JobCampaign): string {
  if (!campaign.schedule) return 'Manual campaign';
  const s = campaign.schedule;
  return `${s.friendly} at ${s.cron.split(' ')[1]!.padStart(2, '0')}:${s.cron.split(' ')[0]!.padStart(2, '0')} ${s.timezone}, search ${campaign.allowedSites.join(', ')}. Process at most ${campaign.maxApplicationsPerRun} new jobs in ${campaign.executionMode} mode above a ${campaign.minimumMatchScore}% match.`;
}

const transitions: Partial<Record<ApplicationState, readonly ApplicationState[]>> = {
  DISCOVERED: ['NORMALIZED', 'SKIPPED', 'CANCELLED'], NORMALIZED: ['DEDUPLICATED', 'DUPLICATE', 'CANCELLED'],
  DEDUPLICATED: ['SCORED', 'CANCELLED'], SCORED: ['SELECTED', 'SKIPPED', 'CANCELLED'],
  SELECTED: ['APPLICATION_STARTED', 'CANCELLED'], APPLICATION_STARTED: ['QUESTIONS_EXTRACTED', 'AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'FAILED_RETRYABLE', 'CANCELLED'],
  QUESTIONS_EXTRACTED: ['ANSWERS_PREPARED', 'CANCELLED'], ANSWERS_PREPARED: ['WAITING_FOR_APPROVAL', 'FILLING', 'CANCELLED'],
  WAITING_FOR_APPROVAL: ['FILLING', 'REJECTED_BY_USER', 'CANCELLED'], FILLING: ['VALIDATING', 'FAILED_RETRYABLE', 'CANCELLED'],
  VALIDATING: ['READY_TO_SUBMIT', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'], READY_TO_SUBMIT: ['SUBMITTING', 'CANCELLED'],
  SUBMITTING: ['SUBMITTED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'], FAILED_RETRYABLE: ['CANCELLED']
};

export function assertTransition(from: ApplicationState, to: ApplicationState): void {
  if (!applicationStates.includes(from) || !transitions[from]?.includes(to)) throw new ValidationError(`Invalid transition ${from} -> ${to}`);
}
