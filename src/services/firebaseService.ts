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

export async function saveConversationToFirestore(userId: string, conversation: Conversation) {
  const pathStr = `conversations/${conversation.id}`;
  try {
    const convRef = doc(db, 'conversations', conversation.id);
    await setDoc(convRef, {
      ...conversation,
      userId,
      updatedAt: conversation.updatedAt || new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathStr);
  }
}

export async function loadConversationsFromFirestore(userId: string): Promise<Conversation[]> {
  const pathStr = 'conversations';
  try {
    const q = query(collection(db, 'conversations'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const convs: Conversation[] = [];
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
    return convs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, pathStr);
  }
}

export async function deleteConversationFromFirestore(conversationId: string) {
  const pathStr = `conversations/${conversationId}`;
  try {
    await deleteDoc(doc(db, 'conversations', conversationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, pathStr);
  }
}

export async function deleteConversationsFromFirestore(conversationIds: string[]) {
  const pathStr = 'conversations/batch';
  try {
    const batch = writeBatch(db);
    conversationIds.forEach(id => {
      batch.delete(doc(db, 'conversations', id));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, pathStr);
  }
}
