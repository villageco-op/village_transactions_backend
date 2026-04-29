import { sql, type SQL, type AnyColumn } from 'drizzle-orm';

/**
 * Generates an SQL condition to filter records by season based on a date/timestamp column.
 * @param season - The season to filter by ('spring', 'summer', 'fall', 'winter', 'all')
 * @param dateColumn - The drizzle column to perform month extraction on
 * @returns SQL condition or undefined if no season is applied
 */
export function getSeasonCondition(
  season: string | undefined,
  dateColumn: AnyColumn | SQL,
): SQL | undefined {
  if (!season || season === 'all') return undefined;

  switch (season) {
    case 'spring':
      return sql`EXTRACT(MONTH FROM ${dateColumn}) IN (3, 4, 5)`;
    case 'summer':
      return sql`EXTRACT(MONTH FROM ${dateColumn}) IN (6, 7, 8)`;
    case 'fall':
      return sql`EXTRACT(MONTH FROM ${dateColumn}) IN (9, 10, 11)`;
    case 'winter':
      return sql`EXTRACT(MONTH FROM ${dateColumn}) IN (12, 1, 2)`;
    default:
      return undefined;
  }
}
