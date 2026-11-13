import { DISCLAIMER, SCOPE_LINE, SCOPE_NOTE, SHORT_DISCLAIMER } from '../legal/disclaimer';
import { monitoringOrValidatorLine, resolvedWithGapsLine } from '../workflow/resolutionWatch';
import type { ComplaintCategory } from '../legal/assumptions';
import { TIMEZONE } from '../legal/assumptions';
import { draftAcknowledgement } from '../case/analyse';
import type { FairReplyCase } from '../case/types';
import { article137Reminder, unansweredPoints } from '../detect/coverage';
import { obligationLine } from '../legal/followUp';
import { article136Reminder } from '../legal/sameLanguage';

export interface PanelPoint {
  text: string;
  answered: boolean;
  fragment: string | null;
}

export type PanelPhase = 'waiting' | 'detected' | 'confirmed' | 'clear' | 'overridden' | 'error';
export type PanelTone = 'complaint' | 'clear' | 'overridden' | 'waiting' | 'error';
/** The four states a judge should be able to name: not a complaint, complaint with clock, uncovered points, ready to close. */
export type JudgeHeadline = 'Not a complaint' | 'Uncovered points' | 'Ready to close' | 'Not classified yet' | 'Could not load';

export interface PanelModel {
  state: 'empty' | 'error' | 'ready';
  tone: PanelTone;
  phase: PanelPhase;
  statusLine: string;
  /** One of the four judge-facing states, or a loading line before the first read. */
  headline: JudgeHeadline;
  /** Present on a complaint so the clock state stays visible beside uncovered points or ready to close. */
  clockBadge: 'Complaint with clock' | null;
  disclaimer: string;
  shortDisclaimer: string;
  scopeNote: string;
  scopeLine: string;
  whyClock: string;
  nextStep: string;
  createdAssumption: string;
  classification: string;
  quote: string | null;
  showQuote: boolean;
  categoryLabel: string;
  deadlineLabel: string;
  points: PanelPoint[];
  showPoints: boolean;
  unansweredCount: number;
  confirmation: FairReplyCase['confirmation'] | null;
  confirmationHistory: string | null;
  /** Monitoring, or the time the validator function last ran. */
  enforcementLine: string;
  /** Set when a done-style status was seen while the complaint was not ready to close. */
  gapsWarning: string | null;
  /** Art. 13.7 reminder. Not an unanswered point and not a block. */
  article137Reminder: string | null;
  /** Art. 13.6 reminder. Not an unanswered point and not a block. */
  article136Reminder: string | null;
  /** Article 17 follow-up for a non-complaint. Not a complaint clock and not a block. */
  obligationLine: string | null;
  /** Customer-facing acknowledgement only. Null when the section is hidden. */
  draftText: string | null;
  /** Agent-only marker note. Not part of the customer draft. */
  draftAgentNote: string | null;
  showDraft: boolean;
  /** Deadline section title. Not a list of gaps. */
  clockHeading: 'Deadline';
  /** Shown only when a customer point is still unanswered. */
  missingHeading: 'What is still missing' | null;
  quoteLabel: 'Sentence that makes it a complaint';
  draftSent: false;
  draftPosted: false;
  draftCustomerReplySent: false;
  needsHumanReview: boolean;
  errorMessage?: string;
}

export const CREATED_ASSUMPTION =
  'Demo anchor: issue created counts only when it matches filing of a complete case. A prior call, an imported message, or a later completion can move the legal start.';

function whyClock(category: ComplaintCategory): string {
  if (category === 'billing') {
    return 'The law says 5 days, without calling them business days. Prudent operational target: 5 calendar days; needs legal or sectoral review.';
  }
  if (category === 'outage') {
    return 'Informative reply within 2 clock hours about the known cause and expected restoration, for continuity on a basic continuous service. Not a promise to repair, and not the clock for every complaint.';
  }
  if (category === 'general') {
    return 'General maximum: 15 business days from filing, and sooner when you can. Sector rules may differ.';
  }
  return '';
}

