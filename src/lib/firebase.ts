import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import rawFirebaseConfig from '../../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: rawFirebaseConfig.apiKey || "AIzaSyCaO2ciwW2oSgQZ4S9keNKHPHYf1gsvW5g",
  authDomain: rawFirebaseConfig.authDomain || "failure-tools-dashboard.firebaseapp.com",
  projectId: rawFirebaseConfig.projectId || "failure-tools-dashboard",
  storageBucket: rawFirebaseConfig.storageBucket || "failure-tools-dashboard.firebasestorage.app",
  messagingSenderId: rawFirebaseConfig.messagingSenderId || "630615281871",
  appId: rawFirebaseConfig.appId || "1:630615281871:web:568157f99a4a030530a7ba",
  measurementId: rawFirebaseConfig.measurementId || "G-VV8N5H5EY1"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with specific database ID from config if available
const databaseId = (rawFirebaseConfig as any).firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

// Initialize Analytics conditionally
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('[Firestore Operation Notice]:', JSON.stringify(errInfo));
}

export default app;
