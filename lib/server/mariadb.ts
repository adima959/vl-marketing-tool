import mysql from 'mysql2/promise';

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
  connectTimeout: 30000,         // 30 seconds to establish connection

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
    console.log('✅ MariaDB connection pool created');
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
  try {
    const pool = getPool();

    // Use query() for simple queries, execute() for parameterized
    // This avoids "prepared statement needs to be re-prepared" errors with views
    const [rows] = params.length > 0
      ? await pool.execute(query, params)
      : await pool.query(query);

    return rows as T[];
  } catch (error) {
    // Log error details for debugging
    console.error('MariaDB query error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      query: query.substring(0, 200), // Log first 200 chars only
      paramCount: params.length,
    });

    // Re-throw to let caller handle
    throw error;
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

    console.log('✅ MariaDB connection test successful');
    return true;
  } catch (error) {
    console.error('❌ MariaDB connection test failed:', {
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
    console.log('✅ MariaDB connection pool closed');
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
