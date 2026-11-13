import { categorize } from '../detect/rules';
import type { ComplaintCategory } from './assumptions';
import { deadlineFor } from './deadlines';
import { fold } from '../text/sentences';

/**
 * A consulta or incidencia that still needs a later response.
 * This does not decide isComplaint. Immediate how-to questions and thank-you notes stay outside.
 */
const LATER_ACTION = /\b(cambio de tarifa|cambiar la tarifa|tariff change|cambio de titular|dar de baja|solicito la baja|solicitar la baja|baja del contrato|baja del suministro|cancel(?:ar|acion|lation)|fault report|aviso de averia)\b/;
const IMMEDIATE = /\b(horario|opening hours|office hours|gracias|thank you|thanks)\b/;
const HOW_TO = /(^|\n)\s*(?:¿\s*)?(?:como|how do i|how can i|what is|where can|where do i)\b/;
/** Scheduled altas, bajas, holder changes, and future tariff switches. Not a current cut. */
const CONTRACT_ADMIN = /\b(cambio de tarifa|cambiar la tarifa|tariff change|cambio de titular|dar de baja|solicito la baja|solicitar la baja|baja del contrato|baja del suministro)\b/;
/** A fault report can be a continuity follow-up when categorize() already says outage. */
const FAULT_REPORT = /\b(fault report|aviso de averia)\b/;

export interface FollowUpObligation {
  category: Exclude<ComplaintCategory, 'none'>;
  deadlineAt: string;
  ruleLabel: string;
}

export function followUpObligation(text: string, createdIso: string): FollowUpObligation | null {
  const folded = fold(text);
  if (!LATER_ACTION.test(folded)) return null;
  if (IMMEDIATE.test(folded) || HOW_TO.test(folded)) return null;
  const clock = followUpClock(text, folded);
  const deadline = deadlineFor(createdIso, clock);
  if (!deadline.deadlineAt) return null;
  return { category: clock, deadlineAt: deadline.deadlineAt, ruleLabel: deadline.ruleLabel };
}

/**
 * categorize() clocks hidden complaints. A scheduled baja or a future tariff
 * switch is contract administration, so it stays on the general article 17.1 maximum.
 */
function followUpClock(text: string, folded: string): Exclude<ComplaintCategory, 'none'> {
  if (CONTRACT_ADMIN.test(folded)) return 'general';
  const category = categorize(text);
  if (category === 'outage' && FAULT_REPORT.test(folded)) return 'outage';
  return 'general';
}

export function obligationLine(obligation: FollowUpObligation, when: string): string {
  return `This is not a complaint clock. Article 17 can still set a response time for this consulta or incidencia. Informative deadline: ${when} (${obligation.ruleLabel}). Fair Reply does not treat this as a complaint. A person still reviews. This is not a universal SLA for every sector.`;
}
