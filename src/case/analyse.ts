import type { FairReplyCase } from './types';
import { deadlineFor } from '../legal/deadlines';
import { followUpObligation } from '../legal/followUp';
import { guessLanguage } from '../legal/sameLanguage';
import type { ComplaintCategory } from '../legal/assumptions';
import { explainCoverage } from '../detect/coverage';
import { pointsFor, type LlmComplete, detectHybrid } from '../detect/hybrid';

export interface TicketInput {
  summary: string;
  description: string;
  created: string;
  customerComments?: string[];
  agentPublicReplies?: string[];
  /** Public comment bodies in read order, including customer comments and agent replies. */
  publicComments?: string[];
  previous?: FairReplyCase | null;
  llmEnabled?: boolean;
  llmComplete?: LlmComplete;
}

export function ticketText(input: Pick<TicketInput, 'summary' | 'description' | 'customerComments'>): string {
  return [input.summary, input.description, ...(input.customerComments ?? [])]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
}

export async function analyseTicket(input: TicketInput): Promise<FairReplyCase> {
  if (input.previous?.confirmation === 'dismissed') {
    return {
      ...input.previous,
      isComplaint: false,
      deadlineAt: null,
      ruleLabel: 'Marked as not a complaint by a human',
      analysedPublicComments: input.publicComments ?? input.previous.analysedPublicComments ?? [],
      resolvedWithGapsAt: null,
    };
  }

  const text = ticketText(input);
  const detection = await detectHybrid(text, {
    llmEnabled: input.llmEnabled ?? false,
    llmComplete: input.llmComplete,
  });
  const forcedComplaint = input.previous?.confirmation === 'confirmed';
  const isComplaint = forcedComplaint || detection.isComplaint;
  let category: ComplaintCategory = detection.category;
  if (isComplaint && category === 'none') {
    category = input.previous?.category && input.previous.category !== 'none' ? input.previous.category : 'general';
  }
  if (!isComplaint) category = 'none';

  const points = isComplaint ? pointsFor(text, detection) : [];
  const replies = input.agentPublicReplies ?? [];
  const coverage = explainCoverage(points, replies);
  const answered = coverage.map((row) => row.answered);
  const replyFragments = coverage.map((row) => row.fragment);
  const deadline = deadlineFor(input.created, category);
  const followUp = followUpObligation(text, input.created);
  const readyToClose = isComplaint && replies.length > 0 && answered.every(Boolean) && points.length > 0;

  return {
    isComplaint,
    quote: isComplaint ? detection.quote : null,
    category,
    startedAt: deadline.startedAt,
    deadlineAt: deadline.deadlineAt,
    points,
    answered,
    replyFragments,
    confirmation: input.previous?.confirmation ?? 'pending',
    confirmationReason: input.previous?.confirmationReason ?? null,
    confirmationAt: input.previous?.confirmationAt ?? null,
    hasPublicReply: replies.length > 0,
    analysedPublicComments: input.publicComments ?? replies,
    engine: detection.engine,
    needsHumanReview: detection.needsHumanReview || detection.ambiguous,
    remindedAt: input.previous?.remindedAt ?? null,
    validatorLastSeenAt: input.previous?.validatorLastSeenAt ?? null,
    resolvedWithGapsAt: readyToClose ? null : (input.previous?.resolvedWithGapsAt ?? null),
    ruleLabel: deadline.ruleLabel,
    followUpDeadlineAt: followUp?.deadlineAt ?? null,
    followUpRuleLabel: followUp?.ruleLabel ?? null,
    followUpCategory: followUp?.category ?? null,
    filingLanguage: guessLanguage(text),
  };
}

const REASON_LIMIT = 300;

export function applyConfirmation(
  record: FairReplyCase,
  decision: 'confirmed' | 'dismissed',
  reason: string,
  decidedAt: string,
): FairReplyCase {
  const trimmed = reason.trim().slice(0, REASON_LIMIT);
  if (!trimmed) return record;
  if (decision === 'dismissed') {
    return {
      ...record,
      isComplaint: false,
      confirmation: 'dismissed',
      confirmationReason: trimmed,
      confirmationAt: decidedAt,
      deadlineAt: null,
      resolvedWithGapsAt: null,
      ruleLabel: 'Marked as not a complaint by a human',
    };
  }
  const category = record.category === 'none' ? 'general' : record.category;
  const keepDeadline = record.deadlineAt != null && record.category !== 'none';
  const derived = deadlineFor(record.startedAt, category);
  return {
    ...record,
    isComplaint: true,
    confirmation: 'confirmed',
    confirmationReason: trimmed,
    confirmationAt: decidedAt,
    category,
    startedAt: record.startedAt,
    deadlineAt: keepDeadline ? record.deadlineAt : derived.deadlineAt,
    ruleLabel: keepDeadline ? record.ruleLabel : derived.ruleLabel,
    needsHumanReview: false,
  };
}

