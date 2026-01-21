import { NextResponse } from 'next/server';
import {
  testMariaDBConnection,
  getMariaDBInfo,
  executeMariaDBQuery
} from '@/lib/server/mariadb';

/**
 * GET /api/test-mariadb
 *
 * Test MariaDB connection and return database information
 *
 * @returns Connection status and database info
 */
export async function GET() {
  try {
    // Test connection
    const isConnected = await testMariaDBConnection();

    if (!isConnected) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to connect to MariaDB',
          message: 'Check your environment variables and database credentials'
        },
        { status: 500 }
      );
    }

    // Get database info
    const info = await getMariaDBInfo();

    // Get table list
    const tables = await executeMariaDBQuery<{ TABLE_NAME: string }>(
      'SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE()'
    );

    return NextResponse.json({
      success: true,
      message: 'MariaDB connection successful',
      info: {
        version: info.version,
        database: info.database,
        host: info.host,
        tableCount: tables.length,
        tables: tables.map(t => t.TABLE_NAME),
      },
    });
  } catch (error) {
    console.error('MariaDB test error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'An error occurred while testing the MariaDB connection'
      },
      { status: 500 }
    );
  }
}
