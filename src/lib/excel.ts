import ExcelJS from 'exceljs';
import { FailureRecord } from '../types';
import { hasTwoOrMoreMissingFields } from './dataUtils';

/**
 * Helper to convert Excel serial dates (e.g., 46027), JavaScript Date objects, or date strings into clean year and YYYY-MM-DD date string.
 */
export function parseDateAndYear(rawVal: any): { year: number; dateStr: string } {
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return { year: new Date().getFullYear(), dateStr: '' };
  }

  // Handle native Date objects
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    const year = rawVal.getUTCFullYear();
    const month = String(rawVal.getUTCMonth() + 1).padStart(2, '0');
    const day = String(rawVal.getUTCDate()).padStart(2, '0');
    return { year, dateStr: `${year}-${month}-${day}` };
  }

  // Handle numeric Excel Serial Date (e.g. 46027 -> 2026-01-05)
  const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
  if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
    const parsedDate = new Date((numVal - 25569) * 86400 * 1000);
    if (!isNaN(parsedDate.getTime())) {
      const year = parsedDate.getUTCFullYear();
      const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getUTCDate()).padStart(2, '0');
      return { year, dateStr: `${year}-${month}-${day}` };
    }
  }

  // Handle standard date strings
  const strVal = String(rawVal).trim();
  const dateObj = new Date(strVal);
  if (!isNaN(dateObj.getTime()) && strVal.length >= 4) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return { year, dateStr: `${year}-${month}-${day}` };
  }

  // If simple 4-digit year number (e.g. 2023)
  if (!isNaN(numVal) && numVal >= 1900 && numVal <= 2100) {
    return { year: Math.floor(numVal), dateStr: '' };
  }

  return { year: new Date().getFullYear(), dateStr: strVal };
}

const ALLOWED_KEYS = new Set([
  'year', 'date', 'month', 'failures', 'client', 'tff_si', 'ca_sperry',
  'run', 'observation', 'initial_findings', 'root_cause', 'failed_component',
  'failed_tool', 'fad', 'equipment_no', 'action_plan', 'npt', 'npt_in_system',
  'witness_status'
]);

/**
 * Normalizes Excel column header strings into clean snake_case schema keys.
 */
function normalizeHeader(rawHeader: string): string {
  const clean = rawHeader.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');

  if (clean.startsWith('empty') || clean.startsWith('_empty')) return '';

  if (clean.includes('year') && clean.includes('date')) return 'date';
  if (clean.includes('year')) return 'year';
  if (clean.includes('date')) return 'date';
  if (clean.includes('month')) return 'month';
  if (clean.includes('failure')) return 'failures';
  if (clean.includes('client')) return 'client';
  if (clean.includes('tff') || clean.includes('si')) return 'tff_si';
  if (clean.includes('ca') || clean.includes('sperry')) return 'ca_sperry';
  if (clean.includes('run')) return 'run';
  if (clean.includes('observation')) return 'observation';
  if (clean.includes('initial') || clean.includes('finding')) return 'initial_findings';
  if (clean.includes('root') || clean.includes('cause')) return 'root_cause';
  if (clean.includes('component')) return 'failed_component';
  if (clean.includes('tool')) return 'failed_tool';
  if (clean === 'fad' || clean.includes('fad')) return 'fad';
  if (clean.includes('equipment') || clean.includes('eq_no')) return 'equipment_no';
  if (clean.includes('action') || clean.includes('plan')) return 'action_plan';
  if (clean === 'npt') return 'npt';
  if (clean.includes('npt') && clean.includes('system')) return 'npt_in_system';
  if (clean.includes('witness')) return 'witness_status';

  return clean;
}

/**
 * Extracts raw or computed value from an ExcelJS cell.
 */
export function extractCellValue(cell: ExcelJS.Cell): any {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    if ('result' in val && val.result !== undefined && val.result !== null) return val.result;
    if ('text' in val) return (val as any).text;
    if ('richText' in val && Array.isArray((val as any).richText)) {
      return (val as any).richText.map((t: any) => t.text || '').join('');
    }
  }
  return val;
}

/**
 * Parses CSV text into row objects.
 */
function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Simple CSV splitter that respects quotes
  const splitCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file and returns parsed FailureRecord items.
 */
