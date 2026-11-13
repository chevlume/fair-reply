import { describe, expect, it } from 'vitest';
import { analyseTicket, draftAcknowledgement } from '../src/case/analyse';
import { DISCLAIMER, SHORT_DISCLAIMER } from '../src/legal/disclaimer';
import { confirmButtonHint, readTextAreaValue } from '../src/panel/confirm';
import { panelFromCase } from '../src/panel/model';
import { draftView } from '../src/rovo/view';

const created = '2026-11-06T09:02:00.000Z';

const spanishFiling = {
  summary: 'Duda sobre mi factura',
  description:
    'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
  created,
  llmEnabled: false as const,
};

describe('panel copy', () => {
  it('writes the acknowledgement in Spanish for a Spanish filing, with the agent note separate', async () => {
    const record = await analyseTicket(spanishFiling);
    expect(record.filingLanguage).toBe('es');
    const draft = draftAcknowledgement(record, 'SUP-14');
    const panel = panelFromCase(record, 'SUP-14');
    expect(draft.text).toBe([
      'Estimado cliente:',
      '',
      'Gracias por escribirnos. Hemos leído su mensaje. Una persona revisará esta respuesta antes de enviarla.',
      '',
      `Usted escribió: "${record.quote}"`,
      'Responderemos a estos puntos:',
      record.points.map((point, index) => `${index + 1}. ${point}`).join('\n'),
      'Nos proponemos responder en 5 días naturales desde su mensaje. Ese plazo es una hipótesis de trabajo, no un compromiso.',
    ].join('\n'));
    expect(draft.text).not.toMatch(/Hello|Thank you|Agent draft|article 12|legal advice/i);
    expect(draft.agentNote).toContain('Agent draft marker: FR-SUP-14');
    expect(draft.agentNote).toMatch(/does not fulfil article 12/i);
    expect(draft.agentNote).toContain('This draft has not been sent.');
    expect(draft.agentNote).not.toContain(SHORT_DISCLAIMER);
    expect(draft.agentNote).not.toContain(DISCLAIMER);
    expect(panel.draftText).toBe(draft.text);
    expect(panel.draftAgentNote).toBe(draft.agentNote);
    expect(panel.shortDisclaimer).toBe(SHORT_DISCLAIMER);
    expect(panel.quoteLabel).toBe('Sentence that makes it a complaint');
    expect(panel.clockHeading).toBe('Deadline');
    expect(panel.missingHeading).toBe('What is still missing');
  });

  it('uses English for an English filing and when the filing language is unclear', async () => {
    const english = await analyseTicket({
      summary: 'Duplicate charge',
      description: 'This is unacceptable. I demand a refund because you have charged this account twice.',
      created,
      llmEnabled: false,
    });
    expect(english.filingLanguage).toBe('en');
    const draft = draftAcknowledgement(english, 'SUP-3');
    expect(draft.text.startsWith('Hello,')).toBe(true);
    expect(draft.text).toContain('not a promise');
    expect(draft.text).not.toContain('Estimado cliente:');
    const unclear = draftAcknowledgement({ ...english, filingLanguage: null }, 'SUP-3');
    expect(unclear.text.startsWith('Hello,')).toBe(true);
  });

  it('hides the acknowledgement once a public reply exists, including when the case is ready to close', async () => {
    const refund = 'Hemos abonado los 48 € del recibo duplicado de marzo.';
    const invoice = 'Adjuntamos la factura corregida.';
    const partial = await analyseTicket({ ...spanishFiling, agentPublicReplies: [refund], publicComments: [refund] });
    const partialPanel = panelFromCase(partial, 'SUP-14');
    expect(partial.hasPublicReply).toBe(true);
    expect(partialPanel.headline).toBe('Uncovered points');
    expect(partialPanel.showDraft).toBe(false);
    expect(partialPanel.draftText).toBeNull();
    expect(partialPanel.missingHeading).toBe('What is still missing');

    const closed = await analyseTicket({
      ...spanishFiling,
      agentPublicReplies: [refund, invoice],
      publicComments: [refund, invoice],
    });
    const closedPanel = panelFromCase(closed, 'SUP-14');
    expect(closedPanel.headline).toBe('Ready to close');
    expect(closedPanel.showDraft).toBe(false);
    expect(closedPanel.missingHeading).toBeNull();
    expect(closedPanel.clockHeading).toBe('Deadline');
    expect(draftView('SUP-14', closed).text).toContain('Estimado cliente:');
  });

  it('says a non-complaint may still need a review only once', async () => {
    const record = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    const panel = panelFromCase(record);
    const visible = [panel.deadlineLabel, panel.nextStep, panel.obligationLine ?? '', panel.classification].join('\n');
    expect(panel.headline).toBe('Not a complaint');
    expect(panel.deadlineLabel).toBe('No complaint clock is running.');
    expect(visible.match(/may still need a review/gi)).toHaveLength(1);
    expect(panel.nextStep).toContain('A consulta or incidencia may still need a review');
  });

  it('keeps the confirm buttons disabled until a reason is written', () => {
    expect(confirmButtonHint('', false)).toEqual({ disabled: true, hint: 'Write a reason to enable' });
    expect(confirmButtonHint('   ', false).hint).toBe('Write a reason to enable');
    expect(confirmButtonHint('The billing failure is real.', false)).toEqual({ disabled: false, hint: null });
    expect(confirmButtonHint('The billing failure is real.', true)).toEqual({
      disabled: true,
      hint: 'Saving this decision.',
    });
    expect(readTextAreaValue({ target: { value: 'Because the charge repeated.' } })).toBe('Because the charge repeated.');
    expect(readTextAreaValue('typed straight through')).toBe('typed straight through');
  });
});
