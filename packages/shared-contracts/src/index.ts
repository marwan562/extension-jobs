import { z } from 'zod';

export const errorCodes = [
  'AUTHENTICATION_REQUIRED', 'BROWSER_NOT_CONNECTED', 'CONNECTOR_DISABLED',
  'AUTOMATION_NOT_PERMITTED', 'SECURITY_CHALLENGE_DETECTED', 'JOB_NOT_FOUND',
  'PROFILE_INCOMPLETE', 'RESUME_NOT_SELECTED', 'RESUME_NOT_APPROVED',
  'RESUME_TAILORING_REVIEW_REQUIRED', 'RESUME_FACT_VALIDATION_FAILED',
  'APPLICATION_INPUT_REQUIRED', 'APPLICATION_CHANGED_AFTER_REVIEW', 'FORM_CHANGED',
  'APPROVAL_REQUIRED', 'APPROVAL_EXPIRED', 'APPROVAL_INVALID',
  'APPROVAL_ALREADY_USED', 'APPROVAL_INVALIDATED', 'DUPLICATE_APPLICATION',
  'DUPLICATE_SUBMISSION_PREVENTED', 'SUBMISSION_IN_PROGRESS',
  'SUBMISSION_VERIFICATION_REQUIRED', 'CAMPAIGN_PAUSED', 'DAILY_LIMIT_REACHED',
  'EMERGENCY_STOP_ACTIVE', 'RATE_LIMITED', 'OPERATION_CANCELLED',
  'WORKFLOW_STATE_CONFLICT', 'INTERNAL_ERROR',
  // Compatibility codes accepted for one migration release.
  'AUTH_REQUIRED', 'SECURITY_CHECK_REQUIRED', 'APPLICATION_NOT_SUPPORTED',
  'BROWSER_UNAVAILABLE', 'ORCHESTRATOR_UNAVAILABLE', 'VALIDATION_ERROR'
] as const;
export const ErrorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const applicationStates = [
  'DISCOVERED', 'NORMALIZED', 'DEDUPLICATED', 'SCORED', 'SELECTED',
  'RESUME_TAILORING', 'RESUME_REVIEW_REQUIRED', 'RESUME_APPROVED',
  'APPLICATION_INSPECTING', 'APPLICATION_REVIEW_REQUIRED', 'APPROVED_FOR_FILL',
  'FILLING', 'FILLED', 'VALIDATING', 'AWAITING_SUBMISSION_APPROVAL',
  'SUBMITTING', 'SUBMITTED', 'AUTH_REQUIRED', 'SECURITY_CHALLENGE_REQUIRED',
  'FORM_CHANGED', 'POLICY_BLOCKED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT',
  'CANCELLED', 'REJECTED',
  // Persisted compatibility states.
  'PREPARING', 'AWAITING_REVIEW', 'SECURITY_CHECK_REQUIRED', 'BLOCKED'
] as const;
export const ApplicationStateSchema = z.enum(applicationStates);
export type ApplicationState = z.infer<typeof ApplicationStateSchema>;

export const toolErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1).max(2_000),
  retryable: z.boolean(),
  userActionRequired: z.boolean().optional(),
  recommendedNextTool: z.string().max(100).optional(),
  correlationId: z.string().min(1).max(100),
  details: z.record(z.unknown()).optional(),
  // Deprecated response keys kept for old clients.
  actionRequired: z.string().max(2_000).optional(),
  diagnostics: z.record(z.unknown()).optional()
}).strict();
export const ToolFailureSchema = z.object({ ok: z.literal(false), error: toolErrorSchema }).strict();
export const toolSuccessSchema = <T extends z.ZodTypeAny>(data: T) => z.object({
  ok: z.literal(true), data, correlationId: z.string().min(1).max(100)
}).strict();
export type ToolSuccess<T> = { ok: true; data: T; correlationId: string };
export type ToolFailure = z.infer<typeof ToolFailureSchema>;
export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export const connectorIds = [
  'wuzzuf', 'indeed', 'linkedin', 'bayt', 'glassdoor', 'ziprecruiter',
  'greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters', 'workday',
  'employer-site', 'email', 'unsupported', 'development'
] as const;
export const ConnectorIdSchema = z.enum(connectorIds);
export type ConnectorId = z.infer<typeof ConnectorIdSchema>;

export const ConnectorCapabilitiesSchema = z.object({
  discovery: z.enum(['official_api', 'browser_automated', 'user_triggered', 'unsupported']),
  details: z.enum(['official_api', 'browser_automated', 'user_triggered', 'unsupported']),
  fill: z.enum(['automated', 'assisted', 'manual', 'unsupported']),
  submit: z.enum(['authorized_api', 'browser_approved', 'manual', 'unsupported']),
  requiresUserPresence: z.boolean(),
  requiresSubmissionApproval: z.boolean()
}).strict();
export type ConnectorCapabilities = z.infer<typeof ConnectorCapabilitiesSchema>;

