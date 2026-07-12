import { db, setDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { Notice } from '../../src/types.js';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'notices';

export class NoticesRepository {
  static async getAll(): Promise<Notice[]> {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list: Notice[] = [];
      snap.forEach(d => {
        list.push(d.data() as Notice);
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  }

  static async getById(id: string): Promise<Notice | null> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        return snap.data() as Notice;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async save(notice: Notice): Promise<void> {
    const path = `${COLLECTION_NAME}/${notice.id}`;
    try {
      await setDoc(doc(db, COLLECTION_NAME, notice.id), notice, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  static async delete(id: string): Promise<void> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}
