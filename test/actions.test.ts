import { describe, expect, it } from 'vitest';
import { analyseTicket, applyConfirmation } from '../src/case/analyse';
import type { FairReplyCase } from '../src/case/types';
import { publicRepliesNeedRefresh, refreshStoredCase } from '../src/case/refresh';
import { formatCheckedDidNotCover, formatCoveringReply } from '../src/detect/coverage';
import { horizonHoursFrom } from '../src/actions';
import {
  AT_RISK_EMPTY,
  AT_RISK_REFRESH_LIMIT,
  atRiskView,
  complaintStatusView,
  coverageView,
  draftView,
  PERSON_RESOLVES,
  refreshAtRiskRows,
  REMINDER_NOTE,
} from '../src/rovo/view';
import { reminderText } from '../src/workflow/remind';

const created = '2026-11-06T09:02:00.000Z';

const billingText = {
  summary: 'Duda sobre mi factura',
  description:
    'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
  created,
  llmEnabled: false as const,
};

describe('Complaints Officer actions', () => {
  it('uses the panel state and citation lines for one refund comment', async () => {
    const refund = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
    const record = await analyseTicket({ ...billingText, agentPublicReplies: [refund] });
    const status = complaintStatusView('SUP-14', record);
    const coverage = coverageView('SUP-14', record);
    expect(status.found).toBe(true);
    if (!status.found || !coverage.found) return;
    expect(status.headline).toBe('Uncovered points');
    expect(status.clockBadge).toBe('Complaint with clock');
    expect(status.ruleLabel).toMatch(/5 calendar days/);
    expect(status.ruleLabel).toMatch(/does not call them business days/i);
    expect(status.readyToClose).toBe(false);
    expect(status.points[0]?.citation).toBe(formatCoveringReply(refund));
    expect(status.points[1]?.citation).toBe(formatCheckedDidNotCover(refund));
    expect(status.points[1]?.citation).not.toMatch(/The reply checked was/);
    expect(coverage.headline).toBe(status.headline);
    expect(coverage.points).toEqual(status.points);
    expect(status.reminderNote).toBe(REMINDER_NOTE);
    expect(status.personResolves).toBe(PERSON_RESOLVES);
  });

  it('lets a second public comment move the same case to Ready to close', async () => {
    const refund = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
    const invoice = 'Adjuntamos la factura corregida.';
    const record = await analyseTicket({ ...billingText, agentPublicReplies: [refund, invoice] });
    const confirmed = { ...record, confirmation: 'confirmed' as const };
    const status = complaintStatusView('SUP-14', confirmed);
    expect(status.found).toBe(true);
    if (!status.found) return;
    expect(status.headline).toBe('Ready to close');
    expect(status.clockBadge).toBe('Complaint with clock');
    expect(status.readyToClose).toBe(true);
    expect(status.points.map((point) => point.citation)).toEqual([
      formatCoveringReply(refund),
      formatCoveringReply(invoice),
    ]);
    expect(status.personResolves).toMatch(/person resolves/i);
  });

  it('describes a continuity clock as an informative reply, not a repair', async () => {
    const record = await analyseTicket({
      summary: 'Sin agua',
      description: 'Desde las siete no sale agua de ningún grifo y el suministro contratado sigue activo.',
      created,
      llmEnabled: false,
    });
    const status = complaintStatusView('SUP-15', record);
    expect(status.found).toBe(true);
    if (!status.found) return;
    expect(record.category).toBe('outage');
    expect(status.headline).toBe('Uncovered points');
    expect(status.ruleLabel).toMatch(/2 clock hours/);
    expect(status.ruleLabel).toMatch(/not a repair promise/i);
    expect(status.whyClock).toMatch(/not a promise to repair/i);
    const listed = atRiskView([{ issueKey: 'SUP-15', record }], new Date('2026-11-06T10:00:00.000Z'), 48);
    expect(listed.count).toBe(1);
    expect(listed.complaints[0]?.headline).toBe('Uncovered points');
    expect(listed.complaints[0]?.ruleLabel).toBe(status.ruleLabel);
    expect(listed.reminderNote).toMatch(/do not send the customer reply/i);
    expect(reminderText(record, 'SUP-15')).toMatch(/does not send a reply to the customer/i);
    expect(reminderText(record, 'SUP-15')).toMatch(/internal note/i);
  });

  it('returns a draft and does not mark it sent or posted', async () => {
    const record = await analyseTicket(billingText);
    const draft = draftView('SUP-14', record);
    expect(draft.sent).toBe(false);
    expect(draft.posted).toBe(false);
    expect(draft.customerReplySent).toBe(false);
    expect(draft.reference).toBe('FR-SUP-14');
    expect(draft.headline).toBe('Uncovered points');
    expect(draft.ruleLabel).toMatch(/5 calendar days/);
    expect(draft.text).toContain('Estimado cliente:');
    expect(draft.text).not.toMatch(/has not been sent/i);
    expect(draft.agentNote).toMatch(/has not been sent/i);
    expect(draft.agentNote).toMatch(/does not fulfil article 12/i);
    expect(draft.text).not.toMatch(/The reply checked was/);
  });

  it('analyses a new public reply in process and does not repeat when the replies are unchanged', async () => {
    const refund = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
    const invoice = 'Adjuntamos la factura corregida.';
    const stored = await analyseTicket(billingText);
    expect(publicRepliesNeedRefresh(stored, [])).toBe(false);
    expect(publicRepliesNeedRefresh(stored, [refund])).toBe(true);

    const first = await refreshStoredCase(stored, { ...billingText, agentPublicReplies: [refund] });
    expect(first.refreshed).toBe(true);
    const halfway = complaintStatusView('SUP-14', first.record);
    expect(halfway.found).toBe(true);
    if (!halfway.found) return;
    expect(halfway.headline).toBe('Uncovered points');
    expect(halfway.points[0]?.citation).toBe(formatCoveringReply(refund));
    expect(halfway.points[1]?.citation).toBe(formatCheckedDidNotCover(refund));
    expect(first.record.analysedPublicComments).toEqual([refund]);

    const again = await refreshStoredCase(first.record, { ...billingText, agentPublicReplies: [refund] });
    expect(again.refreshed).toBe(false);
    expect(again.record).toBe(first.record);

    const second = await refreshStoredCase(first.record, { ...billingText, agentPublicReplies: [refund, invoice] });
    expect(second.refreshed).toBe(true);
    const ready = complaintStatusView('SUP-14', applyConfirmation(second.record, 'confirmed', 'Both points now have a public reply.', '2026-11-07T11:10:00.000Z'));
    expect(ready.found).toBe(true);
    if (!ready.found) return;
    expect(ready.headline).toBe('Ready to close');
    expect(ready.points.map((point) => point.citation)).toEqual([
      formatCoveringReply(refund),
      formatCoveringReply(invoice),
    ]);
    expect(second.record.analysedPublicComments).toEqual([refund, invoice]);
  });

  it('keeps a dismissed case from being reopened by a later public reply', async () => {
    const stored = applyConfirmation(await analyseTicket(billingText), 'dismissed', 'This is a how-to question.', '2026-11-07T11:10:00.000Z');
    const reply = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
    const refreshed = await refreshStoredCase(stored, { ...billingText, agentPublicReplies: [reply] });
    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.record.isComplaint).toBe(false);
    expect(refreshed.record.confirmation).toBe('dismissed');
    expect(refreshed.record.analysedPublicComments).toEqual([reply]);
    const repeat = await refreshStoredCase(refreshed.record, { ...billingText, agentPublicReplies: [reply] });
    expect(repeat.refreshed).toBe(false);
  });

  it('refreshes only the soonest at-risk cases and skips a case that cannot be read', async () => {
    const now = new Date('2026-11-06T10:00:00.000Z');
    const rows = Array.from({ length: AT_RISK_REFRESH_LIMIT + 2 }, (_, index) => ({
      issueKey: `SUP-${index + 1}`,
      record: stubCase(new Date(now.getTime() + (index + 1) * 60 * 60 * 1000).toISOString()),
    }));
    const seen: string[] = [];
    const result = await refreshAtRiskRows(rows, now, 48, async (issueKey, record) => {
      seen.push(issueKey);
      if (issueKey === 'SUP-2') throw new Error('work item cannot be read');
      if (issueKey === 'SUP-1') {
        return { ...record, hasPublicReply: true, answered: [true], points: ['point'], replyFragments: ['Covered.'] };
      }
      return record;
    });
    expect(seen).toEqual(rows.slice(0, AT_RISK_REFRESH_LIMIT).map((row) => row.issueKey));
    expect(result.stats).toEqual({ refreshLimit: AT_RISK_REFRESH_LIMIT, refreshed: 1, skipped: 1, deferred: 2 });
    expect(result.rows.find((row) => row.issueKey === 'SUP-2')?.record.answered).toEqual([]);
    const listed = atRiskView(result.rows, now, 48, result.stats);
    expect(listed.complaints.some((row) => row.issueKey === 'SUP-1')).toBe(false);
    expect(listed.deferred).toBe(2);
    expect(publicRepliesNeedRefresh(rows[0]!.record, rows[0]!.record.analysedPublicComments ?? [])).toBe(false);
  });

  it('uses a 48-hour horizon unless a positive number is given, and names an empty list', () => {
    expect(horizonHoursFrom(undefined)).toBe(48);
    expect(horizonHoursFrom(Number.NaN)).toBe(48);
    expect(horizonHoursFrom(0)).toBe(48);
    expect(horizonHoursFrom(-4)).toBe(48);
    expect(horizonHoursFrom(6)).toBe(6);
    const empty = atRiskView([], new Date('2026-11-06T10:00:00.000Z'), 48);
    expect(empty.count).toBe(0);
    expect(empty.complaints).toEqual([]);
    expect(empty.emptyMessage).toBe(AT_RISK_EMPTY);
  });
});

function stubCase(deadlineAt: string): FairReplyCase {
  return {
    isComplaint: true,
    quote: 'Sin agua desde las siete.',
    category: 'outage',
    startedAt: '2026-11-06T09:02:00.000Z',
    deadlineAt,
    points: [],
    answered: [],
    confirmation: 'pending',
    hasPublicReply: false,
    analysedPublicComments: [],
    engine: 'rules',
    needsHumanReview: false,
    remindedAt: null,
    ruleLabel: '2 clock hours for an informative continuity reply (cause and expected restoration), not a repair promise',
  };
}
