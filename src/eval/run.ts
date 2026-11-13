import { readFileSync } from 'node:fs';
import path from 'node:path';
import { detectByRules } from '../detect/rules';
import type { ComplaintCategory } from '../legal/assumptions';

export interface FixtureTicket {
  id: string;
  lang: 'es' | 'en';
  kind: 'hidden' | 'explicit' | 'none';
  summary: string;
  description: string;
  expectComplaint: boolean;
  expectCategory: ComplaintCategory;
  expectQuote: string | null;
}

export interface FixtureFailure {
  id: string;
  expected: { complaint: boolean; category: ComplaintCategory; quote: string | null };
  actual: { complaint: boolean; category: ComplaintCategory; quote: string | null };
  quoteIsSubstring: boolean;
}

export interface EvalReport {
  passed: number;
  total: number;
  line: string;
  failures: FixtureFailure[];
}

export function fixtureText(ticket: Pick<FixtureTicket, 'summary' | 'description'>): string {
  return `${ticket.summary}\n${ticket.description}`;
}

export function loadFixtures(file = path.join(process.cwd(), 'fixtures', 'tickets.json')): FixtureTicket[] {
  return JSON.parse(readFileSync(file, 'utf8')) as FixtureTicket[];
}

export function scoreFixtures(fixtures: FixtureTicket[]): EvalReport {
  const failures: FixtureFailure[] = [];
  for (const ticket of fixtures) {
    const text = fixtureText(ticket);
    const actual = detectByRules(text);
    const quoteIsSubstring = actual.quote == null || text.includes(actual.quote);
    const pass =
      quoteIsSubstring &&
      actual.isComplaint === ticket.expectComplaint &&
      actual.category === ticket.expectCategory &&
      actual.quote === ticket.expectQuote;
    if (!pass) {
      failures.push({
        id: ticket.id,
        expected: {
          complaint: ticket.expectComplaint,
          category: ticket.expectCategory,
          quote: ticket.expectQuote,
        },
        actual: {
          complaint: actual.isComplaint,
          category: actual.category,
          quote: actual.quote,
        },
        quoteIsSubstring,
      });
    }
  }
  const passed = fixtures.length - failures.length;
  return {
    passed,
    total: fixtures.length,
    line: `${passed}/${fixtures.length}`,
    failures,
  };
}

/** Score of fixtures/hard.json before the rules in the previous pass. Not recomputed. */
export const HARD_SCORE_BEFORE = '6/30';

export interface IndependentMiss {
  id: string;
  expectedComplaint: boolean;
  actualComplaint: boolean;
  expectedCategory: string;
  actualCategory: string;
  quote: string | null;
  literal: boolean;
  proves: boolean;
}

export interface IndependentReport {
  full: number;
  total: number;
  line: string;
  recovered: number;
  complaints: number;
  falseAlarms: number;
  negatives: number;
  wrongClock: number;
  invented: number;
  misses: IndependentMiss[];
}

interface IndependentRow {
  id: string;
  lang: string;
  summary: string;
  description: string;
  expected: {
    isComplaint: boolean;
    category: string;
    mustCiteSubstring?: string | null;
  };
}

export function scoreIndependent(file = path.join(process.cwd(), 'fixtures', 'independent.json')): IndependentReport {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as IndependentRow[];
  const misses: IndependentMiss[] = [];
  let full = 0;
  let recovered = 0;
  let falseAlarms = 0;
  let wrongClock = 0;
  let invented = 0;
  const complaints = rows.filter((row) => row.expected.isComplaint).length;
  const negatives = rows.length - complaints;

  for (const row of rows) {
    const text = `${row.summary}\n${row.description}`;
    const actual = detectByRules(text);
    const expectedCategory = row.expected.category === 'not_complaint' ? 'none' : row.expected.category;
    const literal = actual.quote == null || text.includes(actual.quote);
    if (!literal) invented += 1;
    const reference = row.expected.mustCiteSubstring ?? null;
    const quote = actual.quote;
    const proves = !row.expected.isComplaint
      ? quote == null
      : quote != null && literal && reference != null && (quote === reference || quote.includes(reference) || reference.includes(quote));
    const clockOk = actual.category === expectedCategory;
    const complaintMatch = actual.isComplaint === row.expected.isComplaint;
    if (row.expected.isComplaint && actual.isComplaint) recovered += 1;
    if (!row.expected.isComplaint && actual.isComplaint) falseAlarms += 1;
    if (row.expected.isComplaint && actual.isComplaint && !clockOk) wrongClock += 1;
    if (complaintMatch && clockOk && proves && literal) {
      full += 1;
    } else {
      misses.push({
        id: row.id,
        expectedComplaint: row.expected.isComplaint,
        actualComplaint: actual.isComplaint,
        expectedCategory,
        actualCategory: actual.category,
        quote: actual.quote,
        literal,
        proves,
      });
    }
  }

  return {
    full,
    total: rows.length,
    line: `${full}/${rows.length}`,
    recovered,
    complaints,
    falseAlarms,
    negatives,
    wrongClock,
    invented,
    misses,
  };
}

