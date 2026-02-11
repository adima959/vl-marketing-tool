/**
 * Shared CSV export utilities used by all detail modals.
 */

const BATCH_SIZE = 100;
const MAX_RECORDS = 10_000;

interface BatchResult<T> {
  records: T[];
  total: number;
}

/**
 * Fetches all records by paginating in batches of 100 (server max pageSize).
 * Caps at 10 000 records total.
 *
 * @param fetchFn - callback that fetches a single page
 * @param total   - known total from the initial load (used to calculate page count)
 * @param onProgress - optional callback with (currentPage, totalPages)
 */
export async function fetchAllRecords<T>(
  fetchFn: (pagination: { page: number; pageSize: number }) => Promise<BatchResult<T>>,
  total: number,
  onProgress?: (current: number, totalPages: number) => void,
): Promise<T[]> {
  const capped = Math.min(total, MAX_RECORDS);
  const totalPages = Math.ceil(capped / BATCH_SIZE);
  const allRecords: T[] = [];

  for (let page = 1; page <= totalPages; page++) {
    const batch = await fetchFn({ page, pageSize: BATCH_SIZE });
    allRecords.push(...batch.records);
    onProgress?.(page, totalPages);
    if (batch.records.length < BATCH_SIZE) break;
  }

  return allRecords;
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
