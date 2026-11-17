import { describe, expect, it } from 'vitest';
import { analyseTicket } from '../src/case/analyse';
import { internalDraftNote } from '../src/rovo/internalNote';

const created = '2026-11-06T09:02:00.000Z';

describe('internal acknowledgement note', () => {
  it('builds an internal note from the customer draft and refuses a non-complaint', async () => {
    const complaint = await analyseTicket({
      summary: 'Duda sobre mi factura',
      description:
        'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
      created,
      llmEnabled: false,
    });
    const note = internalDraftNote(complaint, 'SUP-14');
    expect(note.ok).toBe(true);
    if (!note.ok) return;
    expect(note.body).toContain('not sent to the customer');
    expect(note.body).toContain('Estimado cliente:');
    expect(note.body).toContain('does not fulfil article 12');
    expect(note.body).not.toMatch(/sd\.public\.comment/);

    const hours = await analyseTicket({
      summary: 'Horario',
      description: '¿Cuál es el horario de la oficina?',
      created,
      llmEnabled: false,
    });
    const refused = internalDraftNote(hours, 'SUP-1');
    expect(refused.ok).toBe(false);
    expect(internalDraftNote(null, 'SUP-1').ok).toBe(false);
  });
});
