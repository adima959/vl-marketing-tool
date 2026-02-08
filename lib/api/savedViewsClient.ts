import type { SavedView } from '@/types/savedViews';
import { triggerAuthError, isAuthError } from '@/lib/api/authErrorHandler';

export async function fetchSavedViews(pagePath: string): Promise<SavedView[]> {
  const res = await fetch(`/api/saved-views?pagePath=${encodeURIComponent(pagePath)}`);

  if (!res.ok) {
    if (isAuthError(res.status)) triggerAuthError();
    throw new Error('Failed to fetch saved views');
  }

  const json = await res.json();
  return json.data;
}

export async function createSavedView(body: Record<string, unknown>): Promise<SavedView> {
  const res = await fetch('/api/saved-views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (isAuthError(res.status)) triggerAuthError();
    const json = await res.json();
    throw new Error(json.error || 'Failed to create saved view');
  }

  const json = await res.json();
  return json.data;
}

export async function deleteSavedView(id: string): Promise<void> {
  const res = await fetch(`/api/saved-views/${id}`, { method: 'DELETE' });

  if (!res.ok) {
    if (isAuthError(res.status)) triggerAuthError();
    throw new Error('Failed to delete saved view');
  }
}

export async function renameSavedView(id: string, name: string): Promise<SavedView> {
  const res = await fetch(`/api/saved-views/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    if (isAuthError(res.status)) triggerAuthError();
    const json = await res.json();
    throw new Error(json.error || 'Failed to rename saved view');
  }

  const json = await res.json();
  return json.data;
}
