import ExcelJS from 'exceljs';
import { SupplementalColumnValue } from '../types';
import { normalizeFadKey } from './dataUtils';
import { extractCellValue, parseDateAndYear } from './excel';

export interface ParsedSupplementalRow {
  rawFadValue: string;
  normalizedFad: string;
  columns: SupplementalColumnValue[];
}

export interface ParsedSupplementalFile {
  rows: ParsedSupplementalRow[];
  highlightedHeaderLabels: string[];
  keyColumnLabel: string;
  warnings: string[];
}

/**
 * Determines whether a header cell was manually highlighted (given a solid
 * background fill color) in Excel. Plain/white/no-fill cells are ignored.
 */
function isHighlightedFill(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill as any;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') return false;

  const fg = fill.fgColor;
  if (!fg) return false;

  if (fg.argb) {
    const rgb = String(fg.argb).slice(-6).toUpperCase();
    if (rgb === 'FFFFFF') return false; // pure white counts as "no highlight"
    return true;
  }

  if (fg.theme !== undefined) return true;
  if (fg.indexed !== undefined && fg.indexed !== 64) return true; // 64 = "None/Automatic"

  return false;
}

/**
 * Checks whether a header cell's text identifies it as the FAD (or FAR-typo)
 * key column. Matches an exact "FAD"/"FAR", or that word as a leading token
 * in a longer label — e.g. "FAD No", "FAD Number", "FAD#", "FAR-No.", "FAD ID" —
 * while still rejecting unrelated words that merely start the same letters
 * (e.g. "Fardown", "Fadeout") because those are followed directly by another letter.
 */
function matchesKeyHeader(raw: any, keyword: 'FAD' | 'FAR'): boolean {
  const str = raw instanceof Date ? '' : String(raw ?? '').trim().toUpperCase();
  if (!str) return false;
  if (str === keyword) return true;
  return new RegExp(`^${keyword}(?![A-Z])`).test(str);
}

/** Converts an extracted cell value into a clean display string. */
function stringifyValue(raw: any): string {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date) {
    const parsed = parseDateAndYear(raw);
    return parsed.dateStr || raw.toString();
  }
  if (typeof raw === 'number') {
    // Looks like an Excel serial date accidentally captured as a number
    if (raw > 30000 && raw < 60000) {
      const parsed = parseDateAndYear(raw);
      if (parsed.dateStr) return parsed.dateStr;
    }
    return String(raw);
  }
  return String(raw).trim();
}

/** Builds a unique, Firestore-safe field key from a header label. */
function slugifyHeaderLabel(label: string, used: Set<string>): string {
  let base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = 'column';

  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${i}`;
    i++;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Parses an uploaded supplemental Excel file (.xlsx/.xls). Locates the header
 * row containing a "FAD" (or "FAR" typo) column, uses that column as the
 * matching key, and extracts ONLY the columns whose header cell was manually
 * highlighted with a background color in Excel — everything else is ignored.
 */
export async function parseSupplementalExcelFile(file: File): Promise<ParsedSupplementalFile> {
  const warnings: string[] = [];
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    throw new Error('CSV files do not carry cell highlight/color information. Please upload the original .xlsx/.xls file with the desired columns highlighted.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('The uploaded file has no worksheets.');
  }

  // Locate the header row: the first row (within the first 10) containing a
  // cell whose text identifies it as a "FAD" column, or "FAR" (typo) column —
  // matches labels like "FAD", "FAD No", "FAD Number", "FAR No.", "FAD#", etc.
  let headerRowIndex = -1;
  let keyColIndex = -1;
  let keyColumnLabel = '';

  const maxScanRows = Math.min(10, worksheet.rowCount);
  outer: for (let r = 1; r <= maxScanRows; r++) {
    const row = worksheet.getRow(r);
    let farColIndex = -1;
    let farLabel = '';
    let found = false;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (found) return;
      const text = extractCellValue(cell);
      if (matchesKeyHeader(text, 'FAD')) {
        headerRowIndex = r;
        keyColIndex = colNumber;
        keyColumnLabel = String(text).trim();
        found = true;
      } else if (farColIndex === -1 && matchesKeyHeader(text, 'FAR')) {
        farColIndex = colNumber;
        farLabel = String(text).trim();
      }
    });

    if (found) break outer;
    if (farColIndex !== -1) {
      headerRowIndex = r;
      keyColIndex = farColIndex;
      keyColumnLabel = farLabel;
      warnings.push(`No "FAD" column header found — matched using the "${farLabel}" column instead (treated as a typo for FAD).`);
      break outer;
    }
  }

  if (headerRowIndex === -1 || keyColIndex === -1) {
    throw new Error('Could not find a "FAD" (or "FAR") column header in the first 10 rows of this file. Please make sure one of the header cells is labeled FAD.');
  }

  const headerRow = worksheet.getRow(headerRowIndex);

  // Collect highlighted header columns (excluding the key column itself, unless it is also highlighted).
  const highlightedCols: { colIndex: number; label: string }[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = extractCellValue(cell);
    const label = text instanceof Date ? '' : String(text || '').trim();
    if (!label) return;
    if (!isHighlightedFill(cell)) return;
    highlightedCols.push({ colIndex: colNumber, label });
  });

  if (highlightedCols.length === 0) {
    throw new Error('No highlighted column headers were detected in this file. In Excel, apply a background color to the header cells of the columns you want to import, then re-upload.');
  }

  const usedKeys = new Set<string>();
  const columnDefs = highlightedCols.map((c) => ({
    colIndex: c.colIndex,
    label: c.label,
    key: slugifyHeaderLabel(c.label, usedKeys)
  }));

  const rows: ParsedSupplementalRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return;

    const rawFadCell = row.getCell(keyColIndex);
    const rawFadValue = stringifyValue(extractCellValue(rawFadCell));
    const normalizedFad = normalizeFadKey(rawFadValue);
    if (!normalizedFad) return; // can't match a row with no FAD value

    const columns: SupplementalColumnValue[] = [];
    for (const def of columnDefs) {
      const cell = row.getCell(def.colIndex);
      const val = stringifyValue(extractCellValue(cell));
      if (val) {
        columns.push({ key: def.key, label: def.label, value: val });
      }
    }

    if (columns.length === 0) return; // nothing but blanks in the highlighted columns for this row

    rows.push({ rawFadValue, normalizedFad, columns });
  });

  if (rows.length === 0) {
    warnings.push('No data rows with both a FAD number and highlighted-column values were found.');
  }

  return {
    rows,
    highlightedHeaderLabels: columnDefs.map((c) => c.label),
    keyColumnLabel,
    warnings
  };
}
