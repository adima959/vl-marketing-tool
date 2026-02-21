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
    const res = await fetch(`${DRIVE_API}/${encodeURIComponent(folderId)}?supportsAllDrives=true`, {
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
    const res = await fetch(`${DRIVE_API}/${encodeURIComponent(folderId)}?${params}`, {
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
 * Upload a file to a Drive folder using multipart upload.
 * Returns file metadata on success, or null on failure.
 */
export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer,
): Promise<{ id: string; name: string; mimeType: string; webViewLink: string } | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const boundary = `----DriveUpload${Date.now()}`;
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
    });

    // Build multipart body
    const parts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`,
    ];
    const prefix = Buffer.from(parts[0]);
    const middle = Buffer.from(parts[1]);
    const fileBase64 = Buffer.from(fileBuffer.toString('base64'));
    const suffix = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([prefix, middle, fileBase64, suffix]);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body,
      },
    );

    if (!res.ok) {
      console.error(`[Google Drive] Upload failed for "${fileName}":`, res.status, await res.text());
      return null;
    }

    return await res.json() as { id: string; name: string; mimeType: string; webViewLink: string };
  } catch (error) {
    console.error(`[Google Drive] Upload error for "${fileName}":`, error);
    return null;
  }
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  webViewLink: string;
  thumbnailLink?: string;
  createdTime: string;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
  /** Subfolder name this file belongs to, or 'Assets' for root */
  folder?: string;
}

/**
 * List all files in a Drive folder (non-trashed).
 * Returns an empty array on failure.
 */
export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent('files(id,name,mimeType,size,webViewLink,thumbnailLink,createdTime,lastModifyingUser(displayName,emailAddress))');
    const res = await fetch(
      `${DRIVE_API}?q=${q}&fields=${fields}&orderBy=createdTime+desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      console.error(`[Google Drive] List files failed for folder ${folderId}:`, res.status, await res.text());
      return [];
    }

    const data = await res.json() as { files: DriveFile[] };
    return data.files || [];
  } catch (error) {
    console.error(`[Google Drive] List files error for folder ${folderId}:`, error);
    return [];
  }
}

/**
 * Find an existing subfolder by name inside a parent, or create it.
 * Returns the subfolder's Drive ID, or null on failure.
 */
export async function findOrCreateSubfolder(
  parentFolderId: string,
  folderName: string,
): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    // Search for existing folder by name in parent
    const q = encodeURIComponent(
      `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const res = await fetch(
      `${DRIVE_API}?q=${q}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (res.ok) {
      const data = await res.json() as { files: { id: string }[] };
      if (data.files?.length > 0) {
        return data.files[0].id;
      }
    }

    // Not found — create it
    return createDriveSubfolder(parentFolderId, folderName);
  } catch (error) {
    console.error(`[Google Drive] findOrCreateSubfolder "${folderName}" in ${parentFolderId}:`, error);
    return null;
  }
}

/**
 * List files from a folder and all its immediate subfolders.
 * Each file gets a `folder` property indicating which subfolder it belongs to.
 */
export async function listDriveFilesWithSubfolders(folderId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    // 1. List immediate child folders
    const folderQ = encodeURIComponent(
      `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const folderRes = await fetch(
      `${DRIVE_API}?q=${folderQ}&fields=files(id,name)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const subfolders: { id: string; name: string }[] = [];
    if (folderRes.ok) {
      const data = await folderRes.json() as { files: { id: string; name: string }[] };
      subfolders.push(...(data.files || []));
    }

    // 2. List files in root + each subfolder in parallel
    const foldersToList = [
      { id: folderId, name: 'Assets' },
      ...subfolders,
    ];

    const results = await Promise.all(
      foldersToList.map(async (folder) => {
        const files = await listDriveFiles(folder.id);
        return files.map(f => ({ ...f, folder: folder.name }));
      }),
    );

    // 3. Flatten and sort by createdTime desc
    return results.flat().sort((a, b) =>
      new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime(),
    );
  } catch (error) {
    console.error(`[Google Drive] listDriveFilesWithSubfolders error for ${folderId}:`, error);
    return [];
  }
}

/**
 * Delete a file from Google Drive permanently.
 * Returns true on success, false on failure.
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const res = await fetch(`${DRIVE_API}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 404) {
      console.error(`[Google Drive] Delete file failed for ${fileId}:`, res.status, await res.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Google Drive] Delete file error for ${fileId}:`, error);
    return false;
  }
}

/**
 * Download a file from Google Drive via service account.
 * Returns { stream, mimeType, fileName } or null on failure.
 */
export async function downloadDriveFile(fileId: string): Promise<{
  body: ReadableStream<Uint8Array>;
  mimeType: string;
  fileName: string;
  size: string;
} | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    // Get file metadata first (name + mimeType)
    const metaRes = await fetch(
      `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=name,mimeType,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaRes.ok) {
      console.error(`[Google Drive] Download metadata failed for ${fileId}:`, metaRes.status);
      return null;
    }
    const meta = await metaRes.json() as { name: string; mimeType: string; size: string };

    // Download file content
    const dlRes = await fetch(
      `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!dlRes.ok || !dlRes.body) {
      console.error(`[Google Drive] Download failed for ${fileId}:`, dlRes.status);
      return null;
    }

    return {
      body: dlRes.body as ReadableStream<Uint8Array>,
      mimeType: meta.mimeType,
      fileName: meta.name,
      size: meta.size,
    };
  } catch (error) {
    console.error(`[Google Drive] Download error for ${fileId}:`, error);
    return null;
  }
}

/**
 * Build a direct link to a Google Drive folder.
 */
export function getDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}
