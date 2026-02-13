/**
 * Architectural gate: ensures all API routes that execute MariaDB queries
 * do so through approved shared builders — not raw SQL.
 *
 * This prevents metric drift (e.g., one route counting customers differently)
 * by enforcing that CRM queries go through builders backed by crmMetrics.ts.
 *
 * Two rules enforced:
 * 1. API routes using executeMariaDBQuery must import an approved builder
 * 2. Builder modules querying raw CRM tables must import from crmMetrics.ts
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
];

/**
 * Builder modules that query raw CRM tables (subscription, invoice, etc.)
 * must import shared definitions from crmMetrics.ts.
 *
 * onPageCrmQueries is excluded — it queries crm_subscription_enriched
 * where metrics are pre-computed at ETL time.
 */
const BUILDER_MODULES_REQUIRING_CRM_METRICS = [
  'lib/server/crmQueryBuilder.ts',
  'lib/server/crmDetailModalQueryBuilder.ts',
  'lib/server/validationRateQueryBuilder.ts',
  'lib/server/marketingQueryBuilder.ts',
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
});
