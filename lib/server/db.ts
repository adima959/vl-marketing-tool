import { Pool } from '@neondatabase/serverless';
import { normalizeError } from '@/lib/types/errors';
import { classifyDatabaseError, PG_ERROR_CONFIG } from '@/lib/server/dbErrorClassifier';

// Lazy initialization of database pool
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Check if it's still the dummy build-time value
    if (dbUrl.includes('dummy') || dbUrl.includes('localhost')) {
      console.error('DATABASE_URL is not configured properly!');
      throw new Error('DATABASE_URL is set to dummy/localhost value. Please configure real database URL in environment variables.');
    }

    pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 10000, // 10s to establish connection (matches MariaDB)
    });
  }
  return pool;
}

/**
 * Execute a SQL query with parameters
 * @param query SQL query string with $1, $2, etc. placeholders
 * @param params Array of parameter values
 * @returns Query results as array of objects
 */
export async function executeQuery<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const start = performance.now();
  try {
    const result = await getPool().query(query, params);
    const duration = performance.now() - start;
    if (duration > 500) {
      console.warn(`[PG SLOW] ${duration.toFixed(0)}ms — ${query.replace(/\s+/g, ' ').substring(0, 120)}`);
    }
    return result.rows as T[];
  } catch (error: unknown) {
    throw classifyDatabaseError(error, query, params, PG_ERROR_CONFIG);
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getPool().query('SELECT NOW() as current_time');
    return true;
  } catch (error: unknown) {
    const appError = normalizeError(error);
    console.error('Database connection failed:', {
      code: appError.code,
      message: appError.message,
    });
    return false;
  }
}
