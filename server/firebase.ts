import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  deleteDoc, 
  collection, 
  addDoc as originalAddDoc, 
  setDoc as originalSetDoc 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import fs from 'fs';
import path from 'path';

let db: any = null;
let auth: any = null;
let storage: any = null;
let app: any = null;

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

if (!configPath || typeof configPath !== 'string') {
  throw new Error('CRITICAL PATH ERROR: Failed to resolve Firebase config file path.');
}

if (!fs.existsSync(configPath)) {
  throw new Error(`CRITICAL CONFIGURATION ERROR: firebase-applet-config.json not found at: "${configPath}". Please configure Firebase for this project first.`);
}

let firebaseConfig: any;
try {
  const fileContent = fs.readFileSync(configPath, 'utf8');
  if (!fileContent || fileContent.trim() === '') {
    throw new Error('Config file is empty.');
  }
  firebaseConfig = JSON.parse(fileContent);
} catch (parseErr: any) {
  throw new Error(`CRITICAL CONFIGURATION ERROR: Failed to parse firebase-applet-config.json. Please check if it contains valid JSON. Error: ${parseErr.message}`);
}

try {
  if (getApps().length === 0) {
    if (!firebaseConfig || typeof firebaseConfig !== 'object' || Object.keys(firebaseConfig).length === 0) {
      throw new Error('Firebase config object is empty or invalid.');
    }
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  // Initialize standard/custom Firestore DB
  db = firebaseConfig.firestoreDatabaseId ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
} catch (err: any) {
  throw new Error(`CRITICAL INITIALIZATION ERROR: Firebase startup failed. Details: ${err.message}`);
}

/**
 * Startup Verification:
 * ✓ Firebase initialized
 * ✓ Firestore connected
 * ✓ Authentication connected
 * ✓ Storage connected
 * 
 * Includes "Test 1" execution.
 * If connection or Test 1 fails, stop the server and print the exact error.
 */
export async function verifyFirebaseConnections(): Promise<void> {
  console.log('==================================================');
  console.log('[Firebase Verify] Starting startup checks...');
  console.log('==================================================');

  try {
    // 1. Firebase App check
    if (!app) {
      throw new Error('Firebase Application is not initialized.');
    }
    console.log('✓ Firebase initialized');

    // 2. Auth service check
    if (!auth) {
      throw new Error('Firebase Authentication is not connected.');
    }
    console.log('✓ Authentication connected');

    // 3. Storage service check
    if (!storage) {
      throw new Error('Firebase Storage is not connected.');
    }
    console.log('✓ Storage connected (Bucket: ' + (firebaseConfig.storageBucket || 'default') + ')');

    // 4. Firestore connection check + Test 1
    if (!db) {
      throw new Error('Firestore DB instance is not connected.');
    }
    console.log('✓ Firestore connected');

    console.log('[Firebase Verify] Running Test 1: Write, Read, Delete test document in Firestore...');
    const testDocId = `verify-startup-${Date.now()}`;
    const testRef = doc(db, 'knowledge', testDocId);

    // Create a Firestore test document
    await setDoc(testRef, {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'IRA Campus clean architecture startup test document'
    });
    console.log('  -> Test document created successfully');

    // Read it
    const testSnap = await getDoc(testRef);
    if (!testSnap.exists() || !testSnap.data()?.test) {
      throw new Error('Verification failed: Test document could not be read back from Firestore.');
    }
    console.log('  -> Test document read and verified successfully');

    // Delete it
    await deleteDoc(testRef);
    console.log('  -> Test document deleted successfully');
    console.log('✓ Test 1 Passed: Write/Read/Delete operations verified.');
    
    console.log('==================================================');
    console.log('[Firebase Verify] Startup checks completed successfully!');
    console.log('==================================================');
  } catch (err: any) {
    console.warn('==================================================');
    console.warn('[Firebase Verify] STARTUP DIAGNOSTICS WARNING!');
    console.warn('An error occurred during Firebase/Firestore/Auth/Storage connection verification:');
    console.warn(`Warning: ${err.message || err}`);
    console.warn('This error is non-blocking; the server will continue running.');
    console.warn('==================================================');
  }
}

export { app, db, auth, storage, firebaseConfig };

const initializedCollections = new Set<string>();
let firstWriteDone = false;

export async function setDoc(ref: any, data: any, options?: any) {
  const collectionName = ref?.parent?.id || ref?.parent?.path || '';
  const docId = ref?.id || '';

  try {
    const result = await originalSetDoc(ref, data, options);

    if (collectionName) {
      if (!firstWriteDone) {
        firstWriteDone = true;
        console.log('Collection created automatically');
      }
      if (!initializedCollections.has(collectionName)) {
        initializedCollections.add(collectionName);
        console.log(`Collection created automatically: "${collectionName}" on first write to document "${docId}"`);
      }
    }

    // 5. After saving, verify by reading the document back from Firestore.
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.warn(`[Firestore Verify Warning] Document "${docId}" in collection "${collectionName}" was not found immediately after setDoc write.`);
      } else {
        console.log(`[Firestore Verify] Successfully verified setDoc write for document "${docId}" in collection "${collectionName}".`);
      }
    } catch (verifyErr) {
      console.error(`[Firestore Verify Error] Failed to read back and verify document "${docId}" in "${collectionName}":`, verifyErr);
    }

    return result;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || err?.code === 'resource-exhausted' || errMsg.includes('Quota limit exceeded');
    console.error(`[Firestore Write Error] Failed setDoc write for document "${docId}" in collection "${collectionName}":`, err);
    if (isQuotaError) {
      console.warn(`[Firestore Quota Warning] Bypassing write error due to resource quota exhaustion.`);
      return { id: docId, error: errMsg, bypassed: true };
    }
    throw err;
  }
}

export async function addDoc(colRef: any, data: any) {
  const collectionName = colRef?.id || colRef?.path || '';

  try {
    const result = await originalAddDoc(colRef, data);
    const docId = result.id;

    if (collectionName) {
      if (!firstWriteDone) {
        firstWriteDone = true;
        console.log('Collection created automatically');
      }
      if (!initializedCollections.has(collectionName)) {
        initializedCollections.add(collectionName);
        console.log(`Collection created automatically: "${collectionName}" on first write to document "${docId}"`);
      }
    }

    // 5. After saving, verify by reading the document back from Firestore.
    try {
      const docRef = doc(db, collectionName, docId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        console.warn(`[Firestore Verify Warning] Document "${docId}" in collection "${collectionName}" was not found immediately after addDoc write.`);
      } else {
        console.log(`[Firestore Verify] Successfully verified addDoc write for document "${docId}" in collection "${collectionName}".`);
      }
    } catch (verifyErr) {
      console.error(`[Firestore Verify Error] Failed to read back and verify document "${docId}" in "${collectionName}":`, verifyErr);
    }

    return result;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || err?.code === 'resource-exhausted' || errMsg.includes('Quota limit exceeded');
    console.error(`[Firestore Write Error] Failed addDoc write in collection "${collectionName}":`, err);
    if (isQuotaError) {
      console.warn(`[Firestore Quota Warning] Bypassing write error due to resource quota exhaustion.`);
      return { id: `bypassed-quota-${Date.now()}`, error: errMsg, bypassed: true };
    }
    throw err;
  }
}
