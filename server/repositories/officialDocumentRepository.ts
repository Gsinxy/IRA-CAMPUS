import { db, setDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { OfficialDocument } from '../../src/types.js';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'official_documents';
const CHUNK_SIZE = 800000; // 800,000 characters per chunk (~800KB)

export class OfficialDocumentRepository {
  static async getAll(): Promise<OfficialDocument[]> {
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list: OfficialDocument[] = [];
      snap.forEach(d => {
        const data = d.data() as OfficialDocument;
        if (data) {
          data.documentId = data.documentId || d.id;
          list.push(data);
        }
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, COLLECTION_NAME);
    }
  }

  static async getMetadataById(id: string): Promise<OfficialDocument | null> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        const data = snap.data() as OfficialDocument;
        if (data) {
          data.documentId = data.documentId || snap.id;
        }
        return data;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async getById(id: string): Promise<OfficialDocument | null> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        const data = snap.data() as OfficialDocument;
        if (data) {
          data.documentId = data.documentId || snap.id;
        }
        
        // Retrieve and reconstruct chunks if any exist
        const chunksCol = collection(db, COLLECTION_NAME, id, 'chunks');
        const chunksSnap = await getDocs(chunksCol);
        if (!chunksSnap.empty) {
          const sortedChunks = chunksSnap.docs
            .map(d => d.data())
            .sort((a, b) => (a.index || 0) - (b.index || 0));
          const fullBase64 = sortedChunks.map(c => c.content).join('');
          data.fileBase64 = fullBase64;
        }
        return data;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async save(document: OfficialDocument): Promise<void> {
    const docId = document.documentId;
    const path = `${COLLECTION_NAME}/${docId}`;
    try {
      // 1. Separate fileBase64 if present to stay below Firestore's 1MB document limit
      const { fileBase64, ...meta } = document;

      // 2. Save metadata document
      await setDoc(doc(db, COLLECTION_NAME, docId), meta, { merge: true });

      // 3. Save chunked base64 payload if present
      if (fileBase64) {
        // Clear any prior chunks
        const chunksCol = collection(db, COLLECTION_NAME, docId, 'chunks');
        const existingChunks = await getDocs(chunksCol);
        for (const cDoc of existingChunks.docs) {
          await deleteDoc(doc(db, COLLECTION_NAME, docId, 'chunks', cDoc.id));
        }

        const stringLength = fileBase64.length;
        let index = 0;
        let chunkIdx = 0;
        while (index < stringLength) {
          const chunkStr = fileBase64.substring(index, index + CHUNK_SIZE);
          await setDoc(
            doc(db, COLLECTION_NAME, docId, 'chunks', `chunk-${chunkIdx}`),
            {
              content: chunkStr,
              index: chunkIdx,
              updatedAt: new Date().toISOString()
            }
          );
          index += CHUNK_SIZE;
          chunkIdx++;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  static async delete(id: string): Promise<void> {
    const path = `${COLLECTION_NAME}/${id}`;
    try {
      // Delete child chunks subcollection first
      const chunksCol = collection(db, COLLECTION_NAME, id, 'chunks');
      const chunksSnap = await getDocs(chunksCol);
      for (const cDoc of chunksSnap.docs) {
        await deleteDoc(doc(db, COLLECTION_NAME, id, 'chunks', cDoc.id));
      }

      // Delete parent document
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}
