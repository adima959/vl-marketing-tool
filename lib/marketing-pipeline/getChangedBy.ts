import { NextRequest } from 'next/server';
import { getUserFromRequest } from '@/lib/rbac';

/** Extract the current user's ID for history recording. Returns null if not authenticated. */
export async function getChangedBy(request: NextRequest): Promise<string | null> {
  try {
    const user = await getUserFromRequest(request);
    return user?.id ?? null;
  } catch {
    return null;
  }
}
