import { describe, expect, it } from 'vitest';
import { analyseTicket } from '../src/case/analyse';
import type { FairReplyCase } from '../src/case/types';
import { complaintStatusView } from '../src/rovo/view';
import { panelFromCase } from '../src/panel/model';
import {
  isDoneStyleStatus,
  MONITORING_LINE,
  observeDoneTransition,
  readIssueStatus,
  resolutionGapNote,
  stampValidatorSeen,
} from '../src/workflow/resolutionWatch';

const created = '2026-11-06T09:02:00.000Z';
const observedAt = '2026-11-07T11:10:00.000Z';

function uncovered(): FairReplyCase {
  return {
    isComplaint: true,
    quote: 'Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.',
    category: 'billing',
    startedAt: created,
    deadlineAt: '2026-11-11T09:02:00.000Z',
    points: ['Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.', 'También necesito la factura corregida.'],
    answered: [false, false],
    confirmation: 'pending',
    hasPublicReply: false,
    engine: 'rules',
    needsHumanReview: false,
    remindedAt: null,
    ruleLabel: '5 calendar days (the law says 5 days and does not call them business days)',
  };
}

describe('resolution monitoring', () => {
  it('reads a done status from the issue fields or the status changelog', () => {
    expect(readIssueStatus({
      issue: { fields: { status: { name: 'Finished', statusCategory: { key: 'done' } } } },
    })).toEqual({ statusName: 'Finished', statusCategoryKey: 'done' });
    expect(readIssueStatus({
      changelog: { items: [{ field: 'status', toString: 'Resolved' }] },
    }).statusName).toBe('Resolved');
    expect(isDoneStyleStatus({ statusName: 'Unresolved', statusCategoryKey: 'indeterminate' })).toBe(false);
    expect(isDoneStyleStatus({ statusName: 'Resolved tasks', statusCategoryKey: null })).toBe(false);
    expect(isDoneStyleStatus({ statusName: 'Done', statusCategoryKey: null })).toBe(true);
  });

  it('warns once when a done status lands on an uncovered complaint', () => {
    const done = { statusName: 'Resolved', statusCategoryKey: 'done' };
    const first = observeDoneTransition(uncovered(), done, observedAt);
    expect(first.note).toContain('Open point:');
    expect(first.note).toContain('monitoring');
    expect(first.note).toMatch(/internal/i);
    expect(first.note).not.toMatch(/inactivity/i);
    expect(first.record.resolvedWithGapsAt).toBe(observedAt);
    expect(first.record.startedAt).toBe(created);
    expect(first.record.deadlineAt).toBe('2026-11-11T09:02:00.000Z');
    const repeat = observeDoneTransition(first.record, done, '2026-11-07T12:00:00.000Z');
    expect(repeat.note).toBeNull();
    expect(repeat.record.resolvedWithGapsAt).toBe(observedAt);
    expect(first.record.hasPublicReply).toBe(false);
  });

  it('allows a new note after the case was ready to close and then uncovered again', () => {
    const done = { statusName: 'Closed', statusCategoryKey: 'done' };
    const first = observeDoneTransition(uncovered(), done, observedAt);
    const ready = {
      ...first.record,
      hasPublicReply: true,
      answered: [true, true],
    };
    const cleared = observeDoneTransition(ready, done, '2026-11-08T10:00:00.000Z');
    expect(cleared.note).toBeNull();
    expect(cleared.record.resolvedWithGapsAt).toBeNull();
    const uncoveredAgain = { ...cleared.record, hasPublicReply: false, answered: [false, false] };
    const again = observeDoneTransition(uncoveredAgain, done, '2026-11-09T10:00:00.000Z');
    expect(again.note).toBeTruthy();
    expect(again.record.resolvedWithGapsAt).toBe('2026-11-09T10:00:00.000Z');
  });

  it('does not warn a dismissed case or a ready-to-close case', () => {
    const done = { statusName: 'Done', statusCategoryKey: 'done' };
    const dismissed = { ...uncovered(), isComplaint: false, confirmation: 'dismissed' as const, deadlineAt: null };
    expect(observeDoneTransition(dismissed, done, observedAt).note).toBeNull();
    const ready = { ...uncovered(), hasPublicReply: true, answered: [true, true] };
    expect(observeDoneTransition(ready, done, observedAt).note).toBeNull();
  });

  it('stamps a validator run without moving the clock, points, or confirmation', () => {
    const original = uncovered();
    const stamped = stampValidatorSeen(original, observedAt);
    expect(stamped.validatorLastSeenAt).toBe(observedAt);
    expect(stamped.startedAt).toBe(original.startedAt);
    expect(stamped.deadlineAt).toBe(original.deadlineAt);
    expect(stamped.points).toEqual(original.points);
    expect(stamped.answered).toEqual(original.answered);
    expect(stamped.confirmation).toBe(original.confirmation);
    expect(stamped.confirmationReason).toBe(original.confirmationReason);
  });

  it('shows monitoring, a seen validator, and an unresolved-gap warning on the panel and status view', async () => {
    const base = await analyseTicket({
      summary: 'Duda sobre mi factura',
      description: 'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
      created,
      llmEnabled: false,
    });
    const monitored = panelFromCase(base);
    expect(monitored.enforcementLine).toBe(MONITORING_LINE);
    expect(monitored.gapsWarning).toBeNull();
    const seen = stampValidatorSeen(base, observedAt);
    const seenPanel = panelFromCase(seen);
    expect(seenPanel.enforcementLine).toContain('12:10');
    expect(seenPanel.enforcementLine).toContain('Europe/Madrid');
    const gap = observeDoneTransition(base, { statusName: 'Resolved', statusCategoryKey: 'done' }, observedAt).record;
    const gapPanel = panelFromCase(gap);
    const status = complaintStatusView('SUP-14', gap);
    expect(gapPanel.gapsWarning).toContain('did not reverse');
    expect(gapPanel.gapsWarning).toContain('That transition was not blocked.');
    expect(gapPanel.gapsWarning).not.toMatch(/Add the validator/i);
    expect(gapPanel.gapsWarning).toContain('Open point:');
    expect(gapPanel.gapsWarning).not.toMatch(/inactivity/i);
    expect(status.found && status.gapsWarning).toBe(gapPanel.gapsWarning);
    expect(status.found && status.enforcementLine).toBe(gapPanel.enforcementLine);
    expect(resolutionGapNote(gap)).toMatch(/internal/i);
    expect(resolutionGapNote(gap)).not.toMatch(/inactivity/i);
  });
});
