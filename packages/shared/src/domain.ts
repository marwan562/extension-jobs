export const applicationStates = [
  'DISCOVERED', 'NORMALIZED', 'DEDUPLICATED', 'SCORED', 'SELECTED',
  'APPLICATION_STARTED', 'QUESTIONS_EXTRACTED', 'ANSWERS_PREPARED',
  'WAITING_FOR_APPROVAL', 'FILLING', 'VALIDATING', 'READY_TO_SUBMIT',
  'SUBMITTING', 'SUBMITTED', 'SKIPPED', 'REJECTED_BY_USER', 'DUPLICATE',
  'AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'POLICY_BLOCKED', 'FAILED_RETRYABLE',
  'FAILED_PERMANENT', 'CANCELLED'
] as const;

export type ApplicationState = typeof applicationStates[number];
export type ExecutionMode = 'research_only' | 'prepare_and_review' | 'auto_submit';
export type FactKind = 'verified_fact' | 'preference' | 'approved_answer' | 'generated_prose' | 'unknown';

export interface ProfileFact {
  id: string;
  path: string;
  value: string | number | boolean;
  kind: FactKind;
  source: 'cv_import' | 'user_edit' | 'answer_approval';
  verifiedAt?: string;
}

export interface CandidateProfile {
  id: string;
  name: string;
  facts: ProfileFact[];
  cvVariants: Array<{ id: string; name: string; approved: boolean; sourceName: string }>;
  updatedAt: string;
}

export interface Schedule {
  cron: string;
  timezone: string;
  friendly: string;
  quietHours?: { start: string; end: string };
  missedRunPolicy: 'skip' | 'run_once';
  maximumRuntimeMinutes: number;
}

export interface JobCampaign {
  id: string;
  name: string;
  state: 'enabled' | 'paused';
  searchQueries: string[];
  locations: string[];
  workplace: Array<'remote' | 'hybrid' | 'onsite'>;
  includedKeywords: string[];
  excludedKeywords: string[];
  seniority: string[];
  minimumMatchScore: number;
  allowedSites: string[];
  maxApplicationsPerRun: number;
  maxApplicationsPerDay: number;
  schedule?: Schedule;
  executionMode: ExecutionMode;
  profileId: string;
  cvStrategy: string;
  providerId: string;
  model: string;
  dryRun: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RawJob {
  source: string;
  sourceId: string;
  url: string;
  title: string;
  employer: string;
  location: string;
  description: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  remote?: boolean;
  seniority?: string;
  salary?: string;
}

export interface Job extends RawJob {
  id: string;
  fingerprint: string;
  matchScore: number;
  scoreExplanation: Array<{ factor: string; points: number; reason: string }>;
}

export interface FieldAnswer {
  fieldId: string;
  label: string;
  value: string;
  confidence: number;
  supportingFactIds: string[];
  confirmationRequired: boolean;
  reason?: string;
  generatedAt: string;
  model: string;
}

export interface AuditEvent {
  id: string;
  correlationId: string;
  applicationId?: string;
  type: string;
  state?: ApplicationState;
  at: string;
  detail: Record<string, unknown>;
}

export interface AgentSettings {
  activeProfileId?: string;
  chatModel: string;
  answerModel: string;
  matchingModel: string;
  temperature: number;
  maximumAnswerLength: number;
  confidenceThreshold: number;
  maximumConcurrentRuns: number;
  defaultDryRun: boolean;
  browserHeadless: boolean;
  updatedAt: string;
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
