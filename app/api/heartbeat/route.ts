import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/server/db';
import { withAuth } from '@/lib/rbac';
import type { AppUser } from '@/types/user';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

const MIN_HEARTBEAT_INTERVAL_MS = 15_000; // Ignore heartbeats within 15s of last one
const lastHeartbeat = new Map<string, number>();

const heartbeatSchema = z.object({
  page: z.string().min(1).max(255).regex(/^\/[a-z0-9\-\/]*$/i, 'Invalid page path'),
  params: z.record(z.string(), z.string()).default({}).refine(
    (val) => JSON.stringify(val).length <= 2048,
    { message: 'Parameters too large' }
  ),
});

export const POST = withAuth(async (request: NextRequest, user: AppUser): Promise<NextResponse> => {
  try {
    const body = heartbeatSchema.parse(await request.json());

    // Server-side dedup: ignore if same user sent a heartbeat within 15s
    const now = Date.now();
    const lastTime = lastHeartbeat.get(user.id) ?? 0;
    if (now - lastTime < MIN_HEARTBEAT_INTERVAL_MS) {
      return NextResponse.json({ success: true });
    }
    lastHeartbeat.set(user.id, now);

    await executeQuery(
      `INSERT INTO app_usage_heartbeats (user_id, page, params) VALUES ($1, $2, $3)`,
      [user.id, body.page, JSON.stringify(body.params)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }
    // Silently fail — heartbeat loss is not critical
    return NextResponse.json({ success: false }, { status: 500 });
  }
});
