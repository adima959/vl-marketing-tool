const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Google Drive file/folder IDs: alphanumeric, hyphens, underscores, 10+ chars */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,}$/;

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

export function isValidDriveId(value: string): boolean {
  return DRIVE_ID_RE.test(value);
}