export const SitePolicySchema = z.object({
  connectorId: ConnectorIdSchema,
  version: z.string().min(1).max(50),
  enabledByDefault: z.boolean(),
  capabilities: ConnectorCapabilitiesSchema,
  allowedHosts: z.array(z.string().min(1).max(253)).max(20),
  notes: z.string().max(1_000)
}).strict();
export type SitePolicy = z.infer<typeof SitePolicySchema>;

export const JobSourceSchema = z.object({
  connectorId: ConnectorIdSchema,
  externalId: z.string().min(1).max(500),
  discoveredAt: z.string().datetime(),
  discoveryMode: ConnectorCapabilitiesSchema.shape.discovery
}).strict();
export type JobSource = z.infer<typeof JobSourceSchema>;

export const ApplicationDestinationSchema = z.object({
  adapterId: ConnectorIdSchema,
  url: z.string().url().max(4_000),
  detectedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  supported: z.boolean()
}).strict();
export type ApplicationDestination = z.infer<typeof ApplicationDestinationSchema>;

export const NormalizedJobSchema = z.object({
  id: z.string().min(1).max(100),
  fingerprint: z.string().min(16).max(128),
  title: z.string().min(1).max(500),
  employer: z.string().min(1).max(500),
  location: z.string().max(500),
  description: z.string().max(100_000),
  url: z.string().url().max(4_000),
  source: JobSourceSchema,
  applicationDestination: ApplicationDestinationSchema.optional(),
  requiredSkills: z.array(z.string().max(200)).max(200).default([]),
  preferredSkills: z.array(z.string().max(200)).max(200).default([]),
  remote: z.boolean().default(false),
  matchScore: z.number().min(0).max(100).optional()
}).strict();
export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

export const CanonicalFieldIdSchema = z.enum([
  'identity.first_name', 'identity.middle_name', 'identity.last_name', 'identity.full_name',
  'contact.email', 'contact.phone', 'contact.address', 'contact.city', 'contact.region',
  'contact.postal_code', 'contact.country', 'employment.current_company',
  'employment.current_title', 'employment.years_experience', 'employment.notice_period',
  'education.highest_level', 'education.school', 'education.degree', 'education.field',
  'links.linkedin', 'links.github', 'links.portfolio', 'links.website',
  'application.resume', 'application.cover_letter', 'application.salary_expectation',
  'application.work_authorization', 'application.sponsorship_required',
  'application.relocation', 'application.remote_preference', 'application.custom'
]);
export type CanonicalFieldId = z.infer<typeof CanonicalFieldIdSchema>;

export const CanonicalFormFieldSchema = z.object({
  id: z.string().min(1).max(500),
  canonicalId: CanonicalFieldIdSchema,
  label: z.string().min(1).max(1_000),
  type: z.enum(['text', 'email', 'tel', 'number', 'textarea', 'select', 'radio', 'checkbox', 'file']),
  required: z.boolean(),
  sensitive: z.boolean(),
  options: z.array(z.string().max(500)).max(500).optional(),
  mappingConfidence: z.number().min(0).max(1),
  step: z.number().int().min(0)
}).strict();
export type CanonicalFormField = z.infer<typeof CanonicalFormFieldSchema>;

export const FormFingerprintSchema = z.object({
  normalizedUrl: z.string().url().max(4_000), fieldsHash: z.string().min(16).max(128),
  submitControlHash: z.string().min(16).max(128), formVersion: z.string().min(16).max(128),
  capturedAt: z.string().datetime(), stepFingerprints: z.array(z.string().min(16).max(128)).optional()
}).strict();
export type FormFingerprint = z.infer<typeof FormFingerprintSchema>;

export const ApplicationFormSchema = z.object({
  destination: ApplicationDestinationSchema,
  fields: z.array(CanonicalFormFieldSchema).max(500),
  fingerprint: FormFingerprintSchema,
  stepCount: z.number().int().min(1).max(100)
}).strict();
export type ApplicationForm = z.infer<typeof ApplicationFormSchema>;

export const VerifiedFactSchema = z.object({
  id: z.string().min(1).max(100), path: z.string().min(1).max(500),
  value: z.union([z.string().max(100_000), z.number(), z.boolean()]),
  sourceArtifactId: z.string().min(1).max(100), sourceLocation: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1), status: z.enum(['extracted', 'verified', 'rejected']),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
}).strict();
export type VerifiedFact = z.infer<typeof VerifiedFactSchema>;

