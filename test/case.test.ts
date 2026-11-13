import { describe, expect, it } from 'vitest';
import { analyseTicket, applyConfirmation, draftAcknowledgement } from '../src/case/analyse';
import { FAIR_REPLY_PROPERTY_KEY } from '../src/case/types';
import { formatCheckedDidNotCover, formatCoveringReply, pointReplyLine } from '../src/detect/coverage';
import { evaluateClose } from '../src/workflow/validate';
import { shouldRemind } from '../src/workflow/remind';
import { confirmationHistory, panelFromCase, emptyPanel } from '../src/panel/model';
import { complaintStatusView, draftView } from '../src/rovo/view';
import { MONITORING_LINE } from '../src/workflow/resolutionWatch';
import { DISCLAIMER } from '../src/legal/disclaimer';

const created = '2026-11-06T09:02:00.000Z';
const reviewReason = 'The wording is a repeated billing failure, not a how-to question.';
const reviewAt = '2026-11-07T11:10:00.000Z';

async function billingCase(agentPublicReplies?: string[]) {
  return analyseTicket({
    summary: 'Duda sobre mi factura',
    description:
      'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
    created,
    agentPublicReplies,
    llmEnabled: false,
  });
}

describe('case record', () => {
  it('stores the fairreply.case shape and starts the clock from created', async () => {
    const record = await billingCase();
    expect(FAIR_REPLY_PROPERTY_KEY).toBe('fairreply.case');
    expect(record).toMatchObject({
      isComplaint: true,
      category: 'billing',
      startedAt: created,
      deadlineAt: '2026-11-11T09:02:00.000Z',
      confirmation: 'pending',
      engine: 'rules',
    });
    expect(record.quote && record.points.includes(record.quote)).toBe(true);
    expect(record.answered).toHaveLength(record.points.length);
    expect(record.answered.every((flag) => flag === false)).toBe(true);
  });

  it('keeps a human dismissal sticky and clears the deadline', async () => {
    const detected = await billingCase();
    const dismissed = applyConfirmation(detected, 'dismissed', reviewReason, reviewAt);
    const again = await analyseTicket({
      summary: 'Duda sobre mi factura',
      description: 'Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.',
      created,
      previous: dismissed,
      llmEnabled: false,
    });
    expect(again.isComplaint).toBe(false);
    expect(again.deadlineAt).toBeNull();
    expect(again.confirmation).toBe('dismissed');
  });

  it('confirmation of a non-complaint starts the general clock from created', async () => {
    const quiet = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    const confirmed = applyConfirmation(quiet, 'confirmed', 'Opening hours are a question, but a person still wants the general clock.', '2026-11-20T11:10:00.000Z');
    expect(confirmed.isComplaint).toBe(true);
    expect(confirmed.category).toBe('general');
    expect(confirmed.startedAt).toBe(created);
    expect(confirmed.deadlineAt).toBe('2026-11-27T09:02:00.000Z');
    expect(confirmed.confirmationAt).toBe('2026-11-20T11:10:00.000Z');
  });

  it('keeps the original clock when a person confirms days later', async () => {
    const detected = await billingCase();
    const later = '2026-11-20T11:10:00.000Z';
    const confirmed = applyConfirmation(detected, 'confirmed', reviewReason, later);
    expect(confirmed.startedAt).toBe(detected.startedAt);
    expect(confirmed.deadlineAt).toBe(detected.deadlineAt);
    expect(confirmed.confirmationAt).toBe(later);
    expect(confirmed.confirmationReason).toBe(reviewReason);
    expect(confirmed.needsHumanReview).toBe(false);
  });

  it('stores a dismiss reason, clears the deadline, and still allows resolve', async () => {
    const detected = await billingCase();
    const quote = detected.quote;
    const points = detected.points;
    const dismissed = applyConfirmation(detected, 'dismissed', `  ${reviewReason}  `, reviewAt);
    expect(dismissed).not.toBe(detected);
    expect(dismissed.isComplaint).toBe(false);
    expect(dismissed.deadlineAt).toBeNull();
    expect(dismissed.startedAt).toBe(detected.startedAt);
    expect(dismissed.quote).toBe(quote);
    expect(dismissed.points).toEqual(points);
    expect(dismissed.confirmationReason).toBe(reviewReason);
    expect(dismissed.confirmationAt).toBe(reviewAt);
    expect(evaluateClose(dismissed, []).result).toBe(true);
    const history = confirmationHistory(dismissed);
    const panel = panelFromCase(dismissed);
    const status = complaintStatusView('SUP-14', dismissed);
    expect(history).toBe(panel.confirmationHistory);
    expect(status.found && status.confirmationHistory).toBe(history);
    expect(history).toContain(reviewReason);
    expect(history).toContain('Europe/Madrid');
    expect(history).toContain('7 Nov 2026');
    expect(history).toContain('12:10');
    expect(history).toMatch(/not a legal finding/i);
  });

  it('does not change the case when the reason is blank', async () => {
    const detected = await billingCase();
    expect(applyConfirmation(detected, 'dismissed', '   ', reviewAt)).toBe(detected);
    expect(applyConfirmation(detected, 'confirmed', '', reviewAt)).toBe(detected);
    const long = `x${'y'.repeat(400)}`;
    const confirmed = applyConfirmation(detected, 'confirmed', long, reviewAt);
    expect(confirmed.confirmationReason).toHaveLength(300);
    expect(confirmed.confirmationReason?.startsWith('xy')).toBe(true);
  });

  it('restores the clock from the original filing time after a dismiss', async () => {
    const detected = await billingCase();
    const dismissed = applyConfirmation(detected, 'dismissed', reviewReason, reviewAt);
    const later = '2026-11-20T15:00:00.000Z';
    const restored = applyConfirmation(dismissed, 'confirmed', 'The billing failure still stands.', later);
    expect(restored.isComplaint).toBe(true);
    expect(restored.startedAt).toBe(detected.startedAt);
    expect(restored.deadlineAt).toBe(detected.deadlineAt);
    expect(restored.confirmationAt).toBe(later);
    expect(restored.deadlineAt).not.toBe(later);
  });

  it('drafts an acknowledgement and does not mark it sent', async () => {
    const draft = draftAcknowledgement(await billingCase(), 'SUP-14');
    expect(draft.sent).toBe(false);
    expect(draft.reference).toBe('FR-SUP-14');
    expect(draft.text).toContain('Estimado cliente:');
    expect(draft.text).toContain('Usted escribió:');
    expect(draft.text).toContain('Es la tercera vez');
    expect(draft.text).not.toContain('Agent draft marker');
    expect(draft.text).not.toContain(DISCLAIMER);
    expect(draft.agentNote).toContain('Agent draft marker: FR-SUP-14');
    expect(draft.agentNote).toContain('identifying key');
    expect(draft.agentNote).toMatch(/does not fulfil article 12/i);
    expect(draft.agentNote).toContain('has not been sent');
  });

  it('shows the same unsent acknowledgement draft on a complaint panel', async () => {
    const record = await billingCase();
    const panel = panelFromCase(record, 'SUP-14');
    const rovo = draftView('SUP-14', record);
    expect(panel.showDraft).toBe(true);
    expect(panel.draftText).toBe(rovo.text);
    expect(panel.draftAgentNote).toBe(rovo.agentNote);
    expect(panel.draftAgentNote).toMatch(/does not fulfil article 12/i);
    expect(panel.draftText).toContain('Es la tercera vez');
    expect(panel.draftText).not.toMatch(/does not fulfil article 12/i);
    expect(panel.draftSent).toBe(false);
    expect(panel.draftPosted).toBe(false);
    expect(panel.draftCustomerReplySent).toBe(false);
    expect(rovo.sent).toBe(false);
    expect(rovo.posted).toBe(false);
    expect(rovo.customerReplySent).toBe(false);
    expect(panel.enforcementLine).toBe(MONITORING_LINE);
    const dismissed = panelFromCase(applyConfirmation(record, 'dismissed', reviewReason, reviewAt), 'SUP-14');
    expect(dismissed.showDraft).toBe(false);
    expect(dismissed.draftText).toBeNull();
    const quiet = panelFromCase(await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    }), 'SUP-14');
    expect(quiet.showDraft).toBe(false);
  });
});

