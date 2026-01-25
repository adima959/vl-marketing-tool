import { Pool } from '@neondatabase/serverless';
import { createDatabaseError, normalizeError } from '@/lib/types/errors';

// Lazy initialization of database pool
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
  try {
    const result = await getPool().query(query, params);
    return result.rows as T[];
  } catch (error: unknown) {
    const appError = normalizeError(error);
    console.error('Database query error:', {
      code: appError.code,
      message: appError.message,
      query: query.substring(0, 200), // Log first 200 chars
      params,
    });
    throw createDatabaseError(`Database query failed: ${appError.message}`, {
      query: query.substring(0, 200),
      originalError: appError.message,
    });
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await getPool().query('SELECT NOW() as current_time');
    console.log('Database connected:', result.rows[0].current_time);
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