export async function parseExcelFile(file: File): Promise<Omit<FailureRecord, 'id'>[]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv');

  if (isCsv) {
    const text = await file.text();
    const rawRows = parseCsvText(text);
    const mappedRows = rawRows.map((row) => mapRowToFailureRecord(row));
    return mappedRows.filter(r => !hasTwoOrMoreMissingFields(r));
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  // Use 'All Failures' sheet if present, or the first sheet
  const worksheet = workbook.worksheets.find(s => s.name.toLowerCase().includes('failures')) || workbook.worksheets[0];
  if (!worksheet) return [];

  // Find header row (inspect first 5 rows to locate column headers)
  let headerRowIndex = 1;
  let maxMatchedHeaders = 0;
  let detectedHeaders: { colIndex: number; key: string }[] = [];

  for (let r = 1; r <= Math.min(5, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const matched: { colIndex: number; key: string }[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const cellVal = extractCellValue(cell);
      const strVal = cellVal instanceof Date ? '' : String(cellVal || '');
      const key = normalizeHeader(strVal);
      if (key && ALLOWED_KEYS.has(key)) {
        matched.push({ colIndex: colNumber, key });
      }
    });
    if (matched.length > maxMatchedHeaders) {
      maxMatchedHeaders = matched.length;
      headerRowIndex = r;
      detectedHeaders = matched;
    }
  }

  const records: Omit<FailureRecord, 'id'>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return;

    const rowData: Record<string, any> = {};
    detectedHeaders.forEach(({ colIndex, key }) => {
      const cell = row.getCell(colIndex);
      rowData[key] = extractCellValue(cell);
    });

    const mapped = mapRowToFailureRecord(rowData);
    // Automatically exclude rows with 2 or more missing fields
    if (!hasTwoOrMoreMissingFields(mapped)) {
      records.push(mapped);
    }
  });

  return records;
}

function mapRowToFailureRecord(row: Record<string, any>): Omit<FailureRecord, 'id'> {
  const record: any = {
    year: new Date().getFullYear(),
    date: '',
    month: '',
    failures: '',
    client: 'Unknown Client',
    tff_si: '',
    ca_sperry: 'Sperry',
    run: '',
    observation: '',
    initial_findings: '',
    root_cause: '',
    failed_component: '',
    failed_tool: 'Unknown Tool',
    fad: '',
    equipment_no: '',
    action_plan: '',
    npt: 0,
    npt_in_system: 'No',
    witness_status: 'Not Witnessed',
    updatedAt: new Date().toISOString()
  };

  Object.keys(row).forEach((rawKey) => {
    const key = normalizeHeader(rawKey);
    if (!key || !ALLOWED_KEYS.has(key)) return;
    let val = row[rawKey];

    if (key === 'npt') {
      const num = typeof val === 'number' ? val : parseFloat(String(val));
      record.npt = isNaN(num) ? 0 : num;
    } else if (key === 'year' || key === 'date') {
      const parsedYD = parseDateAndYear(val);
      record.year = parsedYD.year;
      if (parsedYD.dateStr) record.date = parsedYD.dateStr;
    } else if (val !== undefined && val !== null) {
      record[key] = String(val).trim();
    }
  });

  // Ensure year and date are consistent if date is present
  if (record.date) {
    const parsed = parseDateAndYear(record.date);
    if (parsed.year) record.year = parsed.year;
    if (parsed.dateStr) record.date = parsed.dateStr;
  }

  return record as Omit<FailureRecord, 'id'>;
}

/**
 * Exports an array of FailureRecord items to an Excel (.xlsx) file download.
 */
export async function exportToExcel(records: FailureRecord[], filename = 'Failures_Export.xlsx'): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Failure Tracker';
  workbook.lastModifiedBy = 'Failure Tracker';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('All Failures');

  worksheet.columns = [
    { header: 'Year', key: 'year', width: 10 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Failures', key: 'failures', width: 14 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'TFF/SI', key: 'tff_si', width: 14 },
    { header: 'CA/Sperry', key: 'ca_sperry', width: 16 },
    { header: 'Run', key: 'run', width: 10 },
    { header: 'Observation', key: 'observation', width: 35 },
    { header: 'Initial Findings', key: 'initial_findings', width: 35 },
    { header: 'Root Cause', key: 'root_cause', width: 35 },
    { header: 'Failed Component', key: 'failed_component', width: 24 },
    { header: 'Failed Tool', key: 'failed_tool', width: 22 },
    { header: 'FAD', key: 'fad', width: 20 },
    { header: 'Equipment No', key: 'equipment_no', width: 18 },
    { header: 'Action Plan', key: 'action_plan', width: 35 },
    { header: 'NPT', key: 'npt', width: 12 },
    { header: 'NPT In System', key: 'npt_in_system', width: 16 },
    { header: 'Witness Status', key: 'witness_status', width: 16 },
    { header: 'Last Updated At', key: 'updatedAt', width: 22 },
    { header: 'Last Updated By', key: 'updatedBy', width: 20 }
  ];

  // Header styling
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD97706' } // amber-600
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  records.forEach((r) => {
    worksheet.addRow({
      year: r.year,
      date: r.date,
      month: r.month,
      failures: r.failures,
      client: r.client,
      tff_si: r.tff_si,
      ca_sperry: r.ca_sperry,
      run: r.run,
      observation: r.observation,
      initial_findings: r.initial_findings,
      root_cause: r.root_cause,
      failed_component: r.failed_component,
      failed_tool: r.failed_tool,
      fad: r.fad,
      equipment_no: r.equipment_no,
      action_plan: r.action_plan,
      npt: r.npt,
      npt_in_system: r.npt_in_system,
      witness_status: r.witness_status,
      updatedAt: r.updatedAt || '',
      updatedBy: r.updatedBy || ''
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
