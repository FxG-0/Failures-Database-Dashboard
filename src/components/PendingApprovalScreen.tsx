import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Clock, ShieldAlert, LogOut, RefreshCw, CheckCircle2, Shield, User, AlertTriangle, Sparkles } from 'lucide-react';

interface PendingApprovalScreenProps {
  user: UserProfile;
  onSignOut: () => void;
  theme: 'dark' | 'light';
}

export const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({
  user,
  onSignOut,
  theme
}) => {
  const [checking, setChecking] = useState(false);
  const isRejected = user.status === 'rejected';

  const handleRefresh = () => {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
    }, 800);
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      <div className={`max-w-lg w-full rounded-2xl border p-8 shadow-2xl transition-all ${
        theme === 'dark'
          ? 'bg-slate-900 border-slate-800 shadow-slate-950/50'
          : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}>
        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {isRejected ? (
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
              <ShieldAlert className="w-8 h-8" />
            </div>
          ) : (
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Clock className="w-8 h-8 animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
              </span>
            </div>
          )}
        </div>

        {/* Title and Description */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold tracking-tight mb-2">
            {isRejected ? 'Access Request Declined' : 'Account Pending Authorization'}
          </h2>
          <p className={`text-xs leading-relaxed ${
            theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
          }`}>
            {isRejected ? (
              <>
                Your request to access the Failures Database was not authorized by the administrator. Please contact the administrator directly if you require access.
              </>
            ) : (
              <>
                Thank you for registering! Your account has been registered and is waiting for administrator authorization and role assignment.
              </>
            )}
          </p>
        </div>

        {/* Account Details Box */}
        <div className={`p-4 rounded-xl border mb-6 text-xs space-y-2.5 ${
          theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Registered Email:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{user.email}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Authorization Status:</span>
            {isRejected ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                <ShieldAlert className="w-3 h-3 mr-1" /> REJECTED
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
                <Clock className="w-3 h-3 mr-1" /> PENDING REVIEW
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Primary Administrator:</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">faiqgoraya166@gmail.com</span>
          </div>
        </div>

        {/* Notification Alert Banner */}
        {!isRejected && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl mb-6 flex items-start space-x-2.5 text-xs text-amber-800 dark:text-amber-200">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Real-time Notification Dispatched</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                The administrator has received a live notification to authorize your account and assign your permissions (Admin or Viewer). This screen updates automatically once approved.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleRefresh}
            disabled={checking}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center space-x-1.5 ${
              theme === 'dark'
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Checking...' : 'Check Status'}</span>
          </button>

          <button
            onClick={onSignOut}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all flex items-center space-x-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
