import { DataStore } from './src/db/data_store.js';

async function test() {
  console.log('--- Testing Firestore DataStore notices fetch ---');
  try {
    const notices = await DataStore.getNotices();
    console.log('Notices fetched successfully! Count:', notices.length);
    if (notices.length > 0) {
      console.log('Sample notice:', notices[0].title);
    }
  } catch (err: any) {
    console.error('DataStore notices error:', err);
  }

  console.log('\n--- Testing Firestore DataStore documents fetch ---');
  try {
    const docs = await DataStore.getDocuments();
    console.log('Documents fetched successfully! Count:', docs.length);
    if (docs.length > 0) {
      console.log('Sample document:', docs[0].title);
    }
  } catch (err: any) {
    console.error('DataStore documents error:', err);
  }
}

test();
