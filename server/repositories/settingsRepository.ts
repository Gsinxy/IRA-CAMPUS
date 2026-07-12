import { db, setDoc } from '../firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { AISettings } from '../../src/types.js';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

const COLLECTION_NAME = 'ai_settings';
const DOCUMENT_ID = 'config';

export const DEFAULT_SETTINGS: AISettings = {
  provider: 'OpenRouter',
  model: 'google/gemini-2.5-flash',
  temperature: 0.2,
  maxTokens: 4096,
  retryAttempts: 3,
  delayBetweenRequests: 3000
};

export class SettingsRepository {
  static async get(): Promise<AISettings> {
    const path = `${COLLECTION_NAME}/${DOCUMENT_ID}`;
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, DOCUMENT_ID));
      if (snap.exists()) {
        return snap.data() as AISettings;
      }
      // If settings don't exist, create and return default settings
      await setDoc(doc(db, COLLECTION_NAME, DOCUMENT_ID), DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  static async save(settings: AISettings): Promise<void> {
    const path = `${COLLECTION_NAME}/${DOCUMENT_ID}`;
    try {
      await setDoc(doc(db, COLLECTION_NAME, DOCUMENT_ID), settings, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}
