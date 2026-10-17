import React, { useState, useMemo } from 'react';
import { FailureRecord, UserRole, FilterState } from '../types';
import { exportToExcel, parseDateAndYear } from '../lib/excel';
import { getMergedUniqueOptions, normalizeFadKey } from '../lib/dataUtils';
import { HeaderMultiSelectFilter } from './HeaderMultiSelectFilter';
import {
  Download, Plus, Edit3, Trash2, Eye, ArrowUpDown, ArrowUp, ArrowDown,
  ExternalLink, Maximize2, ShieldAlert, Check, Copy, MoreHorizontal, RotateCcw, Calendar, Filter, X,
  AlertTriangle, RefreshCw, CheckCircle2, Loader2, Info
} from 'lucide-react';

interface EditableGridProps {
  records: FailureRecord[];
  allRecords?: FailureRecord[];
  filters?: FilterState;
  setFilters?: React.Dispatch<React.SetStateAction<FilterState>>;
  role: UserRole;
  syncStatus?: 'saving' | 'saved';
  onUpdateRecord: (updated: FailureRecord) => Promise<void>;
  onAddRecord: (newRecord: Omit<FailureRecord, 'id'>) => Promise<void>;
  onDuplicateRecord: (record: FailureRecord) => Promise<void>;
  onDeleteRecord: (docId: string) => Promise<void>;
  onOpenDetailModal: (record: FailureRecord) => void;
  onClearAllData?: () => Promise<void>;
  /** Normalized FAD keys (see normalizeFadKey) that have supplemental info uploaded. */
  fadsWithInfo?: Set<string>;
}

type SortField = keyof FailureRecord;

