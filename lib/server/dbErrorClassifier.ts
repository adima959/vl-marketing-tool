/**
 * Config-driven database error classifier.
 *
 * Both PostgreSQL (db.ts) and MariaDB (mariadb.ts) had near-identical
 * error classification logic — network pattern matching, DB-specific
 * code mapping, and fallback text matching. This module unifies that
 * logic behind a single function driven by a per-DB config object.
 */

import type { AppError } from '@/lib/types/errors';
import { createDatabaseError, createNetworkError, createTimeoutError, normalizeError } from '@/lib/types/errors';

type ErrorFactory = (message: string, details?: Record<string, unknown>) => AppError;

interface CodeEntry {
  message: string;
  factory: ErrorFactory;
}

interface FallbackPattern {
  test: RegExp;
  message: string;
  factory: ErrorFactory;
}

export interface ErrorClassifierConfig {
  dbLabel: string;
  extractCode: (error: unknown) => string | number | undefined;
  codeMap: Record<string | number, CodeEntry>;
  fallbackPatterns?: FallbackPattern[];
}

// Network patterns shared by both databases
const NETWORK_PATTERNS: Array<{
  test: (msg: string) => boolean;
  message: string;
  factory: ErrorFactory;
}> = [
  {
    test: (msg) => msg.includes('etimedout') || msg.includes('timeout'),
    message: 'Database connection timeout - please check your connection and try again',
    factory: createTimeoutError,
  },
  {
    test: (msg) => msg.includes('econnrefused') || msg.includes('connection refused'),
    message: 'Unable to connect to database - please check your network connection',
    factory: createNetworkError,
  },
  {
    test: (msg) => msg.includes('enotfound') || msg.includes('getaddrinfo'),
    message: 'Database host not found - please check your network connection',
    factory: createNetworkError,
  },
  {
    test: (msg) => msg.includes('econnreset') || msg.includes('connection reset'),
    message: 'Database connection was reset - please try again',
    factory: createNetworkError,
  },
];

const SYNTAX_FALLBACK: FallbackPattern = {
  test: /syntax error|sql syntax/,
  message: 'Database query error - please try again',
  factory: createDatabaseError,
};

/**
 * Classify a database error into a typed AppError.
 * Checks network patterns first, then DB-specific error codes,
 * then fallback text patterns, and finally a generic fallback.
 */
export function classifyDatabaseError(
  error: unknown,
  query: string,
  params: unknown[] | undefined,
  config: ErrorClassifierConfig
): AppError {
  const normalized = normalizeError(error);
  const dbCode = config.extractCode(error);
  const errorMessage = normalized.message.toLowerCase();
  const details = { query: query.substring(0, 200), originalError: normalized.message };

  console.error(`${config.dbLabel} query error:`, {
    error: normalized.message,
    code: normalized.code,
    dbCode,
    query: query.substring(0, 200),
    paramCount: params?.length ?? 0,
  });

  // 1. Network patterns (shared across all DBs)
  for (const pattern of NETWORK_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return pattern.factory(pattern.message, details);
    }
  }

  // 2. DB-specific error codes
  if (dbCode !== undefined) {
    const entry = config.codeMap[dbCode];
    if (entry) {
      return entry.factory(entry.message, details);
    }
  }

  // 3. Fallback text patterns (DB-specific + shared syntax)
  const allFallbacks = [...(config.fallbackPatterns ?? []), SYNTAX_FALLBACK];
  for (const pattern of allFallbacks) {
    if (pattern.test.test(errorMessage)) {
      return pattern.factory(pattern.message, details);
    }
  }

  // 4. Generic fallback
  return createDatabaseError(`Database query failed: ${normalized.message}`, details);
}

// ── PostgreSQL config ──────────────────────────────────────────────

export const PG_ERROR_CONFIG: ErrorClassifierConfig = {
  dbLabel: 'PostgreSQL',
  extractCode: (error: unknown) => (error as Record<string, unknown>)?.code as string | undefined,
  codeMap: {
    '28P01': { message: 'Database authentication failed', factory: createDatabaseError },
    '28000': { message: 'Database authentication failed', factory: createDatabaseError },
    '23505': { message: 'This record already exists', factory: createDatabaseError },
    '23503': { message: 'Cannot delete - this record is referenced by other data', factory: createDatabaseError },
    '23502': { message: 'Required field is missing', factory: createDatabaseError },
    '42P01': { message: 'Database table not found', factory: createDatabaseError },
    '42703': { message: 'Database column not found', factory: createDatabaseError },
    '40P01': { message: 'Database deadlock detected - please try again', factory: createDatabaseError },
    '53300': { message: 'Too many database connections - please try again shortly', factory: createDatabaseError },
    '57P03': { message: 'Database is currently unavailable - please try again shortly', factory: createDatabaseError },
  },
};

// ── MariaDB config ─────────────────────────────────────────────────

export const MARIADB_ERROR_CONFIG: ErrorClassifierConfig = {
  dbLabel: 'MariaDB',
  extractCode: (error: unknown) => (error as Record<string, unknown>)?.errno as number | undefined,
  codeMap: {
    1045: { message: 'Database authentication failed', factory: createDatabaseError },
    1049: { message: 'Database not found', factory: createDatabaseError },
    1062: { message: 'This record already exists', factory: createDatabaseError },
    1452: { message: 'Cannot delete - this record is referenced by other data', factory: createDatabaseError },
    1451: { message: 'Cannot delete - this record is referenced by other data', factory: createDatabaseError },
    1048: { message: 'Required field is missing', factory: createDatabaseError },
    1364: { message: 'Required field is missing', factory: createDatabaseError },
    1146: { message: 'Database table not found', factory: createDatabaseError },
    1054: { message: 'Database column not found', factory: createDatabaseError },
    1213: { message: 'Database deadlock detected - please try again', factory: createDatabaseError },
    1205: { message: 'Database lock timeout - please try again', factory: createTimeoutError },
    1203: { message: 'Too many database connections - please try again shortly', factory: createDatabaseError },
    1040: { message: 'Too many database connections - please try again shortly', factory: createDatabaseError },
  },
  fallbackPatterns: [
    { test: /access denied|authentication/, message: 'Database authentication failed', factory: createDatabaseError },
  ],
};
