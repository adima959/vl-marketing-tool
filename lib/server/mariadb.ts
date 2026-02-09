import mysql from 'mysql2/promise';
import { createDatabaseError, createNetworkError, createTimeoutError, normalizeError } from '@/lib/types/errors';

/**
 * MariaDB connection pool configuration
 *
 * Uses environment variables for credentials
 * Supports both development and production environments
 */
const poolConfig: mysql.PoolOptions = {
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,

  // Connection pool settings
  waitForConnections: true,
  connectionLimit: 10,           // Max 10 concurrent connections
  maxIdle: 10,                   // Max idle connections
  idleTimeout: 60000,            // Close idle connections after 60s
  queueLimit: 0,                 // No limit on queued connection requests

  // Timeout settings (important for VPN/remote connections)
  connectTimeout: 10000,         // 10 seconds to establish connection

  // Keep-alive settings
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Singleton pool instance (lazy initialization)
let pool: mysql.Pool | null = null;

/**
 * Get or create MariaDB connection pool
 *
 * Lazy initialization ensures pool is only created when first needed
 */
function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(poolConfig);
  }
  return pool;
}

/**
 * Execute a parameterized query against MariaDB
 *
 * Uses ? placeholders for parameters (MariaDB/MySQL syntax)
 * Automatically handles connection pooling
 *
 * @param query - SQL query with ? placeholders
 * @param params - Array of parameter values (strings, numbers, booleans, null, Date)
 * @returns Query results as typed array
 *
 * @example
 * const users = await executeMariaDBQuery<User>(
 *   'SELECT * FROM users WHERE email = ?',
 *   ['user@example.com']
 * );
 */
export async function executeMariaDBQuery<T = Record<string, unknown>>(
  query: string,
  params: (string | number | boolean | null | Date)[] = []
): Promise<T[]> {
  const start = performance.now();
  try {
    const pool = getPool();

    // Use query() for simple queries, execute() for parameterized
    // This avoids "prepared statement needs to be re-prepared" errors with views
    const [rows] = params.length > 0
      ? await pool.execute(query, params)
      : await pool.query(query);

    const duration = performance.now() - start;
    if (duration > 500) {
      console.warn(`[MariaDB SLOW] ${duration.toFixed(0)}ms — ${query.replace(/\s+/g, ' ').substring(0, 120)}`);
    }

    return rows as T[];
  } catch (error: unknown) {
    const normalized = normalizeError(error);

    // Extract MySQL error code if available
    const mysqlError = error as any;
    const mysqlCode = mysqlError?.errno;
    const errorMessage = normalized.message.toLowerCase();

    // Log error details for debugging
    console.error('MariaDB query error:', {
      error: normalized.message,
      code: normalized.code,
      mysqlCode: mysqlCode,
      query: query.substring(0, 200),
      paramCount: params.length,
    });

    // Connection timeout errors
    if (errorMessage.includes('etimedout') || errorMessage.includes('timeout')) {
      throw createTimeoutError(
        'Database connection timeout - please check your connection and try again',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    // Connection refused errors
    if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
      throw createNetworkError(
        'Unable to connect to database - please check your network connection',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    // Host not found errors
    if (errorMessage.includes('enotfound') || errorMessage.includes('getaddrinfo')) {
      throw createNetworkError(
        'Database host not found - please check your network connection',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    // Connection reset errors
    if (errorMessage.includes('econnreset') || errorMessage.includes('connection reset')) {
      throw createNetworkError(
        'Database connection was reset - please try again',
        {
          query: query.substring(0, 200),
          originalError: normalized.message,
        }
      );
    }

    // MySQL/MariaDB specific error codes
    switch (mysqlCode) {
      // Authentication errors
      case 1045: // ER_ACCESS_DENIED_ERROR
        throw createDatabaseError('Database authentication failed', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case 1049: // ER_BAD_DB_ERROR
        throw createDatabaseError('Database not found', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Constraint violations
      case 1062: // ER_DUP_ENTRY
        throw createDatabaseError('This record already exists', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case 1452: // ER_NO_REFERENCED_ROW
      case 1451: // ER_ROW_IS_REFERENCED
        throw createDatabaseError('Cannot delete - this record is referenced by other data', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case 1048: // ER_BAD_NULL_ERROR
      case 1364: // ER_NO_DEFAULT_FOR_FIELD
        throw createDatabaseError('Required field is missing', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Table/column errors
      case 1146: // ER_NO_SUCH_TABLE
        throw createDatabaseError('Database table not found', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case 1054: // ER_BAD_FIELD_ERROR
        throw createDatabaseError('Database column not found', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Lock/deadlock errors
      case 1213: // ER_LOCK_DEADLOCK
        throw createDatabaseError('Database deadlock detected - please try again', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      case 1205: // ER_LOCK_WAIT_TIMEOUT
        throw createTimeoutError('Database lock timeout - please try again', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });

      // Connection limit errors
      case 1203: // ER_TOO_MANY_USER_CONNECTIONS
      case 1040: // ER_CON_COUNT_ERROR
        throw createDatabaseError('Too many database connections - please try again shortly', {
          query: query.substring(0, 200),
          originalError: normalized.message,
        });
    }

    // Generic pattern matching for authentication
    if (errorMessage.includes('access denied') || errorMessage.includes('authentication')) {
      throw createDatabaseError('Database authentication failed', {
        query: query.substring(0, 200),
        originalError: normalized.message,
      });
    }

    // Syntax errors
    if (errorMessage.includes('syntax error') || errorMessage.includes('sql syntax')) {
      throw createDatabaseError('Database query error - please try again', {
        query: query.substring(0, 200),
        originalError: normalized.message,
      });
    }

    // Generic database error
    throw createDatabaseError(
      `Database query failed: ${normalized.message}`,
      {
        query: query.substring(0, 200),
        originalError: normalized.message,
      }
    );
  }
}

/**
 * Test MariaDB connection
 *
 * Useful for health checks and debugging
 *
 * @returns true if connection successful, false otherwise
 */
export async function testMariaDBConnection(): Promise<boolean> {
  try {
    const pool = getPool();

    // Get connection from pool
    const connection = await pool.getConnection();

    // Ping database
    await connection.ping();

    // Release connection back to pool
    connection.release();

    return true;
  } catch (error) {
    console.error('MariaDB connection test failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      host: process.env.MARIADB_HOST,
      database: process.env.MARIADB_DATABASE,
    });
    return false;
  }
}

/**
 * Close MariaDB connection pool
 *
 * Call this during graceful shutdown
 * Not typically needed in serverless environments
 */
export async function closeMariaDBPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Get database information
 *
 * Useful for debugging and verification
 */
export async function getMariaDBInfo(): Promise<{
  version: string;
  database: string;
  host: string;
}> {
  const versionResult = await executeMariaDBQuery<{ version: string }>(
    'SELECT VERSION() as version'
  );

  const dbResult = await executeMariaDBQuery<{ database: string }>(
    'SELECT DATABASE() as `database`'
  );

  return {
    version: versionResult[0]?.version || 'unknown',
    database: dbResult[0]?.database || 'unknown',
    host: process.env.MARIADB_HOST || 'unknown',
  };
}