export const EditableGrid: React.FC<EditableGridProps> = ({
  records,
  allRecords,
  filters,
  setFilters,
  role,
  syncStatus = 'saved',
  onUpdateRecord,
  onAddRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onOpenDetailModal,
  onClearAllData,
  fadsWithInfo
}) => {
  const isAdmin = role === 'admin';

  // Compute column options for Excel-style header filters
  const columnOptions = useMemo(() => {
    const source = allRecords || records;
    const years = Array.from(new Set(source.map(r => r.year).filter(Boolean))).sort((a: number, b: number) => b - a);
    const clients = getMergedUniqueOptions(source.map(r => r.client));
    const failedTools = getMergedUniqueOptions(source.map(r => r.failed_tool));
    const failedComponents = getMergedUniqueOptions(source.map(r => r.failed_component));
    const fads = getMergedUniqueOptions(source.map(r => r.fad));
    const tff_sis = getMergedUniqueOptions(source.map(r => r.tff_si));
    const witnessStatuses = getMergedUniqueOptions(source.map(r => r.witness_status));

    return { years, clients, failedTools, failedComponents, fads, tff_sis, witnessStatuses };
  }, [allRecords, records]);

  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);

  // Clear All Data Confirmation Modal State
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Helper for rendering sort icon
  const renderSortIcon = (field: keyof FailureRecord) => {
    if (sortField === field) {
      return sortDirection === 'asc' 
        ? <ArrowUp className="w-3 h-3 text-amber-400 font-bold" />
        : <ArrowDown className="w-3 h-3 text-amber-400 font-bold" />;
    }
    return <ArrowUpDown className="w-3 h-3 text-slate-500 hover:text-slate-300" />;
  };
  const formatYearDisplay = (yearVal: any, dateVal: any) => {
    if (typeof yearVal === 'number' && yearVal > 30000) {
      return parseDateAndYear(yearVal).year;
    }
    if (yearVal && yearVal >= 1900 && yearVal <= 2100) {
      return yearVal;
    }
    if (dateVal) {
      return parseDateAndYear(dateVal).year;
    }
    return yearVal || new Date().getFullYear();
  };

  const formatDateDisplay = (dateVal: any, yearVal: any) => {
    if (typeof dateVal === 'number' && dateVal > 30000) {
      return parseDateAndYear(dateVal).dateStr;
    }
    if (dateVal && String(dateVal).trim() !== '') {
      const parsed = parseDateAndYear(dateVal);
      return parsed.dateStr || String(dateVal);
    }
    if (typeof yearVal === 'number' && yearVal > 30000) {
      return parseDateAndYear(yearVal).dateStr;
    }
    return '—';
  };

  // Resolves a "Month" cell (name like "Jan"/"January" or a numeric string) to 1-12, or 0 if unresolvable.
  const MONTH_NUM: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };
  const resolveMonthNumber = (monthVal: any): number => {
    if (!monthVal) return 0;
    const str = String(monthVal).trim().toLowerCase();
    if (/^\d{1,2}$/.test(str)) {
      const n = parseInt(str, 10);
      return n >= 1 && n <= 12 ? n : 0;
    }
    return MONTH_NUM[str] || 0;
  };

  // Effective chronological sort key (YYYY-MM-DD) for a record, used for the default
  // latest-to-oldest grid sort. Falls back through: a proper date string -> any
  // parseable date string -> Year + Month (day 01) -> '' (unknown, always sorts last).
  const getDateSortKey = (row: FailureRecord): string => {
    const rawDate = (row.date || '').toString().trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      return rawDate.slice(0, 10);
    }
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    const year = typeof row.year === 'number' && row.year >= 1900 && row.year <= 2100 ? row.year : 0;
    if (year > 0) {
      const month = resolveMonthNumber(row.month) || 1;
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
    return '';
  };

  // Sorting state — defaults to Date, newest first, so the grid opens already sorted
  // latest-to-oldest. Many real rows only have Year/Month populated (no exact Date),
  // so getDateSortKey() falls back to those rather than sorting on the raw (often blank) field.
  const [sortField, setSortField] = useState<SortField | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Inline Editing State (Doc ID -> Field -> Editing Value)
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof FailureRecord } | null>(null);
  const [cellValue, setCellValue] = useState<string | number>('');

  // Handle Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sorted Records
  const sortedRecords = useMemo(() => {
    if (!sortField) return records;
    return [...records].sort((a, b) => {
      if (sortField === 'date') {
        const keyA = getDateSortKey(a);
        const keyB = getDateSortKey(b);
        if (keyA === keyB) return 0;
        if (keyA === '') return 1; // unknown dates always sink to the bottom, regardless of direction
        if (keyB === '') return -1;
        if (keyA < keyB) return sortDirection === 'asc' ? -1 : 1;
        return sortDirection === 'asc' ? 1 : -1;
      }

      let valA = a[sortField] ?? '';
      let valB = b[sortField] ?? '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [records, sortField, sortDirection]);

  // Paginated Records
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedRecords.slice(startIndex, startIndex + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedRecords.length / pageSize) || 1;

  // Handle Cell Click (Inline Editing for Admins, Detail Modal for Viewers/Long Text)
  const handleCellClick = (record: FailureRecord, field: keyof FailureRecord) => {
    if (!isAdmin) {
      onOpenDetailModal(record);
      return;
    }

    // If long free-text field, open DetailModal expander instead of narrow cell inline edit
    const isLongTextField = ['observation', 'initial_findings', 'root_cause', 'action_plan'].includes(field as string);

    if (isLongTextField) {
      onOpenDetailModal(record);
      return;
    }

    setEditingCell({ id: record.id, field });
    setCellValue(record[field] ?? '');
  };

  // Save Inline Cell Edit
  const handleSaveCell = async (record: FailureRecord) => {
    if (!editingCell || !isAdmin) return;

    const { field } = editingCell;
    let newValue: any = cellValue;

    if (field === 'npt' || field === 'year') {
      newValue = parseFloat(String(cellValue)) || 0;
    }

    if (record[field] === newValue) {
      setEditingCell(null);
      return;
    }

    try {
      await onUpdateRecord({
        ...record,
        [field]: newValue
      });
    } catch (err) {
      console.error('Failed inline update:', err);
    } finally {
      setEditingCell(null);
    }
  };

  // Add New Blank Row (Added at the very top)
  const handleAddNewRow = async () => {
    if (!isAdmin) return;

    const newFailure: Omit<FailureRecord, 'id'> = {
      year: new Date().getFullYear(),
      date: new Date().toISOString().split('T')[0],
      month: new Date().toLocaleString('default', { month: 'long' }),
      failures: 'New Failure Entry',
      client: 'Select Client',
      tff_si: 'TFF-NEW',
      ca_sperry: 'Sperry',
      run: 'Run 01',
      observation: 'Enter failure observation description here...',
      initial_findings: 'Enter initial findings...',
      root_cause: 'Pending root cause analysis...',
      failed_component: 'Component Name',
      failed_tool: 'Tool Name',
      fad: 'FAD-000',
      equipment_no: 'EQ-000',
      action_plan: 'Enter corrective action plan...',
      npt: 1.0,
      npt_in_system: 'Yes',
      witness_status: 'Not Witnessed',
      updatedAt: new Date().toISOString()
    };

    await onAddRecord(newFailure);
  };

  // Duplicate Row (Inserted right below target row)
  const handleDuplicateRow = async (record: FailureRecord) => {
    if (!isAdmin) return;
    await onDuplicateRecord(record);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col transition-colors">
      {/* Table Toolbar */}
      <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Failures Data Grid
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 font-mono">
            {records.length} items
          </span>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          {isAdmin && (
            <button
              id="btn-add-row"
              onClick={handleAddNewRow}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Failure Row</span>
            </button>
          )}

          <a
            id="btn-more-info"
            href="#/more-info"
            className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
            title="View supplemental FAD info uploaded from a separate Excel file. Tip: Ctrl/Cmd+Click any FAD number to jump straight here."
          >
            <Info className="w-3.5 h-3.5" />
            <span>More Info</span>
          </a>

          <button
            id="btn-export-excel"
            onClick={() => exportToExcel(records)}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center space-x-1.5"
            title="Download current view to Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Export Excel</span>
          </button>

          {isAdmin && records.length > 0 && onClearAllData && (
            <button
              id="btn-clear-all"
              onClick={() => {
                setShowClearConfirmModal(true);
              }}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5"
              title="Permanently remove all failure records"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
              <span>Clear All Data</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Excel-style Editable Grid Table */}
      <div className="overflow-x-auto max-h-[650px] relative">
        {/* Transparent click-outside backdrop for open column filter popovers */}
        {openFilterCol !== null && (
          <div 
            className="fixed inset-0 z-40 bg-transparent" 
            onClick={() => setOpenFilterCol(null)} 
          />
        )}

        <table className="w-full text-left border-collapse text-xs">
          {/* Table Header */}
          <thead className={`bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 sticky top-0 border-b border-slate-300 dark:border-slate-800 uppercase tracking-wider font-semibold text-[10px] select-none ${openFilterCol !== null ? 'z-50' : 'z-20'}`}>
            <tr>
              <th className="py-2.5 px-2 w-10 text-center border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">#</th>

              {/* Year Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[85px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('year')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>Year</span>
                    {renderSortIcon('year')}
                  </button>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter Year"
                      options={columnOptions.years}
                      selected={filters?.years || []}
                      isOpen={openFilterCol === 'year'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'year' ? null : 'year')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, years: newSelected }))}
                      widthClass="w-48"
                    />
                  )}
                </div>
              </th>

              {/* Date Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[115px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('date')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>Date</span>
                    {renderSortIcon('date')}
                  </button>

                  {setFilters && (
                    <div className="relative inline-flex items-center shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFilterCol(openFilterCol === 'date' ? null : 'date');
                        }}
                        className={`p-1 rounded-md transition-all flex items-center justify-center shrink-0 ${
                          filters?.dateFilter 
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm ring-1 ring-amber-400' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/80'
                        }`}
                        title={filters?.dateFilter ? `Date: ${filters.dateFilter}` : "Filter Date"}
                      >
                        <Filter className="w-2.5 h-2.5" />
                        {filters?.dateFilter && (
                          <span className="ml-0.5 text-[8px] font-extrabold leading-none">1</span>
                        )}
                      </button>

                      {openFilterCol === 'date' && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute left-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs normal-case font-normal text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95">
                          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                            <span className="font-bold text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-wider">Select Date</span>
                            {filters?.dateFilter && (
                              <button
                                onClick={() => setFilters(prev => ({ ...prev, dateFilter: '' }))}
                                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <input
                            type="date"
                            value={filters?.dateFilter || ''}
                            onChange={(e) => {
                              setFilters(prev => ({ ...prev, dateFilter: e.target.value }));
                              setOpenFilterCol(null);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-amber-700 dark:text-amber-300 font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* Client Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[110px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('client')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>Client</span>
                    {renderSortIcon('client')}
                  </button>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter Client"
                      options={columnOptions.clients}
                      selected={filters?.clients || []}
                      isOpen={openFilterCol === 'client'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'client' ? null : 'client')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, clients: newSelected }))}
                      widthClass="w-56"
                    />
                  )}
                </div>
              </th>

              {/* Failed Tool Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[115px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('failed_tool')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>Failed Tool</span>
                    {renderSortIcon('failed_tool')}
                  </button>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter Tool"
                      options={columnOptions.failedTools}
                      selected={filters?.failedTools || []}
                      isOpen={openFilterCol === 'failed_tool'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'failed_tool' ? null : 'failed_tool')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, failedTools: newSelected }))}
                      widthClass="w-56"
                    />
                  )}
                </div>
              </th>

              {/* Failed Component Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[130px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('failed_component')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>Failed Component</span>
                    {renderSortIcon('failed_component')}
                  </button>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter Component"
                      options={columnOptions.failedComponents}
                      selected={filters?.failedComponents || []}
                      isOpen={openFilterCol === 'failed_component'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'failed_component' ? null : 'failed_component')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, failedComponents: newSelected }))}
                      widthClass="w-60"
                    />
                  )}
                </div>
              </th>

              {/* FAD Number Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[110px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('fad')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>FAD Number</span>
                    {renderSortIcon('fad')}
                  </button>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter FAD Number"
                      options={columnOptions.fads}
                      selected={filters?.fads || []}
                      isOpen={openFilterCol === 'fad'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'fad' ? null : 'fad')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, fads: newSelected }))}
                      customSearchText={filters?.fads?.[0] && !columnOptions.fads.includes(filters.fads[0]) ? filters.fads[0] : ''}
                      onCustomSearchChange={(val) => setFilters(prev => ({ ...prev, fads: val ? [val] : [] }))}
                      widthClass="w-60"
                    />
                  )}
                </div>
              </th>

              {/* Observation / Cause Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[160px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <span className="text-[10px] whitespace-nowrap">Observation / Cause</span>

                  {setFilters && (
                    <div className="relative inline-flex items-center shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFilterCol(openFilterCol === 'observation' ? null : 'observation');
                        }}
                        className={`p-1 rounded-md transition-all flex items-center justify-center shrink-0 ${
                          filters?.searchTerm 
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm ring-1 ring-amber-400' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/80'
                        }`}
                        title={filters?.searchTerm ? `Search: "${filters.searchTerm}"` : "Search Observations"}
                      >
                        <Filter className="w-2.5 h-2.5" />
                        {filters?.searchTerm && (
                          <span className="ml-0.5 text-[8px] font-extrabold leading-none">1</span>
                        )}
                      </button>

                      {openFilterCol === 'observation' && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs normal-case font-normal text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95">
                          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                            <span className="font-bold text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-wider">Search Text</span>
                            {filters?.searchTerm && (
                              <button
                                onClick={() => setFilters(prev => ({ ...prev, searchTerm: '' }))}
                                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder="Type keywords..."
                            value={filters?.searchTerm || ''}
                            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* TFF/SI Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[95px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('tff_si')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>TFF/SI</span>
                    {renderSortIcon('tff_si')}
                  </button>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter TFF/SI"
                      options={['TFF', 'SI']}
                      selected={filters?.tff_si || []}
                      isOpen={openFilterCol === 'tff_si'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'tff_si' ? null : 'tff_si')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, tff_si: newSelected }))}
                      align="right"
                      widthClass="w-48"
                      showSearch={false}
                    />
                  )}
                </div>
              </th>

              {/* NPT Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[95px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <button 
                    onClick={() => handleSort('npt')} 
                    className="flex items-center space-x-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors text-[10px] whitespace-nowrap"
                  >
                    <span>NPT (Hrs)</span>
                    {renderSortIcon('npt')}
                  </button>

                  {setFilters && (
                    <div className="relative inline-flex items-center shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenFilterCol(openFilterCol === 'npt' ? null : 'npt');
                        }}
                        className={`p-1 rounded-md transition-all flex items-center justify-center shrink-0 ${
                          (filters?.nptMin !== null && filters?.nptMin !== undefined) || (filters?.nptMax !== null && filters?.nptMax !== undefined)
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm ring-1 ring-amber-400' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/80'
                        }`}
                        title="Filter NPT Range"
                      >
                        <Filter className="w-2.5 h-2.5" />
                        {((filters?.nptMin !== null && filters?.nptMin !== undefined) || (filters?.nptMax !== null && filters?.nptMax !== undefined)) && (
                          <span className="ml-0.5 text-[8px] font-extrabold leading-none">1</span>
                        )}
                      </button>

                      {openFilterCol === 'npt' && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs normal-case font-normal text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95">
                          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                            <span className="font-bold text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-wider">NPT Range (Hours)</span>
                            {(filters?.nptMin !== null || filters?.nptMax !== null) && (
                              <button
                                onClick={() => setFilters(prev => ({ ...prev, nptMin: null, nptMax: null }))}
                                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Min Hours</label>
                              <input
                                type="number"
                                placeholder="Min"
                                value={filters?.nptMin ?? ''}
                                onChange={(e) => setFilters(prev => ({ ...prev, nptMin: e.target.value ? Number(e.target.value) : null }))}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">Max Hours</label>
                              <input
                                type="number"
                                placeholder="Max"
                                value={filters?.nptMax ?? ''}
                                onChange={(e) => setFilters(prev => ({ ...prev, nptMax: e.target.value ? Number(e.target.value) : null }))}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-1.5 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* Witness Header */}
              <th className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 min-w-[95px] whitespace-nowrap relative">
                <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                  <span className="text-[10px] whitespace-nowrap">Witness</span>

                  {setFilters && (
                    <HeaderMultiSelectFilter
                      title="Filter Witness"
                      options={columnOptions.witnessStatuses}
                      selected={filters?.witnessStatuses || []}
                      isOpen={openFilterCol === 'witness'}
                      onToggle={() => setOpenFilterCol(openFilterCol === 'witness' ? null : 'witness')}
                      onClose={() => setOpenFilterCol(null)}
                      onChange={(newSelected) => setFilters(prev => ({ ...prev, witnessStatuses: newSelected }))}
                      align="right"
                      widthClass="w-52"
                    />
                  )}
                </div>
              </th>

              <th className="py-2.5 px-2 text-center w-20 bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-8 text-center text-slate-500 dark:text-slate-400">
                  No failure records match your current filters.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((row, idx) => {
                const rowIndex = (currentPage - 1) * pageSize + idx + 1;
                const uniqueRowKey = row.id ? `${row.id}-${idx}` : `row-${idx}`;
                return (
                  <tr
                    key={uniqueRowKey}
                    className="bg-white dark:bg-slate-900 hover:bg-amber-500/5 dark:hover:bg-slate-800/50 transition-colors group border-b border-slate-200 dark:border-slate-800/40 text-slate-800 dark:text-slate-200"
                  >
                    {/* Index */}
                    <td className="p-2 text-center text-slate-500 dark:text-slate-500 font-mono border-r border-slate-200 dark:border-slate-800/40 bg-slate-50 dark:bg-slate-950/30">
                      {rowIndex}
                    </td>

                    {/* Year Column */}
                    <td
                      onClick={() => handleCellClick(row, 'year')}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 whitespace-nowrap font-mono cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'year' ? (
                        <input
                          type="number"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-16 bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span className="text-slate-900 dark:text-slate-100 font-bold">{formatYearDisplay(row.year, row.date)}</span>
                      )}
                    </td>

                    {/* Date Column */}
                    <td
                      onClick={() => handleCellClick(row, 'date')}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 whitespace-nowrap font-mono cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'date' ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-full bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span className="text-slate-800 dark:text-slate-300 font-medium">{formatDateDisplay(row.date, row.year)}</span>
                      )}
                    </td>

                    {/* Client */}
                    <td
                      onClick={() => handleCellClick(row, 'client')}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 font-medium cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'client' ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-full bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300 font-bold">{row.client}</span>
                      )}
                    </td>

                    {/* Failed Tool */}
                    <td
                      onClick={() => handleCellClick(row, 'failed_tool')}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'failed_tool' ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-full bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span className="text-slate-900 dark:text-slate-200 font-semibold">{row.failed_tool}</span>
                      )}
                    </td>

                    {/* Failed Component */}
                    <td
                      onClick={() => handleCellClick(row, 'failed_component')}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 text-slate-700 dark:text-slate-400 cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'failed_component' ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-full bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span>{row.failed_component || '—'}</span>
                      )}
                    </td>

                    {/* FAD Number */}
                    <td
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 font-mono"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'fad' ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-full bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs font-mono"
                        />
                      ) : row.fad ? (
                        <a
                          href={`#/more-info/${encodeURIComponent(row.fad)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            if (e.ctrlKey || e.metaKey) {
                              // Same-tab navigation to Supplemental Info; a plain click edits/views instead.
                              window.location.hash = `#/more-info/${encodeURIComponent(row.fad)}`;
                              return;
                            }
                            handleCellClick(row, 'fad');
                          }}
                          title={
                            fadsWithInfo?.has(normalizeFadKey(row.fad))
                              ? 'Click to edit/view • Ctrl/Cmd+Click to open Supplemental Info (available)'
                              : 'Click to edit/view • Ctrl/Cmd+Click to open Supplemental Info'
                          }
                          className="inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span className="text-amber-700 dark:text-amber-300 font-mono font-bold bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5 rounded border border-amber-200 dark:border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-200">
                            {row.fad}
                          </span>
                          {fadsWithInfo?.has(normalizeFadKey(row.fad)) && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-sky-500/15 border border-sky-500/40 text-sky-700 dark:text-sky-300 shrink-0 hover:bg-sky-500/25"
                              title="Supplemental info available for this FAD — Ctrl/Cmd+Click to view"
                            >
                              <Info className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </a>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">—</span>
                      )}
                    </td>

                    {/* Observation Preview (Click opens modal expander) */}
                    <td
                      onClick={() => onOpenDetailModal(row)}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors group/cell"
                      title="Click to view/edit full text"
                    >
                      <div className="flex items-center justify-between space-x-1">
                        <span className="text-slate-800 dark:text-slate-300 line-clamp-1 truncate max-w-xs">
                          {row.observation || row.root_cause || 'No observation recorded'}
                        </span>
                        <Maximize2 className="w-3 h-3 text-slate-400 dark:text-slate-600 group-hover/cell:text-amber-600 dark:group-hover/cell:text-amber-400 shrink-0" />
                      </div>
                    </td>

                    {/* TFF / SI */}
                    <td
                      onClick={() => handleCellClick(row, 'tff_si')}
                      className="p-2 border-r border-slate-200 dark:border-slate-800/40 font-mono cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'tff_si' ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-full bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span className="text-slate-800 dark:text-slate-300 font-mono font-semibold">{row.tff_si || '—'}</span>
                      )}
                    </td>

                    {/* NPT Hours */}
                    <td
                      onClick={() => handleCellClick(row, 'npt')}
                      className={`p-2 border-r border-slate-200 dark:border-slate-800/40 font-mono font-bold cursor-pointer hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300 ${
                        row.npt > 10 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {editingCell?.id === row.id && editingCell?.field === 'npt' ? (
                        <input
                          type="number"
                          step="0.5"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          onBlur={() => handleSaveCell(row)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveCell(row)}
                          className="w-16 bg-white dark:bg-slate-950 text-amber-700 dark:text-amber-300 border border-amber-500 rounded px-1 text-xs"
                        />
                      ) : (
                        <span>{row.npt}h</span>
                      )}
                    </td>

                    {/* Witness Status */}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-800/40 text-slate-700 dark:text-slate-400 text-[11px]">
                      <span>{row.witness_status || 'N/A'}</span>
                    </td>

                    {/* Actions Column */}
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => onOpenDetailModal(row)}
                          title="View / Expand Details"
                          className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleDuplicateRow(row)}
                              title="Duplicate Row"
                              className="p-1 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRecord(row.id);
                              }}
                              title="Delete Row"
                              className="p-1 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Grid Pagination Footer */}
      <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center space-x-3">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>
            Page <strong className="text-slate-900 dark:text-slate-100">{currentPage}</strong> of <strong className="text-slate-900 dark:text-slate-100">{totalPages}</strong>
          </span>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center space-x-2">
          {syncStatus === 'saving' ? (
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 animate-pulse font-semibold text-xs transition-all shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
              <span>Saving...</span>
            </div>
          ) : (
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold text-xs transition-all shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Saved</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="px-3 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-800 dark:text-slate-200 rounded border border-slate-300 dark:border-slate-800 transition-colors"
          >
            Previous
          </button>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="px-3 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-800 dark:text-slate-200 rounded border border-slate-300 dark:border-slate-800 transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* Clear All Data Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="bg-rose-500/10 dark:bg-rose-500/20 border-b border-rose-500/20 p-5 flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Confirm Data Wiping
                  </h3>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-0.5">
                    Irreversible Danger Zone Action
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowClearConfirmModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                You are about to permanently delete <strong className="text-rose-600 dark:text-rose-400 font-bold">{records.length} failure record(s)</strong> from the live Firestore database.
              </p>

              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>
                  This operation will clear all failure records from all views for all connected users. This action <strong>cannot be undone</strong>.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                disabled={isClearing}
                onClick={() => {
                  setShowClearConfirmModal(false);
                }}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={async () => {
                  if (!onClearAllData) return;
                  setIsClearing(true);
                  try {
                    await onClearAllData();
                    setShowClearConfirmModal(false);
                  } catch (err) {
                    console.error('Error clearing data:', err);
                  } finally {
                    setIsClearing(false);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-2"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Records...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Clear All Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
