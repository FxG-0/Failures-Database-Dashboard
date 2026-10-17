import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Shield, User, X, Mail, Lock, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  isStandalonePage?: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onLocalLogin?: (role: UserRole, email: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  isStandalonePage = false, 
  onClose, 
  onSuccess, 
  onLocalLogin 
}) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  if (!isOpen && !isStandalonePage) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        const userDocRef = doc(db, 'users', res.user.uid);
        
        const isSuperAdmin = res.user.email === 'faiqgoraya166@gmail.com' || res.user.email === 'admin@failures.com';
        const initialRole: UserRole = isSuperAdmin ? 'admin' : 'viewer';
        const initialStatus = isSuperAdmin ? 'approved' : 'pending';

        // Set status to pending for new users until authorized by the admin
        await setDoc(userDocRef, {
          uid: res.user.uid,
          email: res.user.email,
          role: initialRole,
          status: initialStatus,
          createdAt: new Date().toISOString(),
          disabled: false
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
        // Fall back to local demo login if Firebase Email Auth is disabled in Firebase console
        if (onLocalLogin) {
          onLocalLogin('viewer', email);
          onSuccess();
          onClose();
          return;
        }
        setError('Email/Password sign-in is disabled in your Firebase console settings. Local Demo Login activated.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoRole: UserRole) => {
    setError(null);
    setLoading(true);

    const demoEmail = demoRole === 'admin' ? 'admin@failures.com' : 'viewer@failures.com';
    const demoPassword = 'Password123!';

    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      } catch (signInErr: any) {
        if (signInErr?.code === 'auth/operation-not-allowed' || signInErr?.message?.includes('operation-not-allowed')) {
          // Fall back immediately to local session mode
          if (onLocalLogin) {
            onLocalLogin(demoRole, demoEmail);
            onSuccess();
            onClose();
            return;
          }
        }
        // If account doesn't exist yet, create it automatically for instant demo testing
        userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
      }

      const uid = userCredential.user.uid;
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);

      // Ensure user document has the requested role and approved status
      if (!userDoc.exists() || userDoc.data()?.role !== demoRole || !userDoc.data()?.status) {
        await setDoc(userDocRef, {
          uid,
          email: demoEmail,
          role: demoRole,
          status: 'approved',
          createdAt: new Date().toISOString(),
          disabled: false
        }, { merge: true });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
        if (onLocalLogin) {
          onLocalLogin(demoRole, demoEmail);
          onSuccess();
          onClose();
          return;
        }
        setError('Email/Password auth is disabled in Firebase console. Switched to local session.');
      } else {
        setError(`Demo login failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address to reset password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email.');
    }
  };

  const cardContent = (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isSignUp ? 'Create Failures Account' : 'Sign In to Failures DB'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Access real-time equipment failures dataset & filters
          </p>
        </div>
        {!isStandalonePage && (
          <button
            onClick={onClose}
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Auth Form */}
      <form onSubmit={handleAuth} className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {resetSent && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs">
            Password reset link sent to your email!
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
            <input
              id="input-auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@company.com"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
            <input
              id="input-auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <button
          id="btn-auth-submit"
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center space-x-2 shadow-md disabled:opacity-50"
        >
          <span>{loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>
          {!isSignUp && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Forgot Password?
            </button>
          )}
        </div>
      </form>
    </div>
  );

  if (isStandalonePage) {
    return cardContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      {cardContent}
    </div>
  );
};
