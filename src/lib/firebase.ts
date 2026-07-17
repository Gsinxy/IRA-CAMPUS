import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';

const config: any = firebaseConfig;
const app = initializeApp(config);
export const auth = getAuth(app);

// Use initializeFirestore with experimentalForceLongPolling enabled to resolve connection issues in sandboxed iframe previews
export const db = config.firestoreDatabaseId 
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, config.firestoreDatabaseId) 
  : initializeFirestore(app, { experimentalForceLongPolling: true });

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
