import React, { useMemo, useState } from 'react';
import { FailureRecord } from '../types';
import { cleanStringValue } from '../lib/dataUtils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { Clock, AlertTriangle, TrendingUp, Building2, BarChart2, Hash, Percent } from 'lucide-react';

interface NptDashboardProps {
  records: FailureRecord[];
  totalRecordsCount: number;
}

const BAR_COLORS = [
  '#f59e0b', // amber-500
  '#38bdf8', // sky-400
  '#10b981', // emerald-500
  '#a855f7', // purple-500
  '#f43f5e', // rose-500
  '#fb923c', // orange-400
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
];

export const NptDashboard: React.FC<NptDashboardProps> = ({ records, totalRecordsCount }) => {
  const [metric, setMetric] = useState<'npt' | 'incidents'>('npt');
  const [sortBy, setSortBy] = useState<'value' | 'name'>('value');

  // Aggregated client data
  const { chartData, summary } = useMemo(() => {
    const clientMap: Record<string, { totalNpt: number; count: number }> = {};
    let grandTotalNpt = 0;

    records.forEach(r => {
      const clientName = cleanStringValue(r.client) || 'Unknown / Unassigned';
      const nptVal = typeof r.npt === 'number' && !isNaN(r.npt) ? r.npt : 0;
      
      grandTotalNpt += nptVal;

      if (!clientMap[clientName]) {
        clientMap[clientName] = { totalNpt: 0, count: 0 };
      }
      clientMap[clientName].totalNpt += nptVal;
      clientMap[clientName].count += 1;
    });

    // Convert map to array
    let dataList = Object.keys(clientMap).map(client => {
      const totalNpt = parseFloat(clientMap[client].totalNpt.toFixed(2));
      const count = clientMap[client].count;
      const avgNpt = count > 0 ? parseFloat((totalNpt / count).toFixed(2)) : 0;
      const percent = grandTotalNpt > 0 ? parseFloat(((totalNpt / grandTotalNpt) * 100).toFixed(1)) : 0;

      return {
        client,
        totalNpt,
        incidents: count,
        avgNpt,
        percent
      };
    });

    // Sorting
    if (sortBy === 'value') {
      dataList.sort((a, b) => {
        if (metric === 'npt') return b.totalNpt - a.totalNpt;
        return b.incidents - a.incidents;
      });
    } else {
      dataList.sort((a, b) => a.client.localeCompare(b.client));
    }

    // Top client
    const topClient = dataList.length > 0 
      ? [...dataList].sort((a, b) => b.totalNpt - a.totalNpt)[0] 
      : null;

    const summaryObj = {
      totalNpt: parseFloat(grandTotalNpt.toFixed(2)),
      incidentCount: records.length,
      avgNptPerIncident: records.length > 0 ? parseFloat((grandTotalNpt / records.length).toFixed(2)) : 0,
      clientCount: dataList.length,
      topClientName: topClient?.client || 'N/A',
      topClientNpt: topClient?.totalNpt || 0
    };

    return { chartData: dataList, summary: summaryObj };
  }, [records, metric, sortBy]);

  // Custom Tooltip renderer for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-950/95 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-sans space-y-1.5 z-50">
          <p className="font-bold text-amber-600 dark:text-amber-400 text-sm border-b border-slate-200 dark:border-slate-800 pb-1 flex items-center space-x-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>{label}</span>
          </p>
          <div className="space-y-1 text-slate-700 dark:text-slate-200 pt-0.5">
            <div className="flex justify-between items-center space-x-4">
              <span className="text-slate-500 dark:text-slate-400">Total NPT:</span>
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-300">{data.totalNpt.toLocaleString()} hrs</span>
            </div>
            <div className="flex justify-between items-center space-x-4">
              <span className="text-slate-500 dark:text-slate-400">Incidents:</span>
              <span className="font-mono font-semibold text-sky-600 dark:text-sky-300">{data.incidents} failures</span>
            </div>
            <div className="flex justify-between items-center space-x-4">
              <span className="text-slate-500 dark:text-slate-400">Avg NPT/Incident:</span>
              <span className="font-mono text-slate-800 dark:text-slate-300">{data.avgNpt} hrs</span>
            </div>
            <div className="flex justify-between items-center space-x-4">
              <span className="text-slate-500 dark:text-slate-400">Share of Total NPT:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{data.percent}%</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-6 shadow-xl backdrop-blur-md space-y-5 animate-fade-in transition-colors">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-wide">
              Total NPT by Client Dashboard
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time NPT analysis derived from <span className="text-amber-600 dark:text-amber-300 font-semibold">{records.length}</span> filtered failure {records.length === 1 ? 'record' : 'records'} 
            {totalRecordsCount > records.length && (
              <span className="text-slate-400 dark:text-slate-500"> (out of {totalRecordsCount} total)</span>
            )}
          </p>
        </div>

        {/* View Toggle Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-950 p-1 border border-slate-300 dark:border-slate-800 text-xs">
            <button
              onClick={() => setMetric('npt')}
              className={`px-3 py-1 rounded-lg transition-all font-medium flex items-center space-x-1 ${
                metric === 'npt'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>NPT (Hours)</span>
            </button>
            <button
              onClick={() => setMetric('incidents')}
              className={`px-3 py-1 rounded-lg transition-all font-medium flex items-center space-x-1 ${
                metric === 'incidents'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Incidents</span>
            </button>
          </div>

          {/* Sort Order Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'value' | 'name')}
            className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-300 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="value">Sort: Highest First</option>
            <option value="name">Sort: Alphabetical</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 flex items-center space-x-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total NPT Hours</p>
            <p className="text-lg font-bold font-mono text-amber-600 dark:text-amber-300">{summary.totalNpt.toLocaleString()} <span className="text-xs font-normal text-amber-600/80 dark:text-amber-500/80">hrs</span></p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 flex items-center space-x-3">
          <div className="p-2.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl border border-sky-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Failures</p>
            <p className="text-lg font-bold font-mono text-sky-600 dark:text-sky-300">{summary.incidentCount} <span className="text-xs font-normal text-sky-600/80 dark:text-sky-500/80">events</span></p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Avg NPT / Incident</p>
            <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-300">{summary.avgNptPerIncident} <span className="text-xs font-normal text-emerald-600/80 dark:text-emerald-500/80">hrs</span></p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 flex items-center space-x-3">
          <div className="p-2.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Top Client (NPT)</p>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{summary.topClientName}</p>
            <p className="text-xs font-mono text-purple-600 dark:text-purple-300">{summary.topClientNpt.toLocaleString()} hrs</p>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      {chartData.length === 0 ? (
        <div className="h-64 bg-slate-950/50 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 text-xs">
          <BarChart2 className="w-8 h-8 text-slate-600 mb-2" />
          <p>No client NPT data available for the selected filters.</p>
        </div>
      ) : (
        <div className="pt-2">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="client" 
                  stroke="#64748b" 
                  fontSize={11}
                  tickLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', color: '#94a3b8' }}
                />
                <Bar 
                  dataKey={metric === 'npt' ? 'totalNpt' : 'incidents'} 
                  name={metric === 'npt' ? 'Total NPT (Hours)' : 'Incident Count'} 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={60}
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={BAR_COLORS[index % BAR_COLORS.length]} 
                      className="transition-all duration-300 hover:opacity-80"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
