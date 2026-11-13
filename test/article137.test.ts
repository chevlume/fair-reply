import { describe, expect, it } from 'vitest';
import { analyseTicket, applyConfirmation } from '../src/case/analyse';
import type { FairReplyCase } from '../src/case/types';
import { ARTICLE_137_REMINDER, explainCoverage } from '../src/detect/coverage';
import { panelFromCase } from '../src/panel/model';
import { complaintStatusView, coverageView } from '../src/rovo/view';
import { evaluateClose } from '../src/workflow/validate';

const created = '2026-11-06T09:02:00.000Z';
const point = 'Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.';
const grant = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
const refusal = 'No podemos devolver los 48 € porque la lectura del contador coincide con la tarifa contratada.';
const refusalWithRoutes = `${refusal} La resolución indica los sistemas extrajudiciales de resolución de litigios, cómo acceder a ellos, y los organismos acreditados y sectoriales conforme a la Ley 7/2017.`;

function complaintWith(replies: string[]): FairReplyCase {
  const covered = explainCoverage([point], replies);
  return {
    isComplaint: true,
    quote: point,
    category: 'billing',
    startedAt: created,
    deadlineAt: '2026-11-11T09:02:00.000Z',
    points: [point],
    answered: covered.map((row) => row.answered),
    replyFragments: covered.map((row) => row.fragment),
    analysedPublicComments: replies,
    confirmation: 'confirmed',
    hasPublicReply: true,
    engine: 'rules',
    needsHumanReview: false,
    remindedAt: null,
    ruleLabel: '5 calendar days (the law says 5 days and does not call them business days)',
  };
}

describe('article 13.7 reminder', () => {
  it('does not remind when the covering reply grants the amount', () => {
    const record = complaintWith([grant]);
    expect(record.answered).toEqual([true]);
    expect(panelFromCase(record).article137Reminder).toBeNull();
    expect(evaluateClose(record, [{ author: 'agent', public: true, body: grant }]).result).toBe(true);
  });

  it('reminds on the panel and on status and coverage when a covering refusal omits the routes', () => {
    const record = complaintWith([refusal]);
    expect(record.answered).toEqual([true]);
    const panel = panelFromCase(record, 'SUP-14');
    const status = complaintStatusView('SUP-14', record);
    const coverage = coverageView('SUP-14', record);
    expect(panel.article137Reminder).toBe(ARTICLE_137_REMINDER);
    expect(status.found && status.article137Reminder).toBe(panel.article137Reminder);
    expect(coverage.found && coverage.article137Reminder).toBe(panel.article137Reminder);
    expect(panel.article137Reminder).toMatch(/article 13\.7/i);
    expect(panel.article137Reminder).toMatch(/does not by itself block Resolve/i);
    expect(evaluateClose(record, [{ author: 'agent', public: true, body: refusal }]).result).toBe(true);
  });

  it('does not remind when the covering refusal already names the routes', () => {
    const record = complaintWith([refusalWithRoutes]);
    expect(record.answered).toEqual([true]);
    expect(panelFromCase(record).article137Reminder).toBeNull();
    const split = complaintWith([refusal, 'Cómo acceder a los organismos acreditados conforme a la Ley 7/2017.']);
    expect(split.answered).toEqual([true]);
    expect(panelFromCase(split).article137Reminder).toBeNull();
  });

  it('hides the reminder when the case is not a complaint', async () => {
    const record = complaintWith([refusal]);
    const dismissed = applyConfirmation(record, 'dismissed', 'A person overruled this reading.', '2026-11-07T11:10:00.000Z');
    expect(panelFromCase(dismissed).article137Reminder).toBeNull();
    const quiet = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    expect(panelFromCase(quiet).article137Reminder).toBeNull();
  });
});
