import type { ApplicationDestination, ApplicationForm, ConnectorCapabilities, NormalizedJob } from '../../shared-contracts/src/index.ts';

export interface ConnectorContext { correlationId: string; userPresent: boolean; dryRun: boolean; signal: AbortSignal }
export interface DetectionResult { matched: boolean; confidence: number }
export interface JobSearchRequest { queries: string[]; locations: string[]; remote?: boolean; limit?: number }
export interface CurrentPageImportRequest { url: string; jsonLd?: unknown; safeMetadata?: Record<string, string | string[] | boolean | undefined> }
export interface JobDetailsRequest { externalId?: string; url?: string }

export interface JobSourceConnector {
  id: string;
  detect(url: URL): Promise<DetectionResult>;
  capabilities(context: ConnectorContext): Promise<ConnectorCapabilities>;
  search?(request: JobSearchRequest): Promise<NormalizedJob[]>;
  importCurrentPage?(request: CurrentPageImportRequest): Promise<NormalizedJob>;
  getJobDetails?(request: JobDetailsRequest): Promise<NormalizedJob>;
}

export interface DestinationDetection { matched: boolean; destination?: ApplicationDestination }
export interface InspectApplicationRequest { destination: ApplicationDestination; context: ConnectorContext }
export interface FillApplicationRequest { form: ApplicationForm; answers: Record<string, string>; context: ConnectorContext }
export interface FillApplicationResult { filledFieldIds: string[]; skippedFieldIds: string[]; operationId: string }
export interface ValidateApplicationRequest { form: ApplicationForm; context: ConnectorContext }
export interface ValidationResult { valid: boolean; errors: Array<{ fieldId?: string | undefined; message: string }> }
export interface SubmitApplicationRequest { form: ApplicationForm; approvalId: string; context: ConnectorContext }
export interface SubmissionResult { status: 'submitted' | 'already_applied' | 'verification_required'; confirmationReference?: string }

export interface ApplicationDestinationAdapter {
  id: string;
  detect(url: URL, metadata?: Record<string, unknown>): Promise<DestinationDetection>;
  capabilities(context: ConnectorContext): Promise<ConnectorCapabilities>;
  inspect(request: InspectApplicationRequest): Promise<ApplicationForm>;
  fill(request: FillApplicationRequest): Promise<FillApplicationResult>;
  validate(request: ValidateApplicationRequest): Promise<ValidationResult>;
  submit?(request: SubmitApplicationRequest): Promise<SubmissionResult>;
  cancelOperation?(operationId: string): Promise<void>;
}
