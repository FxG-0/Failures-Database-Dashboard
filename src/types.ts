export type UserRole = 'admin' | 'viewer';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  disabled?: boolean;
}

export interface FailureRecord {
  id: string; // Firestore doc ID
  year: number;
  date: string;
  month: string;
  failures: string;
  client: string;
  tff_si: string;
  ca_sperry: string;
  run: string;
  observation: string;
  initial_findings: string;
  root_cause: string;
  failed_component: string;
  failed_tool: string;
  fad: string;
  equipment_no: string;
  action_plan: string;
  npt: number;
  npt_in_system: string;
  witness_status: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK_IMPORT' | 'ROLE_CHANGE' | 'AUTHORIZE_USER' | 'REJECT_USER' | 'CLEAR_ALL' | 'STANDARDIZE_NAMES' | 'REGISTER_USER';
  docId?: string;
  details: string;
}

export interface SupplementalColumnValue {
  key: string;
  label: string;
  value: string;
}

export interface SupplementalInfoRecord {
  id: string; // normalized FAD key, used as Firestore doc ID
  fad: string; // display FAD value (from matched main record if found, else raw source value)
  matchedRecordId?: string; // FailureRecord.id this row matches, if any
  matched: boolean;
  keyColumnLabel: string; // original header text used to find the FAD value, e.g. "FAD" or "FAR"
  columns: SupplementalColumnValue[]; // only the highlighted columns from the uploaded sheet
  sourceFileName: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface FilterState {
  searchTerm: string;
  dateFilter: string;
  years: number[];
  months: string[];
  clients: string[];
  tff_si: string[];
  ca_sperry: string[];
  failedTools: string[];
  failedComponents: string[];
  fads: string[];
  runs: string[];
  equipmentNos: string[];
  witnessStatuses: string[];
  nptInSystem: string[];
  nptMin: number | null;
  nptMax: number | null;
}
