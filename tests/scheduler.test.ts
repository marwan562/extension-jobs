import test from 'node:test';
import assert from 'node:assert/strict';
import { isScheduleDue } from '../apps/orchestrator/src/scheduler.ts';
import type { Schedule } from '../packages/shared/src/domain.ts';

const schedule: Schedule = { cron: '30 9 * * 1-5', timezone: 'Africa/Cairo', friendly: 'Weekdays', missedRunPolicy: 'skip', maximumRuntimeMinutes: 30 };
test('campaign schedules are timezone-aware and run at most once per local minute', () => { const due = new Date('2026-07-20T06:30:00.000Z'); assert.equal(isScheduleDue(schedule, due), true); assert.equal(isScheduleDue(schedule, due, '2026-07-20T06:30:20.000Z'), false); assert.equal(isScheduleDue(schedule, new Date('2026-07-20T06:31:00.000Z')), false); assert.equal(isScheduleDue(schedule, new Date('2026-07-18T06:30:00.000Z')), false); });
