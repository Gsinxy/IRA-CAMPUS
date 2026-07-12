import { db, setDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { CollegeDocument } from '../../src/types.js';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'knowledge';

export class DocumentRepository {
  static async getAll(): Promise<CollegeDocument[]> {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list: CollegeDocument[] = [];
      snap.forEach(d => {
        list.push(d.data() as CollegeDocument);
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  }

  static async getById(id: string): Promise<CollegeDocument | null> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        return snap.data() as CollegeDocument;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async save(document: CollegeDocument): Promise<void> {
    const path = `${COLLECTION_NAME}/${document.id}`;
    try {
      await setDoc(doc(db, COLLECTION_NAME, document.id), document, { merge: true });
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
