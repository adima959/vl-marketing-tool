/**
 * Lightweight Google Drive client using Service Account JWT auth.
 * Uses Node built-in crypto + fetch — no googleapis dependency.
 */

import crypto from 'node:crypto';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let parsedKey: ServiceAccountKey | null = null;
let initAttempted = false;

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive';

/**
 * Root Drive folder IDs for automatic subfolder creation.
 * Update these when the team's shared Drive structure changes.
 */
export const DRIVE_FOLDERS = {
  /** Top-level folder that contains all product subfolders */
  productsRoot: '1ddfzkwRBwcjUZLWL3Gkoc-1M4e_QTWp-',
} as const;

function getServiceAccountKey(): ServiceAccountKey | null {
  if (parsedKey) return parsedKey;
  if (initAttempted) return null;

  initAttempted = true;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    console.warn('[Google Drive] GOOGLE_SERVICE_ACCOUNT_KEY not configured — Drive integration disabled');
    return null;
  }

  try {
    parsedKey = JSON.parse(keyJson) as ServiceAccountKey;
    return parsedKey;
  } catch (error) {
    console.error('[Google Drive] Failed to parse service account key:', error);
    return null;
  }
}

/** Create a signed JWT for Google OAuth2 token exchange. */
function createJwt(key: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(key.private_key, 'base64url');

  return `${header}.${payload}.${signature}`;
}

/** Get a valid access token, refreshing if expired. */
async function getAccessToken(): Promise<string | null> {
  const key = getServiceAccountKey();
  if (!key) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  try {
    const jwt = createJwt(key);
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!res.ok) {
      console.error('[Google Drive] Token exchange failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
    };
    return cachedToken.token;
  } catch (error) {
    console.error('[Google Drive] Token exchange error:', error);
    return null;
  }
}

/**
 * Create a subfolder inside a parent Drive folder.
 * Returns the new folder ID, or null if creation fails.
 * Non-blocking: callers should handle null gracefully.
 */
export async function createDriveSubfolder(
  parentFolderId: string,
  folderName: string,
): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${DRIVE_API}?fields=id&supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });

    if (!res.ok) {
      console.error(`[Google Drive] Failed to create subfolder "${folderName}":`, res.status, await res.text());
      return null;
    }

    const data = await res.json() as { id: string };
    return data.id;
  } catch (error) {
    console.error(`[Google Drive] Failed to create subfolder "${folderName}" in ${parentFolderId}:`, error);
    return null;
  }
}

/**
 * Rename a Drive folder.
 * Non-blocking: returns true on success, false on failure.
 */
export async function renameDriveFolder(
  folderId: string,
  newName: string,
): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const res = await fetch(`${DRIVE_API}/${folderId}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!res.ok) {
      console.error(`[Google Drive] Failed to rename folder ${folderId}:`, res.status, await res.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Google Drive] Failed to rename folder ${folderId}:`, error);
    return false;
  }
}

/**
 * Move a Drive folder to a new parent folder.
 * Uses addParents/removeParents to reparent without copying.
 * Non-blocking: returns true on success, false on failure.
 */
export async function moveDriveFolder(
  folderId: string,
  newParentId: string,
  oldParentId: string,
): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const params = new URLSearchParams({
      addParents: newParentId,
      removeParents: oldParentId,
      supportsAllDrives: 'true',
    });
    const res = await fetch(`${DRIVE_API}/${folderId}?${params}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      console.error(`[Google Drive] Failed to move folder ${folderId}:`, res.status, await res.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Google Drive] Failed to move folder ${folderId}:`, error);
    return false;
  }
}

/**
 * Build a direct link to a Google Drive folder.
 */
export function getDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
