import { z } from 'zod';

export const errorCodes = [
  'AUTH_REQUIRED', 'SECURITY_CHECK_REQUIRED', 'JOB_NOT_FOUND', 'APPLICATION_NOT_SUPPORTED',
  'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'APPROVAL_ALREADY_USED', 'APPROVAL_INVALIDATED',
  'FORM_CHANGED', 'RATE_LIMITED', 'DAILY_LIMIT_REACHED', 'EMERGENCY_STOP_ACTIVE',
  'BROWSER_UNAVAILABLE', 'ORCHESTRATOR_UNAVAILABLE', 'WORKFLOW_STATE_CONFLICT',
  'DUPLICATE_SUBMISSION_PREVENTED', 'VALIDATION_ERROR', 'INTERNAL_ERROR'
] as const;
export const ErrorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const applicationStates = [
  'DISCOVERED', 'SCORED', 'PREPARING', 'AWAITING_REVIEW', 'APPROVED_FOR_FILL', 'FILLING',
  'FILLED', 'AWAITING_SUBMISSION_APPROVAL', 'SUBMITTING', 'SUBMITTED', 'AUTH_REQUIRED',
  'SECURITY_CHECK_REQUIRED', 'FORM_CHANGED', 'BLOCKED', 'FAILED_RETRYABLE',
  'FAILED_PERMANENT', 'CANCELLED'
] as const;
export const ApplicationStateSchema = z.enum(applicationStates);
export type ApplicationState = z.infer<typeof ApplicationStateSchema>;

export const wuzzufToolActions = [
  'WUZZUF_CREATE_CONNECTION', 'WUZZUF_VERIFY_CONNECTION', 'WUZZUF_DISCONNECT',
  'WUZZUF_SEARCH_JOBS', 'WUZZUF_GET_JOB_DETAILS', 'WUZZUF_SCORE_JOB',
  'WUZZUF_PREPARE_APPLICATION', 'WUZZUF_FILL_APPLICATION', 'WUZZUF_GET_APPLICATION_REVIEW',
  'WUZZUF_REQUEST_SUBMISSION_APPROVAL', 'WUZZUF_SUBMIT_APPLICATION',
  'WUZZUF_GET_APPLICATION_STATUS', 'WUZZUF_CANCEL_APPLICATION',
  'WUZZUF_GET_AUTH_STATUS', 'WUZZUF_OPEN_LOGIN'
] as const;
export const WuzzufToolActionSchema = z.enum(wuzzufToolActions);
export type WuzzufToolAction = z.infer<typeof WuzzufToolActionSchema>;

export const wuzzufRuntimeToolNames = [
  'wuzzuf_create_connection', 'wuzzuf_open_login', 'wuzzuf_get_auth_status',
  'wuzzuf_verify_connection', 'wuzzuf_disconnect', 'wuzzuf_search_jobs',
  'wuzzuf_get_job_details', 'wuzzuf_score_job', 'wuzzuf_prepare_application',
  'wuzzuf_fill_application', 'wuzzuf_get_application_review',
  'wuzzuf_request_submission_approval', 'wuzzuf_submit_application',
  'wuzzuf_get_application_status', 'wuzzuf_cancel_application'
] as const;

export const ToolFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    actionRequired: z.string().optional(),
    correlationId: z.string(),
    diagnostics: z.record(z.unknown()).optional()
  }).strict()
}).strict();
export const toolSuccessSchema = <T extends z.ZodTypeAny>(data: T) => z.object({
  ok: z.literal(true), data, correlationId: z.string()
}).strict();
export type ToolSuccess<T> = { ok: true; data: T; correlationId: string };
export type ToolFailure = z.infer<typeof ToolFailureSchema>;
export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export const WuzzufSearchInputSchema = z.object({
  queries: z.array(z.string().min(1).max(200)).min(1).max(10),
  locations: z.array(z.string().min(1).max(200)).min(1).max(10),
  remote: z.boolean().optional(),
  experienceLevel: z.string().max(100).optional(),
  employmentTypes: z.array(z.string().max(100)).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();
export type WuzzufSearchInput = z.infer<typeof WuzzufSearchInputSchema>;

export const queueJobTypes = [
  'wuzzuf.verify-auth', 'wuzzuf.search', 'wuzzuf.fetch-details', 'wuzzuf.score-job',
  'wuzzuf.prepare-application', 'wuzzuf.fill-application', 'wuzzuf.submit-application',
  'wuzzuf.cleanup-browser', 'campaign.execute'
] as const;
export type QueueJobType = typeof queueJobTypes[number];
export interface QueueJob {
  id: string; type: QueueJobType; payload: unknown;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  attempts: number; maxAttempts: number; runAfter: string; lockedBy?: string;
  lockedAt?: string; correlationId: string; createdAt: string; updatedAt: string;
}

export interface FormFingerprint {
  normalizedUrl: string; fieldsHash: string; submitControlHash: string;
  formVersion: string; capturedAt: string;
}

export const clientScopes = [
  'profile:read', 'profile:write', 'jobs:search', 'applications:prepare',
  'applications:fill', 'applications:review', 'applications:approve',
  'applications:submit', 'campaigns:read', 'campaigns:manage', 'audit:read',
  'admin:emergency-stop'
] as const;
export type ClientScope = typeof clientScopes[number];