function nextStep(phase: PanelPhase, unanswered: number, hasPublicReply: boolean): string {
  if (phase === 'detected' || phase === 'confirmed') {
    if (unanswered > 0 || !hasPublicReply) {
      return 'Next step: Uncovered points. Complaint with clock. A person confirms the reading. Each open point needs a public reply sentence that decides it, or a specific refusal. A later comment can cover a point an earlier comment left open. A generic thank-you does not count.';
    }
    return 'Next step: Ready to close. Complaint with clock. Each point quotes the public reply sentence that covered it. A person checks those sentences, then resolves if that is right.';
  }
  if (phase === 'overridden') {
    return 'Next step: Not a complaint. The complaint clock is cleared. A consulta or continuity question may still need a review.';
  }
  if (phase === 'clear') {
    return 'Next step: Not a complaint. A consulta or incidencia may still need a review, especially a continuity question.';
  }
  return 'Next step: wait for the first read, then a person confirms.';
}

function judgeHeadline(phase: PanelPhase, unanswered: number, hasPublicReply: boolean): Pick<PanelModel, 'headline' | 'clockBadge'> {
  if (phase === 'waiting') return { headline: 'Not classified yet', clockBadge: null };
  if (phase === 'error') return { headline: 'Could not load', clockBadge: null };
  if (phase === 'clear' || phase === 'overridden') return { headline: 'Not a complaint', clockBadge: null };
  if (unanswered > 0 || !hasPublicReply) return { headline: 'Uncovered points', clockBadge: 'Complaint with clock' };
  return { headline: 'Ready to close', clockBadge: 'Complaint with clock' };
}

/** Review note for the panel and Complaints Officer. Not a legal finding. */
export function confirmationHistory(record: Pick<FairReplyCase, 'confirmation' | 'confirmationAt' | 'confirmationReason'>): string | null {
  if ((record.confirmation !== 'confirmed' && record.confirmation !== 'dismissed') || !record.confirmationAt || !record.confirmationReason) {
    return null;
  }
  const when = formatMadrid(record.confirmationAt);
  if (record.confirmation === 'confirmed') {
    return `A person confirmed this complaint on ${when} (${TIMEZONE}). Reason: ${record.confirmationReason}. This review note is not a legal finding, and it does not restart the clock.`;
  }
  return `A person overruled the detector on ${when} (${TIMEZONE}). Reason: ${record.confirmationReason}. The complaint clock is cleared. This review note is not a legal finding.`;
}

function formatMadrid(iso: string | null): string {
  if (!iso) return 'Not set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function emptyPanel(): PanelModel {
  return {
    state: 'empty',
    tone: 'waiting',
    phase: 'waiting',
    statusLine: 'Waiting for the first read',
    headline: 'Not classified yet',
    clockBadge: null,
    disclaimer: DISCLAIMER,
    shortDisclaimer: SHORT_DISCLAIMER,
    scopeNote: SCOPE_NOTE,
    scopeLine: SCOPE_LINE,
    whyClock: '',
    nextStep: 'Next step: wait for the first read, then a person confirms.',
    createdAssumption: CREATED_ASSUMPTION,
    classification: 'Not classified yet',
    quote: null,
    showQuote: false,
    categoryLabel: '',
    deadlineLabel: 'The clock, if this is a complaint, starts from the time the request was created.',
    points: [],
    showPoints: false,
    unansweredCount: 0,
    confirmation: null,
    confirmationHistory: null,
    enforcementLine: monitoringOrValidatorLine({ validatorLastSeenAt: null }),
    gapsWarning: null,
    article137Reminder: null,
    article136Reminder: null,
    obligationLine: null,
    draftText: null,
    draftAgentNote: null,
    showDraft: false,
    clockHeading: 'Deadline',
    missingHeading: null,
    quoteLabel: 'Sentence that makes it a complaint',
    draftSent: false,
    draftPosted: false,
    draftCustomerReplySent: false,
    needsHumanReview: true,
  };
}

export function errorPanel(message: string): PanelModel {
  return {
    ...emptyPanel(),
    state: 'error',
    tone: 'error',
    phase: 'error',
    classification: 'Could not load',
    headline: 'Could not load',
    clockBadge: null,
    errorMessage: message,
  };
}

