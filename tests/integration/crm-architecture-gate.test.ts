/**
 * Architectural gate: ensures all API routes that execute MariaDB queries
 * do so through approved shared builders — not raw SQL.
 *
 * This prevents metric drift (e.g., one route counting customers differently)
 * by enforcing that CRM queries go through builders backed by crmMetrics.ts.
 *
 * Three rules enforced:
 * 1. API routes using executeMariaDBQuery must import an approved builder
 * 2. Builder modules querying raw CRM tables must import from crmMetrics.ts
 * 3. Source-level trial/OTS queries must use same COALESCE + upsell exclusion as dashboard
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const API_DIR = path.join(ROOT, 'app/api');

/**
 * Query builder functions/objects backed by crmMetrics.ts.
 * Constants like CRM_DIMENSION_MAP don't count — they don't build queries.
 */
const APPROVED_BUILDER_IMPORTS = new Set([
  // @/lib/server/crmQueryBuilder
  'crmQueryBuilder',
  // @/lib/server/crmDetailModalQueryBuilder
  'crmDetailModalQueryBuilder',
  // @/lib/server/validationRateQueryBuilder
  'getValidationRateData',
  // @/lib/server/marketingQueryBuilder
  'getMarketingData',
  // @/lib/server/onPageCrmQueries
  'getOnPageCRMData',
  'getOnPageCRMByTrackingIds',
  'getOnPageCRMByVisitorIds',
]);

/** Routes that legitimately use executeMariaDBQuery without a builder */
const ALLOWED_EXCEPTIONS = [
  // Health check — runs SELECT 1, no CRM metrics
  'app/api/verify/mariadb/route.ts',
  // On-page CRM details — queries crm_subscription_enriched (pre-computed), not raw CRM tables
  'app/api/on-page-analysis/crm-details/route.ts',
];

/**
 * Builder modules that query raw CRM tables (subscription, invoice, etc.)
 * must import shared definitions from crmMetrics.ts.
 *
 * Excluded modules:
 * - onPageCrmQueries: queries crm_subscription_enriched (pre-computed at ETL time)
 * - marketingQueryBuilder: delegates CRM queries to crmQueryBuilder, no raw CRM SQL
 */
const BUILDER_MODULES_REQUIRING_CRM_METRICS = [
  'lib/server/crmQueryBuilder.ts',
  'lib/server/crmDetailModalQueryBuilder.ts',
  'lib/server/validationRateQueryBuilder.ts',
];

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Extract named imports from import statements: import { foo, bar as baz } from '...' */
function getImportedNames(content: string): string[] {
  const names: string[] = [];
  const regex = /import\s+\{([^}]+)\}\s+from/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    for (const part of match[1].split(',')) {
      // "foo as bar" → we want "foo"
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

const CRM_QUERY_BUILDER_PATH = path.join(ROOT, 'lib/server/crmQueryBuilder.ts');

/**
 * Required patterns for trial/OTS queries that must stay in sync
 * between the dashboard query builder and source-level fetch functions.
 *
 * When the dashboard query builder (buildTrialModeConfig / buildOtsModeConfig)
 * adds new JOINs or WHERE clauses, the source-level functions must also be updated.
 * This test catches the drift statically — no DB connection needed.
 */
const TRIAL_OTS_REQUIRED_PATTERNS = [
  { label: 'subscription JOIN (for upsell exclusion + COALESCE)', pattern: 'OTS_JOINS.subscription' },
  { label: 'source-from-sub JOIN (for COALESCE fallback)', pattern: 'OTS_JOINS.sourceFromSub' },
  { label: 'upsell exclusion WHERE clause', pattern: 'CRM_WHERE.upsellExclusion' },
  { label: 'COALESCE source column', pattern: 'COALESCE(sr.source, sr_sub.source)' },
];

/**
 * Extract a full exported function region from source code.
 * Finds `export ... function name(` and captures everything until the
 * next top-level `export` or end of file.
 */
function extractFunctionRegion(source: string, functionName: string): string | null {
  const marker = `function ${functionName}(`;
  const funcStart = source.indexOf(marker);
  if (funcStart === -1) return null;

  // Find the next top-level export after this function
  const nextExport = source.indexOf('\nexport ', funcStart + marker.length);
  return nextExport === -1
    ? source.slice(funcStart)
    : source.slice(funcStart, nextExport);
}

describe('CRM Architecture Gate', () => {
  describe('Rule 1: API routes must use approved builders for MariaDB queries', () => {
    it('should not allow raw executeMariaDBQuery without an approved builder', () => {
      const routeFiles = findTsFiles(API_DIR);
      const violations: string[] = [];

      for (const filePath of routeFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes('executeMariaDBQuery')) continue;

        const relativePath = path.relative(ROOT, filePath);
        if (ALLOWED_EXCEPTIONS.includes(relativePath)) continue;

        const importedNames = getImportedNames(content);
        const usesApprovedBuilder = importedNames.some((name) =>
          APPROVED_BUILDER_IMPORTS.has(name),
        );

        if (!usesApprovedBuilder) {
          violations.push(relativePath);
        }
      }

      expect(violations).toEqual([]);
    });

    it('should have valid allowed exceptions (files must exist)', () => {
      for (const exception of ALLOWED_EXCEPTIONS) {
        const fullPath = path.join(ROOT, exception);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    });
  });

  describe('Rule 2: Builder modules querying raw CRM tables must use crmMetrics.ts', () => {
    it('should import from crmMetrics.ts', () => {
      const violations: string[] = [];

      for (const modulePath of BUILDER_MODULES_REQUIRING_CRM_METRICS) {
        const fullPath = path.join(ROOT, modulePath);
        const content = fs.readFileSync(fullPath, 'utf-8');

        const importsCrmMetrics =
          content.includes("from './crmMetrics'") ||
          content.includes("from '@/lib/server/crmMetrics'");

        if (!importsCrmMetrics) {
          violations.push(modulePath);
        }
      }

      expect(violations).toEqual([]);
    });

    it('should have valid builder module paths (files must exist)', () => {
      for (const modulePath of BUILDER_MODULES_REQUIRING_CRM_METRICS) {
        const fullPath = path.join(ROOT, modulePath);
        expect(fs.existsSync(fullPath)).toBe(true);
      }
    });
  });

  describe('Rule 3: Source-level trial/OTS queries must match dashboard logic', () => {
    const source = fs.readFileSync(CRM_QUERY_BUILDER_PATH, 'utf-8');

    for (const funcName of ['fetchSourceCrmData', 'fetchSourceCountryCrmData']) {
      describe(funcName, () => {
        const body = extractFunctionRegion(source, funcName);

        it('should exist in crmQueryBuilder.ts', () => {
          expect(body).not.toBeNull();
        });

        for (const { label, pattern } of TRIAL_OTS_REQUIRED_PATTERNS) {
          it(`should use ${label}`, () => {
            expect(body).toContain(pattern);
          });
        }
      });
    }
  });
});
