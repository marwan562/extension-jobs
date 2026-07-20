import type { ApplicationState, FieldAnswer, Job } from './domain.ts';

export const wuzzufToolActions = [
  'WUZZUF_CREATE_CONNECTION', 'WUZZUF_VERIFY_CONNECTION', 'WUZZUF_DISCONNECT',
  'WUZZUF_SEARCH_JOBS', 'WUZZUF_GET_JOB_DETAILS', 'WUZZUF_SCORE_JOB',
  'WUZZUF_PREPARE_APPLICATION', 'WUZZUF_FILL_APPLICATION',
  'WUZZUF_GET_APPLICATION_REVIEW', 'WUZZUF_SUBMIT_APPLICATION',
  'WUZZUF_GET_APPLICATION_STATUS', 'WUZZUF_CANCEL_APPLICATION',
  'WUZZUF_GET_AUTH_STATUS', 'WUZZUF_OPEN_LOGIN', 'WUZZUF_REQUEST_SUBMISSION_APPROVAL'
] as const;

export type WuzzufToolAction = typeof wuzzufToolActions[number];

export interface WuzzufSearchInput {
  queries: string[];
  locations: string[];
  remote?: boolean;
  experienceLevel?: string;
  employmentTypes?: string[];
  limit?: number;
}

export interface WuzzufErrorResult {
  ok: false;
  error: { code: string; message: string; retryable: boolean; correlationId: string; actionRequired?: string; diagnostics?: Record<string, unknown> };
}

export type WuzzufConnectionStatus = 'disconnected' | 'browser_required' | 'security_check_required' | 'authenticated' | 'expired';
export interface WuzzufConnection {
  id: string;
  userId: string;
  status: WuzzufConnectionStatus;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'used' | 'invalidated';
export interface ApprovalRequestRecord {
  id: string;
  applicationId: string;
  bindingHash: string;
  nonceHash: string;
  status: ApprovalRequestStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  usedAt?: string;
}

export interface WuzzufSuccess<T> { ok: true; data: T; correlationId: string }
export type WuzzufResult<T> = WuzzufSuccess<T> | WuzzufErrorResult;

export interface PreparedApplicationRecord {
  id: string;
  correlationId: string;
  jobId: string;
  job: Job;
  profileId: string;
  selectedResume?: { id: string; name: string; sourceName: string; approved: boolean };
  answers: FieldAnswer[];
  filledFields: string[];
  skippedFields: string[];
  validationErrors: string[];
  sensitiveFields: string[];
  screenshots: string[];
  state: ApplicationState;
  dryRun: boolean;
  submissionAllowed: boolean;
  lastSuccessfulStep: string;
  errors: Array<{ code: string; message: string; at: string }>;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  submissionResult?: { submitted: boolean; confirmation?: string; at: string };
  adapterSessionId?: string;
  reviewRevision?: string;
}

export class WuzzufToolError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly diagnostics?: Record<string, unknown>;
  readonly correlationId?: string;
  readonly actionRequired?: string;
  constructor(code: string, message: string, options: { status?: number; retryable?: boolean; diagnostics?: Record<string, unknown>; correlationId?: string; actionRequired?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause }); this.name = 'WuzzufToolError'; this.code = code; this.status = options.status ?? 400; this.retryable = options.retryable ?? false; if (options.diagnostics) this.diagnostics = options.diagnostics; if (options.correlationId) this.correlationId = options.correlationId; if (options.actionRequired) this.actionRequired = options.actionRequired;
  }
}
