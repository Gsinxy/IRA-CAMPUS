import { db, setDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'feedback';

export class FeedbackRepository {
  static async addFeedback(logId: string, value: 'positive' | 'negative'): Promise<void> {
    const timestamp = new Date().toISOString();
    try {
      // 1. Add feedback doc
      const feedId = `feed-${Date.now()}`;
      await setDoc(doc(db, COLLECTION_NAME, feedId), {
        logId,
        value,
        timestamp
      });

      // 2. Update chat log
      const logRef = doc(db, 'chat_logs', logId);
      const logSnap = await getDoc(logRef);
      if (logSnap.exists()) {
        await setDoc(logRef, { feedback: value }, { merge: true });
      }

      // 3. Update summary counters
      const summaryRef = doc(db, 'analytics', 'summary');
      const summarySnap = await getDoc(summaryRef);
      let positiveFeedbackCount = value === 'positive' ? 1 : 0;
      let negativeFeedbackCount = value === 'negative' ? 1 : 0;

      if (summarySnap.exists()) {
        const sData = summarySnap.data();
        positiveFeedbackCount += (sData.positiveFeedbackCount || 0);
        negativeFeedbackCount += (sData.negativeFeedbackCount || 0);
      }

      await setDoc(summaryRef, {
        positiveFeedbackCount,
        negativeFeedbackCount
      }, { merge: true });

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, COLLECTION_NAME);
    }
  }

  static async getAll(): Promise<any[]> {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  }
}
