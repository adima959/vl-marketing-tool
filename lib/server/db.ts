import { Pool } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create connection pool for parameterized queries
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Execute a SQL query with parameters
 * @param query SQL query string with $1, $2, etc. placeholders
 * @param params Array of parameter values
 * @returns Query results as array of objects
 */
export async function executeQuery<T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  try {
    const result = await pool.query(query, params);
    return result.rows as T[];
  } catch (error: any) {
    console.error('Database query error:', {
      error: error.message,
      query: query.substring(0, 200), // Log first 200 chars
      params,
    });
    throw new Error(`Database query failed: ${error.message}`);
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('Database connected:', result.rows[0].current_time);
    return true;
  } catch (error: any) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}
