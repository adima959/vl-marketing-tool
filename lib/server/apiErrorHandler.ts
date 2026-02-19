/**
 * Shared API error handler for route handlers.
 * Standardizes Zod validation errors and server errors.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unstable_rethrow } from 'next/navigation';
import { maskErrorForClient } from '@/lib/types/errors';

export function handleApiError(error: unknown, context: string): NextResponse<{ success: false; error: string }> {
  unstable_rethrow(error);

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { success: false as const, error: 'Invalid request data' },
      { status: 400 },
    );
  }

  const { message, statusCode } = maskErrorForClient(error, context);
  return NextResponse.json(
    { success: false as const, error: message },
    { status: statusCode },
  );
}
