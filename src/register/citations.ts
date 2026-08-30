// [pure] Citation extraction for markdown documents that cite register ids — skills/
// and any other doc closing with a "Register ids cited" table. The verdict cell may
// carry a qualifier ("FAIL (trap, not a technique)"); only the leading token binds.

export interface CitedRow {
  id: number;
  verdictToken: string;
}

const TABLE_ROW = /^\|\s*(\d+)\s*\|[^|]*\|\s*([A-Z_]+)/;

export function parseCitationTable(md: string): CitedRow[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s+Register ids cited/.test(l));
  if (start === -1) return [];
  const rows: CitedRow[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const m = TABLE_ROW.exec(line.trim());
    if (m) rows.push({ id: Number(m[1]), verdictToken: m[2] });
  }
  return rows;
}

// Matches "id 61", "ids 259, 306", "id 61, id 173" — the citation shapes the skills use.
const BODY_RUN = /\bids?\s+(\d+(?:\s*,\s*(?:ids?\s+)?\d+)*)/gi;

export function parseBodyIds(md: string): number[] {
  const ids = new Set<number>();
  for (const m of md.matchAll(BODY_RUN)) {
    for (const n of m[1].split(/[^0-9]+/)) if (n) ids.add(Number(n));
  }
  return [...ids].sort((a, b) => a - b);
}
