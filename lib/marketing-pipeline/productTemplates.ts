/** HTML templates auto-injected into new products for structured TipTap sections. */

/* Helper to build a TipTap-compatible table row */
const th = (text: string): string => `<th colspan="1" rowspan="1"><p>${text}</p></th>`;
const td = (text = ''): string => `<td colspan="1" rowspan="1"><p>${text}</p></td>`;
const row = (cells: string[]): string => `<tr>${cells.join('')}</tr>`;
const emptyRow = (cols: number): string => row(Array.from({ length: cols }, () => td()));
const table = (headerCells: string[], dataRows: number): string =>
  `<table><tbody>${row(headerCells.map(th))}${Array.from({ length: dataRows }, () => emptyRow(headerCells.length)).join('')}</tbody></table>`;

export const INGREDIENT_CLAIMS_TEMPLATE = table(
  ['Ingredient', 'Approved Claim', 'Framing / Source'],
  3,
);

export const COMPETITIVE_POSITIONING_TEMPLATE = table(
  ['Competitor', 'Their Strength', 'Our Advantage'],
  3,
);

export const CUSTOMER_LANGUAGE_BANK_TEMPLATE = [
  '<h2>Positive Quotes</h2>',
  '<p></p>',
  '<h2>Negative Quotes / Objections</h2>',
  '<p></p>',
].join('');
