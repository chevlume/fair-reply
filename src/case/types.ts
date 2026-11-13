import type { ComplaintCategory } from '../legal/assumptions';

/**
 * Issue property `fairreply.case`.
 * The first eight fields are the contract. The rest are operational flags
 * the panel, validator, and reminder need.
 */
export interface FairReplyCase {
  isComplaint: boolean;
  quote: string | null;
  category: ComplaintCategory;
  startedAt: string;
  deadlineAt: string | null;
  points: string[];
  answered: boolean[];
  /** Reply sentence checked for each point. Null when no public sentence mentioned it. */
  replyFragments?: Array<string | null>;
  confirmation: 'pending' | 'confirmed' | 'dismissed';
  /** Why a person confirmed or overruled the detector. Not a legal finding. */
  confirmationReason?: string | null;
  /** When the person decided. Review time, not a new filing time. */
  confirmationAt?: string | null;
  hasPublicReply: boolean;
  /** Public comment bodies already included in this case, in read order. */
  analysedPublicComments?: string[];
  engine: 'rules' | 'llm';
  needsHumanReview: boolean;
  remindedAt: string | null;
  /** When the workflow validator function last ran on this case. Null until an admin's transition invokes it. */
  validatorLastSeenAt?: string | null;
  /** When a done-style status was first seen while this complaint was not ready to close. */
  resolvedWithGapsAt?: string | null;
  ruleLabel: string;
  /** Article 17 follow-up for a non-complaint consulta or incidencia. Not a complaint deadline. */
  followUpDeadlineAt?: string | null;
  followUpRuleLabel?: string | null;
  followUpCategory?: 'general' | 'billing' | 'outage' | null;
  /** Clear Spanish or English guess for the filing. Null when the text is mixed or unclear. */
  filingLanguage?: 'es' | 'en' | null;
}

export const FAIR_REPLY_PROPERTY_KEY = 'fairreply.case';
export const KVS_INDEX_KEY = 'fairreply-index';

export function caseStorageKey(issueKey: string): string {
  return `fairreply-case-${issueKey}`;
}
