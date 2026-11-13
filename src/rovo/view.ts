import { draftAcknowledgement } from '../case/analyse';
import type { FairReplyCase } from '../case/types';
import { pointReplyLine } from '../detect/coverage';
import { SHORT_DISCLAIMER } from '../legal/disclaimer';
import { confirmationHistory, panelFromCase } from '../panel/model';
import { isAtRisk } from '../workflow/remind';

/** Comment reads per list call. Keeps the action inside Forge's invocation budget. */
export const AT_RISK_REFRESH_LIMIT = 8;

export const REMINDER_NOTE =
  'Reminders are internal notes. They do not send the customer reply and they do not resolve the request.';

export const PERSON_RESOLVES = 'Ready to close allows the transition. A person resolves.';

export const AT_RISK_EMPTY =
  'No stored complaints are inside this horizon. The list reads the KVS mirror, not every work item on the site.';

export interface PointView {
  text: string;
  answered: boolean;
  /** Covering citation, or a checked-did-not-cover line. Null when no sentence was checked. */
  citation: string | null;
}

export function pointsView(record: FairReplyCase): PointView[] {
  return panelFromCase(record).points.map((point) => ({
    text: point.text,
    answered: point.answered,
    citation: pointReplyLine(point.answered, point.fragment),
  }));
}

export function complaintStatusView(issueKey: string, record: FairReplyCase | null) {
  if (!record) return { issueKey, found: false as const, message: 'No Fair Reply case is stored yet.' };
  const panel = panelFromCase(record);
  return {
    issueKey,
    found: true as const,
    headline: panel.headline,
    clockBadge: panel.clockBadge,
    whyClock: panel.whyClock,
    ruleLabel: record.ruleLabel,
    deadlineAt: record.deadlineAt,
    category: record.category,
    isComplaint: record.isComplaint,
    quote: record.quote,
    confirmation: record.confirmation,
    confirmationReason: record.confirmationReason ?? null,
    confirmationAt: record.confirmationAt ?? null,
    confirmationHistory: confirmationHistory(record),
    enforcementLine: panel.enforcementLine,
    gapsWarning: panel.gapsWarning,
    article137Reminder: panel.article137Reminder,
    article136Reminder: panel.article136Reminder,
    obligationLine: panel.obligationLine,
    hasPublicReply: record.hasPublicReply,
    points: pointsView(record),
    readyToClose: panel.headline === 'Ready to close',
    personResolves: PERSON_RESOLVES,
    reminderNote: REMINDER_NOTE,
    disclaimer: SHORT_DISCLAIMER,
  };
}

export interface AtRiskRefreshStats {
  refreshLimit: number;
  refreshed: number;
  skipped: number;
  deferred: number;
}

/**
 * Refresh the soonest at-risk cases, at most `limit` of them.
 * A thrown read is a skip: that case stays on the stored record.
 */
export async function refreshAtRiskRows(
  rows: Array<{ issueKey: string; record: FairReplyCase }>,
  now: Date,
  horizonHours: number,
  refresh: (issueKey: string, record: FairReplyCase) => Promise<FairReplyCase>,
  limit = AT_RISK_REFRESH_LIMIT,
): Promise<{ rows: Array<{ issueKey: string; record: FairReplyCase }>; stats: AtRiskRefreshStats }> {
  const atRisk = rows
    .filter((row) => isAtRisk(row.record, now, horizonHours))
    .sort((left, right) => new Date(left.record.deadlineAt ?? 0).getTime() - new Date(right.record.deadlineAt ?? 0).getTime());
  const selected = new Set(atRisk.slice(0, limit).map((row) => row.issueKey));
  let refreshed = 0;
  let skipped = 0;
  const next: Array<{ issueKey: string; record: FairReplyCase }> = [];
  for (const row of rows) {
    if (!selected.has(row.issueKey)) {
      next.push(row);
      continue;
    }
    try {
      const record = await refresh(row.issueKey, row.record);
      if (record !== row.record) refreshed += 1;
      next.push({ issueKey: row.issueKey, record });
    } catch {
      skipped += 1;
      next.push(row);
    }
  }
  return {
    rows: next,
    stats: {
      refreshLimit: limit,
      refreshed,
      skipped,
      deferred: Math.max(0, atRisk.length - limit),
    },
  };
}

export function atRiskView(
  rows: Array<{ issueKey: string; record: FairReplyCase }>,
  now: Date,
  horizonHours = 48,
  stats?: AtRiskRefreshStats,
) {
  const complaints = rows
    .filter((row) => isAtRisk(row.record, now, horizonHours))
    .map((row) => {
      const status = complaintStatusView(row.issueKey, row.record);
      return {
        issueKey: row.issueKey,
        headline: status.found ? status.headline : 'Not classified yet',
        clockBadge: status.found ? status.clockBadge : null,
        ruleLabel: row.record.ruleLabel,
        deadlineAt: row.record.deadlineAt,
        category: row.record.category,
        points: status.found ? status.points : [],
      };
    });
  return {
    horizonHours,
    count: complaints.length,
    emptyMessage: complaints.length === 0 ? AT_RISK_EMPTY : null,
    complaints,
    refreshLimit: stats?.refreshLimit ?? AT_RISK_REFRESH_LIMIT,
    refreshed: stats?.refreshed ?? 0,
    skipped: stats?.skipped ?? 0,
    deferred: stats?.deferred ?? 0,
    reminderNote: REMINDER_NOTE,
    personResolves: PERSON_RESOLVES,
    disclaimer: SHORT_DISCLAIMER,
  };
}

export function coverageView(issueKey: string, record: FairReplyCase | null) {
  const status = complaintStatusView(issueKey, record);
  if (!status.found) return status;
  return {
    issueKey,
    found: true as const,
    headline: status.headline,
    clockBadge: status.clockBadge,
    whyClock: status.whyClock,
    ruleLabel: status.ruleLabel,
    hasPublicReply: status.hasPublicReply,
    confirmation: status.confirmation,
    confirmationReason: status.confirmationReason,
    confirmationAt: status.confirmationAt,
    confirmationHistory: status.confirmationHistory,
    enforcementLine: status.enforcementLine,
    gapsWarning: status.gapsWarning,
    article137Reminder: status.article137Reminder,
    article136Reminder: status.article136Reminder,
    obligationLine: status.obligationLine,
    readyToClose: status.readyToClose,
    points: status.points,
    personResolves: PERSON_RESOLVES,
    disclaimer: SHORT_DISCLAIMER,
  };
}

export function draftView(issueKey: string, record: FairReplyCase | null) {
  const draft = draftAcknowledgement(record, issueKey);
  const status = record ? complaintStatusView(issueKey, record) : null;
  return {
    issueKey,
    text: draft.text,
    agentNote: draft.agentNote,
    sent: false as const,
    posted: false as const,
    customerReplySent: false as const,
    reference: draft.reference,
    headline: status?.found ? status.headline : 'Not classified yet',
    clockBadge: status?.found ? status.clockBadge : null,
    ruleLabel: record?.ruleLabel ?? null,
    personResolves: PERSON_RESOLVES,
    disclaimer: SHORT_DISCLAIMER,
  };
}
