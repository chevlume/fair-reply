import {
  BILLING_CALENDAR_DAYS,
  GENERAL_BUSINESS_DAYS,
  OUTAGE_HOURS,
  type ComplaintCategory,
} from './assumptions';
import { addBusinessDays, addCalendarDays } from './businessDays';

export interface DeadlineResult {
  category: ComplaintCategory;
  startedAt: string;
  deadlineAt: string | null;
  /** Short English label for the panel. Not a statutory quotation. */
  ruleLabel: string;
}

export function deadlineFor(createdIso: string, category: ComplaintCategory): DeadlineResult {
  const started = new Date(createdIso);
  if (Number.isNaN(started.getTime())) {
    throw new Error('createdIso is not a valid timestamp');
  }
  if (category === 'none') {
    return {
      category,
      startedAt: started.toISOString(),
      deadlineAt: null,
      ruleLabel: 'No complaint deadline',
    };
  }
  if (category === 'outage') {
    const deadline = new Date(started.getTime() + OUTAGE_HOURS * 60 * 60 * 1000);
    return {
      category,
      startedAt: started.toISOString(),
      deadlineAt: deadline.toISOString(),
      ruleLabel: `${OUTAGE_HOURS} clock hours for an informative continuity reply (cause and expected restoration), not a repair promise`,
    };
  }
  if (category === 'billing') {
    const deadline = addCalendarDays(started, BILLING_CALENDAR_DAYS);
    return {
      category,
      startedAt: started.toISOString(),
      deadlineAt: deadline.toISOString(),
      ruleLabel: `${BILLING_CALENDAR_DAYS} calendar days (the law says 5 days and does not call them business days)`,
    };
  }
  const deadline = addBusinessDays(started, GENERAL_BUSINESS_DAYS);
  return {
    category,
    startedAt: started.toISOString(),
    deadlineAt: deadline.toISOString(),
    ruleLabel: `${GENERAL_BUSINESS_DAYS} business days maximum for a general complaint; aim sooner`,
  };
}
