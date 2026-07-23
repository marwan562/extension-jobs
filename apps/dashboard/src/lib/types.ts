export interface Summary {
  generatedAt: string;
  health: { daemon: 'online'; storage: 'ready'; browser: string; emergencyStop: boolean };
  counts: { jobs: number; shortlisted: number; applications: number; approvals: number; manualActions: number; campaigns: number };
  queue: Record<string, number>;
  matchDistribution: Array<{ label: string; count: number }>;
  campaignPulse: Array<{ id: string; name: string; state: 'enabled' | 'paused'; updatedAt: string }>;
  attention: Array<{ id: string; kind: string; title: string; detail: string }>;
}

export interface Job {
  id: string;
  title: string;
  employer: string;
  location: string;
  url: string;
  source: string;
  description: string;
  matchScore: number;
  scoreExplanation: Array<{ factor: string; points: number; reason: string }>;
  remote: boolean;
  discoveredAt?: string;
  disposition?: 'shortlisted' | 'rejected';
  tags: string[];
  note?: string;
  noteVersion?: number;
  applicationState?: string;
  applicationId?: string;
}

export interface Application {
  id: string;
  jobId: string;
  state: string;
  createdAt?: string;
  updatedAt?: string;
  dryRun?: boolean;
  job?: { title: string; employer: string; location: string };
  answers?: Array<{ fieldId: string; label: string; value: string; confirmationRequired: boolean; confidence: number }>;
  filledFields?: string[];
  skippedFields?: string[];
  validationErrors?: string[];
  sensitiveFields?: string[];
  submissionAllowed?: boolean;
  errors: Array<{ code?: string; message?: string; at?: string }>;
}

export interface ManualAction {
  id: string;
  applicationId?: string;
  kind: string;
  status: 'open' | 'continued' | 'cancelled';
  title: string;
  detail: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeSource {
  source: { id: string; profileId: string; displayName: string; mediaType: string; size: number; approved: boolean; createdAt: string };
  facts: Array<{ id: string; path: string; value: string | number | boolean; confidence: number; status: string; sourceLocation?: string }>;
}

export interface TailoredResume {
  tailoredResume: { id: string; sourceResumeId: string; jobId: string; approved: boolean; pdfArtifactId?: string; tailoringPlan: Array<{ kind: string; section: string; before?: string; after?: string; supportingFactIds: string[] }> };
  review: { changes: Array<{ kind: string; section: string; before?: string; after?: string }>; missingRequirements: string[] };
  validation: { valid: boolean; errors: string[]; warnings: string[] };
  artifacts?: { pdf?: { id: string } };
}

export interface Campaign {
  id: string;
  name: string;
  state: 'enabled' | 'paused';
  searchQueries: string[];
  locations: string[];
  workplace: string[];
  includedKeywords: string[];
  excludedKeywords: string[];
  seniority: string[];
  minimumMatchScore: number;
  allowedSites: string[];
  maxApplicationsPerRun: number;
  maxApplicationsPerDay: number;
  timezone?: string;
  executionMode: 'research_only' | 'prepare_and_review' | 'auto_submit';
  profileId: string;
  cvStrategy: string;
  providerId: string;
  model: string;
  dryRun: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Connector {
  enabled: boolean;
  policy: {
    connectorId: string;
    version: string;
    capabilities: { discovery: string; details: string; fill: string; submit: string; requiresUserPresence: boolean; requiresSubmissionApproval: boolean };
    allowedHosts: string[];
    notes: string;
  };
}

export interface Page<T> { items: T[]; nextCursor?: string; total: number }
