import { crmQueryBuilder } from '@/lib/server/crmQueryBuilder';
import type { CRMQueryOptions } from '@/lib/server/crmQueryBuilder';

function makeDateRange(startISO: string, endISO: string) {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  return {
    start: new Date(Date.UTC(sy, sm - 1, sd)),
    end: new Date(Date.UTC(ey, em - 1, ed)),
  };
}

const JAN_2026 = makeDateRange('2026-01-01', '2026-01-31');

describe('crmQueryBuilder', () => {
  // -------------------------------------------------------------------------
  // buildQuery
  // -------------------------------------------------------------------------

  describe('buildQuery', () => {
    it('geography mode basic (Dashboard pattern)', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'geography', dimensions: ['country'] },
        depth: 0,
      };

      const result = crmQueryBuilder.buildQuery(options);

      // LEFT JOIN for invoice (dashboard pattern)
      expect(result.query).toContain(
        'LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1'
      );

      // leftJoinExpr for trial count
      expect(result.query).toContain(
        'COUNT(DISTINCT CASE WHEN i.type = 1 THEN i.id END)'
      );

      // Should NOT have tracking mode WHERE clauses
      expect(result.query).not.toContain('s.deleted = 0');
      expect(result.query).not.toContain('s.tracking_id_4 IS NOT NULL');

      // Params: [startDate, endDate]
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
        ]
      `);
    });

    it('tracking mode basic (Marketing pattern)', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'tracking', dimensions: ['campaign'] },
        depth: 0,
      };

      const result = crmQueryBuilder.buildQuery(options);

      // INNER JOIN for invoice (marketing pattern)
      expect(result.query).toContain(
        'INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1'
      );

      // innerJoinExpr for trial count
      expect(result.query).toContain('COUNT(DISTINCT i.id)');

      // Tracking mode WHERE clauses
      expect(result.query).toContain('s.deleted = 0');
      expect(result.query).toContain('s.tracking_id_4 IS NOT NULL');
      expect(result.query).toContain("s.tracking_id_4 != 'null'");
      expect(result.query).toContain('s.tracking_id_2 IS NOT NULL');
      expect(result.query).toContain("s.tracking_id_2 != 'null'");
      expect(result.query).toContain('s.tracking_id IS NOT NULL');
      expect(result.query).toContain("s.tracking_id != 'null'");

      // Source column for JS-side matching
      expect(result.query).toContain('sr.source AS source');

      // Params: [startDate, endDate]
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
        ]
      `);
    });

    it('geography mode with parent filters', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'geography', dimensions: ['country', 'source'] },
        depth: 1,
        parentFilters: { country: 'US' },
      };

      const result = crmQueryBuilder.buildQuery(options);

      // Filter condition for country
      expect(result.query).toContain('c.country = ?');

      // Params: [startDate, endDate, 'US']
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
          "US",
        ]
      `);
    });

    it('geography mode with Unknown filter (NULL handling)', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'geography', dimensions: ['country', 'source'] },
        depth: 1,
        parentFilters: { country: 'Unknown' },
      };

      const result = crmQueryBuilder.buildQuery(options);

      // Unknown maps to NULL check with the custom nullCheck expression
      expect(result.query).toContain("(c.country IS NULL OR c.country = '')");

      // No extra param for Unknown — only date params
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
        ]
      `);
    });

    it('tracking mode with product filter', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'tracking', dimensions: ['campaign'] },
        depth: 0,
        productFilter: '%Balansera%',
      };

      const result = crmQueryBuilder.buildQuery(options);

      // Product filter EXISTS subquery
      expect(result.query).toContain('EXISTS (');
      expect(result.query).toContain('SELECT 1 FROM invoice_product ip');
      expect(result.query).toContain('p.product_name LIKE ?');

      // Params: [startDate, endDate, productFilter]
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
          "%Balansera%",
        ]
      `);
    });
  });

  // -------------------------------------------------------------------------
  // buildOtsQuery
  // -------------------------------------------------------------------------

  describe('buildOtsQuery', () => {
    it('geography mode OTS', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'geography', dimensions: ['country'] },
        depth: 0,
      };

      const result = crmQueryBuilder.buildOtsQuery(options);

      // OTS queries use FROM invoice (not subscription)
      expect(result.query).toContain('FROM invoice i');
      expect(result.query).not.toContain('FROM subscription');

      // OTS base filter
      expect(result.query).toContain('i.type = 3 AND i.deleted = 0');

      // OTS metrics
      expect(result.query).toContain('COUNT(DISTINCT i.id)');
      expect(result.query).toContain(
        'COUNT(DISTINCT CASE WHEN i.is_marked = 1 THEN i.id END)'
      );

      // OTS-specific JOINs (customer via invoice, not subscription)
      expect(result.query).toContain(
        'LEFT JOIN customer c ON c.id = i.customer_id'
      );

      // Should NOT have subscription-path tracking clauses
      expect(result.query).not.toContain('s.tracking_id');

      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
        ]
      `);
    });

    it('tracking mode OTS', () => {
      const options: CRMQueryOptions = {
        dateRange: JAN_2026,
        groupBy: { type: 'tracking', dimensions: ['campaign', 'date'] },
        depth: 0,
      };

      const result = crmQueryBuilder.buildOtsQuery(options);

      // Tracking dimensions should use i. prefix (not s.)
      expect(result.query).toContain('i.tracking_id_4');

      // Date dimension should use order_date (not date_create)
      expect(result.query).not.toContain('date_create');

      // OTS tracking ID validation (on invoice fields)
      expect(result.query).toContain('i.tracking_id_4 IS NOT NULL');
      expect(result.query).toContain("i.tracking_id_4 != 'null'");
      expect(result.query).toContain('i.tracking_id_2 IS NOT NULL');
      expect(result.query).toContain("i.tracking_id_2 != 'null'");
      expect(result.query).toContain('i.tracking_id IS NOT NULL');
      expect(result.query).toContain("i.tracking_id != 'null'");

      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01 00:00:00",
          "2026-01-31 23:59:59",
        ]
      `);
    });
  });
});
