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

// Use initializeFirestore with experimentalForceLongPolling enabled to resolve connection issues in sandboxed iframe previews.
// Initialize idempotently to handle Hot Module Replacement (HMR) or multi-module imports without throwing.
let dbInstance: any = null;
const dbId = config.firestoreDatabaseId || undefined;

try {
  // 1. Try to get already initialized instance for this databaseId
  dbInstance = getFirestore(app, dbId);
} catch (getErr: any) {
  console.warn('[Firebase Client SDK] getFirestore(dbId) failed, attempting initialize:', getErr.message);
}

if (!dbInstance) {
  try {
    // 2. Try initialize with settings and dbId
    dbInstance = dbId 
      ? initializeFirestore(app, { experimentalForceLongPolling: true }, dbId)
      : initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (initErr: any) {
    console.warn('[Firebase Client SDK] initializeFirestore with dbId failed:', initErr.message);
    try {
      // 3. Fallback to default initialize with settings (no dbId)
      dbInstance = initializeFirestore(app, { experimentalForceLongPolling: true });
    } catch (initDefaultErr: any) {
      console.warn('[Firebase Client SDK] initializeFirestore default failed:', initDefaultErr.message);
      try {
        // 4. Fallback to default getFirestore with dbId
        dbInstance = getFirestore(app, dbId);
      } catch (getFallbackErr: any) {
        console.warn('[Firebase Client SDK] getFirestore fallback with dbId failed:', getFallbackErr.message);
        try {
          // 5. Ultimate fallback to standard default getFirestore
          dbInstance = getFirestore(app);
        } catch (ultimateErr: any) {
          console.error('[Firebase Client SDK] Ultimate getFirestore(app) fallback failed:', ultimateErr.message);
          try {
            dbInstance = getFirestore();
          } catch (lastErr: any) {
            console.error('[Firebase Client SDK] CRITICAL: getFirestore() failed completely:', lastErr.message);
          }
        }
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
