import React from 'react';
import { UserProfile } from '../types';
import { Database, Shield, User, LogOut, FileSpreadsheet, Settings, Radio, Sun, Moon, Bell } from 'lucide-react';

interface HeaderProps {
  user: UserProfile | null;
  activeTab: 'database' | 'admin';
  setActiveTab: (tab: 'database' | 'admin') => void;
  onSignOut: () => void;
  onOpenAuth: () => void;
  recordCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  pendingApprovalsCount?: number;
  onOpenPendingApprovals?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  setActiveTab,
  onSignOut,
  onOpenAuth,
  recordCount,
  theme,
  onToggleTheme,
  pendingApprovalsCount = 0,
  onOpenPendingApprovals
}) => {
  return (
    <header className={`border-b sticky top-0 z-30 shadow-md transition-colors ${
      theme === 'dark'
        ? 'bg-slate-900 border-slate-800 text-slate-100'
        : 'bg-white border-slate-200 text-slate-900'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & App Title */}
          <div className="flex items-center space-x-3">
            <div className={`p-2 border rounded-xl flex items-center justify-center transition-colors ${
              theme === 'dark'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-600'
            }`}>
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className={`text-lg font-bold tracking-tight ${
                  theme === 'dark' ? 'text-white' : 'text-slate-900'
                }`}>Failures Database</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                  <Radio className="w-3 h-3 mr-1 animate-pulse" /> Live Sync
                </span>
              </div>
              <p className={`text-xs hidden sm:block ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                Sperry Drilling & Client Equipment Failure Records ({recordCount} total rows)
              </p>
            </div>
          </div>

          {/* Navigation Tabs (Admin Console accessible only if admin) */}
          <div className="flex items-center space-x-2">
            <button
              id="nav-tab-database"
              onClick={() => setActiveTab('database')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'database'
                  ? theme === 'dark'
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-amber-50 text-amber-700 border border-amber-300'
                  : theme === 'dark'
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Failures Grid</span>
            </button>

            {user?.role === 'admin' && (
              <button
                id="nav-tab-admin"
                onClick={() => setActiveTab('admin')}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'admin'
                    ? theme === 'dark'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-amber-50 text-amber-700 border border-amber-300'
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Admin Console</span>
              </button>
            )}
          </div>

          {/* User Profile & Theme Toggle & Notifications */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Admin Pending Approvals Notification Bell */}
            {user?.role === 'admin' && onOpenPendingApprovals && (
              <button
                id="btn-pending-approvals"
                onClick={onOpenPendingApprovals}
                title={pendingApprovalsCount > 0 ? `${pendingApprovalsCount} Pending User Sign-Up Authorization(s)` : 'No pending authorizations'}
                className={`relative p-2 rounded-xl border transition-all flex items-center justify-center ${
                  pendingApprovalsCount > 0
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 hover:bg-amber-500/30 shadow-sm animate-pulse'
                    : theme === 'dark'
                      ? 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <Bell className="w-4 h-4" />
                {pendingApprovalsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            )}

            {/* Theme Toggle Button */}
            <button
              id="btn-theme-toggle"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-slate-800/80 text-amber-400 border-slate-700 hover:bg-slate-700 hover:border-amber-500/50 shadow-inner'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 hover:border-amber-500 shadow-sm'
              }`}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700 transition-transform duration-300 hover:-rotate-12" />
              )}
            </button>

            {user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className={`text-xs font-medium ${
                    theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
                  }`}>{user.email}</span>
                  <div className="flex items-center space-x-1 mt-0.5">
                    {user.role === 'admin' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        <Shield className="w-2.5 h-2.5 mr-0.5" /> ADMIN (FULL ACCESS)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/40">
                        <User className="w-2.5 h-2.5 mr-0.5" /> VIEWER (READ ONLY)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  id="btn-signout"
                  onClick={onSignOut}
                  title="Sign Out"
                  className={`p-2 rounded-lg transition-colors border ${
                    theme === 'dark'
                      ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800 border-transparent hover:border-slate-700'
                      : 'text-slate-600 hover:text-amber-600 hover:bg-slate-100 border-transparent hover:border-slate-300'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="btn-login-open"
                onClick={onOpenAuth}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-lg transition-all shadow-sm flex items-center space-x-1.5"
              >
                <User className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
