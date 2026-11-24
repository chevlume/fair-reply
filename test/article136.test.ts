import { describe, expect, it } from 'vitest';
import { analyseTicket } from '../src/case/analyse';
import { explainCoverage } from '../src/detect/coverage';
import { ARTICLE_136_REMINDER } from '../src/legal/sameLanguage';
import { panelFromCase } from '../src/panel/model';
import { complaintStatusView, coverageView } from '../src/rovo/view';
import { evaluateClose } from '../src/workflow/validate';

const created = '2026-11-06T09:02:00.000Z';
const summary = 'Duda sobre mi factura';
const description = 'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.';
const spanishReplies = [
  'Hemos abonado los 48 € del recibo duplicado de marzo.',
  'Adjuntamos la factura corregida.',
];
const englishReply = 'We have refunded the 48 EUR of the duplicate March bill.';

describe('article 13.6 same-language reminder', () => {
  it('stays quiet when a Spanish filing has Spanish covering replies', async () => {
    const record = await analyseTicket({
      summary,
      description,
      created,
      agentPublicReplies: spanishReplies,
      publicComments: spanishReplies,
      llmEnabled: false,
    });
    expect(record.isComplaint).toBe(true);
    expect(record.filingLanguage).toBe('es');
    const panel = panelFromCase(record, 'SUP-14');
    expect(panel.article136Reminder).toBeNull();
    expect(record.answered).toEqual(explainCoverage(record.points, spanishReplies).map((row) => row.answered));
  });

  it('reminds when a Spanish filing has a clearly English public reply, without changing coverage', async () => {
    const record = await analyseTicket({
      summary,
      description,
      created,
      agentPublicReplies: [englishReply],
      publicComments: [englishReply],
      llmEnabled: false,
    });
    const covered = explainCoverage(record.points, [englishReply]);
    expect(record.answered).toEqual(covered.map((row) => row.answered));
    const panel = panelFromCase(record, 'SUP-14');
    const status = complaintStatusView('SUP-14', record);
    const coverage = coverageView('SUP-14', record);
    expect(panel.article136Reminder).toBe(ARTICLE_136_REMINDER);
    expect(panel.article136Reminder).toMatch(/article 13\.6/i);
    expect(panel.article136Reminder).toMatch(/does not by itself block Resolve/i);
    expect(status.found && status.article136Reminder).toBe(panel.article136Reminder);
    expect(coverage.found && coverage.article136Reminder).toBe(panel.article136Reminder);
    const decision = evaluateClose(record, [{ author: 'agent', public: true, body: englishReply }]);
    expect(decision.result).toBe(record.answered.every(Boolean) && record.hasPublicReply);
  });

  it('stays quiet when an English filing has an English reply', async () => {
    const record = await analyseTicket({
      summary: 'Duplicate charge',
      description: 'This is unacceptable. I demand a refund because you have charged this account twice.',
      created,
      agentPublicReplies: ['We have refunded the duplicate charge.'],
      publicComments: ['We have refunded the duplicate charge.'],
      llmEnabled: false,
    });
    expect(record.isComplaint).toBe(true);
    expect(record.filingLanguage).toBe('en');
    expect(panelFromCase(record).article136Reminder).toBeNull();
  });

  it('reminds when a later English reply follows a Spanish one on a Spanish filing', async () => {
    const replies = [spanishReplies[0], englishReply];
    const record = await analyseTicket({
      summary,
      description,
      created,
      agentPublicReplies: replies,
      publicComments: replies,
      llmEnabled: false,
    });
    expect(record.filingLanguage).toBe('es');
    expect(panelFromCase(record, 'SUP-14').article136Reminder).toBe(ARTICLE_136_REMINDER);
    const covered = explainCoverage(record.points, replies);
    expect(record.answered).toEqual(covered.map((row) => row.answered));
    const decision = evaluateClose(record, replies.map((body) => ({ author: 'agent' as const, public: true, body })));
    expect(decision.result).toBe(record.answered.every(Boolean) && record.hasPublicReply);
  });

  it('stays quiet for Spanish replies only, including a motivated refusal', async () => {
    const replies = [
      'Hemos abonado los 48 € del recibo duplicado de marzo.',
      'No podemos devolver los 48 € porque la lectura del contador coincide con la tarifa contratada.',
    ];
    const record = await analyseTicket({
      summary,
      description,
      created,
      agentPublicReplies: replies,
      publicComments: replies,
      llmEnabled: false,
    });
    expect(panelFromCase(record).article136Reminder).toBeNull();
  });

  it('reminds when an English filing receives a Spanish reply', async () => {
    const record = await analyseTicket({
      summary: 'Duplicate charge',
      description: 'This is unacceptable. I demand a refund because you have charged this account twice.',
      created,
      agentPublicReplies: ['Hemos abonado los 48 € del recibo duplicado de marzo.'],
      publicComments: ['Hemos abonado los 48 € del recibo duplicado de marzo.'],
      llmEnabled: false,
    });
    expect(record.filingLanguage).toBe('en');
    expect(record.isComplaint).toBe(true);
    expect(panelFromCase(record).article136Reminder).toBe(ARTICLE_136_REMINDER);
  });

  it('stays quiet when the only public reply is too short to judge', async () => {
    const record = await analyseTicket({
      summary,
      description,
      created,
      agentPublicReplies: ['Ok.'],
      publicComments: ['Ok.'],
      llmEnabled: false,
    });
    expect(record.filingLanguage).toBe('es');
    expect(panelFromCase(record).article136Reminder).toBeNull();
  });

  it('stays quiet for an hours question and when there is no public reply', async () => {
    const hours = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    expect(hours.isComplaint).toBe(false);
    expect(panelFromCase(hours).article136Reminder).toBeNull();
    const waiting = await analyseTicket({
      summary,
      description,
      created,
      llmEnabled: false,
    });
    expect(waiting.isComplaint).toBe(true);
    expect(waiting.analysedPublicComments ?? []).toEqual([]);
    expect(panelFromCase(waiting).article136Reminder).toBeNull();
  });
});
