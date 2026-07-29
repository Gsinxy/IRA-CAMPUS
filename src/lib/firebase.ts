import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';

const config: any = firebaseConfig;

// Initialize Firebase App idempotently
let app;
if (getApps().length === 0) {
  app = initializeApp(config);
} else {
  app = getApp();
}

export const auth = getAuth(app);

// Use initializeFirestore with long polling enabled FIRST to prevent connection failures in sandboxed iframe previews.
let dbInstance: any = null;
const dbId = config.firestoreDatabaseId || undefined;

const firestoreSettings = {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: true,
};

try {
  // 1. Prioritize initializeFirestore with long polling settings
  dbInstance = dbId 
    ? initializeFirestore(app, firestoreSettings, dbId)
    : initializeFirestore(app, firestoreSettings);
} catch (initErr: any) {
  // 2. If already initialized, retrieve existing Firestore instance
  try {
    dbInstance = getFirestore(app, dbId);
  } catch (getErr: any) {
    try {
      dbInstance = getFirestore(app);
    } catch (getDefErr: any) {
      try {
        dbInstance = getFirestore();
      } catch (lastErr: any) {
        console.error('[Firebase Client SDK] CRITICAL: Firestore initialization failed:', lastErr.message);
      }
    }
  }
}

export const db = dbInstance;

// Initialize Firebase Analytics (browser only)
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((yes) => {
    if (yes) {
      try {
        analytics = getAnalytics(app);
      } catch (err) {
        console.warn('[Firebase Analytics] Gracefully handled load/fetch error:', err);
      }
    }
  }).catch((err) => {
    console.warn('[Firebase Analytics] isSupported check failed:', err);
  });
}

export { app };
