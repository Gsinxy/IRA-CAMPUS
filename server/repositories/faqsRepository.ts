import { db, setDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { FAQ } from '../../src/types.js';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'faqs';

export class FaqsRepository {
  static async getAll(): Promise<FAQ[]> {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list: FAQ[] = [];
      snap.forEach(d => {
        list.push(d.data() as FAQ);
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  }

  static async getById(id: string): Promise<FAQ | null> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        return snap.data() as FAQ;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async save(faq: FAQ): Promise<void> {
    const path = `${COLLECTION_NAME}/${faq.id}`;
    try {
      await setDoc(doc(db, COLLECTION_NAME, faq.id), faq, { merge: true });
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
