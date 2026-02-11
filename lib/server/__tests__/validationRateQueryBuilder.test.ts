import { generateTimePeriods } from '@/lib/server/validationRateQueryBuilder';

// Helper: create a Date at UTC midnight
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('generateTimePeriods', () => {
  // -------------------------------------------------------------------------
  // Weekly periods
  // -------------------------------------------------------------------------
  describe('weekly', () => {
    it('creates 2 full weekly periods for a 2-week range', () => {
      const periods = generateTimePeriods(utc(2026, 1, 5), utc(2026, 1, 18), 'weekly');

      expect(periods).toHaveLength(2);
      expect(periods.map((p) => [p.startDate, p.endDate])).toMatchInlineSnapshot(`
        [
          [
            "2026-01-05 00:00:00",
            "2026-01-11 23:59:59",
          ],
          [
            "2026-01-12 00:00:00",
            "2026-01-18 23:59:59",
          ],
        ]
      `);
    });

    it('clamps the first period to startDate when partial week', () => {
      const periods = generateTimePeriods(utc(2026, 1, 8), utc(2026, 1, 18), 'weekly');

      expect(periods).toHaveLength(2);
      expect(periods[0].startDate).toMatchInlineSnapshot(`"2026-01-08 00:00:00"`);
      expect(periods[0].endDate).toMatchInlineSnapshot(`"2026-01-11 23:59:59"`);
      expect(periods[1].startDate).toMatchInlineSnapshot(`"2026-01-12 00:00:00"`);
      expect(periods[1].endDate).toMatchInlineSnapshot(`"2026-01-18 23:59:59"`);
    });

    it('returns a single period for same-day range', () => {
      const periods = generateTimePeriods(utc(2026, 1, 10), utc(2026, 1, 10), 'weekly');

      expect(periods).toHaveLength(1);
      expect(periods[0].startDate).toMatchInlineSnapshot(`"2026-01-10 00:00:00"`);
      expect(periods[0].endDate).toMatchInlineSnapshot(`"2026-01-10 23:59:59"`);
    });
  });

  // -------------------------------------------------------------------------
  // Biweekly periods
  // -------------------------------------------------------------------------
  describe('biweekly', () => {
    it('creates 2 half-month periods for a full month', () => {
      const periods = generateTimePeriods(utc(2026, 1, 1), utc(2026, 1, 31), 'biweekly');

      expect(periods).toHaveLength(2);
      expect(periods.map((p) => [p.startDate, p.endDate])).toMatchInlineSnapshot(`
        [
          [
            "2026-01-01 00:00:00",
            "2026-01-14 23:59:59",
          ],
          [
            "2026-01-15 00:00:00",
            "2026-01-31 23:59:59",
          ],
        ]
      `);
    });

    it('handles cross-month biweekly periods', () => {
      const periods = generateTimePeriods(utc(2026, 1, 15), utc(2026, 2, 14), 'biweekly');

      expect(periods).toHaveLength(2);
      expect(periods.map((p) => [p.startDate, p.endDate])).toMatchInlineSnapshot(`
        [
          [
            "2026-01-15 00:00:00",
            "2026-01-31 23:59:59",
          ],
          [
            "2026-02-01 00:00:00",
            "2026-02-14 23:59:59",
          ],
        ]
      `);
    });

    it('handles February (28 days) correctly', () => {
      const periods = generateTimePeriods(utc(2026, 2, 1), utc(2026, 2, 28), 'biweekly');

      expect(periods).toHaveLength(2);
      expect(periods.map((p) => [p.startDate, p.endDate])).toMatchInlineSnapshot(`
        [
          [
            "2026-02-01 00:00:00",
            "2026-02-14 23:59:59",
          ],
          [
            "2026-02-15 00:00:00",
            "2026-02-28 23:59:59",
          ],
        ]
      `);
    });
  });

  // -------------------------------------------------------------------------
  // Monthly periods
  // -------------------------------------------------------------------------
  describe('monthly', () => {
    it('creates 3 monthly periods for a 3-month range', () => {
      const periods = generateTimePeriods(utc(2026, 1, 1), utc(2026, 3, 31), 'monthly');

      expect(periods).toHaveLength(3);
      expect(periods.map((p) => [p.startDate, p.endDate])).toMatchInlineSnapshot(`
        [
          [
            "2026-01-01 00:00:00",
            "2026-01-31 23:59:59",
          ],
          [
            "2026-02-01 00:00:00",
            "2026-02-28 23:59:59",
          ],
          [
            "2026-03-01 00:00:00",
            "2026-03-31 23:59:59",
          ],
        ]
      `);
    });

    it('clamps the first month when startDate is mid-month', () => {
      const periods = generateTimePeriods(utc(2026, 1, 15), utc(2026, 3, 31), 'monthly');

      expect(periods).toHaveLength(3);
      expect(periods[0].startDate).toMatchInlineSnapshot(`"2026-01-15 00:00:00"`);
      expect(periods[0].endDate).toMatchInlineSnapshot(`"2026-01-31 23:59:59"`);
      // Subsequent months are full
      expect(periods[1].startDate).toMatchInlineSnapshot(`"2026-02-01 00:00:00"`);
      expect(periods[2].startDate).toMatchInlineSnapshot(`"2026-03-01 00:00:00"`);
    });

    it('includes year in label for months outside current year', () => {
      const periods = generateTimePeriods(utc(2025, 11, 1), utc(2026, 1, 31), 'monthly');

      expect(periods).toHaveLength(3);
      // 2025 months should have year suffix
      expect(periods[0].label).toMatchInlineSnapshot(`"Nov 2025"`);
      expect(periods[1].label).toMatchInlineSnapshot(`"Dec 2025"`);
      // 2026 is the current year in the test context — label depends on runtime year
      // Since the function checks against new Date().getUTCFullYear(), we verify the dates
      expect(periods[2].startDate).toMatchInlineSnapshot(`"2026-01-01 00:00:00"`);
      expect(periods[2].endDate).toMatchInlineSnapshot(`"2026-01-31 23:59:59"`);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('enforces max 53 periods for large weekly ranges', () => {
      // 2 years = ~104 weeks, should be capped at 53 (break fires when periodIndex > 52)
      const periods = generateTimePeriods(utc(2024, 1, 1), utc(2025, 12, 31), 'weekly');

      expect(periods).toHaveLength(53);
    });

    it('returns periods in oldest-first order', () => {
      const periods = generateTimePeriods(utc(2026, 1, 1), utc(2026, 3, 31), 'monthly');

      for (let i = 1; i < periods.length; i++) {
        expect(periods[i].startDate > periods[i - 1].startDate).toBe(true);
      }
    });

    it('assigns sequential keys starting from the oldest period', () => {
      const periods = generateTimePeriods(utc(2026, 1, 1), utc(2026, 3, 31), 'monthly');

      // After reversal, the keys are in reverse index order (generated backwards)
      // The oldest period was generated last, so it has the highest index
      expect(periods[0].key).toBe('period_2');
      expect(periods[1].key).toBe('period_1');
      expect(periods[2].key).toBe('period_0');
    });
  });
});