describe('workflow validator', () => {
  it('blocks resolve when the only public reply is a generic thank-you', async () => {
    const reply = 'Gracias por su mensaje. Gracias por escribirnos sobre la factura y los 48 €.';
    const checked = 'Gracias por escribirnos sobre la factura y los 48 €.';
    const record = await billingCase([reply]);
    const decision = evaluateClose(record, [{ author: 'agent', public: true, body: reply }]);
    const shown = panelFromCase(record);
    expect(decision.result).toBe(false);
    expect(decision.errorMessage).toMatch(/uncovered points/i);
    expect(decision.errorMessage).toMatch(/point 1/i);
    expect(decision.errorMessage).toMatch(/point 2/i);
    expect(decision.errorMessage).not.toMatch(/clause compared|inactivity|The reply checked was:/i);
    expect(shown.points.map((point) => point.fragment)).toEqual([checked, checked]);
    for (const point of shown.points) {
      expect(point.answered).toBe(false);
      expect(pointReplyLine(point.answered, point.fragment)).toBe(formatCheckedDidNotCover(checked));
      expect(decision.errorMessage).toContain(formatCheckedDidNotCover(checked));
    }
  });

  it('blocks resolve when there is no public reply', async () => {
    const record = await billingCase();
    const decision = evaluateClose(record, []);
    expect(decision.result).toBe(false);
    expect(decision.errorMessage).toMatch(/no public reply/i);
    expect(decision.errorMessage).toMatch(/point 1/i);
    expect(decision.errorMessage).toMatch(/point 2/i);
  });

  it('blocks resolve when a public reply leaves a point unanswered', async () => {
    const record = await billingCase();
    const decision = evaluateClose(record, [
      { author: 'agent', public: true, body: 'Hemos abonado los 48 € del recibo duplicado de marzo.' },
    ]);
    expect(decision.result).toBe(false);
    expect(decision.errorMessage).toMatch(/uncovered points/i);
    expect(decision.errorMessage).toMatch(/point 2/i);
    expect(decision.errorMessage).toMatch(/factura corregida/);
    expect(decision.errorMessage).toContain(formatCheckedDidNotCover('Hemos abonado los 48 € del recibo duplicado de marzo.'));
    expect(decision.errorMessage).not.toMatch(/The reply checked was:|inactivity/i);
  });

  it('lets two public comments cover two points and quotes each checked sentence', async () => {
    const refund = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
    const invoice = 'Adjuntamos la factura corregida.';
    const halfway = await billingCase([refund]);
    const halfwayPanel = panelFromCase(halfway);
    const blocked = evaluateClose(halfway, [{ author: 'agent', public: true, body: refund }]);
    expect(blocked.result).toBe(false);
    expect(blocked.errorMessage).toMatch(/point 2/i);
    expect(blocked.errorMessage).toContain(formatCheckedDidNotCover(refund));
    expect(blocked.errorMessage).not.toMatch(/The reply checked was:/);
    expect(halfwayPanel.points[0]?.answered).toBe(true);
    expect(pointReplyLine(true, halfwayPanel.points[0]?.fragment ?? null)).toBe(formatCoveringReply(refund));
    expect(halfwayPanel.points[1]?.answered).toBe(false);
    expect(pointReplyLine(false, halfwayPanel.points[1]?.fragment ?? null)).toBe(formatCheckedDidNotCover(refund));
    expect(halfwayPanel.headline).toBe('Uncovered points');

    const done = await billingCase([refund, invoice]);
    const donePanel = panelFromCase(applyConfirmation(done, 'confirmed', reviewReason, reviewAt));
    const allowed = evaluateClose(done, [
      { author: 'agent', public: true, body: refund },
      { author: 'agent', public: true, body: invoice },
    ]);
    expect(donePanel.points.map((point) => point.fragment)).toEqual([refund, invoice]);
    expect(donePanel.points.map((point) => pointReplyLine(point.answered, point.fragment))).toEqual([
      formatCoveringReply(refund),
      formatCoveringReply(invoice),
    ]);
    expect(donePanel.points.every((point) => point.answered)).toBe(true);
    expect(donePanel.headline).toBe('Ready to close');
    expect(donePanel.clockBadge).toBe('Complaint with clock');
    expect(allowed.result).toBe(true);
    expect(allowed.errorMessage).toBeUndefined();
  });

  it('allows resolve when every point is answered in a public reply', async () => {
    const record = await billingCase();
    const decision = evaluateClose(record, [
      {
        author: 'agent',
        public: true,
        body: 'Hemos abonado los 48 € del recibo duplicado de marzo y adjuntamos la factura corregida.',
      },
    ]);
    expect(decision.result).toBe(true);
  });

  it('ignores an internal note and a customer reply', async () => {
    const record = await billingCase();
    const decision = evaluateClose(record, [
      { author: 'agent', public: false, body: 'Hemos abonado los 48 € y la factura corregida.' },
      { author: 'customer', public: true, body: 'Sigo esperando la factura corregida y los 48 €.' },
    ]);
    expect(decision.result).toBe(false);
  });

  it('allows a dismissed case and a non-complaint', async () => {
    const record = applyConfirmation(await billingCase(), 'dismissed', reviewReason, reviewAt);
    expect(evaluateClose(record, []).result).toBe(true);
    const quiet = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
    });
    expect(evaluateClose(quiet, []).result).toBe(true);
    const clear = panelFromCase(quiet);
    expect(clear.tone).toBe('clear');
    expect(clear.showQuote).toBe(false);
    expect(clear.showPoints).toBe(false);
    expect(clear.classification).toBe('Not a complaint');
    expect(clear.headline).toBe('Not a complaint');
    expect(clear.clockBadge).toBeNull();
    expect(clear.phase).toBe('clear');
    const overruled = panelFromCase(applyConfirmation(await billingCase(), 'dismissed', reviewReason, reviewAt));
    expect(overruled.phase).toBe('overridden');
    expect(overruled.showQuote).toBe(false);
    const confirmedCase = applyConfirmation(await billingCase(), 'confirmed', reviewReason, reviewAt);
    const confirmed = panelFromCase(confirmedCase);
    expect(confirmed.phase).toBe('confirmed');
    expect(confirmed.classification).toBe('Confirmed complaint');
    expect(confirmed.headline).toBe('Uncovered points');
    const ready = panelFromCase({
      ...confirmedCase,
      hasPublicReply: true,
      answered: confirmedCase.points.map(() => true),
    });
    expect(ready.headline).toBe('Ready to close');
    expect(ready.clockBadge).toBe('Complaint with clock');
  });
});