export function panelFromCase(record: FairReplyCase, issueKey?: string | null): PanelModel {
  const points = record.points.map((text, index) => ({
    text,
    answered: Boolean(record.answered[index]),
    fragment: record.replyFragments?.[index] ?? null,
  }));
  const unansweredCount = unansweredPoints(record.points, record.answered).length;
  const phase: PanelPhase = record.confirmation === 'dismissed'
    ? 'overridden'
    : record.isComplaint && record.confirmation === 'confirmed'
      ? 'confirmed'
      : record.isComplaint
        ? 'detected'
        : 'clear';
  const classification = phase === 'detected'
    ? 'Detected complaint'
    : phase === 'confirmed'
      ? 'Confirmed complaint'
      : phase === 'overridden'
        ? 'Not a complaint — overruled'
        : 'Not a complaint';
  const statusLine = phase === 'detected'
    ? 'Awaiting a person to confirm'
    : phase === 'confirmed'
      ? 'A person confirmed this complaint'
      : phase === 'overridden'
        ? 'A person overruled the detector'
        : 'The detector does not see a complaint';

  const started = formatMadrid(record.startedAt);
  const deadline = formatMadrid(record.deadlineAt);
  const categoryTitle =
    record.category === 'billing' ? 'Billing'
      : record.category === 'outage' ? 'Basic-service outage'
        : record.category === 'general' ? 'General'
          : 'Not a complaint';
  const deadlineLabel = record.isComplaint && record.deadlineAt
    ? `${categoryTitle}. Started ${started} from issue created (${TIMEZONE}). Deadline ${deadline} (${TIMEZONE}).`
    : 'No complaint clock is running.';

  const complaint = phase === 'detected' || phase === 'confirmed';
  const obligation = !complaint && record.followUpDeadlineAt && record.followUpRuleLabel && record.followUpCategory
    ? obligationLine({
      category: record.followUpCategory,
      deadlineAt: record.followUpDeadlineAt,
      ruleLabel: record.followUpRuleLabel,
    }, formatMadrid(record.followUpDeadlineAt))
    : null;
  const judged = judgeHeadline(phase, complaint ? unansweredCount : 0, Boolean(record.hasPublicReply));
  const showDraft = complaint && !record.hasPublicReply && judged.headline !== 'Ready to close';
  const draft = showDraft ? draftAcknowledgement(record, issueKey) : null;
  return {
    state: complaint ? 'ready' : 'empty',
    tone: complaint ? 'complaint' : phase === 'overridden' ? 'overridden' : 'clear',
    phase,
    statusLine,
    ...judged,
    disclaimer: DISCLAIMER,
    shortDisclaimer: SHORT_DISCLAIMER,
    scopeNote: SCOPE_NOTE,
    scopeLine: SCOPE_LINE,
    whyClock: complaint ? whyClock(record.category) : '',
    nextStep: nextStep(phase, complaint ? unansweredCount : 0, Boolean(record.hasPublicReply)),
    createdAssumption: CREATED_ASSUMPTION,
    classification,
    quote: complaint ? record.quote : null,
    showQuote: complaint && Boolean(record.quote),
    categoryLabel: complaint ? categoryTitle : '',
    deadlineLabel,
    points: complaint ? points : [],
    showPoints: complaint && points.length > 0,
    unansweredCount: complaint ? unansweredCount : 0,
    confirmation: record.confirmation,
    confirmationHistory: confirmationHistory(record),
    enforcementLine: monitoringOrValidatorLine(record),
    gapsWarning: resolvedWithGapsLine(record),
    article137Reminder: complaint ? article137Reminder(record) : null,
    article136Reminder: complaint ? article136Reminder(record) : null,
    obligationLine: obligation,
    draftText: draft?.text ?? null,
    draftAgentNote: draft?.agentNote ?? null,
    showDraft: Boolean(draft),
    clockHeading: 'Deadline',
    missingHeading: complaint && unansweredCount > 0 ? 'What is still missing' : null,
    quoteLabel: 'Sentence that makes it a complaint',
    draftSent: false,
    draftPosted: false,
    draftCustomerReplySent: false,
    needsHumanReview: record.needsHumanReview || record.confirmation === 'pending',
  };
}
