import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

async function run() {
  const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  const app = initializeApp(cfg);
  const db = getFirestore(app, cfg.firestoreDatabaseId);

  for (let i = 0; i < 6; i++) {
    console.log(`Attempt ${i + 1} at ${new Date().toLocaleTimeString()}...`);
    try {
      const snap = await getDocs(collection(db, 'notices'));
      console.log('Success! Fetched notices count:', snap.size);
      break;
    } catch (err: any) {
      console.error('Error:', err.message || err);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

run();