export type R3MissKind = 'not-detected' | 'wrong citation' | 'wrong clock' | 'false alarm';

export interface R3Miss extends IndependentMiss {
  kinds: R3MissKind[];
}

export interface R3Report extends IndependentReport {
  misses: R3Miss[];
}

/**
 * First blind score of fixtures/r3.json, recorded before any rule change
 * that used its misses. Not recomputed. fixtures/r3.json is no longer a blind holdout.
 */
export const R3_SCORE_BEFORE = {
  full: '14/40',
  recovered: '14/28',
  falseAlarms: '3/12',
  wrongClock: '2',
  invented: '0',
  misses: [
    'R3-ES-01 wrong citation',
    'R3-ES-02 not-detected',
    'R3-ES-03 not-detected',
    'R3-ES-04 not-detected',
    'R3-ES-05 not-detected',
    'R3-ES-07 not-detected',
    'R3-ES-09 wrong citation',
    'R3-ES-11 wrong citation',
    'R3-ES-12 wrong citation',
    'R3-ES-13 wrong citation',
    'R3-ES-14 wrong clock+wrong citation',
    'R3-ES-16 false alarm',
    'R3-ES-17 false alarm',
    'R3-EN-01 not-detected',
    'R3-EN-02 not-detected',
    'R3-EN-04 not-detected',
    'R3-EN-05 not-detected',
    'R3-EN-07 not-detected',
    'R3-EN-08 not-detected',
    'R3-EN-09 not-detected',
    'R3-EN-10 wrong clock+wrong citation',
    'R3-EN-11 wrong citation',
    'R3-EN-12 wrong citation',
    'R3-EN-13 not-detected',
    'R3-EN-14 not-detected',
    'R3-EN-17 false alarm',
  ].join('; '),
} as const;

/**
 * First blind score of fixtures/r4.json, recorded before any rule change
 * that used its misses. Not recomputed. fixtures/r4.json is no longer a blind holdout.
 */
export const R4_SCORE_BEFORE = {
  full: '17/40',
  recovered: '16/28',
  falseAlarms: '2/12',
  wrongClock: '5',
  invented: '0',
  misses: [
    'R4-ES-01 not-detected',
    'R4-ES-02 wrong citation',
    'R4-ES-05 wrong clock+wrong citation',
    'R4-ES-06 not-detected',
    'R4-ES-08 wrong citation',
    'R4-ES-09 wrong clock',
    'R4-ES-11 not-detected',
    'R4-ES-13 wrong citation',
    'R4-ES-15 not-detected',
    'R4-ES-16 false alarm',
    'R4-ES-17 wrong clock+wrong citation',
    'R4-ES-18 not-detected',
    'R4-EN-01 not-detected',
    'R4-EN-05 not-detected',
    'R4-EN-06 not-detected',
    'R4-EN-07 false alarm',
    'R4-EN-09 wrong citation',
    'R4-EN-11 not-detected',
    'R4-EN-12 wrong clock+wrong citation',
    'R4-EN-15 not-detected',
    'R4-EN-17 not-detected',
    'R4-EN-18 not-detected',
    'R4-EN-19 wrong clock',
  ].join('; '),
} as const;

function missKinds(input: {
  expectedComplaint: boolean;
  actualComplaint: boolean;
  clockOk: boolean;
  proves: boolean;
}): R3MissKind[] {
  if (!input.expectedComplaint && input.actualComplaint) return ['false alarm'];
  if (input.expectedComplaint && !input.actualComplaint) return ['not-detected'];
  const kinds: R3MissKind[] = [];
  if (!input.clockOk) kinds.push('wrong clock');
  if (!input.proves) kinds.push('wrong citation');
  return kinds.length > 0 ? kinds : ['wrong citation'];
}

