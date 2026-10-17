import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut, signInAnonymously, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, query, where 
} from 'firebase/firestore';
import { FailureRecord, UserProfile, FilterState, UserRole, UserStatus } from './types';
import { matchesFilterOption, hasTwoOrMoreMissingFields, filterCompleteRecords, normalizeFadKey } from './lib/dataUtils';

import { Header } from './components/Header';
import { FilterPanel } from './components/FilterPanel';
import { EditableGrid } from './components/EditableGrid';
import { NptDashboard } from './components/NptDashboard';
import { DetailModal } from './components/DetailModal';
import { AdminConsole } from './components/AdminConsole';
import { AuthModal } from './components/AuthModal';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { PendingApprovalsModal } from './components/PendingApprovalsModal';
import { MoreInfoPage } from './components/MoreInfoPage';
import { parseDateAndYear } from './lib/excel';

// Simple hash-based route so FAD links can be opened in a new browser tab
// (e.g. via Ctrl/Cmd+Click) and land directly on the Supplemental Info page.
type AppRoute = { view: 'app' | 'more-info'; fad?: string };

function parseRouteHash(hash: string): AppRoute {
  const match = hash.match(/^#\/more-info(?:\/([^/]+))?\/?$/);
  if (match) {
    return { view: 'more-info', fad: match[1] ? decodeURIComponent(match[1]) : undefined };
  }
  return { view: 'app' };
}

import { 
  Database, AlertTriangle, Shield, User, Loader2, Sparkles, RefreshCw, 
  Bell, ShieldCheck, UserCheck, XCircle, X 
} from 'lucide-react';

export default function App() {
  const deletedRecordIdsRef = useRef<Set<string>>(new Set());

  // Theme state ('dark' | 'light')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('app_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Auth state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Admin Pending User Approvals State
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [isPendingApprovalsModalOpen, setIsPendingApprovalsModalOpen] = useState(false);
  const [dismissedNotificationUids, setDismissedNotificationUids] = useState<Set<string>>(new Set());

  // App Navigation View
  const [activeTab, setActiveTab] = useState<'database' | 'admin'>('database');

  // Hash-based route for the Supplemental Info page (supports opening in a new tab via Ctrl/Cmd+Click)
  const [route, setRoute] = useState<AppRoute>(() => parseRouteHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRouteHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Lightweight index of which FAD numbers have supplemental info, so the grid/detail
  // modal can show a small indicator without loading all the supplemental data itself.
  const [fadsWithInfo, setFadsWithInfo] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ref = collection(db, 'supplemental_info');
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const ids = new Set<string>();
      snapshot.forEach((docSnap) => ids.add(docSnap.id));
      setFadsWithInfo(ids);
    }, (err) => {
      console.warn('[supplemental_info index] listener notice:', err);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Live Dataset & Sync State
  const [records, setRecords] = useState<FailureRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'saving' | 'saved'>('saved');

  // Modal Detail State
  const [selectedRecord, setSelectedRecord] = useState<FailureRecord | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Filter State
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
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

  // Listen for Firebase Auth State & User Profile Document in Firestore
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);

      // Clean up previous user profile listener if active
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (user) {
        // Clear local storage demo profile so Firebase Auth takes precedence
        localStorage.removeItem('local_user_profile');

        const userDocRef = doc(db, 'users', user.uid);

        // Subscribe to real-time updates for the logged-in user's profile document
        unsubscribeUserDoc = onSnapshot(userDocRef, async (userSnap) => {
          const isSuperAdminEmail = user.email === 'faiqgoraya166@gmail.com' || user.email === 'admin@failures.com' || !!user.email?.includes('admin');

          if (userSnap.exists()) {
            const data = userSnap.data();
            const rawRole = data?.role;
            const normalizedRole: UserRole = isSuperAdminEmail ? 'admin' : (String(rawRole || 'viewer').toLowerCase().trim() === 'admin' ? 'admin' : 'viewer');
            const resolvedStatus: UserStatus = isSuperAdminEmail ? 'approved' : (data?.status || (normalizedRole === 'admin' ? 'approved' : 'pending'));

            const profile: UserProfile = {
              uid: user.uid,
              email: data?.email || user.email || 'user@failures.com',
              role: normalizedRole,
              status: resolvedStatus,
              approvedAt: data?.approvedAt,
              approvedBy: data?.approvedBy,
              createdAt: data?.createdAt || new Date().toISOString(),
              disabled: !!data?.disabled
            };

            // If super admin's document in Firestore does not have admin role or approved status, fix it
            if (isSuperAdminEmail && (data?.role !== 'admin' || data?.status !== 'approved')) {
              try {
                await setDoc(userDocRef, { role: 'admin', status: 'approved' }, { merge: true });
              } catch (e) {
                console.warn('Super admin status sync notice:', e);
              }
            }

            setUserProfile(profile);
          } else {
            console.log(`[Auth Profile Sync] No user document found in Firestore for UID "${user.uid}". Creating auto-provisioned doc...`);
            const defaultRole: UserRole = isSuperAdminEmail ? 'admin' : 'viewer';
            const defaultStatus: UserStatus = isSuperAdminEmail ? 'approved' : 'pending';
            
            const newProf: UserProfile = {
              uid: user.uid,
              email: user.email || 'user@failures.com',
              role: defaultRole,
              status: defaultStatus,
              createdAt: new Date().toISOString(),
              disabled: false
            };

            try {
              await setDoc(userDocRef, newProf, { merge: true });
              console.log(`[Auth Profile Sync] Auto-provisioned user profile doc with role: "${defaultRole}", status: "${defaultStatus}"`);
            } catch (setErr) {
              console.warn('[Auth Profile Sync] Could not write auto-provisioned profile doc:', setErr);
            }

            setUserProfile(newProf);
          }
          setAuthLoading(false);
        }, (error) => {
          console.warn('[Auth Profile Sync] Error fetching user profile doc from Firestore:', error);
          const isSuperAdminEmail = user.email === 'faiqgoraya166@gmail.com' || user.email === 'admin@failures.com' || !!user.email?.includes('admin');
          const fallbackRole: UserRole = isSuperAdminEmail ? 'admin' : 'viewer';
          const fallbackStatus: UserStatus = isSuperAdminEmail ? 'approved' : 'pending';
          
          setUserProfile({
            uid: user.uid,
            email: user.email || 'user@failures.com',
            role: fallbackRole,
            status: fallbackStatus,
            createdAt: new Date().toISOString(),
            disabled: false
          });
          setAuthLoading(false);
        });
      } else {
        // No authenticated Firebase user: check local storage demo profile
        const savedLocal = localStorage.getItem('local_user_profile');
        if (savedLocal) {
          try {
            const parsed = JSON.parse(savedLocal);
            const normalizedRole: UserRole = String(parsed?.role || 'viewer').toLowerCase().trim() === 'admin' ? 'admin' : 'viewer';
            const resolvedStatus: UserStatus = parsed?.status || (normalizedRole === 'admin' ? 'approved' : 'pending');
            setUserProfile({ ...parsed, role: normalizedRole, status: resolvedStatus });
          } catch (e) {
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
        }
        setAuthLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  // Listen in real-time to pending sign-ups if current user is an admin
  useEffect(() => {
    if (!userProfile || userProfile.role !== 'admin') {
      setPendingUsers([]);
      return;
    }

    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const pending: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const uData = docSnap.data();
        if (uData.status === 'pending') {
          pending.push({ uid: docSnap.id, ...uData } as UserProfile);
        }
      });
      setPendingUsers(pending);
    }, (err) => {
      console.warn('Pending users listener notice:', err);
    });

    return () => unsubscribe();
  }, [userProfile?.role, userProfile?.uid]);

  // Authorize user as Admin or Viewer
  const handleAuthorizeUser = async (targetUser: UserProfile, role: UserRole) => {
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, {
        role,
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: userProfile?.email || 'admin'
      }, { merge: true });

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: userProfile?.uid || 'admin',
          userEmail: userProfile?.email || 'admin',
          action: 'AUTHORIZE_USER',
          details: `Authorized ${targetUser.email} as ${role.toUpperCase()} (Approved by ${userProfile?.email})`
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr);
      }
    } catch (err: any) {
      console.error('Error authorizing user:', err);
    }
  };

  // Reject user access
  const handleRejectUser = async (targetUser: UserProfile) => {
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await setDoc(userRef, {
        status: 'rejected',
        approvedAt: new Date().toISOString(),
        approvedBy: userProfile?.email || 'admin'
      }, { merge: true });

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: userProfile?.uid || 'admin',
          userEmail: userProfile?.email || 'admin',
          action: 'REJECT_USER',
          details: `Rejected access request for ${targetUser.email} by ${userProfile?.email}`
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr);
      }
    } catch (err: any) {
      console.error('Error rejecting user:', err);
    }
  };

  const handleLocalLogin = async (role: UserRole, email: string) => {
    // Attempt anonymous Firebase Auth session if not logged in
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.warn('[handleLocalLogin] Anonymous auth fallback notice:', anonErr);
      }
    }

    const uid = auth.currentUser?.uid || ('demo-' + role + '-' + Date.now());
    const userEmail = email || `${role}@failures.com`;

    const localProf: UserProfile = {
      uid: uid,
      email: userEmail,
      role: role,
      status: 'approved',
      createdAt: new Date().toISOString(),
      disabled: false
    };
    localStorage.setItem('local_user_profile', JSON.stringify(localProf));
    setUserProfile(localProf);

    // Persist to Firestore 'users' collection so profile document is permanently stored and visible in Admin Console
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, localProf, { merge: true });
    } catch (err) {
      console.warn('[handleLocalLogin] Could not sync user profile document to Firestore:', err);
    }
  };

  // Listen for Live Firestore Failures Collection (`onSnapshot`)
  useEffect(() => {
    const failuresRef = collection(db, 'failures');
    const unsubscribeSnapshot = onSnapshot(failuresRef, (snapshot) => {
      const docs: FailureRecord[] = [];
      const purgeIds: string[] = [];

      snapshot.forEach((docSnap) => {
        if (deletedRecordIdsRef.current.has(docSnap.id)) {
          return;
        }

        const data = docSnap.data();
        let yearVal = data.year;
        let dateVal = data.date;

        if (typeof yearVal === 'number' && yearVal > 30000) {
          const parsed = parseDateAndYear(yearVal);
          yearVal = parsed.year;
          if (!dateVal) dateVal = parsed.dateStr;
        }
        if (dateVal) {
          const parsed = parseDateAndYear(dateVal);
          if (parsed.year) yearVal = parsed.year;
          if (parsed.dateStr) dateVal = parsed.dateStr;
        }

        const recordCandidate: FailureRecord = {
          ...data,
          id: docSnap.id,
          year: yearVal || new Date().getFullYear(),
          date: dateVal || ''
        } as FailureRecord;

        // Check if row has 2 or more missing fields of data
        if (hasTwoOrMoreMissingFields(recordCandidate)) {
          purgeIds.push(docSnap.id);
          deletedRecordIdsRef.current.add(docSnap.id);
        } else {
          docs.push(recordCandidate);
        }
      });

      // Automatically purge incomplete rows from Firestore in the background
      if (purgeIds.length > 0) {
        console.log(`[Auto-Purge] Automatically removing ${purgeIds.length} rows with 2+ missing fields from Firestore:`, purgeIds);
        purgeIds.forEach((id) => {
          deleteDoc(doc(db, 'failures', id)).catch((err) => {
            console.warn('Auto-purge Firestore delete notice:', err);
          });
        });
      }

      setRecords((prevRecords) => {
        if (prevRecords.length === 0) {
          return docs;
        }

        const docsMap = new Map<string, FailureRecord>(docs.map((d) => [d.id, d]));
        const updated: FailureRecord[] = [];
        const seen = new Set<string>();

        // Preserve relative order of existing records
        for (const rec of prevRecords) {
          if (docsMap.has(rec.id) && !hasTwoOrMoreMissingFields(rec)) {
            updated.push(docsMap.get(rec.id)!);
            seen.add(rec.id);
          }
        }

        // Add any brand-new docs from Firestore that were not in prevRecords at the top
        for (const docItem of docs) {
          if (!seen.has(docItem.id) && !hasTwoOrMoreMissingFields(docItem)) {
            updated.unshift(docItem);
          }
        }

        return updated;
      });
      setDataLoading(false);
      setSyncStatus('saved');
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'failures');
      } catch (e) {
        console.warn('[Firestore onSnapshot Handled Error]:', e);
      }
      setRecords((prev) => filterCompleteRecords(prev));
      setDataLoading(false);
    });

    return () => unsubscribeSnapshot();
  }, []);

  // Filter Records Client-side
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // 1. Search Term
      if (filters.searchTerm) {
        const query = filters.searchTerm.toLowerCase();
        const obs = (rec.observation || '').toLowerCase();
        const findings = (rec.initial_findings || '').toLowerCase();
        const root = (rec.root_cause || '').toLowerCase();
        const plan = (rec.action_plan || '').toLowerCase();
        const client = (rec.client || '').toLowerCase();
        const tool = (rec.failed_tool || '').toLowerCase();
        const fad = (rec.fad || '').toLowerCase();

        const matchesSearch = 
          obs.includes(query) || 
          findings.includes(query) || 
          root.includes(query) || 
          plan.includes(query) ||
          client.includes(query) ||
          tool.includes(query) ||
          fad.includes(query);

        if (!matchesSearch) return false;
      }

      // 2. Selectable Calendar Date Filter
      if (filters.dateFilter) {
        if (!rec.date || !rec.date.includes(filters.dateFilter)) {
          return false;
        }
      }

      // 3. Year Filter
      if (filters.years.length > 0 && !filters.years.includes(rec.year)) {
        return false;
      }

      // 4. Client Filter
      if (!matchesFilterOption(rec.client, filters.clients)) {
        return false;
      }

      // 5. Failed Tool Filter
      if (!matchesFilterOption(rec.failed_tool, filters.failedTools)) {
        return false;
      }

      // 6. TFF / SI Filter (Supports TFF vs SI categorization)
      if (filters.tff_si && filters.tff_si.length > 0 && filters.tff_si[0] !== '') {
        const selectedTffSi = filters.tff_si[0].toUpperCase().trim();
        const recVal = (rec.tff_si || '').toUpperCase().trim();
        if (selectedTffSi === 'TFF') {
          if (!recVal.includes('TFF')) {
            return false;
          }
        } else if (selectedTffSi === 'SI') {
          if (!recVal.includes('SI') && !recVal.includes('SPT') && !recVal.includes('SERVICE') && recVal.includes('TFF')) {
            return false;
          }
        } else {
          if (!matchesFilterOption(rec.tff_si, filters.tff_si)) {
            return false;
          }
        }
      }

      // 7. CA / Sperry Filter
      if (!matchesFilterOption(rec.ca_sperry, filters.ca_sperry)) {
        return false;
      }

      // 8. Failed Component Filter
      if (!matchesFilterOption(rec.failed_component, filters.failedComponents)) {
        return false;
      }

      // 9. FAD Number Filter (Supports partial text search)
      if (filters.fads && filters.fads.length > 0 && filters.fads[0] !== '') {
        const fadQuery = filters.fads[0].trim().toLowerCase();
        if (fadQuery) {
          const recFad = (rec.fad || '').toLowerCase();
          if (!recFad.includes(fadQuery)) {
            return false;
          }
        }
      }

      // 10. Run Filter
      if (filters.runs && filters.runs.length > 0 && !filters.runs.includes(rec.run)) {
        return false;
      }

      // 11. Equipment No Filter
      if (filters.equipmentNos && filters.equipmentNos.length > 0 && !filters.equipmentNos.includes(rec.equipment_no)) {
        return false;
      }

      // 12. Witness Status Filter
      if (!matchesFilterOption(rec.witness_status, filters.witnessStatuses)) {
        return false;
      }

      // 13. NPT In System Filter
      if (filters.nptInSystem && filters.nptInSystem.length > 0 && !filters.nptInSystem.includes(rec.npt_in_system)) {
        return false;
      }

      // 14. NPT Range
      if (filters.nptMin !== null && rec.npt < filters.nptMin) return false;
      if (filters.nptMax !== null && rec.npt > filters.nptMax) return false;

      return true;
    });
  }, [records, filters]);

  // Firestore Write Handlers (Admin Only)
  const handleUpdateRecord = async (updated: FailureRecord) => {
    if (!userProfile || userProfile.role !== 'admin') {
      alert('Only Admin users can edit records.');
      return;
    }

    setSyncStatus('saving');

    let targetId = updated.id;
    if (!targetId || targetId.trim() === '') {
      targetId = doc(collection(db, 'failures')).id;
    }

    const updateData: FailureRecord = {
      ...updated,
      id: targetId,
      updatedAt: new Date().toISOString(),
      updatedBy: userProfile.email
    };

    // Optimistically update React state
    setRecords((prev) => prev.map((r) => r.id === targetId ? updateData : r));

    try {
      const docRef = doc(db, 'failures', targetId);
      await setDoc(docRef, updateData, { merge: true });

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: userProfile.uid,
          userEmail: userProfile.email,
          action: 'UPDATE',
          docId: targetId,
          details: `Updated failure record ${updated.failed_tool || ''} (${updated.client || ''})`
        });
      } catch (auditErr) {
        console.warn('Could not write audit log:', auditErr);
      }
    } catch (err: any) {
      console.warn('Firestore update sync notice:', err);
    } finally {
      setTimeout(() => setSyncStatus('saved'), 300);
    }
  };

  const handleAddRecord = async (newRecord: Omit<FailureRecord, 'id'>) => {
    if (!userProfile || userProfile.role !== 'admin') {
      alert('Only Admin users can add failure records.');
      return;
    }

    if (hasTwoOrMoreMissingFields(newRecord)) {
      alert('Cannot save record: 2 or more required fields are missing. Please complete the details before saving.');
      return;
    }

    setSyncStatus('saving');

    const newDocRef = doc(collection(db, 'failures'));
    const recordData: FailureRecord = {
      ...newRecord,
      id: newDocRef.id,
      updatedAt: new Date().toISOString(),
      updatedBy: userProfile.email
    };

    // Optimistically update React state: insert at top
    setRecords((prev) => [recordData, ...prev]);

    try {
      await setDoc(newDocRef, recordData);

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: userProfile.uid,
          userEmail: userProfile.email,
          action: 'CREATE',
          docId: newDocRef.id,
          details: `Created failure record for ${newRecord.client} - ${newRecord.failed_tool}`
        });
      } catch (auditErr) {
        console.warn('Could not write audit log:', auditErr);
      }
    } catch (err: any) {
      console.warn('Firestore add sync notice:', err);
    } finally {
      setTimeout(() => setSyncStatus('saved'), 300);
    }
  };

  const handleDuplicateRecord = async (targetRecord: FailureRecord) => {
    if (!userProfile || userProfile.role !== 'admin') {
      alert('Only Admin users can duplicate records.');
      return;
    }

    setSyncStatus('saving');

    const { id, ...rest } = targetRecord;
    const newDocRef = doc(collection(db, 'failures'));
    const recordData: FailureRecord = {
      ...rest,
      id: newDocRef.id,
      failures: rest.failures ? `${rest.failures} (Copy)` : 'Copy Failure Entry',
      updatedAt: new Date().toISOString(),
      updatedBy: userProfile.email
    };

    // Optimistically update React state: insert right below targetRecord
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === targetRecord.id);
      if (idx === -1) {
        return [recordData, ...prev];
      }
      const newArr = [...prev];
      newArr.splice(idx + 1, 0, recordData);
      return newArr;
    });

    try {
      await setDoc(newDocRef, recordData);

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: userProfile.uid,
          userEmail: userProfile.email,
          action: 'CREATE',
          docId: newDocRef.id,
          details: `Duplicated failure record ID ${targetRecord.id}`
        });
      } catch (auditErr) {
        console.warn('Could not write audit log:', auditErr);
      }
    } catch (err: any) {
      console.warn('Firestore duplicate sync notice:', err);
    } finally {
      setTimeout(() => setSyncStatus('saved'), 300);
    }
  };

  const handleDeleteRecord = async (docId: string) => {
    console.log('[handleDeleteRecord] Execution started for docId:', docId);

    if (!docId || docId.trim() === '') {
      console.error('[handleDeleteRecord] ABORTED: Provided docId is empty or invalid:', docId);
      return;
    }

    setSyncStatus('saving');

    // Track deleted ID in ref so onSnapshot won't restore it
    deletedRecordIdsRef.current.add(docId);
    console.log('[handleDeleteRecord] Added docId to deletedRecordIdsRef set:', docId);

    // Optimistically update React state immediately
    setRecords((prev) => {
      const filtered = prev.filter((r) => r.id !== docId);
      console.log(`[handleDeleteRecord] Optimistically updated UI state: ${prev.length} -> ${filtered.length} records`);
      return filtered;
    });

    try {
      const docRef = doc(db, 'failures', docId);
      console.log('[handleDeleteRecord] Invoking Firestore deleteDoc on path:', docRef.path);
      await deleteDoc(docRef);
      console.log('[handleDeleteRecord] SUCCESS: Document deleted from Firestore successfully:', docId);

      // Audit log
      try {
        if (userProfile) {
          await addDoc(collection(db, 'audit_logs'), {
            timestamp: new Date().toISOString(),
            userId: userProfile.uid,
            userEmail: userProfile.email,
            action: 'DELETE',
            docId,
            details: `Deleted failure record ID ${docId}`
          });
          console.log('[handleDeleteRecord] Audit log entry created for docId:', docId);
        }
      } catch (auditErr) {
        console.warn('[handleDeleteRecord] Non-fatal notice: Could not write audit log:', auditErr);
      }
    } catch (err: any) {
      console.error('[handleDeleteRecord] ERROR deleting doc from Firestore:', err);
      handleFirestoreError(err, OperationType.DELETE, `failures/${docId}`);
    } finally {
      setTimeout(() => setSyncStatus('saved'), 300);
    }
  };

  // Clear All Database Records Handler
  const handleClearAllData = async () => {
    console.log('[handleClearAllData] Execution started. Total records in current state:', records.length);

    if (records.length === 0) {
      console.warn('[handleClearAllData] ABORTED: Database state is already empty (0 records).');
      return;
    }

    setSyncStatus('saving');

    const countToClear = records.length;
    const recordsToDelete = [...records];
    console.log(`[handleClearAllData] Preparing to delete ${countToClear} records from Firestore.`);

    // Mark all existing IDs as deleted
    recordsToDelete.forEach((r) => {
      if (r.id) {
        deletedRecordIdsRef.current.add(r.id);
      }
    });
    console.log(`[handleClearAllData] Added ${recordsToDelete.length} document IDs to deletedRecordIdsRef filter.`);

    // Clear state immediately
    setRecords([]);
    console.log('[handleClearAllData] Optimistically cleared records state to []');

    try {
      const chunkSize = 400;
      let deletedCount = 0;

      for (let i = 0; i < recordsToDelete.length; i += chunkSize) {
        const chunk = recordsToDelete.slice(i, i + chunkSize);
        console.log(`[handleClearAllData] Processing batch chunk ${Math.floor(i / chunkSize) + 1} (${chunk.length} items)...`);
        
        const batch = writeBatch(db);
        let batchItemCount = 0;

        chunk.forEach(r => {
          if (r.id && r.id.trim() !== '') {
            const docRef = doc(db, 'failures', r.id);
            batch.delete(docRef);
            batchItemCount++;
          }
        });

        if (batchItemCount > 0) {
          console.log(`[handleClearAllData] Committing writeBatch with ${batchItemCount} delete operations...`);
          await batch.commit();
          deletedCount += batchItemCount;
          console.log(`[handleClearAllData] Batch commit successful. Total deleted so far: ${deletedCount}/${countToClear}`);
        }
      }

      console.log(`[handleClearAllData] SUCCESS: All ${deletedCount} documents deleted from Firestore.`);

      try {
        if (userProfile) {
          await addDoc(collection(db, 'audit_logs'), {
            timestamp: new Date().toISOString(),
            userId: userProfile.uid,
            userEmail: userProfile.email,
            action: 'CLEAR_ALL',
            details: `Cleared all ${countToClear} failure records from database.`
          });
          console.log('[handleClearAllData] Audit log entry created for clear_all action.');
        }
      } catch (auditErr) {
        console.warn('[handleClearAllData] Non-fatal notice: Could not write audit log:', auditErr);
      }
    } catch (err: any) {
      console.error('[handleClearAllData] ERROR during batch clear in Firestore:', err);
      handleFirestoreError(err, OperationType.DELETE, 'failures');
      // Revert optimistic clear so UI state remains accurate to Firestore
      setRecords(recordsToDelete);
      recordsToDelete.forEach((r) => {
        if (r.id) {
          deletedRecordIdsRef.current.delete(r.id);
        }
      });
      alert('Could not clear database records. Please check permissions or network connection.');
    } finally {
      setTimeout(() => setSyncStatus('saved'), 300);
    }
  };

  // Bulk Excel Import
  const handleBulkImport = async (imported: Omit<FailureRecord, 'id'>[], mode: 'overwrite' | 'merge') => {
    if (!userProfile || userProfile.role !== 'admin') return;

    setSyncStatus('saving');

    const userEmail = userProfile?.email || 'admin@failures.com';
    const userId = userProfile?.uid || 'admin-uid';

    const ALLOWED_RECORD_FIELDS = [
      'year', 'date', 'month', 'failures', 'client', 'tff_si', 'ca_sperry',
      'run', 'observation', 'initial_findings', 'root_cause', 'failed_component',
      'failed_tool', 'fad', 'equipment_no', 'action_plan', 'npt', 'npt_in_system',
      'witness_status'
    ];

    // Clean & sanitize record objects, assigning a valid doc ID upfront and filtering out rows with 2+ missing fields
    const sanitizedImported: FailureRecord[] = imported
      .map((rec) => {
        const newDocRef = doc(collection(db, 'failures'));
        const cleanRec: Record<string, any> = { id: newDocRef.id };
        
        ALLOWED_RECORD_FIELDS.forEach((field) => {
          const val = (rec as any)[field];
          if (field === 'npt' || field === 'year') {
            const num = typeof val === 'number' ? val : parseFloat(val);
            cleanRec[field] = isNaN(num) ? 0 : num;
          } else if (val !== undefined && val !== null) {
            cleanRec[field] = String(val).trim();
          } else {
            cleanRec[field] = '';
          }
        });
        cleanRec.updatedAt = new Date().toISOString();
        cleanRec.updatedBy = userEmail;
        return cleanRec as FailureRecord;
      })
      .filter((r) => !hasTwoOrMoreMissingFields(r));

    // Immediately update local state so user sees imported data instantly
    if (mode === 'overwrite') {
      deletedRecordIdsRef.current.clear();
      setRecords(sanitizedImported);
    } else {
      setRecords((prev) => [...sanitizedImported, ...prev]);
    }

    try {
      if (mode === 'overwrite' && records.length > 0) {
        // Delete existing records in chunks of 400
        const deleteChunkSize = 400;
        for (let i = 0; i < records.length; i += deleteChunkSize) {
          const chunk = records.slice(i, i + deleteChunkSize);
          const deleteBatch = writeBatch(db);
          let count = 0;
          chunk.forEach(r => {
            if (r.id) {
              deleteBatch.delete(doc(db, 'failures', r.id));
              count++;
            }
          });
          if (count > 0) {
            try {
              await deleteBatch.commit();
            } catch (delErr) {
              console.warn('Batch deletion sync notice:', delErr);
            }
          }
        }
      }

      // Batch insert in chunks of 400
      const chunkSize = 400;
      for (let i = 0; i < sanitizedImported.length; i += chunkSize) {
        const chunk = sanitizedImported.slice(i, i + chunkSize);
        
        try {
          const batch = writeBatch(db);
          chunk.forEach(rec => {
            batch.set(doc(db, 'failures', rec.id), rec);
          });
          await batch.commit();
        } catch (batchErr) {
          console.warn('Batch import chunk fallback to individual writes:', batchErr);
          for (const rec of chunk) {
            try {
              await setDoc(doc(db, 'failures', rec.id), rec);
            } catch (singleErr) {
              console.warn('Single record sync notice:', singleErr);
            }
          }
        }
      }

      // Audit log
      try {
        await addDoc(collection(db, 'audit_logs'), {
          timestamp: new Date().toISOString(),
          userId: userId,
          userEmail: userEmail,
          action: 'BULK_IMPORT',
          details: `Bulk imported ${sanitizedImported.length} failure rows (${mode} mode)`
        });
      } catch (auditErr) {
        console.warn('Could not write audit log:', auditErr);
      }

      alert(`Successfully imported ${sanitizedImported.length} records!`);
    } catch (err: any) {
      console.warn('Bulk import sync notice:', err);
      alert(`Imported ${sanitizedImported.length} records into the grid.`);
    } finally {
      setTimeout(() => setSyncStatus('saved'), 300);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      // Ignore auth signout error if in demo mode
    }
    localStorage.removeItem('local_user_profile');
    setUserProfile(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <p className="text-xs text-slate-400 font-mono">Initializing Failures Database Auth...</p>
      </div>
    );
  }

  // Standalone Auth Screen when no saved user session exists
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-amber-500 selection:text-slate-950">
        <div className="mb-6 text-center space-y-2">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-xs font-semibold">
            <Shield className="w-4 h-4" />
            <span>Equipment Failures Database</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Sign In to Access Dashboard
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Please sign in or create an account to view and manage equipment failure records.
          </p>
        </div>

        <AuthModal
          isOpen={true}
          isStandalonePage={true}
          onClose={() => {}}
          onSuccess={() => {}}
          onLocalLogin={handleLocalLogin}
        />
      </div>
    );
  }

  // Pending Authorization or Rejected Account Screen
  if (userProfile.status === 'pending' || userProfile.status === 'rejected') {
    return (
      <PendingApprovalScreen
        user={userProfile}
        onSignOut={handleSignOut}
        theme={theme}
      />
    );
  }

  // Identify newest pending user for floating alert
  const activeAlertPendingUser = pendingUsers.find(u => !dismissedNotificationUids.has(u.uid));

  // Supplemental Info page renders full-screen with its own header (opened via
  // the "More Info" button, or Ctrl/Cmd+Click on a FAD number, or a direct/new-tab URL)
  if (route.view === 'more-info') {
    return (
      <div className={`min-h-screen selection:bg-amber-500 selection:text-slate-950 font-sans transition-colors ${
        theme === 'dark' ? 'dark' : 'light'
      }`}>
        <MoreInfoPage
          records={records}
          recordsLoading={dataLoading}
          role={userProfile.role}
          userEmail={userProfile.email}
          theme={theme}
          focusFad={route.fad}
          onViewInGrid={(record) => {
            setActiveTab('database');
            setSelectedRecord(record);
            setIsDetailModalOpen(true);
            window.location.hash = '#/';
          }}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans transition-colors ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-50 text-slate-900 light'
    }`}>
      {/* Top Application Header */}
      <Header
        user={userProfile}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={handleSignOut}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        recordCount={records.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        pendingApprovalsCount={pendingUsers.length}
        onOpenPendingApprovals={() => setIsPendingApprovalsModalOpen(true)}
      />

      {/* Floating Admin Notification Banner for New Sign-ups */}
      {userProfile.role === 'admin' && activeAlertPendingUser && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 backdrop-blur-md shadow-sm sticky top-16 z-20 transition-all">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center space-x-2.5">
              <span className="p-1 rounded-lg bg-amber-500/20 text-amber-500">
                <Bell className="w-4 h-4 animate-bounce" />
              </span>
              <span className="font-semibold text-slate-900 dark:text-amber-200">
                New User Sign-Up Request:
              </span>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                {activeAlertPendingUser.email}
              </span>
              <span className="text-slate-500 dark:text-slate-400 hidden md:inline">
                wants authorization to access the database.
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleAuthorizeUser(activeAlertPendingUser, 'admin')}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg shadow-sm transition-all flex items-center space-x-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authorize Admin</span>
              </button>
              <button
                onClick={() => handleAuthorizeUser(activeAlertPendingUser, 'viewer')}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-sm transition-all flex items-center space-x-1"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Authorize Viewer</span>
              </button>
              <button
                onClick={() => handleRejectUser(activeAlertPendingUser)}
                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-lg transition-all flex items-center space-x-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
              {pendingUsers.length > 1 && (
                <button
                  onClick={() => setIsPendingApprovalsModalOpen(true)}
                  className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-all"
                >
                  View All ({pendingUsers.length})
                </button>
              )}
              <button
                onClick={() => setDismissedNotificationUids(prev => new Set(prev).add(activeAlertPendingUser.uid))}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                title="Dismiss Banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">



        {/* VIEW 1: FAILURES GRID & FILTERS */}
        {activeTab === 'database' && (
          <div>
            {/* Filter Panel */}
            <FilterPanel
              records={records}
              filters={filters}
              setFilters={setFilters}
              filteredCount={filteredRecords.length}
              totalCount={records.length}
              isCollapsed={isFilterCollapsed}
              setIsCollapsed={setIsFilterCollapsed}
            />

            {/* Recharts NPT Dashboard */}
            <NptDashboard 
              records={filteredRecords} 
              totalRecordsCount={records.length} 
            />

            {/* Editable Excel Grid */}
            <EditableGrid
              records={filteredRecords}
              allRecords={records}
              filters={filters}
              setFilters={setFilters}
              role={userProfile?.role || 'viewer'}
              syncStatus={syncStatus}
              onUpdateRecord={handleUpdateRecord}
              onAddRecord={handleAddRecord}
              onDuplicateRecord={handleDuplicateRecord}
              onDeleteRecord={handleDeleteRecord}
              onClearAllData={handleClearAllData}
              onOpenDetailModal={(rec) => {
                setSelectedRecord(rec);
                setIsDetailModalOpen(true);
              }}
              fadsWithInfo={fadsWithInfo}
            />
          </div>
        )}

        {/* VIEW 2: ADMIN CONSOLE */}
        {activeTab === 'admin' && (
          userProfile?.role === 'admin' ? (
            <AdminConsole
              currentUser={userProfile}
              records={records}
              onClearAllData={handleClearAllData}
              onBulkImportRecords={handleBulkImport}
              onStandardizeRecords={async (stdRecords) => {
                setRecords(stdRecords);
              }}
            />
          ) : (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <Shield className="w-12 h-12 text-rose-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">Access Restricted</h3>
              <p className="text-xs text-slate-400">
                You must have the <code className="text-amber-300">admin</code> role to access the Admin Console.
              </p>
            </div>
          )
        )}
      </main>

      {/* Expanded Record Detail / Long Text Editor Modal */}
      <DetailModal
        record={selectedRecord}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        role={userProfile?.role || 'viewer'}
        onSave={handleUpdateRecord}
        onDelete={handleDeleteRecord}
        hasMoreInfo={!!selectedRecord && fadsWithInfo.has(normalizeFadKey(selectedRecord.fad))}
      />

      {/* Firebase Authentication & Demo Login Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => setIsAuthModalOpen(false)}
        onLocalLogin={handleLocalLogin}
      />

      {/* Admin Pending Sign-up Approvals Modal */}
      {userProfile.role === 'admin' && (
        <PendingApprovalsModal
          isOpen={isPendingApprovalsModalOpen}
          onClose={() => setIsPendingApprovalsModalOpen(false)}
          pendingUsers={pendingUsers}
          onAuthorizeUser={handleAuthorizeUser}
          onRejectUser={handleRejectUser}
        />
      )}
    </div>
  );
}
