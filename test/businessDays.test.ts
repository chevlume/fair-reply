import { describe, expect, it } from 'vitest';
import { addBusinessDays, isBusinessDay, madridParts } from '../src/legal/businessDays';
import { isNationalHoliday } from '../src/legal/holidays';
import { deadlineFor } from '../src/legal/deadlines';

describe('Spanish business days', () => {
  it('skips the weekend and keeps the Madrid wall time', () => {
    // Friday 6 Nov 2026 10:02 Europe/Madrid (CET, UTC+1).
    const start = new Date('2026-11-06T09:02:00.000Z');
    const deadline = addBusinessDays(start, 5);
    expect(deadline.toISOString()).toBe('2026-11-13T09:02:00.000Z');
    expect(madridParts(deadline).hour).toBe(10);
    expect(madridParts(deadline).minute).toBe(2);
  });

  it('does not count the creation day', () => {
    const start = new Date('2026-11-06T09:02:00.000Z');
    const one = addBusinessDays(start, 1);
    expect(one.toISOString()).toBe('2026-11-09T09:02:00.000Z');
  });

  it('moves a Saturday start onto the next business days', () => {
    const start = new Date('2026-11-07T09:00:00.000Z');
    expect(addBusinessDays(start, 1).toISOString()).toBe('2026-11-09T09:00:00.000Z');
  });

  it('skips Inmaculada 2026-12-08 and does not skip the regional Monday substitutes', () => {
    expect(isNationalHoliday('2026-12-08')).toBe(true);
    expect(isNationalHoliday('2026-12-07')).toBe(false);
    expect(isNationalHoliday('2026-11-02')).toBe(false);
    expect(isBusinessDay(2026, 12, 7)).toBe(true);
    expect(isBusinessDay(2026, 12, 8)).toBe(false);

    // Thursday 3 Dec 2026 09:00 Madrid. Fri 4, Mon 7, Wed 9 (Tue 8 is a holiday).
    const start = new Date('2026-12-03T08:00:00.000Z');
    expect(addBusinessDays(start, 3).toISOString()).toBe('2026-12-09T08:00:00.000Z');
  });

  it('does not treat Jueves Santo as national, and does skip Viernes Santo', () => {
    expect(isNationalHoliday('2026-04-02')).toBe(false);
    expect(isNationalHoliday('2026-04-03')).toBe(true);
    expect(isNationalHoliday('2027-03-25')).toBe(false);
    expect(isNationalHoliday('2027-03-26')).toBe(true);

    // Wednesday 1 Apr 2026 10:00 Madrid. +1 lands on Thursday 2 Apr, which is a business day here.
    const start = new Date('2026-04-01T08:00:00.000Z');
    expect(addBusinessDays(start, 1).toISOString()).toBe('2026-04-02T08:00:00.000Z');
    expect(addBusinessDays(start, 2).toISOString()).toBe('2026-04-06T08:00:00.000Z');
  });

  it('crosses the 2026/2027 holidays for a 15-business-day general period', () => {
    // Monday 14 Dec 2026 10:00 Madrid. 15th business day is Thursday 7 Jan 2027.
    const start = new Date('2026-12-14T09:00:00.000Z');
    expect(addBusinessDays(start, 15).toISOString()).toBe('2027-01-07T09:00:00.000Z');
    expect(isNationalHoliday('2026-12-25')).toBe(true);
    expect(isNationalHoliday('2027-01-01')).toBe(true);
    expect(isNationalHoliday('2027-01-06')).toBe(true);
    expect(isNationalHoliday('2027-12-06')).toBe(true);
  });

  it('preserves Madrid wall time across the March 2026 DST change', () => {
    // Friday 27 Mar 2026 10:00 CET (UTC+1) -> Monday 30 Mar 2026 10:00 CEST (UTC+2).
    const start = new Date('2026-03-27T09:00:00.000Z');
    const next = addBusinessDays(start, 1);
    expect(next.toISOString()).toBe('2026-03-30T08:00:00.000Z');
    expect(madridParts(next)).toMatchObject({ year: 2026, month: 3, day: 30, hour: 10, minute: 0 });
  });
});

describe('deadline categories', () => {
  const created = '2026-11-06T09:02:00.000Z';

  it('uses 5 calendar days for billing and 15 business days for general', () => {
    // Friday 6 Nov 2026 10:02 Madrid. Five calendar days is Wednesday 11 Nov, earlier than five business days (13 Nov).
    expect(deadlineFor(created, 'billing').deadlineAt).toBe('2026-11-11T09:02:00.000Z');
    expect(deadlineFor(created, 'general').deadlineAt).toBe('2026-11-27T09:02:00.000Z');
    expect(deadlineFor(created, 'billing').ruleLabel).toContain('5 calendar days');
    expect(deadlineFor(created, 'billing').ruleLabel).toMatch(/does not call them business days/i);
    expect(deadlineFor(created, 'general').ruleLabel).toContain('15 business days');
  });

  it('counts billing days through a national holiday', () => {
    const start = new Date('2026-12-23T09:00:00.000Z');
    expect(deadlineFor(start.toISOString(), 'billing').deadlineAt).toBe('2026-12-28T09:00:00.000Z');
  });

  it('uses two clock hours for a basic-service outage, including across midnight', () => {
    expect(deadlineFor(created, 'outage').deadlineAt).toBe('2026-11-06T11:02:00.000Z');
    expect(deadlineFor('2026-11-06T22:00:00.000Z', 'outage').deadlineAt).toBe('2026-11-07T00:00:00.000Z');
    expect(deadlineFor(created, 'outage').ruleLabel).toContain('2 clock hours');
  });

  it('sets no deadline when the request is not a complaint', () => {
    expect(deadlineFor(created, 'none').deadlineAt).toBeNull();
  });
});
