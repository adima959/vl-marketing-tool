/**
 * Shared CSV export utilities used by all detail modals.
 */

const BATCH_SIZE = 5_000;
const MAX_RECORDS = 100_000;

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

interface BatchResult<T> {
  records: T[];
  total: number;
}

/**
 * Fetches all records by paginating in batches of 5 000.
 * Caps at 100 000 records total.
 *
 * @param fetchFn    - callback that fetches a single page
 * @param total      - known total from the initial load
 * @param onProgress - optional callback with (fetchedSoFar, cappedTotal)
 * @param signal     - optional AbortSignal to cancel the export mid-request
 */
export async function fetchAllRecords<T>(
  fetchFn: (pagination: { page: number; pageSize: number }) => Promise<BatchResult<T>>,
  total: number,
  onProgress?: (fetched: number, total: number) => void,
  signal?: AbortSignal,
): Promise<T[]> {
  const capped = Math.min(total, MAX_RECORDS);
  const totalPages = Math.ceil(capped / BATCH_SIZE);
  const allRecords: T[] = [];

  for (let page = 1; page <= totalPages; page++) {
    if (signal?.aborted) throw new ExportCancelledError();

    // Race the fetch against the abort signal so cancel is instant
    const batch = await (signal
      ? raceAbort(fetchFn({ page, pageSize: BATCH_SIZE }), signal)
      : fetchFn({ page, pageSize: BATCH_SIZE }));

    allRecords.push(...batch.records);
    onProgress?.(allRecords.length, capped);
    if (batch.records.length < BATCH_SIZE) break;
  }

  return allRecords;
}

/**
 * Races a promise against an AbortSignal.
 * Resolves/rejects as soon as either the promise settles or the signal fires.
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ExportCancelledError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ExportCancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

/**
 * Triggers a CSV file download in the browser.
 */
export function downloadCsv(csvRows: string[], filename: string): void {
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
