/**
 * Build dynamic SET clauses for SQL UPDATE statements.
 * Only includes fields where data[tsKey] is not undefined.
 * Produces PostgreSQL-style $1, $2, $3 placeholders.
 */
export function buildDynamicSetClauses<T extends Record<string, unknown>>(
  data: T,
  fieldMap: Record<string, string>,
  startIndex = 1,
): { setClauses: string[]; values: unknown[]; nextIndex: number } {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let index = startIndex;

  for (const [tsKey, sqlColumn] of Object.entries(fieldMap)) {
    if (data[tsKey] !== undefined) {
      setClauses.push(`${sqlColumn} = $${index++}`);
      values.push(data[tsKey]);
    }
  }

  return { setClauses, values, nextIndex: index };
}
