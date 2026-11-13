import { describe, expect, it } from 'vitest';
import { detectByRules, extractPoints } from '../src/detect/rules';
import { assessCoverage, explainCoverage } from '../src/detect/coverage';
import { deadlineFor } from '../src/legal/deadlines';
import { verifyCitations } from '../src/detect/citations';
import { detectHybrid, isLlmEnabled } from '../src/detect/hybrid';
import { parseLlmJson } from '../src/detect/forgeLlm';
import { readFileSync } from 'node:fs';

describe('rules detector', () => {
  it('cites the demand inside a ticket filed as a billing question', () => {
    const text = [
      'Duda sobre mi factura',
      'Quería comentar un cargo del recibo. Es la tercera vez que os lo digo y exijo que me devolváis los 48 €. También necesito la factura corregida.',
    ].join('\n');
    const detected = detectByRules(text);
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('billing');
    expect(detected.quote).toBe('Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.');
    expect(text.includes(detected.quote ?? '')).toBe(true);
    expect(extractPoints(text, detected)).toEqual([
      'Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.',
      'También necesito la factura corregida.',
    ]);
  });

  it('does not treat a how-to question about refunds as a complaint', () => {
    const text = 'Información sobre devoluciones\n¿Cómo solicito una devolución si me arrepiento en 14 días?';
    const detected = detectByRules(text);
    expect(detected.isComplaint).toBe(false);
    expect(detected.quote).toBeNull();
    expect(detected.category).toBe('none');
  });

  it('does not treat a thank-you note as a complaint', () => {
    const detected = detectByRules('Gracias\nGracias, la incidencia de ayer ya está resuelta.');
    expect(detected.isComplaint).toBe(false);
  });

  it('flags an ambiguous sentence for a human without calling it a complaint', () => {
    const detected = detectByRules('Feedback\nI am not happy with the wait, but I only wanted to say so.');
    expect(detected.isComplaint).toBe(false);
    expect(detected.ambiguous).toBe(true);
    expect(detected.needsHumanReview).toBe(true);
    expect(detected.quote).toBeNull();
  });
});

describe('reply coverage', () => {
  const points = [
    'Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.',
    'También necesito la factura corregida.',
  ];

  it('marks the refund answered and the corrected invoice open', () => {
    const answered = assessCoverage(points, ['Hemos abonado los 48 € del recibo duplicado de marzo.']);
    expect(answered).toEqual([true, false]);
  });

  it('does not treat a generic holding reply as coverage', () => {
    expect(assessCoverage(points, ['Estamos revisando su solicitud.'])).toEqual([false, false]);
    expect(assessCoverage(points, ['Gracias por su mensaje. Gracias por escribirnos sobre la factura y los 48 €.'])).toEqual([false, false]);
  });

  it('accepts a specific refusal as covering the point it addresses', () => {
    const answered = assessCoverage(points, [
      'No podemos devolver los 48 € porque la lectura del contador coincide con la tarifa contratada.',
    ]);
    expect(answered).toEqual([true, false]);
  });

  it('does not treat an echo of the same nouns as an answer', () => {
    const echo = 'Hemos leído la factura corregida y los 48 € del recibo que mencionas.';
    const rows = explainCoverage(points, [echo]);
    expect(rows.map((row) => row.answered)).toEqual([false, false]);
    expect(rows[0]?.fragment).toBe(echo);
    expect(rows[1]?.fragment).toBe(echo);
  });

  it('binds a money decision to the point that names that amount', () => {
    const rows = explainCoverage(points, ['Hemos abonado los 48 €.']);
    expect(rows.map((row) => row.answered)).toEqual([true, false]);
    const otherAmount = explainCoverage(points, ['Hemos abonado los 12 € de otro cargo.']);
    expect(otherAmount.map((row) => row.answered)).toEqual([false, false]);
  });

  it('recognises a credit note and a scheduled visit as decisions', () => {
    const credit = explainCoverage(
      ['Es la tercera vez que os lo digo y exijo que me devolváis los 48 €.'],
      ['Hemos emitido una nota de abono por los 48 €.'],
    );
    expect(credit[0]?.answered).toBe(true);
    const visit = explainCoverage(
      ['Necesito que venga el técnico a revisar la avería.'],
      ['Queda programada la visita del técnico para el martes.'],
    );
    expect(visit[0]?.answered).toBe(true);
    const echo = explainCoverage(points, ['We have noted your invoice and the 48 EUR refund.']);
    expect(echo.map((row) => row.answered)).toEqual([false, false]);
  });

  it('answers only the point that received a decision', () => {
    const rows = explainCoverage(points, [
      'Hemos abonado los 48 € del recibo duplicado de marzo. Sobre la factura corregida, la hemos leído.',
    ]);
    expect(rows.map((row) => row.answered)).toEqual([true, false]);
    expect(rows[1]?.fragment).toMatch(/factura corregida/i);
  });

  it('matches an appointment reply in the same language', () => {
    const point = 'Os escribí el lunes y sigo sin una cita para la revisión que prometisteis.';
    const answered = assessCoverage([point], ['Hemos reservado la cita de revisión para el martes.']);
    expect(answered).toEqual([true]);
  });
});

