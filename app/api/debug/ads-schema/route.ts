import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';

/**
 * GET /api/debug/ads-schema
 * Shows all available columns in merged_ads_spending table
 */
export async function GET() {
  try {
    // Get sample row to see all columns
    const sample = await executeQuery<Record<string, unknown>>(`
      SELECT * FROM merged_ads_spending
      WHERE date >= '2026-02-01'::date
      LIMIT 1
    `);

    if (sample.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No data found',
      });
    }

    const columns = Object.keys(sample[0]);
    const columnDetails = columns.map(col => ({
      name: col,
      type: typeof sample[0][col],
      sampleValue: sample[0][col],
    }));

    return NextResponse.json({
      success: true,
      totalColumns: columns.length,
      columns: columnDetails,
      sampleRow: sample[0],
    });
  } catch (error: unknown) {
    console.error('[DEBUG] Ads schema error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
