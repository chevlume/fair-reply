import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { R3_SCORE_BEFORE, R4_SCORE_BEFORE, loadFixtures, runEval } from '../src/eval/run';

describe('fixture eval', () => {
  it('prints original, hard, and independent scores', () => {
    const digest = createHash('sha256').update(readFileSync('fixtures/independent.json')).digest('hex');
    expect(digest).toBe('31a1afc6f71eb341cf39ffc9872992cb282aabb7e80e11213f549ee3fbbf00a9');
    const r3Digest = createHash('sha256').update(readFileSync('fixtures/r3.json')).digest('hex');
    expect(r3Digest).toBe('4736aa53dd7d39a698483c282ef92cd2b801c472e046c7605f75ea3cd0d32617');
    const r4Digest = createHash('sha256').update(readFileSync('fixtures/r4.json')).digest('hex');
    expect(r4Digest).toBe('e396ccde8956eef7592a426321f3b6e29169f235fc53beac43449a0fcd42e5ec');

    for (const file of ['fixtures/tickets.json', 'fixtures/hard.json']) {
      const fixtures = loadFixtures(file);
      expect(fixtures).toHaveLength(30);
      expect(fixtures.filter((ticket) => ticket.lang === 'es')).toHaveLength(15);
      expect(fixtures.filter((ticket) => ticket.lang === 'en')).toHaveLength(15);
    }

    const { original, hard, independent, r3, r4 } = runEval();
    expect(original.passed).toBeGreaterThanOrEqual(28);
    expect(hard.passed).toBeGreaterThanOrEqual(27);
    expect(original.line).toBe('30/30');
    expect(hard.line).toBe('30/30');
    expect(independent.total).toBe(40);
    expect(independent.complaints).toBe(28);
    expect(independent.negatives).toBe(12);
    expect(independent.recovered).toBeGreaterThanOrEqual(26);
    expect(independent.falseAlarms).toBeLessThanOrEqual(1);
    expect(independent.invented).toBe(0);
    expect(independent.line).toBe('40/40');
    expect(independent.misses).toEqual([]);
    expect(original.failures).toEqual([]);
    expect(hard.failures).toEqual([]);
    expect(R3_SCORE_BEFORE.full).toBe('14/40');
    expect(R3_SCORE_BEFORE.recovered).toBe('14/28');
    expect(R3_SCORE_BEFORE.falseAlarms).toBe('3/12');
    expect(R3_SCORE_BEFORE.wrongClock).toBe('2');
    expect(R3_SCORE_BEFORE.invented).toBe('0');
    expect(r3.total).toBe(40);
    expect(r3.complaints).toBe(28);
    expect(r3.negatives).toBe(12);
    expect(r3.line).toBe('40/40');
    expect(r3.recovered).toBe(28);
    expect(r3.falseAlarms).toBe(0);
    expect(r3.wrongClock).toBe(0);
    expect(r3.invented).toBe(0);
    expect(r3.misses).toEqual([]);
    expect(R4_SCORE_BEFORE.full).toBe('17/40');
    expect(R4_SCORE_BEFORE.recovered).toBe('16/28');
    expect(R4_SCORE_BEFORE.falseAlarms).toBe('2/12');
    expect(R4_SCORE_BEFORE.wrongClock).toBe('5');
    expect(R4_SCORE_BEFORE.invented).toBe('0');
    expect(r4.total).toBe(40);
    expect(r4.complaints).toBe(28);
    expect(r4.negatives).toBe(12);
    expect(r4.line).toBe('40/40');
    expect(r4.recovered).toBe(28);
    expect(r4.falseAlarms).toBe(0);
    expect(r4.wrongClock).toBe(0);
    expect(r4.invented).toBe(0);
    expect(r4.misses).toEqual([]);
  });
});