import React, { useState, useEffect } from 'react';
import { FailureRecord, UserRole } from '../types';
import { X, Save, Trash2, Calendar, FileText, AlertTriangle, Shield, Check, Info } from 'lucide-react';

interface DetailModalProps {
  record: FailureRecord | null;
  isOpen: boolean;
  onClose: () => void;
  role: UserRole;
  onSave: (updatedRecord: FailureRecord) => Promise<void>;
  onDelete?: (docId: string) => Promise<void>;
  initialFocusField?: keyof FailureRecord;
  /** Whether supplemental info has been uploaded for this record's FAD number. */
  hasMoreInfo?: boolean;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  record,
  isOpen,
  onClose,
  role,
  onSave,
  onDelete,
  initialFocusField,
  hasMoreInfo
}) => {
  const [formData, setFormData] = useState<Partial<FailureRecord>>({});
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setFormData(record);
      setSavedSuccess(false);
      setError(null);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const isAdmin = role === 'admin';

  const handleChange = (field: keyof FailureRecord, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setError(null);

    try {
      await onSave(formData as FailureRecord);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 600);
    } catch (err: any) {
      setError(err.message || 'Failed to save updates');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!isAdmin || !onDelete || !record.id) {
      console.warn('[DetailModal] Cannot delete record: missing admin privileges, onDelete prop, or record ID.');
      return;
    }
    console.log('[DetailModal] Triggering delete for record ID:', record.id);
    try {
      setSaving(true);
      await onDelete(record.id);
      onClose();
    } catch (err: any) {
      console.error('[DetailModal] Error deleting record:', err);
      setError(err.message || 'Failed to delete record');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Failure Record Details
                </h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-amber-700 dark:text-amber-300 font-mono font-semibold">
                  {record.client} • {record.failed_tool}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ID: {record.id} {record.updatedBy && `• Last edited by ${record.updatedBy}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Metrics & Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Year / Date
              </label>
              {isAdmin ? (
                <input
                  type="date"
                  value={formData.date || ''}
                  onChange={(e) => handleChange('date', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1.5 text-xs text-slate-800 dark:text-slate-100 mt-1"
                />
              ) : (
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">{record.year} ({record.date})</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Client
              </label>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.client || ''}
                  onChange={(e) => handleChange('client', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1.5 text-xs text-slate-800 dark:text-slate-100 mt-1"
                />
              ) : (
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-300 mt-1">{record.client}</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Failed Tool
              </label>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.failed_tool || ''}
                  onChange={(e) => handleChange('failed_tool', e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1.5 text-xs text-slate-800 dark:text-slate-100 mt-1"
                />
              ) : (
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">{record.failed_tool}</p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                NPT Hours
              </label>
              {isAdmin ? (
                <input
                  type="number"
                  step="0.1"
                  value={formData.npt ?? 0}
                  onChange={(e) => handleChange('npt', parseFloat(e.target.value) || 0)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1.5 text-xs text-slate-800 dark:text-slate-100 font-bold mt-1"
                />
              ) : (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-1">{record.npt} Hours</p>
              )}
            </div>
          </div>

          {/* Secondary Parameters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-amber-700 dark:text-amber-300">FAD Number</label>
                {record.fad && (
                  <a
                    href={`#/more-info/${encodeURIComponent(record.fad)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.hash = `#/more-info/${encodeURIComponent(record.fad)}`;
                    }}
                    title="View Supplemental Info for this FAD"
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                      hasMoreInfo
                        ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:text-sky-700 dark:hover:text-sky-300'
                    }`}
                  >
                    <Info className="w-2.5 h-2.5" />
                    <span>{hasMoreInfo ? 'More Info' : 'View More Info'}</span>
                  </a>
                )}
              </div>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.fad || ''}
                  onChange={(e) => handleChange('fad', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded p-2 text-amber-700 dark:text-amber-300 font-mono"
                />
              ) : (
                <p className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-300 dark:border-slate-800 text-amber-700 dark:text-amber-300 font-mono">{record.fad || 'N/A'}</p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">TFF / SI</label>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.tff_si || ''}
                  onChange={(e) => handleChange('tff_si', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded p-2 text-slate-800 dark:text-slate-200"
                />
              ) : (
                <p className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono">{record.tff_si || 'N/A'}</p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">CA / Sperry</label>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.ca_sperry || ''}
                  onChange={(e) => handleChange('ca_sperry', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded p-2 text-slate-800 dark:text-slate-200"
                />
              ) : (
                <p className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300">{record.ca_sperry || 'N/A'}</p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Failed Component</label>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.failed_component || ''}
                  onChange={(e) => handleChange('failed_component', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded p-2 text-slate-800 dark:text-slate-200"
                />
              ) : (
                <p className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300">{record.failed_component || 'N/A'}</p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1">Equipment No.</label>
              {isAdmin ? (
                <input
                  type="text"
                  value={formData.equipment_no || ''}
                  onChange={(e) => handleChange('equipment_no', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded p-2 text-slate-800 dark:text-slate-200"
                />
              ) : (
                <p className="p-2 bg-slate-50 dark:bg-slate-950 rounded border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-mono">{record.equipment_no || 'N/A'}</p>
              )}
            </div>
          </div>

          {/* Long Text Areas */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">
                Observation / Summary
              </label>
              {isAdmin ? (
                <textarea
                  rows={3}
                  value={formData.observation || ''}
                  onChange={(e) => handleChange('observation', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  placeholder="Describe observation..."
                />
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {record.observation || 'No observation recorded.'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">
                Initial Findings
              </label>
              {isAdmin ? (
                <textarea
                  rows={3}
                  value={formData.initial_findings || ''}
                  onChange={(e) => handleChange('initial_findings', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  placeholder="Describe initial findings..."
                />
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {record.initial_findings || 'No initial findings recorded.'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1.5">
                Root Cause Analysis
              </label>
              {isAdmin ? (
                <textarea
                  rows={3}
                  value={formData.root_cause || ''}
                  onChange={(e) => handleChange('root_cause', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  placeholder="Describe root cause..."
                />
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {record.root_cause || 'Root cause pending analysis.'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5">
                Action Plan & Corrective Measures
              </label>
              {isAdmin ? (
                <textarea
                  rows={3}
                  value={formData.action_plan || ''}
                  onChange={(e) => handleChange('action_plan', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  placeholder="Describe action plan..."
                />
              ) : (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {record.action_plan || 'No action plan assigned.'}
                </div>
              )}
            </div>
          </div>

          {/* Save / Delete Footer Controls */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              {isAdmin && onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteRecord}
                  disabled={saving}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Record</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition-colors"
              >
                {isAdmin ? 'Cancel' : 'Close'}
              </button>

              {isAdmin && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center space-x-2 shadow-md disabled:opacity-50"
                >
                  {savedSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
