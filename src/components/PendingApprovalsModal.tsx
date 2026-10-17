import React, { useState } from 'react';
import { UserProfile } from '../types';
import { 
  ShieldCheck, UserCheck, XCircle, Clock, X, CheckCircle2, 
  Shield, User, Bell, Sparkles, AlertCircle 
} from 'lucide-react';

interface PendingApprovalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingUsers: UserProfile[];
  onAuthorizeUser: (user: UserProfile, role: 'admin' | 'viewer') => Promise<void>;
  onRejectUser: (user: UserProfile) => Promise<void>;
  theme: 'dark' | 'light';
}

export const PendingApprovalsModal: React.FC<PendingApprovalsModalProps> = ({
  isOpen,
  onClose,
  pendingUsers,
  onAuthorizeUser,
  onRejectUser,
  theme
}) => {
  const [processingUid, setProcessingUid] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAction = async (user: UserProfile, role?: 'admin' | 'viewer') => {
    setProcessingUid(user.uid);
    try {
      if (role) {
        await onAuthorizeUser(user, role);
        setActionFeedback(`Authorized ${user.email} as ${role.toUpperCase()}`);
      } else {
        await onRejectUser(user);
        setActionFeedback(`Rejected access for ${user.email}`);
      }
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: any) {
      console.error('Error handling user authorization:', err);
    } finally {
      setProcessingUid(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className={`max-w-2xl w-full rounded-2xl border shadow-2xl overflow-hidden transition-colors flex flex-col max-h-[85vh] ${
        theme === 'dark'
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          theme === 'dark' ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold">New Sign-Up Authorizations</h3>
                {pendingUsers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-500 text-slate-950">
                    {pendingUsers.length} Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Review new user sign-ups and choose whether to authorize them as Admin or Viewer.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {actionFeedback && (
          <div className="mx-5 mt-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-300 text-xs flex items-center space-x-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Body / User List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {pendingUsers.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">All Caught Up!</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                There are no pending user authorization requests at this time. All users have been reviewed.
              </p>
            </div>
          ) : (
            pendingUsers.map((user) => {
              const isProcessing = processingUid === user.uid;
              const formattedDate = user.createdAt
                ? new Date(user.createdAt).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })
                : 'Just now';

              return (
                <div
                  key={user.uid}
                  className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    theme === 'dark'
                      ? 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* User info */}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {user.email}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 animate-pulse">
                        PENDING
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Registered: {formattedDate}</span>
                      </span>
                      <span>•</span>
                      <span>UID: {user.uid.slice(0, 10)}...</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center flex-wrap gap-2 shrink-0">
                    {/* Authorize as Admin */}
                    <button
                      disabled={isProcessing}
                      onClick={() => handleAction(user, 'admin')}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                      title="Grant Admin privileges with full database edit & user management"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Authorize as Admin</span>
                    </button>

                    {/* Authorize as Viewer */}
                    <button
                      disabled={isProcessing}
                      onClick={() => handleAction(user, 'viewer')}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                      title="Grant Viewer privileges with read-only access and filters"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Authorize as Viewer</span>
                    </button>

                    {/* Reject */}
                    <button
                      disabled={isProcessing}
                      onClick={() => handleAction(user)}
                      className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1 disabled:opacity-50"
                      title="Decline this user registration"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between text-xs ${
          theme === 'dark' ? 'bg-slate-950/60 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <span className="flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Authorized users gain real-time access immediately without re-login.</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
