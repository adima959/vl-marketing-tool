import type { SavedView } from '@/types/savedViews';
import { triggerError, isAuthError } from '@/lib/api/errorHandler';
import { ErrorCode } from '@/lib/types/errors';

export async function fetchSavedViews(pagePath: string): Promise<SavedView[]> {
  const res = await fetch(`/api/saved-views?pagePath=${encodeURIComponent(pagePath)}`);

  if (!res.ok) {
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
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
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
    const json = await res.json();
    throw new Error(json.error || 'Failed to create saved view');
  }

  const json = await res.json();
  return json.data;
}

export async function deleteSavedView(id: string): Promise<void> {
  const res = await fetch(`/api/saved-views/${id}`, { method: 'DELETE' });

  if (!res.ok) {
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
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
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
    const json = await res.json();
    throw new Error(json.error || 'Failed to rename saved view');
  }

  const json = await res.json();
  return json.data;
}

export async function fetchFavoriteViews(): Promise<SavedView[]> {
  const res = await fetch('/api/saved-views?favorites=true');

  if (!res.ok) {
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
    throw new Error('Failed to fetch favorite views');
  }

  const json = await res.json();
  return json.data;
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
  const res = await fetch(`/api/saved-views/${id}/favorite`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFavorite }),
  });

  if (!res.ok) {
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
    throw new Error('Failed to update favorite status');
  }
}

export async function reorderFavorites(items: { id: string; favoriteOrder: number }[]): Promise<void> {
  const res = await fetch('/api/saved-views/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
    throw new Error('Failed to reorder favorites');
  }
}

export async function fetchSavedViewById(id: string): Promise<SavedView> {
  const res = await fetch(`/api/saved-views/${id}`);

  if (!res.ok) {
    if (isAuthError(res.status)) {
    const authError: import('@/lib/types/errors').AppError = {
      name: 'AuthError',
      message: 'Your session has expired or is invalid. Please refresh your session to continue.',
      code: ErrorCode.AUTH_ERROR,
      statusCode: 401,
    };
    triggerError(authError);
  }
    throw new Error('Failed to fetch saved view');
  }

  const json = await res.json();
  return json.data;
}