/** Stable reference printed on a draft. The draft is never posted. */
export function acknowledgementReference(issueKey?: string | null): string {
  const key = issueKey?.trim();
  return key ? `FR-${key}` : 'FR-PENDING';
}

/** Agent-only. Not part of the customer-facing draft. */
export function acknowledgementAgentNote(reference: string): string {
  return [
    `Agent draft marker: ${reference}`,
    'That marker does not fulfil article 12. It is not the identifying key the customer should receive. You provide that key, in the form your process requires.',
    'This draft has not been sent.',
  ].join('\n');
}

function draftLanguage(record: FairReplyCase | null): 'es' | 'en' {
  return record?.filingLanguage === 'es' ? 'es' : 'en';
}

function customerTiming(record: FairReplyCase, language: 'es' | 'en'): string {
  if (!record.deadlineAt) {
    return language === 'es' ? 'Todavía no hay un plazo fijado.' : 'A deadline has not been set.';
  }
  if (record.category === 'billing') {
    return language === 'es'
      ? 'Nos proponemos responder en 5 días naturales desde su mensaje. Ese plazo es una hipótesis de trabajo, no un compromiso.'
      : 'We aim to reply within 5 calendar days of your message. That timing is a working assumption, not a promise.';
  }
  if (record.category === 'outage') {
    return language === 'es'
      ? 'Nos proponemos enviar una respuesta informativa en 2 horas desde su mensaje, sobre la causa conocida y cuándo se espera el restablecimiento. No es un compromiso de reparación.'
      : 'We aim to send an informative reply within 2 hours of your message, about the known cause and when service is expected to return. That is not a promise to repair.';
  }
  return language === 'es'
    ? 'Nos proponemos responder en un máximo de 15 días hábiles desde su mensaje, y antes si podemos. Ese plazo es una hipótesis de trabajo, no un compromiso.'
    : 'We aim to reply within 15 business days of your message, and sooner when we can. That timing is a working assumption, not a promise.';
}

export function draftAcknowledgement(
  record: FairReplyCase | null,
  issueKey?: string | null,
): { text: string; agentNote: string; sent: false; reference: string } {
  const reference = acknowledgementReference(issueKey);
  const agentNote = acknowledgementAgentNote(reference);
  const language = draftLanguage(record);
  if (!record || !record.isComplaint) {
    const text = language === 'es'
      ? 'Estimado cliente:\n\nGracias por su mensaje. Una persona comprobará si debe tratarse como una reclamación antes de enviar cualquier respuesta.'
      : 'Hello,\n\nThank you for your message. A person will check whether it should be handled as a complaint before any reply is sent.';
    return { sent: false, reference, text, agentNote };
  }
  const pointLines = record.points.length
    ? record.points.map((point, index) => `${index + 1}. ${point}`).join('\n')
    : language === 'es'
      ? 'No se han extraído puntos separados.'
      : 'No separate points were extracted.';
  const text = language === 'es'
    ? [
        'Estimado cliente:',
        '',
        'Gracias por escribirnos. Hemos leído su mensaje. Una persona revisará esta respuesta antes de enviarla.',
        '',
        record.quote ? `Usted escribió: "${record.quote}"` : 'No hemos podido citar una frase de forma automática.',
        'Responderemos a estos puntos:',
        pointLines,
        customerTiming(record, 'es'),
      ].join('\n')
    : [
        'Hello,',
        '',
        'Thank you for writing. We have read your message. A person will check this reply before it is sent.',
        '',
        record.quote ? `You wrote: "${record.quote}"` : 'We could not cite a single sentence automatically.',
        'We will answer these points:',
        pointLines,
        customerTiming(record, 'en'),
      ].join('\n');
  return { sent: false, reference, text, agentNote };
}
