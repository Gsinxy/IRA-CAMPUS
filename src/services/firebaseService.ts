import { db, auth } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { Conversation } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeData(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData);
  } else if (obj !== null && typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        res[key] = sanitizeData(obj[key]);
      }
    }
    return res;
  }
  return obj;
}

export async function saveConversationToFirestore(userId: string, conversation: Conversation) {
  const pathStr = `conversations/${conversation.id}`;
  try {
    const convRef = doc(db, 'conversations', conversation.id);
    const sanitized = sanitizeData({
      ...conversation,
      userId,
      updatedAt: conversation.updatedAt || new Date().toISOString()
    });
    await setDoc(convRef, sanitized, { merge: true });
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || error?.code === 'resource-exhausted' || errMsg.includes('Quota limit exceeded');
    if (isQuotaError) {
      console.warn(`[Firestore Quota] Conversation save bypassed due to quota exhaustion. Storing in localStorage fallback.`);
      try {
        localStorage.setItem(`ira_fallback_conv_${conversation.id}`, JSON.stringify({
          ...conversation,
          userId,
          updatedAt: conversation.updatedAt || new Date().toISOString()
        }));
      } catch (lsErr) {
        console.error('Failed to save to localStorage fallback:', lsErr);
      }
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, pathStr);
  }
}

export async function loadConversationsFromFirestore(userId: string): Promise<Conversation[]> {
  const pathStr = 'conversations';
  const convs: Conversation[] = [];
  try {
    const q = query(collection(db, 'conversations'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      convs.push({
        id: data.id,
        title: data.title,
        messages: data.messages || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt || data.createdAt,
        isPinned: data.isPinned || false,
        modelUsed: data.modelUsed,
        totalTokens: data.totalTokens
      } as Conversation);
    });
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || error?.code === 'resource-exhausted' || errMsg.includes('Quota limit exceeded');
    if (isQuotaError) {
      console.warn('[Firestore Quota] Could not load from Firestore due to quota exhaustion. Using local cache/localStorage.');
    } else {
      handleFirestoreError(error, OperationType.LIST, pathStr);
    }
  }

  // Merge with localStorage fallback conversations
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ira_fallback_conv_')) {
        const item = localStorage.getItem(key);
        if (item) {
          const localConv = JSON.parse(item);
          if (localConv && localConv.id && localConv.userId === userId && !convs.some(c => c.id === localConv.id)) {
            convs.push(localConv);
          }
        }
      }
    }
  } catch (lsErr) {
    console.error('Failed to read from localStorage fallback list:', lsErr);
  }

  return convs;
}

export async function deleteConversationFromFirestore(conversationId: string) {
  const pathStr = `conversations/${conversationId}`;
  try {
    try {
      localStorage.removeItem(`ira_fallback_conv_${conversationId}`);
    } catch (e) {}
    await deleteDoc(doc(db, 'conversations', conversationId));
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || error?.code === 'resource-exhausted' || errMsg.includes('Quota limit exceeded');
    if (isQuotaError) {
      console.warn(`[Firestore Quota] Deletion bypassed due to quota exhaustion.`);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, pathStr);
  }
}

export async function deleteConversationsFromFirestore(conversationIds: string[]) {
  const pathStr = 'conversations/batch';
  try {
    conversationIds.forEach(id => {
      try {
        localStorage.removeItem(`ira_fallback_conv_${id}`);
      } catch (e) {}
    });
    const batch = writeBatch(db);
    conversationIds.forEach(id => {
      batch.delete(doc(db, 'conversations', id));
    });
    await batch.commit();
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const isQuotaError = errMsg.includes('RESOURCE_EXHAUSTED') || error?.code === 'resource-exhausted' || errMsg.includes('Quota limit exceeded');
    if (isQuotaError) {
      console.warn(`[Firestore Quota] Batch deletion bypassed due to quota exhaustion.`);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, pathStr);
  }
}
