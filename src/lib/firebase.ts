import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
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
export const storage = getStorage(app);

// Initialize Firestore instance with long polling support for iframe sandboxes
let dbInstance: any = null;
const dbId = config.firestoreDatabaseId || undefined;

const firestoreSettings = {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
};

try {
  dbInstance = dbId 
    ? initializeFirestore(app, firestoreSettings, dbId)
    : initializeFirestore(app, firestoreSettings);
} catch (err: any) {
  try {
    dbInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
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

// Initialize Firebase Analytics (only if measurementId exists, safely caught for iframe sandboxes/adblockers)
export let analytics: any = null;
if (typeof window !== 'undefined' && config.measurementId) {
  try {
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
  } catch (err) {
    console.warn('[Firebase Analytics] Setup error:', err);
  }
}

export { app };
