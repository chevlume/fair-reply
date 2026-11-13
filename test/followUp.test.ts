import { describe, expect, it } from 'vitest';
import { analyseTicket, applyConfirmation } from '../src/case/analyse';
import { detectByRules } from '../src/detect/rules';
import { panelFromCase } from '../src/panel/model';
import { complaintStatusView, coverageView } from '../src/rovo/view';
import { MONITORING_LINE } from '../src/workflow/resolutionWatch';
import { evaluateClose } from '../src/workflow/validate';

const created = '2026-11-06T09:02:00.000Z';
const reviewReason = 'A person reviewed this reading.';
const reviewAt = '2026-11-20T11:10:00.000Z';

describe('article 17 follow-up obligation', () => {
  it('keeps a hidden billing complaint on the complaint clock', async () => {
    const record = await analyseTicket({
      summary: 'Duda sobre mi factura',
      description: 'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
      created,
      llmEnabled: false,
    });
    const panel = panelFromCase(record, 'SUP-14');
    expect(record.isComplaint).toBe(true);
    expect(record.category).toBe('billing');
    expect(record.deadlineAt).toBe('2026-11-11T09:02:00.000Z');
    expect(panel.obligationLine).toBeNull();
    expect(panel.headline).not.toBe('Not a complaint');
    expect(panel.clockBadge).toBe('Complaint with clock');
    expect(panel.showDraft).toBe(true);
    expect(panel.enforcementLine).toBe(MONITORING_LINE);
  });

  it('leaves an immediate hours question without a complaint clock or an obligation', async () => {
    const text = 'Horario\n¿Cuál es el horario de la oficina?';
    expect(detectByRules(text).isComplaint).toBe(false);
    const record = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    const panel = panelFromCase(record);
    expect(record.isComplaint).toBe(false);
    expect(record.deadlineAt).toBeNull();
    expect(record.followUpDeadlineAt ?? null).toBeNull();
    expect(panel.obligationLine).toBeNull();
    expect(panel.headline).toBe('Not a complaint');
    expect(evaluateClose(record, []).result).toBe(true);
  });

  it('shows an obligation for a tariff-change request that is not a complaint', async () => {
    const description = 'Quiero cambiar la tarifa a la modalidad plana desde el mes que viene. La tarifa actual es correcta.';
    const text = `Cambio de tarifa\n${description}`;
    const detected = detectByRules(text);
    expect(detected.isComplaint).toBe(false);
    const record = await analyseTicket({
      summary: 'Cambio de tarifa',
      description,
      created,
      llmEnabled: false,
    });
    const panel = panelFromCase(record);
    const status = complaintStatusView('SUP-20', record);
    const coverage = coverageView('SUP-20', record);
    expect(record.isComplaint).toBe(false);
    expect(record.deadlineAt).toBeNull();
    expect(record.followUpCategory).toBe('general');
    expect(record.followUpDeadlineAt).toBe('2026-11-27T09:02:00.000Z');
    expect(panel.obligationLine).toMatch(/not a complaint clock/i);
    expect(panel.obligationLine).toMatch(/article 17/i);
    expect(panel.obligationLine).toMatch(/15 business days/i);
    expect(panel.obligationLine).not.toMatch(/5 calendar days/i);
    expect(panel.obligationLine).toMatch(/not a universal SLA/i);
    expect(panel.headline).toBe('Not a complaint');
    expect(panel.article137Reminder).toBeNull();
    expect(panel.showDraft).toBe(false);
    expect(status.found && status.obligationLine).toBe(panel.obligationLine);
    expect(coverage.found && coverage.obligationLine).toBe(panel.obligationLine);
    expect(evaluateClose(record, []).result).toBe(true);
    const confirmed = applyConfirmation(record, 'confirmed', reviewReason, reviewAt);
    expect(confirmed.isComplaint).toBe(true);
    expect(confirmed.startedAt).toBe(record.startedAt);
    expect(confirmed.deadlineAt).toBe('2026-11-27T09:02:00.000Z');
    expect(panelFromCase(confirmed).obligationLine).toBeNull();
  });

  it('uses the general response time for a scheduled water cancellation', async () => {
    const description = '¿Puedo solicitar la baja del suministro de agua para el lunes?';
    const text = `Baja de suministro\n${description}`;
    const detected = detectByRules(text);
    expect(detected.isComplaint).toBe(false);
    const record = await analyseTicket({
      summary: 'Baja de suministro',
      description,
      created,
      llmEnabled: false,
    });
    expect(record.followUpCategory).toBe('general');
    expect(record.followUpDeadlineAt).toBe('2026-11-27T09:02:00.000Z');
    expect(record.deadlineAt).toBeNull();
    const panel = panelFromCase(record);
    expect(panel.obligationLine).toMatch(/15 business days/i);
    expect(panel.obligationLine).not.toMatch(/2 clock hours/);
    expect(panel.headline).toBe('Not a complaint');
    expect(evaluateClose(record, []).result).toBe(true);
  });

  it('drops the complaint deadline on dismiss and keeps an obligation only when the follow-up matches', async () => {
    const hours = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    const misread = applyConfirmation(hours, 'confirmed', reviewReason, reviewAt);
    const dismissed = applyConfirmation(misread, 'dismissed', 'This was only an hours question.', reviewAt);
    expect(dismissed.deadlineAt).toBeNull();
    expect(panelFromCase(dismissed).obligationLine).toBeNull();
    expect(dismissed.isComplaint).toBe(false);
  });
});
