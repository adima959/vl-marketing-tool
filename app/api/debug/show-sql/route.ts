import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/rbac';
import type { AppUser } from '@/types/user';

/**
 * POST /api/debug/show-sql
 * Shows exactly what SQL and parameters will be used for a marketing query
 */
async function handleShowSQL(
  request: NextRequest,
  _user: AppUser
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { dateRange } = body;

    // Simulate the exact logic from marketingQueryBuilder.ts
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    // Shift back 1 day (current logic)
    const startDateShifted = new Date(startDate);
    startDateShifted.setDate(startDateShifted.getDate() - 1);

    const endDateShifted = new Date(endDate);
    endDateShifted.setDate(endDateShifted.getDate() - 1);

    const startParam = startDateShifted.toISOString().split('T')[0];
    const endParam = endDateShifted.toISOString().split('T')[0];

    return NextResponse.json({
      success: true,
      input: {
        start: dateRange.start,
        end: dateRange.end,
      },
      processing: {
        startDateParsed: startDate.toISOString(),
        endDateParsed: endDate.toISOString(),
        startDateShifted: startDateShifted.toISOString(),
        endDateShifted: endDateShifted.toISOString(),
      },
      sql: {
        query: "WHERE date::date BETWEEN $1::date AND $2::date",
        param1: startParam,
        param2: endParam,
      },
      expectedMatch: {
        shouldMatch: "2026-01-31T23:00:00.000Z (3,571 clicks)",
        willMatch: `Timestamps where date::date = '${startParam}'`,
      },
    });
  } catch (error: unknown) {
    console.error('[DEBUG] Show SQL error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const POST = withAdmin(handleShowSQL);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/debug/show-sql',
    methods: ['POST'],
    description: 'Shows SQL query and parameters that will be used',
  });
}
