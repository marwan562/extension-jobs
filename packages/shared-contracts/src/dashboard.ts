import { z } from 'zod';

export const DashboardSessionSchema = z.object({
  authenticated: z.literal(true),
  csrfToken: z.string().min(32).max(128),
  expiresAt: z.string().datetime()
}).strict();

export const DashboardJobDispositionSchema = z.enum(['shortlisted', 'rejected']);

export const DashboardJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  employer: z.string(),
  location: z.string(),
  url: z.string().url(),
  source: z.string(),
  description: z.string(),
  matchScore: z.number().min(0).max(100),
  scoreExplanation: z.array(z.object({
    factor: z.string(),
    points: z.number(),
    reason: z.string()
  }).strict()),
  remote: z.boolean(),
  discoveredAt: z.string().datetime().optional(),
  disposition: DashboardJobDispositionSchema.optional(),
  tags: z.array(z.string()),
  note: z.string().optional(),
  applicationState: z.string().min(1).max(80).optional(),
  applicationId: z.string().optional()
}).strict();
export type DashboardJob = z.infer<typeof DashboardJobSchema>;

export const DashboardApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  state: z.string().min(1).max(80),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  dryRun: z.boolean().optional(),
  job: z.object({
    title: z.string(),
    employer: z.string(),
    location: z.string()
  }).strict().optional(),
  errors: z.array(z.unknown()).default([])
}).strict();
export type DashboardApplication = z.infer<typeof DashboardApplicationSchema>;

export const DashboardSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  health: z.object({
    daemon: z.literal('online'),
    storage: z.literal('ready'),
    browser: z.string(),
    emergencyStop: z.boolean()
  }).strict(),
  counts: z.object({
    jobs: z.number().int().nonnegative(),
    shortlisted: z.number().int().nonnegative(),
    applications: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
    manualActions: z.number().int().nonnegative(),
    campaigns: z.number().int().nonnegative()
  }).strict(),
  queue: z.record(z.number()),
  matchDistribution: z.array(z.object({
    label: z.string(),
    count: z.number().int().nonnegative()
  }).strict()),
  campaignPulse: z.array(z.object({
    id: z.string(),
    name: z.string(),
    state: z.enum(['enabled', 'paused']),
    updatedAt: z.string().datetime()
  }).strict()),
  attention: z.array(z.object({
    id: z.string(),
    kind: z.enum(['approval', 'manual_action', 'resume', 'emergency_stop']),
    title: z.string(),
    detail: z.string()
  }).strict())
}).strict();
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const DashboardConnectorSchema = z.object({
  enabled: z.boolean(),
  policy: z.object({
    connectorId: z.string().min(1).max(80),
    version: z.string(),
    enabledByDefault: z.boolean(),
    capabilities: z.object({
      discovery: z.string(),
      details: z.string(),
      fill: z.string(),
      submit: z.string(),
      requiresUserPresence: z.boolean(),
      requiresSubmissionApproval: z.boolean()
    }).passthrough(),
    allowedHosts: z.array(z.string()),
    notes: z.string()
  }).passthrough()
}).strict();

export const CursorPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  items: z.array(item),
  nextCursor: z.string().optional(),
  total: z.number().int().nonnegative()
}).strict();
