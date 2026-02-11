import { onPageQueryBuilder } from '@/lib/server/onPageQueryBuilder';

/**
 * Unit tests for OnPageQueryBuilder.buildQuery()
 *
 * These test the SQL generation and parameter ordering without hitting a database.
 * Dates use CET-safe values (parsed as UTC midnight, which is 01:00 CET = same calendar day).
 */

describe('OnPageQueryBuilder.buildQuery', () => {
  const defaultDateRange = {
    start: new Date('2026-01-01'),
    end: new Date('2026-01-31'),
  };

  describe('basic dimension query (no JOINs)', () => {
    it('generates a query for urlPath at depth 0', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
      });

      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01",
          "2026-01-31",
        ]
      `);

      // No table alias when no JOINs needed
      expect(result.query).toContain('FROM remote_session_tracker.event_page_view_enriched_v2');
      expect(result.query).not.toContain('FROM remote_session_tracker.event_page_view_enriched_v2 pv');

      // Dimension mapped to url_path
      expect(result.query).toContain('url_path AS dimension_value');

      // Uses PostgreSQL placeholders
      expect(result.query).toContain('$1::date');
      expect(result.query).toContain('$2::date');

      // Should not have dimension_id for non-enriched dims
      expect(result.query).not.toContain('dimension_id');
    });

    it('generates a query for deviceType at depth 0', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['deviceType'],
        depth: 0,
      });

      expect(result.query).toContain('device_type AS dimension_value');
      expect(result.query).toContain('FROM remote_session_tracker.event_page_view_enriched_v2');
      expect(result.query).not.toContain(' pv');
    });
  });

  describe('enriched dimension (campaign) with JOINs', () => {
    it('generates a query with LEFT JOIN for campaign names', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['campaign'],
        depth: 0,
      });

      // Should alias the base table as pv
      expect(result.query).toContain('FROM remote_session_tracker.event_page_view_enriched_v2 pv');

      // Should LEFT JOIN the spending subquery
      expect(result.query).toContain('LEFT JOIN (');
      expect(result.query).toContain('FROM merged_ads_spending');
      expect(result.query).toContain(') mas ON pv.utm_campaign::text = mas.campaign_id::text');

      // Should produce dimension_id and dimension_value with name resolution
      expect(result.query).toContain('pv.utm_campaign::text AS dimension_id');
      expect(result.query).toContain('MAX(mas.campaign_name)');
    });

    it('uses adset-level JOIN when adset dimension is queried', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['adset'],
        depth: 0,
      });

      expect(result.query).toContain('adset_id, adset_name');
      expect(result.query).toContain('AND pv.utm_content::text = mas.adset_id::text');
    });
  });

  describe('classification dimension (classifiedProduct)', () => {
    it('generates JOINs to app_url_classifications and app_products', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['classifiedProduct'],
        depth: 0,
      });

      // Classification JOINs
      expect(result.query).toContain('LEFT JOIN app_url_classifications');
      expect(result.query).toContain('LEFT JOIN app_products');

      // SELECT uses product id as dimension_id and name as dimension_value
      expect(result.query).toContain('ap.id::text AS dimension_id');
      expect(result.query).toContain('MAX(ap.name)');
    });

    it('generates classifiedCountry with country_code', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['classifiedCountry'],
        depth: 0,
      });

      expect(result.query).toContain('uc.country_code AS dimension_value');
      expect(result.query).toContain('LEFT JOIN app_url_classifications');
    });
  });

  describe('parent filters with Unknown to NULL conversion', () => {
    it('converts Unknown parent filter value to IS NULL', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath', 'deviceType'],
        depth: 1,
        parentFilters: { urlPath: 'Unknown' },
      });

      // Unknown should become IS NULL, no extra param
      expect(result.query).toContain('url_path IS NULL');
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01",
          "2026-01-31",
        ]
      `);
    });

    it('adds a parameterized filter for non-Unknown parent value', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath', 'deviceType'],
        depth: 1,
        parentFilters: { urlPath: '/home' },
      });

      // Should add $3 param for the parent filter value
      expect(result.query).toContain('$3');
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01",
          "2026-01-31",
          "/home",
        ]
      `);
    });

    it('converts Unknown for enriched dimensions to IS NULL on parent filter expression', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['campaign', 'urlPath'],
        depth: 1,
        parentFilters: { campaign: 'Unknown' },
      });

      // Enriched dim Unknown uses its parentFilterExpr IS NULL
      expect(result.query).toContain('pv.utm_campaign::text IS NULL');
      expect(result.params).toHaveLength(2); // only date params
    });
  });

  describe('table filters with operators', () => {
    it('generates ILIKE with wildcard for contains operator', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
        filters: [{ field: 'urlPath', operator: 'contains', value: 'home' }],
      });

      expect(result.query).toContain('ILIKE');
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01",
          "2026-01-31",
          "%home%",
        ]
      `);
    });

    it('generates case-insensitive equals for equals operator', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
        filters: [{ field: 'urlPath', operator: 'equals', value: '/about' }],
      });

      expect(result.query).toContain('LOWER(');
      expect(result.params).toContain('/about');
    });

    it('generates IS NULL for equals with empty value', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
        filters: [{ field: 'urlPath', operator: 'equals', value: '' }],
      });

      expect(result.query).toContain('IS NULL');
      // No param added for empty equals
      expect(result.params).toHaveLength(2);
    });

    it('generates NOT ILIKE for not_contains operator', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
        filters: [{ field: 'urlPath', operator: 'not_contains', value: 'test' }],
      });

      expect(result.query).toContain('NOT ILIKE');
      expect(result.params).toContain('%test%');
    });
  });

  describe('param ordering', () => {
    it('orders params as [startDate, endDate, parentFilterParams, tableFilterParams]', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath', 'deviceType'],
        depth: 1,
        parentFilters: { urlPath: '/products' },
        filters: [{ field: 'deviceType', operator: 'contains', value: 'mobile' }],
      });

      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01",
          "2026-01-31",
          "/products",
          "%mobile%",
        ]
      `);

      // Verify placeholder ordering in query
      expect(result.query).toContain('$1::date');
      expect(result.query).toContain('$2::date');
      expect(result.query).toContain('$3');
      expect(result.query).toContain('$4');
    });

    it('skips param for Unknown parent filters but continues numbering', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath', 'deviceType'],
        depth: 1,
        parentFilters: { urlPath: 'Unknown' },
        filters: [{ field: 'deviceType', operator: 'contains', value: 'desktop' }],
      });

      // Unknown adds no param, so table filter gets $3
      expect(result.params).toMatchInlineSnapshot(`
        [
          "2026-01-01",
          "2026-01-31",
          "%desktop%",
        ]
      `);
      expect(result.query).toContain('$3');
    });
  });

  describe('sorting and limits', () => {
    it('defaults to sorting by page_views DESC', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
      });

      expect(result.query).toContain('ORDER BY page_views DESC');
    });

    it('sorts by date dimension_value DESC when dimension is date', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['date'],
        depth: 0,
      });

      expect(result.query).toContain('ORDER BY dimension_value DESC');
    });

    it('applies custom sort metric', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
        sortBy: 'uniqueVisitors',
      });

      expect(result.query).toContain('ORDER BY unique_visitors DESC');
    });

    it('clamps limit to safe range', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
        limit: 99999,
      });

      expect(result.query).toContain('LIMIT 10000');
    });

    it('uses default limit of 1000', () => {
      const result = onPageQueryBuilder.buildQuery({
        dateRange: defaultDateRange,
        dimensions: ['urlPath'],
        depth: 0,
      });

      expect(result.query).toContain('LIMIT 1000');
    });
  });

  describe('error handling', () => {
    it('throws when depth exceeds dimensions length', () => {
      expect(() =>
        onPageQueryBuilder.buildQuery({
          dateRange: defaultDateRange,
          dimensions: ['urlPath'],
          depth: 1,
        })
      ).toThrow('Depth 1 exceeds dimensions length 1');
    });

    it('throws for unknown dimension', () => {
      expect(() =>
        onPageQueryBuilder.buildQuery({
          dateRange: defaultDateRange,
          dimensions: ['nonexistent'],
          depth: 0,
        })
      ).toThrow('Unknown dimension: nonexistent');
    });

    it('throws for unknown parent filter dimension', () => {
      expect(() =>
        onPageQueryBuilder.buildQuery({
          dateRange: defaultDateRange,
          dimensions: ['urlPath', 'deviceType'],
          depth: 1,
          parentFilters: { bogus: 'value' },
        })
      ).toThrow('Unknown dimension in parent filter: bogus');
    });
  });
});
