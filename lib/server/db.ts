import { Pool } from '@neondatabase/serverless';
import { createDatabaseError, normalizeError } from '@/lib/types/errors';

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
      console.error('❌ DATABASE_URL is not configured properly!');
      console.error('Current value:', dbUrl);
      throw new Error('DATABASE_URL is set to dummy/localhost value. Please configure real database URL in environment variables.');
    }

    console.log('✅ Initializing PostgreSQL connection to:', dbUrl.split('@')[1]?.split('/')[0] || 'unknown host');
    pool = new Pool({ connectionString: dbUrl });
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
