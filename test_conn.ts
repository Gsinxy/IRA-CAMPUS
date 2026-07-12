import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import fs from 'fs';

async function run() {
  console.log('--- Diagnosing Firestore Connection ---');
  try {
    const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
    const app = initializeApp(cfg);
    const db = getFirestore(app, cfg.firestoreDatabaseId);
    
    console.log('Attempting getDocFromServer...');
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Success! Connection is working.');
  } catch (err: any) {
    console.error('Detailed Connection Error:', {
      message: err.message,
      code: err.code,
      stack: err.stack
    });
  }
}

run();
