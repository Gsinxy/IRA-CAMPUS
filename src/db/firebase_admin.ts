import { initializeApp as initializeClientApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let db: any;

try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let app;
    if (getApps().length === 0) {
      app = initializeClientApp(firebaseConfig);
    } else {
      app = getApp();
    }
    db = firebaseConfig.firestoreDatabaseId ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : getFirestore(app);
    console.log('[Firebase Client SDK Server] Firestore initialized successfully with database ID:', firebaseConfig.firestoreDatabaseId || '(default)');
  } else {
    console.error('[Firebase Client SDK Server] firebase-applet-config.json not found on server.');
  }
} catch (err: any) {
  console.error('[Firebase Client SDK Server] Initialization failed:', err.message);
}

export function initializeAppLegacy(config: any, appName?: string) {
  const apps = getApps();
  const existing = apps.find(app => app?.name === appName);
  if (existing) return existing;
  return initializeClientApp(config, appName);
}

export function initializeFirestore(app: any, config: any) {
  return db;
}

export {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  initializeAppLegacy as initializeApp
};