export const ResumeSourceSchema = z.object({
  id: z.string().min(1).max(100), profileId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(500), mediaType: z.enum(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/markdown', 'text/plain', 'application/json', 'application/yaml']),
  sha256: z.string().length(64), size: z.number().int().min(1), approved: z.boolean(), createdAt: z.string().datetime()
}).strict();
export type ResumeSource = z.infer<typeof ResumeSourceSchema>;

export const TailoringChangeSchema = z.object({
  kind: z.enum(['emphasize', 'remove', 'reorder', 'rewrite', 'keyword']),
  section: z.string().min(1).max(200), before: z.string().max(10_000).optional(),
  after: z.string().max(10_000).optional(), supportingFactIds: z.array(z.string().min(1).max(100)).min(1).max(100)
}).strict();
export type TailoringChange = z.infer<typeof TailoringChangeSchema>;

export const TailoredResumeSchema = z.object({
  id: z.string().min(1).max(100), sourceResumeId: z.string().min(1).max(100),
  profileSnapshotId: z.string().min(1).max(100), jobId: z.string().min(1).max(100),
  jobFingerprint: z.string().min(16).max(128), tailoringPlan: z.array(TailoringChangeSchema).max(500),
  selectedFactIds: z.array(z.string().min(1).max(100)).min(1).max(1_000),
  generatedDocumentHash: z.string().length(64), pdfArtifactId: z.string().min(1).max(100).optional(),
  approved: z.boolean(), createdAt: z.string().datetime()
}).strict();
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

export const ArtifactSchema = z.object({
  id: z.string().min(1).max(100), kind: z.enum(['resume-source', 'resume-json', 'resume-html', 'resume-pdf', 'tailoring-diff', 'validation-report', 'cover-letter']),
  mediaType: z.string().min(1).max(200), sha256: z.string().length(64), size: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
}).strict();
export type Artifact = z.infer<typeof ArtifactSchema>;

export const genericRuntimeToolNames = [
  'job_automation_status', 'job_automation_doctor', 'job_automation_emergency_stop',
  'job_automation_clear_emergency_stop', 'job_automation_get_audit_events',
  'jobs_get_connector_capabilities', 'jobs_get_connection_status', 'jobs_open_login',
  'candidate_profile_list', 'candidate_profile_get', 'candidate_profile_update_preferences',
  'candidate_profile_list_resumes', 'candidate_profile_import_resume', 'candidate_profile_select_resume',
  'candidate_profile_approve_resume', 'candidate_profile_get_resume_variants', 'jobs_search',
  'jobs_import_current_page', 'jobs_get_details', 'jobs_score', 'jobs_explain_match',
  'jobs_shortlist', 'jobs_reject', 'jobs_tailor_resume', 'jobs_get_tailored_resume_review',
  'jobs_approve_tailored_resume', 'jobs_get_resume_artifact', 'jobs_prepare_application',
  'jobs_get_application_review', 'jobs_set_application_answer', 'jobs_fill_application',
  'jobs_validate_application', 'jobs_request_submission_approval', 'jobs_submit_application',
  'jobs_cancel_application', 'jobs_get_application_status', 'campaign_create', 'campaign_preview',
  'campaign_update', 'campaign_run', 'campaign_pause', 'campaign_resume', 'campaign_cancel',
  'campaign_get', 'campaign_list', 'campaign_get_activity'
] as const;

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

export const WuzzufSearchInputSchema = z.object({
  queries: z.array(z.string().min(1).max(200)).min(1).max(10),
  locations: z.array(z.string().min(1).max(200)).min(1).max(10),
  remote: z.boolean().optional(), experienceLevel: z.string().max(100).optional(),
  employmentTypes: z.array(z.string().max(100)).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional()
}).strict();
export type WuzzufSearchInput = z.infer<typeof WuzzufSearchInputSchema>;

export const queueJobTypes = [
  'connector.verify-auth', 'jobs.search', 'jobs.read-details', 'application.inspect',
  'application.fill', 'application.validate', 'application.submit', 'application.cleanup',
  'resume.render', 'campaign.execute',
  // Compatibility job names.
  'wuzzuf.verify-auth', 'wuzzuf.search', 'wuzzuf.fetch-details', 'wuzzuf.score-job',
  'wuzzuf.prepare-application', 'wuzzuf.fill-application', 'wuzzuf.submit-application',
  'wuzzuf.cleanup-browser'
] as const;
export type QueueJobType = typeof queueJobTypes[number];
export interface QueueJob {
  id: string; type: QueueJobType; payload: unknown;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  attempts: number; maxAttempts: number; runAfter: string; lockedBy?: string;
  lockedAt?: string; correlationId: string; createdAt: string; updatedAt: string;
}

export const clientScopes = [
  'profile:read', 'profile:write', 'jobs:search', 'jobs:read', 'artifacts:read',
  'applications:prepare', 'applications:fill', 'applications:review',
  'applications:approve', 'applications:submit', 'campaigns:read',
  'campaigns:manage', 'audit:read', 'admin:emergency-stop', 'worker:execute'
] as const;
export type ClientScope = typeof clientScopes[number];
