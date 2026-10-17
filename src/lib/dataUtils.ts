import { FailureRecord } from '../types';

// Explicit dictionary mappings for known typos, acronyms, and tools/components
const KNOWN_MAPPINGS: Record<string, string> = {
  // Clients
  'oxy': 'OXY',
  'zadco': 'ZADCO',
  'adof': 'ADOF',
  'adon': 'ADON',
  'asg': 'ASG',
  'eni': 'ENI',
  'mari': 'MARI',
  'mol': 'MOL',
  'snoc': 'SNOC',
  'petonas': 'Petronas',
  'petronas': 'Petronas',
  'mpcl': 'MPCL',
  'mpcl pakistan': 'MPCL Pakistan',
  'adon sour gas': 'ADON Sour Gas',

  // Tools & Components & Typos
  'connector': 'Connector',
  'connectortbd': 'Connector TBD',
  'connector tbd': 'Connector TBD',
  'connector/ctn': 'Connector / CTN',
  'connector / ctn': 'Connector / CTN',
  'ctn/ald': 'CTN / ALD',
  'ctn / ald': 'CTN / ALD',
  'basestar': 'Basestar',
  'basestar/battery?': 'Basestar / Battery',
  'basestar/battery': 'Basestar / Battery',
  'basestar / battery': 'Basestar / Battery',
  'battery': 'Battery',
  'bha': 'BHA',
  'bha design': 'BHA Design',
  'bit': 'BIT',
  'bits': 'BITs',
  'dgr': 'DGR',
  'ald': 'ALD',
  'adr': 'ADR',
  'ecmb': 'ECMB',
  'external environment': 'External Environment',
  'detection': 'Detection',
  'downlink': 'Downlink',
  'earthstar': 'Earthstar',
  'mwd': 'MWD',
  'lwd': 'LWD',
  'rss': 'RSS',
  'pulser': 'Pulser',
};

const KNOWN_ACRONYMS = new Set([
  'mwd', 'lwd', 'rss', 'bha', 'dgr', 'ald', 'adr', 'ecmb', 'ctn', 'pwd', 
  'npt', 'fad', 'fads', 'tbd', 'oxy', 'zadco', 'adof', 'adon', 'asg', 'eni', 
  'mari', 'mol', 'mpcl', 'snoc', 'rwd', 'abi', 'sxi', 'gab', 'dds', 'dwd', 'bit'
]);

/**
 * Clean a single word or token (handles casing, acronyms, title casing)
 */
