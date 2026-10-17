import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, writeBatch, deleteDoc } from 'firebase/firestore';
import { FailureRecord, SupplementalInfoRecord, UserRole } from '../types';
import { normalizeFadKey } from '../lib/dataUtils';
import { parseSupplementalExcelFile, ParsedSupplementalFile } from '../lib/supplementalExcel';
import {
  ArrowLeft, Upload, Search, ChevronDown, ChevronRight, Trash2, Link2,
  AlertTriangle, CheckCircle2, Loader2, FileSpreadsheet, Sparkles, Info, X, Database, ExternalLink
} from 'lucide-react';

interface MoreInfoPageProps {
  records: FailureRecord[];
  /** True while the Failures Grid's own records are still loading — avoids briefly showing
   *  "no matches" before the grid data needed to compute matches has arrived. */
  recordsLoading?: boolean;
  role: UserRole;
  userEmail: string;
  theme: 'dark' | 'light';
  focusFad?: string;
  /** Jumps back to the Failures Grid and opens this record's detail modal. */
  onViewInGrid?: (record: FailureRecord) => void;
}

export const MoreInfoPage: React.FC<MoreInfoPageProps> = ({ records, recordsLoading, role, userEmail, theme, focusFad, onViewInGrid }) => {
  const isAdmin = role === 'admin';

  const [supplementalList, setSupplementalList] = useState<SupplementalInfoRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(focusFad || '');
  const [expandedId, setExpandedId] = useState<string | null>(focusFad ? normalizeFadKey(focusFad) : null);

  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedSupplementalFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const hasScrolledToFocus = useRef(false);
  const focusRowRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to the supplemental_info Firestore collection
  useEffect(() => {
    const ref = collection(db, 'supplemental_info');
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const list: SupplementalInfoRecord[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SupplementalInfoRecord);
      });
      list.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
      setSupplementalList(list);
      setListLoading(false);
    }, (err) => {
      console.warn('[MoreInfoPage] supplemental_info listener notice:', err);
      setListLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Scroll to / re-expand the focused FAD once its entry loads
  useEffect(() => {
    if (!focusFad || hasScrolledToFocus.current || listLoading) return;
    const key = normalizeFadKey(focusFad);
    const exists = supplementalList.some((s) => s.id === key);
    if (exists) {
      setExpandedId(key);
      hasScrolledToFocus.current = true;
      setTimeout(() => {
        focusRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [focusFad, listLoading, supplementalList]);

  // Live lookup from normalized FAD key -> current Failures Grid record. Computed fresh from
  // the live `records` prop (not the `matched`/`matchedRecordId` fields stored at import time),
  // so the connection stays correct even if grid rows are added/edited/removed after import.
  const recordsByFad = useMemo(() => {
    const map = new Map<string, FailureRecord>();
    for (const r of records) {
      const key = normalizeFadKey(r.fad);
      if (key && !map.has(key)) map.set(key, r);
    }
    return map;
  }, [records]);

  // Only entries that actually connect to a record currently in the Failures Grid are worth
  // showing here — an uploaded row with no matching FAD in the grid has nothing to link to yet.
  // It reappears automatically the moment a grid record with that FAD number exists.
  const connectedList = useMemo(
    () => supplementalList.filter((s) => recordsByFad.has(s.id)),
    [supplementalList, recordsByFad]
  );

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return connectedList;
    const q = normalizeFadKey(searchQuery);
    const qLower = searchQuery.trim().toLowerCase();
    return connectedList.filter((s) =>
      s.id.includes(q) ||
      (s.fad || '').toLowerCase().includes(qLower) ||
      s.columns.some((c) => c.value.toLowerCase().includes(qLower) || c.label.toLowerCase().includes(qLower))
    );
  }, [connectedList, searchQuery]);

  const matchStats = useMemo(() => {
    const matched = connectedList.length;
    return { total: supplementalList.length, matched, unmatched: supplementalList.length - matched };
  }, [supplementalList, connectedList]);

  const previewMatchStats = useMemo(() => {
    if (!parsedPreview) return null;
    const uniqueFads = new Set(parsedPreview.rows.map((r) => r.normalizedFad));
    let matched = 0;
    uniqueFads.forEach((fad) => {
      if (records.some((r) => normalizeFadKey(r.fad) === fad)) matched++;
    });
    return { totalRows: parsedPreview.rows.length, uniqueFads: uniqueFads.size, matched, unmatched: uniqueFads.size - matched };
  }, [parsedPreview, records]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setParsedPreview(null);
    setParseError(null);
    setImportStatus(null);
    setParsing(true);
    try {
      const result = await parseSupplementalExcelFile(file);
      setParsedPreview(result);
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse the uploaded file.');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedPreview || !uploadFile) return;
    setImporting(true);
    setImportStatus('Matching FAD numbers and writing supplemental records...');

    try {
      // Merge duplicate FAD rows within this file (last value wins per column)
      const merged = new Map<string, { rawFadValue: string; columns: SupplementalInfoRecord['columns'] }>();
      for (const row of parsedPreview.rows) {
        const existing = merged.get(row.normalizedFad);
        if (existing) {
          const colMap = new Map(existing.columns.map((c) => [c.key, c]));
          row.columns.forEach((c) => colMap.set(c.key, c));
          merged.set(row.normalizedFad, { rawFadValue: row.rawFadValue, columns: Array.from(colMap.values()) });
        } else {
          merged.set(row.normalizedFad, { rawFadValue: row.rawFadValue, columns: row.columns });
        }
      }

      const entries = Array.from(merged.entries());
      const chunkSize = 400;
      const nowIso = new Date().toISOString();

      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach(([normFad, data]) => {
          const matchRec = records.find((r) => normalizeFadKey(r.fad) === normFad);
          const docRef = doc(db, 'supplemental_info', normFad);
          const payload: any = {
            id: normFad,
            fad: matchRec ? matchRec.fad : data.rawFadValue,
            matched: !!matchRec,
            keyColumnLabel: parsedPreview.keyColumnLabel,
            columns: data.columns,
            sourceFileName: uploadFile.name,
            uploadedAt: nowIso,
            uploadedBy: userEmail
          };
          if (matchRec) payload.matchedRecordId = matchRec.id;
          batch.set(docRef, payload, { merge: true });
        });

        await batch.commit();
      }

      setImportStatus(`Successfully imported supplemental info for ${entries.length} FAD number(s).`);
      setUploadFile(null);
      setParsedPreview(null);
    } catch (err: any) {
      console.warn('[MoreInfoPage] Import error:', err);
      setImportStatus(`Import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm('Remove this supplemental info entry?')) return;
    try {
      await deleteDoc(doc(db, 'supplemental_info', id));
    } catch (err) {
      console.warn('[MoreInfoPage] Delete entry notice:', err);
    }
  };

  return (
    <div className={`min-h-screen transition-colors ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Page Header */}
      <header className={`border-b sticky top-0 z-30 shadow-md transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <a
                href="#/"
                title="Back to Failures Grid"
                className={`p-2 rounded-xl border transition-colors flex items-center justify-center ${theme === 'dark' ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'}`}
              >
                <ArrowLeft className="w-4 h-4" />
              </a>
              <div className={`p-2 border rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-500/15 border-amber-500/40 text-amber-600'}`}>
                <Info className="w-6 h-6" />
              </div>
              <div>
                <h1 className={`text-lg font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Supplemental FAD Info</h1>
                <p className={`text-xs hidden sm:block ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  Extra reference data matched by FAD number — kept separate from the main Failures Grid
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Stats + Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 font-mono text-emerald-700 dark:text-emerald-400">
              {matchStats.matched} connected to grid record{matchStats.matched === 1 ? '' : 's'}
            </span>
            {matchStats.unmatched > 0 && (
              <span
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 font-mono text-slate-500 dark:text-slate-400"
                title="Uploaded, but no record with this FAD number exists in the Failures Grid yet — hidden until one does"
              >
                {matchStats.unmatched} hidden (no grid match yet)
              </span>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search FAD number or value..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Admin Upload Panel */}
        {isAdmin && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => setShowUploadPanel((v) => !v)}
              className="w-full p-4 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Upload className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Upload Supplemental Excel File
              </span>
              {showUploadPanel ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {showUploadPanel && (
              <div className="p-5 space-y-4 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Upload any Excel sheet that has a <code className="text-amber-600 dark:text-amber-300">FAD</code> column (a{' '}
                  <code className="text-amber-600 dark:text-amber-300">FAR</code> typo is also handled). Only columns whose{' '}
                  <strong>header cell has a background highlight color</strong> in Excel are imported — every other column is ignored.
                  Rows are matched into this page by FAD number; nothing is added to the main Failures Grid.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Excel File (.xlsx, .xls)</label>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                    className="w-full text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400"
                  />
                </div>

                {parsing && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Scanning header row for highlighted columns...
                  </div>
                )}

                {parseError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{parseError}</span>
                  </div>
                )}

                {parsedPreview && !parseError && (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                      <Sparkles className="w-4 h-4" />
                      Preview — review before importing
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <p>Matched key column: <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">{parsedPreview.keyColumnLabel}</span></p>
                      <p>Highlighted columns detected ({parsedPreview.highlightedHeaderLabels.length}):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedPreview.highlightedHeaderLabels.map((label) => (
                          <span key={label} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-400/40 text-amber-700 dark:text-amber-300 font-mono text-[11px]">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {previewMatchStats && (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 font-mono">
                          {previewMatchStats.uniqueFads} unique FAD numbers ({previewMatchStats.totalRows} rows)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-mono">
                          {previewMatchStats.matched} match the Failures Grid
                        </span>
                        {previewMatchStats.unmatched > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 font-mono">
                            {previewMatchStats.unmatched} not currently in the Grid
                          </span>
                        )}
                      </div>
                    )}

                    {parsedPreview.warnings.length > 0 && (
                      <div className="space-y-1">
                        {parsedPreview.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      disabled={importing}
                      onClick={handleConfirmImport}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {importing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Confirm Import
                        </>
                      )}
                    </button>
                  </div>
                )}

                {importStatus && (
                  <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${importStatus.startsWith('Import failed') ? 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}`}>
                    {importStatus.startsWith('Import failed') ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{importStatus}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Supplemental Info List */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">FAD Entries</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 font-mono">
              {filteredList.length} shown
            </span>
          </div>

          {listLoading || recordsLoading ? (
            <div className="p-10 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">Loading supplemental info...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-xs space-y-1">
              <Database className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              {supplementalList.length === 0 ? (
                <>
                  <p>No supplemental info uploaded yet.</p>
                  {isAdmin && <p>Use the upload panel above to import a highlighted-column Excel file.</p>}
                </>
              ) : connectedList.length === 0 ? (
                <>
                  <p>{supplementalList.length} row{supplementalList.length === 1 ? ' was' : 's were'} uploaded, but none currently match a FAD number in the Failures Grid.</p>
                  <p>Entries appear here automatically once a matching FAD is added to the grid.</p>
                </>
              ) : (
                <p>No entries match your search.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {filteredList.map((entry) => {
                const isExpanded = expandedId === entry.id;
                const linkedRecord = recordsByFad.get(entry.id);
                return (
                  <div key={entry.id} ref={focusFad && normalizeFadKey(focusFad) === entry.id ? focusRowRef : undefined}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className={`w-full p-3.5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-amber-500/5 dark:hover:bg-slate-800/50 ${isExpanded ? 'bg-amber-500/5 dark:bg-slate-800/40' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-500/20 shrink-0">
                          {entry.fad || entry.id}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                          <Link2 className="w-2.5 h-2.5" /> In Grid
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                          {entry.columns.slice(0, 2).map((c) => `${c.label}: ${c.value}`).join(' · ')}
                        </span>
                      </div>

                      {isAdmin && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEntry(entry.id);
                          }}
                          title="Remove entry"
                          className="p-1.5 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 rounded hover:bg-rose-500/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 space-y-3 animate-fade-in">
                        {/* Linked Failures Grid record — the actual FAD-number connection to the rest of the dataset */}
                        {linkedRecord ? (
                          <div className="p-3 bg-sky-500/5 border border-sky-500/25 rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                                <Link2 className="w-3 h-3" />
                                Linked Failures Grid Record
                              </span>
                              {onViewInGrid && (
                                <button
                                  onClick={() => onViewInGrid(linkedRecord)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  View Full Record in Grid
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Date</p>
                                <p className="font-semibold text-slate-800 dark:text-slate-200">{linkedRecord.date || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Client</p>
                                <p className="font-semibold text-amber-700 dark:text-amber-300">{linkedRecord.client || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Failed Tool</p>
                                <p className="font-semibold text-slate-800 dark:text-slate-200">{linkedRecord.failed_tool || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">NPT (Hrs)</p>
                                <p className="font-semibold text-rose-600 dark:text-rose-400">{linkedRecord.npt ?? '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Failed Component</p>
                                <p className="text-slate-700 dark:text-slate-300">{linkedRecord.failed_component || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">TFF / SI</p>
                                <p className="text-slate-700 dark:text-slate-300">{linkedRecord.tff_si || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Run</p>
                                <p className="text-slate-700 dark:text-slate-300">{linkedRecord.run || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Witness</p>
                                <p className="text-slate-700 dark:text-slate-300">{linkedRecord.witness_status || '—'}</p>
                              </div>
                            </div>
                            {linkedRecord.observation && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 pt-1 border-t border-sky-500/15">
                                {linkedRecord.observation}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-[11px] text-slate-500 dark:text-slate-400">
                            No record with this FAD number exists in the Failures Grid yet — this data will connect automatically if one is added later.
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {entry.columns.map((c) => (
                            <div key={c.key} className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">{c.label}</p>
                              <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{c.value}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-600">
                          Source: {entry.sourceFileName} • Uploaded {entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'} by {entry.uploadedBy} • Matched via "{entry.keyColumnLabel}" column
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
