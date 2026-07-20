import type { ApplicationState, ErrorCode } from '../../shared-contracts/src/index.ts';

export const allowedTransitions: Readonly<Record<ApplicationState, readonly ApplicationState[]>> = {
  DISCOVERED: ['SCORED', 'CANCELLED'], SCORED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['AWAITING_REVIEW', 'AUTH_REQUIRED', 'SECURITY_CHECK_REQUIRED', 'FORM_CHANGED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'],
  AWAITING_REVIEW: ['APPROVED_FOR_FILL', 'CANCELLED'], APPROVED_FOR_FILL: ['FILLING', 'CANCELLED'],
  FILLING: ['FILLED', 'FORM_CHANGED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT', 'CANCELLED'],
  FILLED: ['AWAITING_SUBMISSION_APPROVAL', 'CANCELLED'],
  AWAITING_SUBMISSION_APPROVAL: ['SUBMITTING', 'FORM_CHANGED', 'CANCELLED'],
  SUBMITTING: ['SUBMITTED', 'FAILED_PERMANENT'], SUBMITTED: [], AUTH_REQUIRED: ['PREPARING', 'CANCELLED'],
  SECURITY_CHECK_REQUIRED: ['PREPARING', 'CANCELLED'], FORM_CHANGED: ['PREPARING', 'CANCELLED'],
  BLOCKED: ['CANCELLED'], FAILED_RETRYABLE: ['PREPARING', 'CANCELLED'], FAILED_PERMANENT: [], CANCELLED: []
};

export class WorkflowConflictError extends Error { readonly code: ErrorCode = 'WORKFLOW_STATE_CONFLICT'; }
export function assertWorkflowTransition(from: ApplicationState, to: ApplicationState): void {
  if (!allowedTransitions[from].includes(to)) throw new WorkflowConflictError(`Invalid application transition ${from} -> ${to}`);
}
export interface ApplicationTransitionEvent {
  applicationId: string; previousState: ApplicationState; nextState: ApplicationState;
  correlationId: string; timestamp: string; actor: string; detail: Record<string, unknown>; errorCode?: ErrorCode;
}
