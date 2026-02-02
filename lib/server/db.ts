import { Pool } from '@neondatabase/serverless';
import { createDatabaseError, createNetworkError, createTimeoutError, normalizeError } from '@/lib/types/errors';

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
    const normalized = normalizeError(error);

    // Extract PostgreSQL error code if available
    const pgError = error as any;
    const pgCode = pgError?.code;
    const errorMessage = normalized.message.toLowerCase();

    // Log error details for debugging
    console.error('PostgreSQL query error:', {
      error: normalized.message,
      code: normalized.code,
      pgCode: pgCode,
      query: query.substring(0, 200),
      params,
    });

    // Connection errors
    if (errorMessage.includes('etimedout') || errorMessage.includes('timeout')) {
      throw createTimeoutError(
        'Database connection timeout - please check your connection and try again',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
      throw createNetworkError(
        'Unable to connect to database - please check your network connection',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    if (errorMessage.includes('enotfound') || errorMessage.includes('getaddrinfo')) {
      throw createNetworkError(
        'Database host not found - please check your network connection',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    if (errorMessage.includes('econnreset') || errorMessage.includes('connection reset')) {
      throw createNetworkError(
        'Database connection was reset - please try again',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    // PostgreSQL specific error codes
    switch (pgCode) {
      // Authentication errors
      case '28P01': // Invalid password
      case '28000': // Invalid authorization
        throw createDatabaseError('Database authentication failed', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Constraint violations
      case '23505': // Unique violation
        throw createDatabaseError('This record already exists', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case '23503': // Foreign key violation
        throw createDatabaseError('Cannot delete - this record is referenced by other data', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case '23502': // Not null violation
        throw createDatabaseError('Required field is missing', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Table/column errors
      case '42P01': // Undefined table
        throw createDatabaseError('Database table not found', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case '42703': // Undefined column
        throw createDatabaseError('Database column not found', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Lock/deadlock errors
      case '40P01': // Deadlock detected
        throw createDatabaseError('Database deadlock detected - please try again', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Connection limit errors
      case '53300': // Too many connections
        throw createDatabaseError('Too many database connections - please try again shortly', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case '57P03': // Cannot connect now
        throw createDatabaseError('Database is currently unavailable - please try again shortly', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });
    }

    // Syntax errors (generic pattern matching)
    if (errorMessage.includes('syntax error') || errorMessage.includes('sql syntax')) {
      throw createDatabaseError('Database query error - please try again', {
        query: query.substring(0, 200),
        originalError: normalized.message,
      });
    }

    // Generic database error
    throw createDatabaseError(`Database query failed: ${normalized.message}`, {
      query: query.substring(0, 200),
      originalError: normalized.message,
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
