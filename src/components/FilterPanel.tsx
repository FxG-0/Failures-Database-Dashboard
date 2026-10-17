import React, { useMemo } from 'react';
import { FilterState, FailureRecord } from '../types';
import { Search, RotateCcw, X, ChevronDown, ChevronUp, SlidersHorizontal, Check } from 'lucide-react';
import { getMergedUniqueOptions } from '../lib/dataUtils';
import { MultiSelectDropdown } from './MultiSelectDropdown';

interface FilterPanelProps {
  records: FailureRecord[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  filteredCount: number;
  totalCount: number;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  records,
  filters,
  setFilters,
  filteredCount,
  totalCount,
  isCollapsed,
  setIsCollapsed
}) => {
  // Extract unique merged filter options dynamically from current dataset
  const options = useMemo(() => {
    const years = Array.from(new Set(records.map(r => r.year).filter(Boolean))).sort((a: number, b: number) => b - a);
    const clients = getMergedUniqueOptions(records.map(r => r.client));
    const tff_si = ['TFF', 'SI'];
    const ca_sperry = getMergedUniqueOptions(records.map(r => r.ca_sperry));
    const failedTools = getMergedUniqueOptions(records.map(r => r.failed_tool));
    const failedComponents = getMergedUniqueOptions(records.map(r => r.failed_component));
    const witnessStatuses = getMergedUniqueOptions(records.map(r => r.witness_status));

    return { years, clients, tff_si, ca_sperry, failedTools, failedComponents, witnessStatuses };
  }, [records]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({ ...prev, searchTerm: e.target.value }));
  };

  const handleSelectToggle = (category: keyof FilterState, value: any) => {
    setFilters(prev => {
      const currentList = prev[category] as any[];
      if (Array.isArray(currentList)) {
        const updated = currentList.includes(value)
          ? currentList.filter(item => item !== value)
          : [...currentList, value];
        return { ...prev, [category]: updated };
      }
      return prev;
    });
  };

  const handleResetFilters = () => {
    setFilters({
      searchTerm: '',
      dateFilter: '',
      years: [],
      months: [],
      clients: [],
      tff_si: [],
      ca_sperry: [],
      failedTools: [],
      failedComponents: [],
      fads: [],
      runs: [],
      equipmentNos: [],
      witnessStatuses: [],
      nptInSystem: [],
      nptMin: null,
      nptMax: null
    });
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchTerm) count++;
    if (filters.years.length) count += filters.years.length;
    if (filters.clients.length) count += filters.clients.length;
    if (filters.tff_si.length) count += filters.tff_si.length;
    if (filters.ca_sperry.length) count += filters.ca_sperry.length;
    if (filters.failedTools.length) count += filters.failedTools.length;
    if (filters.failedComponents.length) count += filters.failedComponents.length;
    if (filters.witnessStatuses.length) count += filters.witnessStatuses.length;
    if (filters.fads && filters.fads.length) count += filters.fads.length;
    if (filters.nptMin !== null || filters.nptMax !== null) count++;
    return count;
  }, [filters]);

  return (
    <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xl mb-6 backdrop-blur-md transition-colors relative z-20">
      {/* Search & Main Filter Bar */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900/90">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
          <input
            id="input-filter-search"
            type="text"
            value={filters.searchTerm}
            onChange={handleSearchChange}
            placeholder="Search observation, root cause, action plan..."
            className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
          />
          {filters.searchTerm && (
            <button
              onClick={() => setFilters(prev => ({ ...prev, searchTerm: '' }))}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Counter and Filter Toggle Controls */}
        <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-end">
          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800/80 flex items-center space-x-1.5 font-mono">
            <span className="font-bold text-amber-600 dark:text-amber-400">{filteredCount}</span>
            <span className="text-slate-400 dark:text-slate-500 font-sans">of</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{totalCount} records</span>
          </div>

          <button
            id="btn-toggle-filters"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition-all ${
              !isCollapsed || activeFilterCount > 0
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full">
                {activeFilterCount}
              </span>
            )}
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 ml-1" /> : <ChevronUp className="w-3.5 h-3.5 ml-1" />}
          </button>

          {activeFilterCount > 0 && (
            <button
              id="btn-reset-filters"
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/30 rounded-xl transition-all flex items-center space-x-1"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Filter Panel Options with Multiple Selections */}
      {!isCollapsed && (
        <div className="p-5 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs animate-fade-in">
          
          {/* 1. YEAR (Multi-select Pills) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                YEAR
              </label>
              {filters.years.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, years: [] }))}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Clear ({filters.years.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl min-h-[38px]">
              {options.years.length === 0 ? (
                <span className="text-slate-400 dark:text-slate-600 text-xs px-2">No years</span>
              ) : (
                options.years.map(y => {
                  const isSelected = filters.years.includes(y);
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => handleSelectToggle('years', y)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/90'
                      }`}
                    >
                      <span>{y}</span>
                      {isSelected && <Check className="w-3 h-3 ml-0.5 text-slate-950" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. CLIENT (Multi-select Dropdown) */}
          <MultiSelectDropdown
            id="filter-client"
            label="CLIENT"
            placeholder="All Clients"
            options={options.clients}
            selected={filters.clients}
            onChange={(selected) => setFilters(prev => ({ ...prev, clients: selected }))}
          />

          {/* 3. FAILED TOOL (Multi-select Dropdown) */}
          <MultiSelectDropdown
            id="filter-failed-tool"
            label="FAILED TOOL"
            placeholder="All Tools"
            options={options.failedTools}
            selected={filters.failedTools}
            onChange={(selected) => setFilters(prev => ({ ...prev, failedTools: selected }))}
          />

          {/* 4. TFF / SI CODE (Multi-select Toggle Pills) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                TFF / SI CODE
              </label>
              {filters.tff_si.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, tff_si: [] }))}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Clear ({filters.tff_si.length})
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl min-h-[38px]">
              {['TFF', 'SI'].map(code => {
                const isSelected = filters.tff_si.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleSelectToggle('tff_si', code)}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/90'
                    }`}
                  >
                    <span>{code}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-slate-950" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. CA / SPERRY (Multi-select Dropdown) */}
          <MultiSelectDropdown
            id="filter-ca-sperry"
            label="CA / SPERRY"
            placeholder="All Categories"
            options={options.ca_sperry}
            selected={filters.ca_sperry}
            onChange={(selected) => setFilters(prev => ({ ...prev, ca_sperry: selected }))}
          />

          {/* 6. FAILED COMPONENT (Multi-select Dropdown) */}
          <MultiSelectDropdown
            id="filter-failed-comp"
            label="FAILED COMPONENT"
            placeholder="All Components"
            options={options.failedComponents}
            selected={filters.failedComponents}
            onChange={(selected) => setFilters(prev => ({ ...prev, failedComponents: selected }))}
          />

          {/* 7. WITNESS STATUS (Multi-select Dropdown) */}
          <MultiSelectDropdown
            id="filter-witness"
            label="WITNESS STATUS"
            placeholder="All Statuses"
            options={options.witnessStatuses}
            selected={filters.witnessStatuses}
            onChange={(selected) => setFilters(prev => ({ ...prev, witnessStatuses: selected }))}
          />

          {/* 8. NPT HOURS RANGE (MIN - MAX) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              NPT HOURS RANGE (MIN - MAX)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="Min NPT"
                value={filters.nptMin !== null ? filters.nptMin : ''}
                onChange={(e) => {
                  const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
                  setFilters(prev => ({ ...prev, nptMin: val }));
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-amber-500 placeholder-slate-400 dark:placeholder-slate-600"
              />
              <span className="text-slate-400 dark:text-slate-600 font-bold">-</span>
              <input
                type="number"
                placeholder="Max NPT"
                value={filters.nptMax !== null ? filters.nptMax : ''}
                onChange={(e) => {
                  const val = e.target.value !== '' ? parseFloat(e.target.value) : null;
                  setFilters(prev => ({ ...prev, nptMax: val }));
                }}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-amber-500 placeholder-slate-400 dark:placeholder-slate-600"
              />
            </div>
          </div>

        </div>
      )}

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/60 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider mr-1">
            Active Filters:
          </span>
          {filters.searchTerm && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              Search: "{filters.searchTerm}"
              <button onClick={() => setFilters(prev => ({ ...prev, searchTerm: '' }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.years.map(y => (
            <span key={`tag-y-${y}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              Year: {y}
              <button onClick={() => handleSelectToggle('years', y)} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.clients.map(c => (
            <span key={`tag-c-${c}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              Client: {c}
              <button onClick={() => setFilters(prev => ({ ...prev, clients: prev.clients.filter(x => x !== c) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.failedTools.map(t => (
            <span key={`tag-t-${t}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              Tool: {t}
              <button onClick={() => setFilters(prev => ({ ...prev, failedTools: prev.failedTools.filter(x => x !== t) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.tff_si.map(code => (
            <span key={`tag-tff-${code}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              TFF/SI: {code}
              <button onClick={() => setFilters(prev => ({ ...prev, tff_si: prev.tff_si.filter(x => x !== code) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.ca_sperry.map(ca => (
            <span key={`tag-ca-${ca}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              CA/Sperry: {ca}
              <button onClick={() => setFilters(prev => ({ ...prev, ca_sperry: prev.ca_sperry.filter(x => x !== ca) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.failedComponents.map(comp => (
            <span key={`tag-comp-${comp}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              Comp: {comp}
              <button onClick={() => setFilters(prev => ({ ...prev, failedComponents: prev.failedComponents.filter(x => x !== comp) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.witnessStatuses.map(w => (
            <span key={`tag-w-${w}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              Witness: {w}
              <button onClick={() => setFilters(prev => ({ ...prev, witnessStatuses: prev.witnessStatuses.filter(x => x !== w) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.fads && filters.fads.map(f => (
            <span key={`tag-fad-${f}`} className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              FAD: {f}
              <button onClick={() => setFilters(prev => ({ ...prev, fads: prev.fads.filter(x => x !== f) }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {(filters.nptMin !== null || filters.nptMax !== null) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
              NPT Range: {filters.nptMin ?? 0}h - {filters.nptMax ?? '∞'}h
              <button onClick={() => setFilters(prev => ({ ...prev, nptMin: null, nptMax: null }))} className="ml-1 hover:text-slate-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