describe('continuity clock scope', () => {
  const created = '2026-11-06T09:02:00.000Z';

  it('uses 2 clock hours for a contracted water failure', () => {
    const detected = detectByRules('Consulta\nDesde las siete no sale agua de ningún grifo y el suministro contratado sigue activo.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('outage');
    expect(deadlineFor(created, detected.category).deadlineAt).toBe('2026-11-06T11:02:00.000Z');
  });

  it('uses 2 clock hours for a contracted gas failure', () => {
    const detected = detectByRules('Supply\nThe gas supply to the flat has been off since dawn and the agreement is active.');
    expect(detected.category).toBe('outage');
    expect(deadlineFor(created, detected.category).ruleLabel).toMatch(/not a repair promise/i);
  });

  it('does not use the 2-hour clock when a document portal has no service', () => {
    const detected = detectByRules('Acceso\nEl portal de documentos lleva toda la mañana sin servicio y no puedo descargar los archivos.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).not.toBe('outage');
  });

  it('does not use the 2-hour clock when an unrelated app has no service', () => {
    const detected = detectByRules('App access\nThe mobile app has no service this morning and I cannot open my documents.');
    expect(detected.category).not.toBe('outage');
  });

  it('cites the broken provision rather than the complaint label', () => {
    const detected = detectByRules('Recibo\nReclamación sobre el recibo.\nHabéis facturado 200 kWh cuando las lecturas solo difieren en 20 kWh.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('billing');
    expect(detected.quote).toMatch(/solo difieren/i);
  });

  it('treats gas that is not arriving as a continuity interruption', () => {
    const detected = detectByRules('Suministro\nPresento una reclamación.\nDesde ayer no llega gas a la vivienda y el contrato sigue activo.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('outage');
    expect(detected.quote).toMatch(/no llega gas/i);
    expect(deadlineFor(created, detected.category).ruleLabel).toMatch(/not a repair promise/i);
  });

  it('does not treat another person\'s review as the customer\'s complaint', () => {
    const detected = detectByRules('Clase\nEn una reseña de otra persona he leído: «Me habéis cortado el gas». Yo no tengo contrato con vosotros.');
    expect(detected.isComplaint).toBe(false);
    expect(detected.quote).toBeNull();
    expect(detected.category).toBe('none');
  });

  it('does not treat a question about the word reclamación as a complaint', () => {
    const detected = detectByRules('Formulario\nEn el formulario aparecen consulta y reclamación. ¿Qué significa la palabra reclamación? No estoy describiendo ningún problema.');
    expect(detected.isComplaint).toBe(false);
    expect(detected.category).toBe('none');
  });

  it('cites the charge that the tariff excludes, not the tariff sentence alone', () => {
    const detected = detectByRules('Tarifa\nLa tarifa contratada es sin cuota de alta. En el segundo mes ya habéis incluido una cuota de 8 euros.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('billing');
    expect(detected.quote).toMatch(/habéis incluido una cuota/i);
  });

  it('cites a current electricity failure rather than a short summary', () => {
    const detected = detectByRules('Aviso\nSin luz desde las seis\nDesde las seis no tenemos electricidad en el portal.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('outage');
    expect(detected.quote).toMatch(/no tenemos electricidad en el portal/i);
  });

  it('does not use the two-hour clock for damage after a past cut', () => {
    const detected = detectByRules('Daños\nReclamación por daños tras el corte.\nTras la subida de tensión se quemó la nevera. Solicito la indemnización.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).not.toBe('outage');
    expect(detected.quote).toMatch(/se quemó la nevera/i);
  });

  it('does not treat a class exercise about the word reclamación as a complaint', () => {
    const detected = detectByRules('Clase\nPara un ejercicio, ¿es correcto decir presentar una reclamación?');
    expect(detected.isComplaint).toBe(false);
    expect(detected.category).toBe('none');
  });

  it('does not treat a review the writer disowns as their complaint', () => {
    const detected = detectByRules("Review\nSaw this review online: 'they never paid the claim at all'. Not my experience.");
    expect(detected.isComplaint).toBe(false);
    expect(detected.quote).toBeNull();
  });

  it('cites a missed visit rather than the complaint label', () => {
    const detected = detectByRules('Cita\nQueja: el técnico no vino\nTenía cita el viernes y el técnico no apareció ni avisó.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).not.toBe('outage');
    expect(detected.quote).toMatch(/no apareció ni avisó/i);
  });

  it('treats a cancellation penalty as a billing complaint', () => {
    const detected = detectByRules('Baja\nAl contratar me dijeron que no había permanencia y ahora me cobran una penalización de 80 €.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).toBe('billing');
    expect(detected.quote).toMatch(/penalización de 80/i);
  });

  it('does not use the 2-hour clock when a customer area has no service', () => {
    const detected = detectByRules('Acceso\nEl área de clientes lleva toda la mañana sin servicio y no puedo consultar los contratos.');
    expect(detected.isComplaint).toBe(true);
    expect(detected.category).not.toBe('outage');
    expect(deadlineFor(created, detected.category).ruleLabel).not.toMatch(/2 clock hours/);
  });
});

describe('llm gate', () => {
  it('is off unless FAIR_REPLY_LLM=on', () => {
    expect(isLlmEnabled({})).toBe(false);
    expect(isLlmEnabled({ FAIR_REPLY_LLM: 'off' })).toBe(false);
    expect(isLlmEnabled({ FAIR_REPLY_LLM: 'on' })).toBe(true);
  });

  it('does not call the llm client on the default path', async () => {
    let calls = 0;
    const result = await detectHybrid('Duda\nEs indignante que nadie responda.', {
      llmEnabled: false,
      llmComplete: async () => {
        calls += 1;
        return { isComplaint: false, quote: null, category: 'none', points: [] };
      },
    });
    expect(calls).toBe(0);
    expect(result.engine).toBe('rules');
    expect(result.isComplaint).toBe(true);
  });

  it('rejects an llm quote that is not a substring and keeps the rules result', async () => {
    const text = 'Feedback\nI am not happy with the wait.';
    const result = await detectHybrid(text, {
      llmEnabled: true,
      llmComplete: async () => ({
        isComplaint: true,
        quote: 'a sentence the customer never wrote',
        category: 'general',
        points: ['a sentence the customer never wrote'],
      }),
    });
    expect(result.engine).toBe('rules');
    expect(result.isComplaint).toBe(false);
    expect(result.needsHumanReview).toBe(true);
    expect(result.quote).toBeNull();
  });

  it('accepts an llm quote only when it is copied from the ticket', async () => {
    const text = 'Feedback\nI am not happy with the wait.';
    const quote = 'I am not happy with the wait.';
    const result = await detectHybrid(text, {
      llmEnabled: true,
      llmComplete: async () => ({
        isComplaint: true,
        quote,
        category: 'general',
        points: [quote],
      }),
    });
    expect(result.engine).toBe('llm');
    expect(result.quote).toBe(quote);
    expect(text.includes(result.quote ?? '')).toBe(true);
  });

  it('parses fenced json and drops nothing until citation checks run', () => {
    const parsed = parseLlmJson('```json\n{"isComplaint":true,"quote":"hola","category":"billing","points":["hola"]}\n```');
    expect(parsed?.category).toBe('billing');
    expect(verifyCitations('hola mundo', ['hola', 'inventado'])).toEqual({
      accepted: ['hola'],
      rejected: ['inventado'],
    });
  });

  it('keeps the @forge/llm import behind the enable flag', () => {
    const source = readFileSync('src/detect/forgeLlm.ts', 'utf8');
    expect(source).not.toMatch(/import\s*\{[^}]*chat[^}]*\}\s*from\s*['"]@forge\/llm['"]/);
    expect(source).toContain("await import('@forge/llm')");
    expect(source).toContain('isLlmEnabled');
    const runtime = readFileSync('src/runtime.ts', 'utf8');
    expect(runtime).toContain('llmEnabled');
    expect(runtime).toContain('createForgeLlmClient');
    expect(runtime).not.toMatch(/from '@forge\/llm'/);
  });
});