/** Same proving rule as the independent set. The detector receives only summary and description. */
export function scoreR3(file = path.join(process.cwd(), 'fixtures', 'r3.json')): R3Report {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as IndependentRow[];
  const misses: R3Miss[] = [];
  let full = 0;
  let recovered = 0;
  let falseAlarms = 0;
  let wrongClock = 0;
  let invented = 0;
  const complaints = rows.filter((row) => row.expected.isComplaint).length;
  const negatives = rows.length - complaints;

  for (const row of rows) {
    const text = `${row.summary}\n${row.description}`;
    const actual = detectByRules(text);
    const expectedCategory = row.expected.category === 'not_complaint' ? 'none' : row.expected.category;
    const literal = actual.quote == null || text.includes(actual.quote);
    if (!literal) invented += 1;
    const reference = row.expected.mustCiteSubstring ?? null;
    const quote = actual.quote;
    const proves = !row.expected.isComplaint
      ? quote == null
      : quote != null && literal && reference != null && (quote === reference || quote.includes(reference) || reference.includes(quote));
    const clockOk = actual.category === expectedCategory;
    const complaintMatch = actual.isComplaint === row.expected.isComplaint;
    if (row.expected.isComplaint && actual.isComplaint) recovered += 1;
    if (!row.expected.isComplaint && actual.isComplaint) falseAlarms += 1;
    if (row.expected.isComplaint && actual.isComplaint && !clockOk) wrongClock += 1;
    if (complaintMatch && clockOk && proves && literal) {
      full += 1;
    } else {
      misses.push({
        id: row.id,
        expectedComplaint: row.expected.isComplaint,
        actualComplaint: actual.isComplaint,
        expectedCategory,
        actualCategory: actual.category,
        quote,
        literal,
        proves,
        kinds: missKinds({
          expectedComplaint: row.expected.isComplaint,
          actualComplaint: actual.isComplaint,
          clockOk,
          proves,
        }),
      });
    }
  }

  return {
    full,
    total: rows.length,
    line: `${full}/${rows.length}`,
    recovered,
    complaints,
    falseAlarms,
    negatives,
    wrongClock,
    invented,
    misses,
  };
}

export function printR3(report: R3Report, label: string): void {
  console.log(`${label} full: ${report.line}`);
  console.log(`${label} complaints recovered: ${report.recovered}/${report.complaints}`);
  console.log(`${label} false alarms: ${report.falseAlarms}/${report.negatives}`);
  console.log(`${label} wrong clocks: ${report.wrongClock}`);
  console.log(`${label} invented citations: ${report.invented}`);
  if (report.misses.length === 0) console.log(`${label} misses: none`);
  for (const miss of report.misses) {
    console.log(`${label} ${miss.id} ${miss.kinds.join('+')} complaint ${miss.expectedComplaint}->${miss.actualComplaint} cat ${miss.expectedCategory}->${miss.actualCategory} proves ${miss.proves} quote ${JSON.stringify(miss.quote)}`);
  }
}

export function runEval(): { original: EvalReport; hard: EvalReport; independent: IndependentReport; r3: R3Report; r4: R3Report } {
  const original = scoreFixtures(loadFixtures(path.join(process.cwd(), 'fixtures', 'tickets.json')));
  const hard = scoreFixtures(loadFixtures(path.join(process.cwd(), 'fixtures', 'hard.json')));
  const independent = scoreIndependent();
  const r3 = scoreR3();
  const r4 = scoreR3(path.join(process.cwd(), 'fixtures', 'r4.json'));
  console.log(`Fair Reply rules detector (fixtures): ${original.line}`);
  console.log(`Fair Reply rules detector (hard): ${hard.line}`);
  console.log(`Fair Reply independent (full): ${independent.line}`);
  console.log(`Independent complaints recovered: ${independent.recovered}/${independent.complaints}`);
  console.log(`Independent false alarms: ${independent.falseAlarms}/${independent.negatives}`);
  if (independent.misses.length === 0) console.log('Independent misses: none');
  for (const miss of independent.misses) {
    console.log(`independent ${miss.id} complaint ${miss.expectedComplaint}->${miss.actualComplaint} cat ${miss.expectedCategory}->${miss.actualCategory} proves ${miss.proves} quote ${JSON.stringify(miss.quote)}`);
  }
  console.log('r3 is no longer a blind holdout; rules were changed after its misses were seen.');
  console.log(`r3 FIRST full: ${R3_SCORE_BEFORE.full}`);
  console.log(`r3 FIRST recovered: ${R3_SCORE_BEFORE.recovered}`);
  console.log(`r3 FIRST false alarms: ${R3_SCORE_BEFORE.falseAlarms}`);
  console.log(`r3 FIRST wrong clocks: ${R3_SCORE_BEFORE.wrongClock}`);
  console.log(`r3 FIRST invented citations: ${R3_SCORE_BEFORE.invented}`);
  console.log(`r3 FIRST misses: ${R3_SCORE_BEFORE.misses}`);
  printR3(r3, 'r3');
  console.log('r4 is no longer a blind holdout; rules were changed after its misses were seen.');
  console.log(`r4 FIRST full: ${R4_SCORE_BEFORE.full}`);
  console.log(`r4 FIRST recovered: ${R4_SCORE_BEFORE.recovered}`);
  console.log(`r4 FIRST false alarms: ${R4_SCORE_BEFORE.falseAlarms}`);
  console.log(`r4 FIRST wrong clocks: ${R4_SCORE_BEFORE.wrongClock}`);
  console.log(`r4 FIRST invented citations: ${R4_SCORE_BEFORE.invented}`);
  console.log(`r4 FIRST misses: ${R4_SCORE_BEFORE.misses}`);
  printR3(r4, 'r4');
  for (const failure of [...original.failures, ...hard.failures]) {
    console.log(`${failure.id} expected ${JSON.stringify(failure.expected)} actual ${JSON.stringify(failure.actual)}`);
  }
  return { original, hard, independent, r3, r4 };
}
