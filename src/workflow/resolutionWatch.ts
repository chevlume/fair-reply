import type { FairReplyCase } from '../case/types';
import { unansweredPoints } from '../detect/coverage';
import { TIMEZONE } from '../legal/assumptions';

/** Status fields already present on a Jira issue-updated event, when the product sends them. */
export interface IssueStatusSnapshot {
  statusName: string | null;
  statusCategoryKey: string | null;
}

const DONE_NAMES = new Set(['resolve', 'resolved', 'close', 'closed', 'done']);

export function readIssueStatus(event: {
  issue?: { fields?: { status?: { name?: string; statusCategory?: { key?: string } } } };
  changelog?: { items?: Array<{ field?: string; toString?: string }> };
} | null | undefined): IssueStatusSnapshot {
  const status = event?.issue?.fields?.status;
  const nameFromFields = status?.name?.trim() || null;
  const category = status?.statusCategory?.key?.trim() || null;
  const nameFromChangelog = event?.changelog?.items?.find((item) => item.field === 'status')?.toString?.trim() || null;
  return {
    statusName: nameFromFields ?? nameFromChangelog,
    statusCategoryKey: category,
  };
}

/** Category `done` wins. Names must match the whole status, not a substring of another word. */
export function isDoneStyleStatus(snapshot: IssueStatusSnapshot): boolean {
  if (snapshot.statusCategoryKey?.trim().toLowerCase() === 'done') return true;
  const name = snapshot.statusName?.trim().toLowerCase() ?? '';
  return DONE_NAMES.has(name);
}

export function isReadyToClose(record: FairReplyCase): boolean {
  if (!record.isComplaint || !record.hasPublicReply) return false;
  return unansweredPoints(record.points, record.answered).length === 0 && record.points.length > 0;
}

/**
 * The panel cannot read workflow rules with the current calls.
 * `manage:jira-configuration` can list workflows, but matching this Forge validator
 * to the published Resolve and Close transitions of one issue is not reliable
 * across company-managed and team-managed projects. Say the conditional instead.
 */
export const MONITORING_LINE =
  'If your admin has added the Fair Reply validator to Resolve/Close, those transitions are blocked while points are open; otherwise this panel only monitors.';

export function validatorSeenLine(seenAt: string): string {
  return `The Fair Reply validator last checked a resolve attempt at ${formatMadrid(seenAt)} (${TIMEZONE}).`;
}

export function monitoringOrValidatorLine(record: Pick<FairReplyCase, 'validatorLastSeenAt'>): string {
  return record.validatorLastSeenAt ? validatorSeenLine(record.validatorLastSeenAt) : MONITORING_LINE;
}

export function resolvedWithGapsLine(record: FairReplyCase): string | null {
  if (!record.isComplaint || !record.resolvedWithGapsAt || isReadyToClose(record)) return null;
  const open = unansweredPoints(record.points, record.answered);
  const point = open[0] ? ` Open point: ${open[0]}.` : '';
  const missingReply = record.hasPublicReply ? '' : ' There is no public reply.';
  const when = formatMadrid(record.resolvedWithGapsAt);
  return `This request was marked resolved while points were still uncovered (${when}, ${TIMEZONE}).${missingReply}${point} Fair Reply did not reverse that. That transition was not blocked.`;
}

export function resolutionGapNote(record: FairReplyCase): string {
  const open = unansweredPoints(record.points, record.answered);
  const lines = [
    'Fair Reply monitoring note.',
    record.hasPublicReply
      ? 'State: Uncovered points. This request was marked resolved while points were still uncovered.'
      : 'This request was marked resolved while there is no public reply.',
  ];
  if (open[0]) lines.push(`Open point: ${open[0]}`);
  lines.push(
    'Fair Reply did not reverse that status. This is monitoring because the validator may not be on that transition.',
    'This note is internal. It is not a customer reply and it does not resolve the request. Decision support, not legal advice.',
  );
  return lines.join('\n');
}

export interface ResolutionWatch {
  record: FairReplyCase;
  /** Internal note to post once. Null when no new warning is due. */
  note: string | null;
}

/**
 * Observe a status update. A done-style status on an uncovered complaint stamps
 * `resolvedWithGapsAt` and asks for one internal note. It does not change the issue status.
 */
export function observeDoneTransition(
  record: FairReplyCase,
  snapshot: IssueStatusSnapshot,
  observedAt: string,
): ResolutionWatch {
  if (!isDoneStyleStatus(snapshot)) return { record, note: null };
  if (!record.isComplaint || isReadyToClose(record)) {
    if (!record.resolvedWithGapsAt) return { record, note: null };
    return { record: { ...record, resolvedWithGapsAt: null }, note: null };
  }
  if (record.resolvedWithGapsAt) return { record, note: null };
  const next = { ...record, resolvedWithGapsAt: observedAt };
  return { record: next, note: resolutionGapNote(next) };
}

/** Record that the validator function ran. Leaves clocks, points, coverage, and confirmation alone. */
export function stampValidatorSeen(record: FairReplyCase, seenAt: string): FairReplyCase {
  return { ...record, validatorLastSeenAt: seenAt };
}

function formatMadrid(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