describe('panel and reminders', () => {
  it('shows the citation, the deadline, unanswered points, and the disclaimer', async () => {
    const model = panelFromCase(await billingCase());
    expect(model.classification).toBe('Detected complaint');
    expect(model.headline).toBe('Uncovered points');
    expect(model.clockBadge).toBe('Complaint with clock');
    expect(model.phase).toBe('detected');
    expect(model.statusLine).toMatch(/awaiting a person/i);
    expect(model.whyClock).toMatch(/without calling them business days/i);
    expect(model.whyClock).toMatch(/5 calendar days/);
    expect(model.nextStep).toMatch(/next step/i);
    expect(model.scopeLine).toMatch(/in scope/i);
    expect(model.shortDisclaimer).toBe('A human confirms this result. Decision support, not legal advice.');
    expect(model.quote).toContain('exijo que me devolváis los 48 €');
    expect(model.deadlineLabel).toContain('issue created');
    expect(model.unansweredCount).toBe(2);
    expect(model.tone).toBe('complaint');
    expect(model.showQuote).toBe(true);
    expect(model.shortDisclaimer).toMatch(/human confirms/i);
    expect(model.shortDisclaimer).toMatch(/not legal advice/i);
    expect(model.disclaimer).toBe(DISCLAIMER);
    expect(model.scopeNote).toMatch(/does not decide/i);
    expect(model.deadlineLabel).toMatch(/issue created/i);
    expect(emptyPanel().tone).toBe('waiting');
    expect(emptyPanel().disclaimer).toBe(DISCLAIMER);
  });

  it('reminds only inside the last day, and not after a full public answer', async () => {
    const record = await billingCase();
    const early = new Date('2026-11-09T09:02:00.000Z');
    const close = new Date('2026-11-11T00:00:00.000Z');
    expect(shouldRemind(record, early)).toBe(false);
    expect(shouldRemind(record, close)).toBe(true);
    expect(shouldRemind({ ...record, remindedAt: '2026-11-10T20:00:00.000Z' }, close)).toBe(false);
    const answered = {
      ...record,
      hasPublicReply: true,
      answered: record.points.map(() => true),
    };
    expect(shouldRemind(answered, close)).toBe(false);
  });

  it('reminds a continuity case before the two-hour mark and not on the next five-minute tick', async () => {
    const record = await analyseTicket({
      summary: 'Sin agua',
      description: 'Desde las siete no sale agua de ningún grifo y el suministro contratado sigue activo.',
      created,
      llmEnabled: false,
    });
    expect(record.category).toBe('outage');
    expect(record.deadlineAt).toBe('2026-11-06T11:02:00.000Z');
    const fiveMinutes = new Date('2026-11-06T09:07:00.000Z');
    expect(fiveMinutes.getTime()).toBeLessThan(new Date(record.deadlineAt!).getTime());
    expect(shouldRemind(record, fiveMinutes)).toBe(true);
    const nextTick = new Date('2026-11-06T09:12:00.000Z');
    expect(shouldRemind({ ...record, remindedAt: fiveMinutes.toISOString() }, nextTick)).toBe(false);
  });
});