function cleanToken(token: string): string {
  if (!token) return '';
  // Strip trailing noise like '?', '!', trailing commas
  let cleaned = token.trim().replace(/[?!,]+$/g, '').trim();
  if (!cleaned) return '';

  const lower = cleaned.toLowerCase();
  if (KNOWN_MAPPINGS[lower]) {
    return KNOWN_MAPPINGS[lower];
  }

  // Handle compound phrases (space-separated)
  if (cleaned.includes(' ')) {
    return cleaned
      .split(/\s+/)
      .map(part => cleanToken(part))
      .filter(Boolean)
      .join(' ');
  }

  // Acronym check
  if (KNOWN_ACRONYMS.has(lower) || (cleaned.length <= 4 && /^[a-zA-Z]+$/.test(cleaned))) {
    return cleaned.toUpperCase();
  }

  // Title case standard words
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/**
 * Standardize and clean a single string value (trims, handles slashes, title casing & acronyms)
 */
export function cleanStringValue(val: string | null | undefined): string {
  if (!val) return '';
  let trimmed = val.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  // Remove trailing question marks or exclamation marks
  trimmed = trimmed.replace(/[?!]+$/g, '').trim();

  const lower = trimmed.toLowerCase();
  if (KNOWN_MAPPINGS[lower]) {
    return KNOWN_MAPPINGS[lower];
  }

  // Handle slash separators (e.g. Basestar/Battery?, Connector/CTN, CTN/ALD)
  if (trimmed.includes('/')) {
    const parts = trimmed
      .split('/')
      .map(part => cleanToken(part))
      .filter(Boolean);
    return parts.join(' / ');
  }

  return cleanToken(trimmed);
}

/**
 * Normalize a key for matching (lowercased, stripped of all punctuation, spaces, slashes)
 */
export function normalizeKey(val: string | null | undefined): string {
  if (!val) return '';
  const cleaned = cleanStringValue(val);
  return cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes a FAD number value into a strict matching key: uppercased,
 * stripped of every non-alphanumeric character (spaces, dashes, slashes, etc).
 * Used as the Firestore doc ID for supplemental info so that small formatting
 * differences between spreadsheets (e.g. "FAD-102" vs "fad 102") still match,
 * and so a "FAR" typo column in an uploaded sheet still lines up correctly.
 */
export function normalizeFadKey(val: string | null | undefined): string {
  if (!val) return '';
  return String(val).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extract deduplicated, merged, sorted options from an array of record values
 */
export function getMergedUniqueOptions(values: (string | null | undefined)[]): string[] {
  const map = new Map<string, string>(); // key: normalizedKey, value: bestDisplayName

  for (const raw of values) {
    if (!raw) continue;
    const cleaned = cleanStringValue(raw);
    if (!cleaned || cleaned === '—' || cleaned === 'N/A') continue;

    const key = normalizeKey(cleaned);
    
    if (!map.has(key)) {
      map.set(key, cleaned);
    } else {
      // Keep the best display name (prefer spaced slashes " / ", longer casing, properly formatted)
      const existing = map.get(key)!;
      if (cleaned.includes(' / ') && !existing.includes(' / ')) {
        map.set(key, cleaned);
      } else if (cleaned.length > existing.length && !existing.includes(' / ')) {
        map.set(key, cleaned);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Check if a record field matches any selected filter options (case-insensitively & normalized)
 */
export function matchesFilterOption(
  recordValue: string | null | undefined, 
  selectedOptions: string[]
): boolean {
  if (!selectedOptions || selectedOptions.length === 0) return true;
  if (!recordValue) return false;

  const recordKey = normalizeKey(recordValue);
  return selectedOptions.some(opt => normalizeKey(opt) === recordKey);
}

/**
 * Check if a field value is considered empty, missing, or a placeholder
 */
export function isFieldMissing(val: any): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'number') {
    return isNaN(val);
  }
  const str = String(val).trim().toLowerCase();
  return (
    str === '' ||
    str === '-' ||
    str === '—' ||
    str === '–' ||
    str === '--' ||
    str === 'n/a' ||
    str === 'na' ||
    str === 'none' ||
    str === 'unknown' ||
    str === 'unknown client' ||
    str === 'unknown tool' ||
    str === 'null' ||
    str === 'undefined' ||
    str === 'tbd' ||
    str === '?'
  );
}

/**
 * Count the number of missing/blank fields across the core failure record columns:
 * 1. Date
 * 2. Client
 * 3. Failed Tool
 * 4. Failed Component
 * 5. FAD Number
 * 6. Observation / Cause / Findings / Failures
 * 7. TFF / SI
 */
export function countMissingFields(rec: Partial<FailureRecord>): number {
  let missing = 0;

  // 1. Date
  if (isFieldMissing(rec.date)) missing++;

  // 2. Client
  if (isFieldMissing(rec.client)) missing++;

  // 3. Failed Tool
  if (isFieldMissing(rec.failed_tool)) missing++;

  // 4. Failed Component
  if (isFieldMissing(rec.failed_component)) missing++;

  // 5. FAD Number
  if (isFieldMissing(rec.fad)) missing++;

  // 6. Observation / Root Cause / Findings / Failures
  const hasObservation = 
    !isFieldMissing(rec.observation) || 
    !isFieldMissing(rec.root_cause) || 
    !isFieldMissing(rec.initial_findings) ||
    !isFieldMissing(rec.failures);
  if (!hasObservation) missing++;

  // 7. TFF / SI
  if (isFieldMissing(rec.tff_si)) missing++;

  return missing;
}

/**
 * Returns true if a record has 2 or more missing fields
 */
export function hasTwoOrMoreMissingFields(rec: Partial<FailureRecord>): boolean {
  return countMissingFields(rec) >= 2;
}

/**
 * Filters an array of failure records to exclude any that have 2 or more missing fields
 */
export function filterCompleteRecords(records: FailureRecord[]): FailureRecord[] {
  return records.filter(rec => !hasTwoOrMoreMissingFields(rec));
}

/**
 * Clean up an entire FailureRecord object so its string fields are standardized
 */
export function cleanFailureRecord(rec: FailureRecord): FailureRecord {
  return {
    ...rec,
    client: cleanStringValue(rec.client),
    failed_tool: cleanStringValue(rec.failed_tool),
    failed_component: cleanStringValue(rec.failed_component),
    tff_si: cleanStringValue(rec.tff_si),
    ca_sperry: cleanStringValue(rec.ca_sperry),
    witness_status: cleanStringValue(rec.witness_status),
    fad: cleanStringValue(rec.fad),
  };
}

