/**
 * Date utilities for the dashboard time series chart.
 */

/** Get date range for last 14 days (including today) */
export function getLast14DaysRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setDate(start.getDate() - 13);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

/** Parse "YYYY-MM-DD" as local date (not UTC) to avoid timezone shift */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Format date for X axis labels (e.g., "Jan 24") */
export function formatXAxisDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format date for tooltip (e.g., "Friday, Jan 24, 2026") */
export function formatTooltipDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
