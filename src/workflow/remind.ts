import type { FairReplyCase } from '../case/types';
import { unansweredPoints } from '../detect/coverage';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Due within 24 hours, or already due, and not reminded in the last 20 hours.
 * The schedule is fiveMinute, so a 2-hour continuity case is seen before that mark.
 * The 20-hour gap stops the five-minute job from posting on every tick.
 */
export function shouldRemind(record: FairReplyCase, now: Date): boolean {
  if (!record.isComplaint || !record.deadlineAt) return false;
  const openPoints = unansweredPoints(record.points, record.answered);
  const fullyAnswered = record.hasPublicReply && openPoints.length === 0 && record.points.length > 0;
  if (fullyAnswered) return false;
  if (!record.hasPublicReply || openPoints.length > 0 || record.points.length === 0) {
    const hoursLeft = (new Date(record.deadlineAt).getTime() - now.getTime()) / HOUR_MS;
    if (hoursLeft > 24) return false;
    if (!record.remindedAt) return true;
    return now.getTime() - new Date(record.remindedAt).getTime() >= 20 * HOUR_MS;
  }
  return false;
}

export function reminderText(record: FairReplyCase, issueKey: string): string {
  const open = unansweredPoints(record.points, record.answered);
  const openText = open.length ? open.map((point) => `- ${point}`).join('\n') : '- No public reply yet, or no points were extracted.';
  return [
    `Fair Reply reminder for ${issueKey}.`,
    `Deadline (${record.ruleLabel}): ${record.deadlineAt}.`,
    'Still open:',
    openText,
    'This is an internal note. It does not send a reply to the customer, it does not resolve the request, and it is not legal advice. A human confirms the deadline.',
  ].join('\n');
}

export function isAtRisk(record: FairReplyCase, now: Date, horizonHours = 48): boolean {
  if (!record.isComplaint || !record.deadlineAt) return false;
  const open = unansweredPoints(record.points, record.answered);
  if (record.hasPublicReply && open.length === 0 && record.points.length > 0) return false;
  const hoursLeft = (new Date(record.deadlineAt).getTime() - now.getTime()) / HOUR_MS;
  return hoursLeft <= horizonHours;
}
