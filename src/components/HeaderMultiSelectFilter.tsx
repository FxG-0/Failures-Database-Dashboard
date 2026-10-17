import React, { useState, useMemo } from 'react';
import { Filter, X, Search, Check } from 'lucide-react';

interface HeaderMultiSelectFilterProps {
  title: string;
  options: (string | number)[];
  selected: (string | number)[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChange: (newSelected: any[]) => void;
  showSearch?: boolean;
  align?: 'left' | 'right';
  widthClass?: string;
  customSearchText?: string;
  onCustomSearchChange?: (val: string) => void;
}

export const HeaderMultiSelectFilter: React.FC<HeaderMultiSelectFilterProps> = ({
  title,
  options = [],
  selected = [],
  isOpen,
  onToggle,
  onClose,
  onChange,
  showSearch = true,
  align = 'left',
  widthClass = 'w-56',
  customSearchText,
  onCustomSearchChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(opt => String(opt).toLowerCase().includes(q));
  }, [options, searchQuery]);

  const handleToggle = (val: string | number) => {
    const isChecked = selected.includes(val);
    if (isChecked) {
      onChange(selected.filter(item => item !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const handleSelectAll = () => {
    onChange(Array.from(new Set([...selected, ...filteredOptions])));
  };

  const handleClear = () => {
    onChange([]);
    if (onCustomSearchChange) {
      onCustomSearchChange('');
    }
  };

  const isAllFilteredSelected = filteredOptions.length > 0 && 
    filteredOptions.every(opt => selected.includes(opt));

  const hasActiveFilter = selected.length > 0 || (customSearchText && customSearchText.trim() !== '');

  return (
    <div className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`p-1 rounded-md transition-all flex items-center justify-center shrink-0 ${
          hasActiveFilter
            ? 'bg-amber-500 text-slate-950 font-bold shadow-sm ring-1 ring-amber-400'
            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800/80'
        }`}
        title={hasActiveFilter ? `${title}: ${selected.length || 1} active` : `Filter ${title}`}
      >
        <Filter className="w-2.5 h-2.5" />
        {selected.length > 0 && (
          <span className="ml-0.5 text-[8px] font-extrabold leading-none">
            {selected.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 ${widthClass} bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs normal-case font-normal text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-amber-600 dark:text-amber-400 text-[11px] uppercase tracking-wider truncate">
              {title}
            </span>
            <div className="flex items-center space-x-1.5">
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[10px] text-rose-500 hover:underline font-semibold"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Custom Search (e.g. For FAD text input) */}
          {onCustomSearchChange !== undefined && (
            <div className="mb-2">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                Direct Search
              </label>
              <input
                type="text"
                placeholder="Search keywords..."
                value={customSearchText || ''}
                onChange={(e) => onCustomSearchChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300 font-mono focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                autoFocus
              />
            </div>
          )}

          {/* Search in list */}
          {showSearch && options.length > 5 && (
            <div className="relative mb-2">
              <Search className="w-3 h-3 text-slate-400 dark:text-slate-500 absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Filter list..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-7 pr-6 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Quick Select All / Deselect All */}
          {options.length > 0 && (
            <div className="flex items-center justify-between text-[10px] mb-1.5 px-0.5 text-slate-500 dark:text-slate-400">
              <span>{selected.length} of {options.length} selected</span>
              <button
                type="button"
                onClick={isAllFilteredSelected ? handleClear : handleSelectAll}
                className="text-amber-600 dark:text-amber-400 font-semibold hover:underline"
              >
                {isAllFilteredSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-center text-slate-400 dark:text-slate-500 text-xs">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selected.includes(opt);
                return (
                  <label
                    key={String(opt)}
                    className={`flex items-center space-x-2 px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggle(opt)}
                      className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 h-3 w-3"
                    />
                    <span className="truncate flex-1 text-xs">{opt}</span>
                    {isChecked && <Check className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                  </label>
                );
              })
            )}
          </div>

          {/* Bottom actions */}
          <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
