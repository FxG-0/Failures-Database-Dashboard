import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

interface MultiSelectDropdownProps {
  id?: string;
  label?: string;
  placeholder?: string;
  options: (string | number)[];
  selected: (string | number)[];
  onChange: (selected: any[]) => void;
  className?: string;
  showSearch?: boolean;
  maxDisplay?: number;
  size?: 'sm' | 'md';
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  id,
  label,
  placeholder = 'Select options...',
  options = [],
  selected = [],
  onChange,
  className = '',
  showSearch = true,
  maxDisplay = 2,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(opt => String(opt).toLowerCase().includes(q));
  }, [options, searchQuery]);

  const handleToggleOption = (val: string | number) => {
    const isSelected = selected.includes(val);
    if (isSelected) {
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
  };

  const isAllFilteredSelected = filteredOptions.length > 0 && 
    filteredOptions.every(opt => selected.includes(opt));

  // Determine display text for the trigger button
  const renderTriggerText = () => {
    if (selected.length === 0) {
      return <span className="text-slate-400 dark:text-slate-500 font-normal truncate">{placeholder}</span>;
    }

    if (selected.length <= maxDisplay) {
      return (
        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
          {selected.join(', ')}
        </span>
      );
    }

    return (
      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
        {selected.length} selected
      </span>
    );
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white dark:bg-slate-900 border rounded-xl flex items-center justify-between text-left transition-all ${
          selected.length > 0
            ? 'border-amber-500/60 bg-amber-500/5 dark:bg-amber-500/10'
            : 'border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
        } ${size === 'sm' ? 'p-2 text-xs' : 'p-2.5 text-xs'}`}
      >
        <div className="flex items-center gap-1.5 overflow-hidden flex-1 mr-1">
          {selected.length > 0 && (
            <span className="bg-amber-500 text-slate-950 font-bold text-[10px] px-1.5 py-0.2 rounded-full shrink-0">
              {selected.length}
            </span>
          )}
          <div className="truncate">{renderTriggerText()}</div>
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400 dark:text-slate-500">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 hover:text-rose-500 dark:hover:text-rose-400 rounded transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-amber-500' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[220px] max-w-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl z-50 p-2 text-xs normal-case font-normal text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95">
          {/* Header controls: Search & Quick Actions */}
          <div className="space-y-1.5 mb-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            {showSearch && options.length > 5 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter options..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="text-slate-500 dark:text-slate-400">
                {selected.length} of {options.length} selected
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={isAllFilteredSelected ? handleClear : handleSelectAll}
                  className="text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                >
                  {isAllFilteredSelected ? 'Deselect All' : 'Select All'}
                </button>
                {selected.length > 0 && !isAllFilteredSelected && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-rose-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Options Checkbox List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 dark:text-slate-500 text-xs">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = selected.includes(opt);
                return (
                  <label
                    key={String(opt)}
                    className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleOption(opt)}
                      className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                    />
                    <span className="truncate flex-1 text-xs">{opt}</span>
                    {isChecked && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
