/**
 * Spanish labour holidays used by the deadline engine.
 *
 * Sources (public calendars, not copied statutory prose):
 * - 2026: BOE-A-2025-21667 (Resolución de 17 de octubre de 2025)
 * - 2027: BOE-A-2026-21254 (Resolución de 8 de octubre de 2026)
 *
 * Encoded dates are national holidays observed in every autonomous community
 * and both autonomous cities, plus the statutory national dates that fall on
 * a Sunday (they do not remove a weekday). Regional and local holidays are
 * out of scope. In particular, Jueves Santo is not encoded: the 2026 and 2027
 * annexes do not mark it for Catalonia and the Valencian Community.
 * Monday substitutes chosen by only some communities are also excluded
 * (2 Nov 2026, 7 Dec 2026, 16 Aug 2027, and Extremadura's 11 Oct 2027 substitute).
 */
export interface NationalHoliday {
  date: string;
  name: string;
  /** national-non-substitutable = BOE "*"; national-kept-everywhere = BOE "**" in all 19 territories. */
  scope: 'national-non-substitutable' | 'national-kept-everywhere';
  note?: string;
}

export const NATIONAL_HOLIDAYS: readonly NationalHoliday[] = [
  { date: '2026-01-01', name: 'Año Nuevo', scope: 'national-non-substitutable' },
  { date: '2026-01-06', name: 'Epifanía del Señor', scope: 'national-kept-everywhere' },
  { date: '2026-04-03', name: 'Viernes Santo', scope: 'national-non-substitutable' },
  { date: '2026-05-01', name: 'Fiesta del Trabajo', scope: 'national-non-substitutable' },
  { date: '2026-08-15', name: 'Asunción de la Virgen', scope: 'national-non-substitutable' },
  { date: '2026-10-12', name: 'Fiesta Nacional de España', scope: 'national-non-substitutable' },
  {
    date: '2026-11-01',
    name: 'Todos los Santos',
    scope: 'national-non-substitutable',
    note: 'Sunday in 2026. The Monday substitute is regional and is not encoded.',
  },
  {
    date: '2026-12-06',
    name: 'Día de la Constitución Española',
    scope: 'national-non-substitutable',
    note: 'Sunday in 2026. The Monday substitute is regional and is not encoded.',
  },
  { date: '2026-12-08', name: 'Inmaculada Concepción', scope: 'national-non-substitutable' },
  { date: '2026-12-25', name: 'Natividad del Señor', scope: 'national-non-substitutable' },

  { date: '2027-01-01', name: 'Año Nuevo', scope: 'national-non-substitutable' },
  { date: '2027-01-06', name: 'Epifanía del Señor', scope: 'national-kept-everywhere' },
  { date: '2027-03-26', name: 'Viernes Santo', scope: 'national-non-substitutable' },
  { date: '2027-05-01', name: 'Fiesta del Trabajo', scope: 'national-non-substitutable' },
  {
    date: '2027-08-15',
    name: 'Asunción de la Virgen',
    scope: 'national-non-substitutable',
    note: 'Sunday in 2027. The BOE annex lists Monday substitutes only for some territories; those substitutes are not encoded.',
  },
  { date: '2027-10-12', name: 'Fiesta Nacional de España', scope: 'national-non-substitutable' },
  { date: '2027-11-01', name: 'Todos los Santos', scope: 'national-non-substitutable' },
  { date: '2027-12-06', name: 'Día de la Constitución Española', scope: 'national-non-substitutable' },
  { date: '2027-12-08', name: 'Inmaculada Concepción', scope: 'national-non-substitutable' },
  { date: '2027-12-25', name: 'Natividad del Señor', scope: 'national-non-substitutable' },
];

export const HOLIDAY_DATES: ReadonlySet<string> = new Set(NATIONAL_HOLIDAYS.map((holiday) => holiday.date));

export function isNationalHoliday(isoDate: string): boolean {
  return HOLIDAY_DATES.has(isoDate);
}
