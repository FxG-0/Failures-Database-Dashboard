import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc, addDoc, query, orderBy, limit, writeBatch } from 'firebase/firestore';
import { UserProfile, FailureRecord, AuditLog, UserRole } from '../types';
import { parseExcelFile, exportToExcel } from '../lib/excel';
import { cleanFailureRecord } from '../lib/dataUtils';
import { 
  Users, Activity, Upload, Download, Shield, User, Trash2, UserPlus, 
  RefreshCw, CheckCircle2, AlertCircle, FileSpreadsheet, Database, Clock, Zap,
  AlertTriangle, X, ShieldAlert, Sparkles, Bell, XCircle, ShieldCheck, UserCheck
} from 'lucide-react';

interface AdminConsoleProps {
  currentUser: UserProfile;
  records: FailureRecord[];
  onClearAllData: () => Promise<void>;
  onBulkImportRecords: (imported: Omit<FailureRecord, 'id'>[], mode: 'overwrite' | 'merge') => Promise<void>;
  onStandardizeRecords?: (records: FailureRecord[]) => Promise<void>;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  currentUser,
  records,
  onClearAllData,
  onBulkImportRecords,
  onStandardizeRecords
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'health' | 'bulk'>('users');

  // Users Collection Live Stream
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Audit Logs Collection Live Stream
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // User Management State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('viewer');
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);

  // Bulk File Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Clear All Data Confirmation Modal State
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Database Standardization State
  const [cleaningData, setCleaningData] = useState(false);
  const [cleanStatus, setCleanStatus] = useState<string | null>(null);

  const handleCleanDatabaseNames = async () => {
    if (records.length === 0) return;
    setCleaningData(true);
    setCleanStatus('Scanning and standardizing filter names across all database records...');

    try {
      const recordsToUpdate: { id: string; updates: Record<string, any> }[] = [];
      const updatedFullRecords: FailureRecord[] = [];

      for (const rec of records) {
        if (!rec.id) {
          updatedFullRecords.push(rec);
          continue;
        }
        const cleaned = cleanFailureRecord(rec);
        
        const hasChange = 
          cleaned.client !== rec.client ||
          cleaned.failed_tool !== rec.failed_tool ||
          cleaned.failed_component !== rec.failed_component ||
          cleaned.tff_si !== rec.tff_si ||
          cleaned.ca_sperry !== rec.ca_sperry ||
          cleaned.witness_status !== rec.witness_status ||
          cleaned.fad !== rec.fad;

        if (hasChange) {
          const updatePayload = {
            client: cleaned.client,
            failed_tool: cleaned.failed_tool,
            failed_component: cleaned.failed_component,
            tff_si: cleaned.tff_si,
            ca_sperry: cleaned.ca_sperry,
            witness_status: cleaned.witness_status,
            fad: cleaned.fad,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.email
          };
          recordsToUpdate.push({ id: rec.id, updates: updatePayload });
          updatedFullRecords.push({ ...rec, ...updatePayload });
        } else {
          updatedFullRecords.push(rec);
        }
      }

      if (recordsToUpdate.length > 0) {
        // Optimistically update React state in parent component
        if (onStandardizeRecords) {
          await onStandardizeRecords(updatedFullRecords);
        }

        // Commit to Firestore in safe chunks (max 400 operations per batch)
        const CHUNK_SIZE = 400;
        for (let i = 0; i < recordsToUpdate.length; i += CHUNK_SIZE) {
          const chunk = recordsToUpdate.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);

          for (const item of chunk) {
            const docRef = doc(db, 'failures', item.id);
            batch.set(docRef, item.updates, { merge: true });
          }

          await batch.commit();
        }

        // Write audit log
        try {
          await addDoc(collection(db, 'audit_logs'), {
            timestamp: new Date().toISOString(),
            userId: currentUser.uid,
            userEmail: currentUser.email,
            action: 'STANDARDIZE_NAMES',
            details: `Standardized ${recordsToUpdate.length} record(s) with clean client/tool/tff/fad filter names.`
          });
        } catch (auditErr) {
          console.warn('Audit log write notice:', auditErr);
        }

        setCleanStatus(`Successfully standardized ${recordsToUpdate.length} record(s) in Firestore!`);
      } else {
        setCleanStatus('All filter names in database are already clean and standardized!');
      }
    } catch (err: any) {
      console.error('Error standardizing database names:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'failures');
      setCleanStatus(`Notice: Standardized records updated locally (${err?.message || 'Check Firestore connection'}).`);
    } finally {
      setCleaningData(false);
    }
  };

  // Subscribe to Users collection
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      });
      setUsersList((prev) => {
        const serverIds = new Set(list.map((u) => u.uid));
        const localOnly = prev.filter((u) => !serverIds.has(u.uid));
        return [...list, ...localOnly];
      });
      setUsersLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
      setUsersLoading(false);
    });

    return () => unsubscribeUsers();
  }, []);

  // Subscribe to Audit Logs collection
  useEffect(() => {
    const auditRef = collection(db, 'audit_logs');
    const q = query(auditRef, orderBy('timestamp', 'desc'), limit(30));
    const unsubscribeAudit = onSnapshot(q, (snapshot) => {
      const logs: AuditLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
      });
      setAuditLogs(logs);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'audit_logs');
    });

    return () => unsubscribeAudit();
  }, []);

  // Filter pending users
  const pendingUsers = usersList.filter((u) => u.status === 'pending');

  // Authorize User as Admin or Viewer
  const handleAuthorizeUser = async (targetUser: UserProfile, role: UserRole) => {
    const updated: UserProfile = {
      ...targetUser,
      role,
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: currentUser.email
    };

    setUsersList((prev) =>
      prev.map((u) => (u.uid === targetUser.uid ? updated : u))
    );

    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, {
        role,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser.email
      }, { merge: true });

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          action: 'AUTHORIZE_USER',
          details: `Authorized ${targetUser.email} as ${role.toUpperCase()} (Approved by ${currentUser.email})`
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr);
      }

      setUserActionMsg(`Authorized ${targetUser.email} with role ${role.toUpperCase()}`);
      setTimeout(() => setUserActionMsg(null), 3500);
    } catch (err: any) {
      console.warn('Authorize sync notice:', err);
    }
  };

  // Reject User Access
  const handleRejectUser = async (targetUser: UserProfile) => {
    const updated: UserProfile = {
      ...targetUser,
      status: 'rejected',
      approvedAt: new Date().toISOString(),
      approvedBy: currentUser.email
    };

    setUsersList((prev) =>
      prev.map((u) => (u.uid === targetUser.uid ? updated : u))
    );

    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, {
        status: 'rejected',
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser.email
      }, { merge: true });

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          action: 'REJECT_USER',
          details: `Rejected access request for ${targetUser.email}`
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr);
      }

      setUserActionMsg(`Rejected access request for ${targetUser.email}`);
      setTimeout(() => setUserActionMsg(null), 3500);
    } catch (err: any) {
      console.warn('Reject user sync notice:', err);
    }
  };

  // Toggle user role
  const handleRoleToggle = async (targetUser: UserProfile) => {
    const newRole: UserRole = targetUser.role === 'admin' ? 'viewer' : 'admin';
    setUsersList((prev) =>
      prev.map((u) => (u.uid === targetUser.uid ? { ...u, role: newRole, status: 'approved' } : u))
    );
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, { role: newRole, status: 'approved' }, { merge: true });

      // Write audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          action: 'ROLE_CHANGE',
          details: `Changed role of ${targetUser.email} to ${newRole.toUpperCase()}`
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr);
      }

      setUserActionMsg(`Updated ${targetUser.email} role to ${newRole.toUpperCase()}`);
      setTimeout(() => setUserActionMsg(null), 3000);
    } catch (err: any) {
      console.warn('Role toggle sync notice:', err);
    }
  };

  // Create / Register user profile document
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail) return;

    const userDocRef = doc(collection(db, 'users'));
    const generatedUid = userDocRef.id;

    const newUserObj: UserProfile = {
      uid: generatedUid,
      email: newUserEmail,
      role: newUserRole,
      status: 'approved',
      approvedBy: currentUser.email,
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      disabled: false
    };

    // Optimistically update state so user sees created user instantly
    setUsersList((prev) => [newUserObj, ...prev.filter(u => u.email !== newUserEmail)]);

    const createdEmail = newUserEmail;
    setNewUserEmail('');
    setUserActionMsg(`User profile for ${createdEmail} registered as ${newUserRole.toUpperCase()} (Approved)`);
    setTimeout(() => setUserActionMsg(null), 3500);

    try {
      await setDoc(userDocRef, newUserObj);

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: currentUser.uid,
          userEmail: currentUser.email,
          action: 'REGISTER_USER',
          details: `Registered and pre-approved user profile for ${createdEmail} (${newUserRole.toUpperCase()})`
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr);
      }
    } catch (err: any) {
      console.warn('User write sync notice:', err);
    }
  };

  // Toggle User Active/Disabled
  const handleToggleDisabled = async (targetUser: UserProfile) => {
    const newDisabled = !targetUser.disabled;
    setUsersList((prev) =>
      prev.map((u) => (u.uid === targetUser.uid ? { ...u, disabled: newDisabled } : u))
    );
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, { disabled: newDisabled }, { merge: true });
    } catch (err: any) {
      console.warn('Toggle disabled sync notice:', err);
    }
  };

  // Handle Bulk Excel Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (!uploadFile) return;

    setImporting(true);
    setImportStatus('Parsing Excel sheet data...');

    try {
      const parsedRecords = await parseExcelFile(uploadFile);
      setImportStatus(`Importing ${parsedRecords.length} records into Firestore (${importMode})...`);

      await onBulkImportRecords(parsedRecords, importMode);

      setImportStatus(`Successfully imported ${parsedRecords.length} rows into Firestore!`);
      setUploadFile(null);
    } catch (err: any) {
      setImportStatus(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Compute Data Health Statistics
  const totalNpt = records.reduce((acc, r) => acc + (r.npt || 0), 0);
  const avgNpt = records.length ? (totalNpt / records.length).toFixed(1) : 0;

  const toolFailuresCount = records.reduce((acc: Record<string, number>, r) => {
    const tool = r.failed_tool || 'Unknown';
    acc[tool] = (acc[tool] || 0) + 1;
    return acc;
  }, {});

  const topTools = Object.entries(toolFailuresCount)
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in transition-colors">
      {/* Console Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Admin Control Panel</h2>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center space-x-1">
              <Shield className="w-3 h-3" />
              <span>Admin Privileges Active</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage user roles, audit activity logs, inspect database metrics, and bulk import/export Excel files.
          </p>
        </div>

        {/* Console Nav Sub-Tabs */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-300 dark:border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center space-x-1.5 ${
              activeTab === 'users'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>User Management</span>
          </button>

          <button
            onClick={() => setActiveTab('health')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center space-x-1.5 ${
              activeTab === 'health'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Data Health & Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('bulk')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center space-x-1.5 ${
              activeTab === 'bulk'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk Tools</span>
          </button>
        </div>
      </div>

      {/* TAB 1: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* PENDING AUTHORIZATIONS BANNER / CARD */}
          {pendingUsers.length > 0 && (
            <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-5 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500">
                    <Bell className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center space-x-2">
                      <span>Pending Sign-Up Authorizations</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950">
                        {pendingUsers.length} Action Needed
                      </span>
                    </h3>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                      New users have signed up and are waiting for your approval. Authorize their access level or reject the request.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 mt-4">
                {pendingUsers.map((pUser) => (
                  <div
                    key={pUser.uid}
                    className="p-3.5 bg-white dark:bg-slate-900 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {pUser.email}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                          Awaiting Decision
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Registered: {pUser.createdAt ? new Date(pUser.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently'}
                      </p>
                    </div>

                    <div className="flex items-center flex-wrap gap-2">
                      <button
                        onClick={() => handleAuthorizeUser(pUser, 'admin')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-sm flex items-center space-x-1"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Authorize as Admin</span>
                      </button>
                      <button
                        onClick={() => handleAuthorizeUser(pUser, 'viewer')}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition-all shadow-sm flex items-center space-x-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Authorize as Viewer</span>
                      </button>
                      <button
                        onClick={() => handleRejectUser(pUser)}
                        className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-lg transition-all flex items-center space-x-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Register / Invite New User Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
              <UserPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Register / Pre-Authorize User Profile</span>
            </h3>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  User Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="engineer@company.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assigned Access Role
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="viewer">Viewer (Read-Only Dataset & Filters)</option>
                  <option value="admin">Admin (Full Edit, Delete & Import Privileges)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow flex items-center justify-center space-x-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register & Approve</span>
                </button>
              </div>
            </form>
          </div>

          {/* Registered Users Table Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Registered Users & Authorization Status ({usersList.length})</span>
              </h3>
              {userActionMsg && (
                <span className="text-xs text-amber-700 dark:text-amber-300 font-medium bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 animate-fade-in">
                  {userActionMsg}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">User Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Authorization</th>
                    <th className="p-3">Account State</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 dark:text-slate-500">
                        No user profiles registered yet. Use the form above to add a user.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((usr) => {
                      const userStatus = usr.status || (usr.role === 'admin' ? 'approved' : 'approved');
                      return (
                        <tr key={usr.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                            {usr.email}
                            {usr.uid === currentUser.uid && (
                              <span className="ml-1.5 text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 rounded font-bold">
                                YOU
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {usr.role === 'admin' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                <Shield className="w-3 h-3 mr-1" /> ADMIN
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                                <User className="w-3 h-3 mr-1" /> VIEWER
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {userStatus === 'pending' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                                <Clock className="w-3 h-3 mr-1" /> PENDING REVIEW
                              </span>
                            ) : userStatus === 'rejected' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                <XCircle className="w-3 h-3 mr-1" /> REJECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> APPROVED
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {usr.disabled ? (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">Disabled</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {userStatus === 'pending' ? (
                              <>
                                <button
                                  onClick={() => handleAuthorizeUser(usr, 'admin')}
                                  className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-700 hover:text-slate-950 dark:text-amber-300 dark:hover:text-slate-950 rounded-lg border border-amber-500/30 transition-colors text-[11px] font-bold"
                                  title="Approve as Admin"
                                >
                                  Approve Admin
                                </button>
                                <button
                                  onClick={() => handleAuthorizeUser(usr, 'viewer')}
                                  className="px-2 py-1 bg-sky-500/20 hover:bg-sky-500 text-sky-700 hover:text-white dark:text-sky-300 dark:hover:text-white rounded-lg border border-sky-500/30 transition-colors text-[11px] font-bold"
                                  title="Approve as Viewer"
                                >
                                  Approve Viewer
                                </button>
                                <button
                                  onClick={() => handleRejectUser(usr)}
                                  className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/30 transition-colors text-[11px]"
                                  title="Reject Access"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleRoleToggle(usr)}
                                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors text-[11px]"
                                >
                                  Make {usr.role === 'admin' ? 'Viewer' : 'Admin'}
                                </button>
                                <button
                                  onClick={() => handleToggleDisabled(usr)}
                                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/20 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors text-[11px]"
                                >
                                  {usr.disabled ? 'Enable' : 'Disable'}
                                </button>
                              </>
                            )}
                            {usr.uid !== currentUser.uid && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete profile for ${usr.email}?`)) return;
                                  setUsersList((prev) => prev.filter((u) => u.uid !== usr.uid));
                                  try {
                                    await deleteDoc(doc(db, 'users', usr.uid));
                                    setUserActionMsg(`Removed user ${usr.email}`);
                                    setTimeout(() => setUserActionMsg(null), 3000);
                                  } catch (e) {
                                    console.warn('Error deleting user doc:', e);
                                  }
                                }}
                                title="Delete User Profile Document"
                                className="p-1 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors inline-flex items-center"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATA HEALTH & AUDIT LOGS */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total Failures Rows</p>
                <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{records.length}</p>
              </div>
              <Database className="w-8 h-8 text-amber-500/30" />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Total NPT Impact</p>
                <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">{totalNpt.toFixed(1)} hrs</p>
              </div>
              <Clock className="w-8 h-8 text-rose-500/30" />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Avg NPT / Event</p>
                <p className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 mt-1">{avgNpt} hrs</p>
              </div>
              <Activity className="w-8 h-8 text-sky-500/30" />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase">Top Failing Tool</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate max-w-[140px]">
                  {topTools[0] ? topTools[0][0] : 'N/A'}
                </p>
              </div>
              <Zap className="w-8 h-8 text-emerald-500/30" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Failing Tools Breakdown */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Top Failing Equipment</span>
              </h3>
              <div className="space-y-3 text-xs">
                {topTools.map(([toolName, count]) => (
                  <div key={toolName} className="space-y-1">
                    <div className="flex justify-between text-slate-700 dark:text-slate-300 font-medium">
                      <span>{toolName}</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{count} events</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full"
                        style={{ width: `${Math.min(100, (Number(count) / (records.length || 1)) * 100 * 3)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Log Stream */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xl">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Firestore Activity Audit Trail</span>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">Live Changes Log</span>
              </h3>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
                {auditLogs.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-500 text-center py-6">No audit log entries recorded yet.</p>
                ) : (
                  auditLogs.map((log, idx) => (
                    <div
                      key={log.id ? `${log.id}-${idx}` : `log-${idx}`}
                      className="p-3 bg-slate-50 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-start justify-between space-x-3"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-amber-600 dark:text-amber-400">{log.action}</span>
                          <span className="text-slate-500 dark:text-slate-400 font-medium">• {log.userEmail}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 mt-1">{log.details}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BULK TOOLS */}
      {activeTab === 'bulk' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Re-import from Fresh Excel File */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Upload className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span>Import Failures Excel Sheet</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Upload <code className="text-amber-600 dark:text-amber-300">Failures_Data_base.xlsx</code> or any fresh spreadsheet. Columns like <code className="text-slate-700 dark:text-slate-300">TFF/SI</code>, <code className="text-slate-700 dark:text-slate-300">NPT</code>, and <code className="text-slate-700 dark:text-slate-300">Root Cause</code> will be parsed and bulk-written directly into Firestore.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Import Action Mode</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`p-2.5 rounded-xl border font-semibold flex items-center justify-center space-x-1 transition-all ${
                      importMode === 'merge'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-100 dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Merge / Append</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('overwrite')}
                    className={`p-2.5 rounded-xl border font-semibold flex items-center justify-center space-x-1 transition-all ${
                      importMode === 'overwrite'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300'
                        : 'bg-slate-100 dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>Overwrite Database</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Excel File (.xlsx, .xls, .csv)</label>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400"
                />
              </div>

              {importStatus && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                  {importStatus}
                </div>
              )}

              <button
                disabled={!uploadFile || importing}
                onClick={handleExecuteImport}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center space-x-2"
              >
                <Upload className="w-4 h-4" />
                <span>{importing ? 'Processing Bulk Import...' : 'Execute Bulk Excel Import'}</span>
              </button>
            </div>
          </div>

          {/* Export & Clear Data Management */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Export & Clear Database</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Export the live Firestore failure collection to an Excel file, or clear all data records from the database.
              </p>
            </div>

            <div className="space-y-3">
              <button
                disabled={records.length === 0}
                onClick={() => exportToExcel(records, `Failures_Export_${new Date().toISOString().split('T')[0]}.xlsx`)}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Export Full Dataset to Excel (.xlsx)</span>
              </button>

              <button
                disabled={records.length === 0 || cleaningData}
                onClick={handleCleanDatabaseNames}
                className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-2"
              >
                {cleaningData ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                    <span>Standardizing Database Names...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Standardize & Clean Filter Names in Database</span>
                  </>
                )}
              </button>

              {cleanStatus && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium">
                  {cleanStatus}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-2">Danger Zone / Clear Database:</p>
                <button
                  disabled={records.length === 0}
                  onClick={() => {
                    setShowClearConfirmModal(true);
                  }}
                  className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  <span>Clear All Data ({records.length} records)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
