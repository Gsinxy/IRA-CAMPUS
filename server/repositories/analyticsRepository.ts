import { db, setDoc, addDoc } from '../firebase.js';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/helpers.js';

export class AnalyticsRepository {
  /**
   * Log an AI Model execution log entry to Firestore.
   */
  static async addAILogEntry(logEntry: {
    model: string;
    processingTimeMs: number;
    tokens?: number;
    cost?: number;
    status: 'Success' | 'Failed';
    retries: number;
    promptSnippet: string;
    error?: string | null;
  }): Promise<void> {
    const COLLECTION_NAME = 'analytics_ai_logs';
    try {
      const id = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const timestamp = new Date().toISOString();
      await setDoc(doc(db, COLLECTION_NAME, id), {
        ...logEntry,
        id,
        timestamp
      });
    } catch (err) {
      console.error(`[AnalyticsRepo] Failed to save AI log entry in Firestore:`, err);
    }
  }

  /**
   * Log an administrative audit event to Firestore.
   */
  static async logAuditEvent(email: string, action: string, ipAddress: string): Promise<void> {
    const COLLECTION_NAME = 'audit_logs';
    try {
      const logRef = collection(db, COLLECTION_NAME);
      await addDoc(logRef, {
        email,
        action,
        timestamp: new Date().toISOString(),
        ipAddress
      });
      console.log(`[Audit Log] ${email} performed action: ${action} [IP: ${ipAddress}]`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, COLLECTION_NAME);
    }
  }

  /**
   * Increment frequency counts of questions asked by students.
   */
  static async incrementPopularQuestion(question: string): Promise<void> {
    if (!question || !question.trim()) return;
    const COLLECTION_NAME = 'frequent_questions';
    try {
      const qClean = question.trim().replace(/[?.,!]/g, '').toLowerCase();
      if (!qClean) return;

      const qRef = collection(db, COLLECTION_NAME);
      const qSnap = await getDocs(qRef);
      let matchedDocId = null;
      let currentCount = 0;
      let existingQuestionText = question;

      for (const docSnapshot of qSnap.docs) {
        const data = docSnapshot.data();
        const docClean = (data.question || '').trim().replace(/[?.,!]/g, '').toLowerCase();
        if (docClean === qClean || docClean.includes(qClean) || qClean.includes(docClean)) {
          matchedDocId = docSnapshot.id;
          currentCount = data.count || 0;
          existingQuestionText = data.question || question;
          break;
        }
      }

      if (matchedDocId) {
        await setDoc(doc(db, COLLECTION_NAME, matchedDocId), {
          question: existingQuestionText,
          count: currentCount + 1,
          lastAsked: new Date().toISOString()
        }, { merge: true });
      } else {
        const newId = `q-${Date.now()}`;
        await setDoc(doc(db, COLLECTION_NAME, newId), {
          question,
          count: 1,
          lastAsked: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('[AnalyticsRepo] Failed to increment popular question:', err);
    }
  }

  /**
   * Increment document access count.
   */
  static async incrementDocAccessCount(docTitle: string): Promise<void> {
    if (!docTitle) return;
    const COLLECTION_NAME = 'popular_documents';
    try {
      const dRef = doc(db, COLLECTION_NAME, docTitle.replace(/[\/\\#?\[\]]/g, '_'));
      const dSnap = await getDoc(dRef);
      let count = 1;
      if (dSnap.exists()) {
        count = (dSnap.data().count || 0) + 1;
      }
      await setDoc(dRef, {
        title: docTitle,
        count,
        lastAccessed: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error('[AnalyticsRepo] Failed to increment doc access count:', err);
    }
  }

  /**
   * Log chat interaction details and update metrics synchronously in Firestore.
   */
  static async logChatInteraction(
    question: string,
    answer: string,
    duration: number,
    retrievalTime: number,
    promptTokens: number,
    completionTokens: number,
    cost: number,
    model: string,
    citations: string[],
    sessionId: string
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const todayStr = timestamp.split('T')[0];
      const logId = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const generationTime = Math.max(0, duration - retrievalTime);

      // 1. Add chat log
      await setDoc(doc(db, 'chat_logs', logId), {
        question,
        answer,
        timestamp,
        responseTimeMs: duration,
        retrievalTimeMs: retrievalTime,
        generationTimeMs: generationTime,
        model,
        promptTokens,
        completionTokens,
        cost,
        citations,
        feedback: null,
        sessionId,
        user: 'student'
      });

      // 2. Add performance log
      await setDoc(doc(db, 'performance_logs', logId), {
        timestamp,
        responseTimeMs: duration,
        retrievalTimeMs: retrievalTime,
        generationTimeMs: generationTime
      });

      // 3. Update active session for today (DAU tracking)
      const sessionDocRef = doc(db, 'daily_usage', todayStr, 'active_sessions', sessionId || 'anon-session');
      await setDoc(sessionDocRef, { timestamp });

      // 4. Increment daily questions count
      const dailyDocRef = doc(db, 'daily_usage', todayStr);
      const dailySnap = await getDoc(dailyDocRef);
      let dayCount = 1;
      if (dailySnap.exists()) {
        dayCount = (dailySnap.data().questionsCount || 0) + 1;
      }
      await setDoc(dailyDocRef, { date: todayStr, questionsCount: dayCount }, { merge: true });

      // 5. Update central summary analytics
      const summaryRef = doc(db, 'analytics', 'summary');
      const summarySnap = await getDoc(summaryRef);
      let totalQuestions = 1;
      let totalTokensVal = promptTokens + completionTokens;
      let totalPromptVal = promptTokens;
      let totalCompletionVal = completionTokens;
      let totalCostVal = cost;
      let fastestVal = duration;
      let slowestVal = duration;
      let avgResponseVal = duration;
      let totalRetrievalVal = retrievalTime;
      let totalGenerationVal = generationTime;

      if (summarySnap.exists()) {
        const sData = summarySnap.data();
        totalQuestions = (sData.totalQuestions || 0) + 1;
        totalTokensVal += (sData.totalTokens || 0);
        totalPromptVal += (sData.promptTokens || 0);
        totalCompletionVal += (sData.completionTokens || 0);
        totalCostVal += (sData.estimatedCost || 0);

        const oldAvg = sData.averageResponseTime || 0;
        avgResponseVal = oldAvg + (duration - oldAvg) / totalQuestions;

        fastestVal = sData.fastestResponseTime ? Math.min(sData.fastestResponseTime, duration) : duration;
        slowestVal = sData.slowestResponseTime ? Math.max(sData.slowestResponseTime, duration) : duration;

        const oldAvgRet = sData.averageRetrievalTime || 25;
        totalRetrievalVal = oldAvgRet + (retrievalTime - oldAvgRet) / totalQuestions;

        const oldAvgGen = sData.averageGenerationTime || (avgResponseVal - totalRetrievalVal);
        totalGenerationVal = oldAvgGen + (generationTime - oldAvgGen) / totalQuestions;
      }

      await setDoc(summaryRef, {
        totalQuestions,
        totalTokens: totalTokensVal,
        promptTokens: totalPromptVal,
        completionTokens: totalCompletionVal,
        estimatedCost: totalCostVal,
        averageResponseTime: avgResponseVal,
        fastestResponseTime: fastestVal,
        slowestResponseTime: slowestVal,
        lastResponseTime: duration,
        averageRetrievalTime: totalRetrievalVal,
        averageGenerationTime: totalGenerationVal
      }, { merge: true });

      // 6. Update popular question lists
      await this.incrementPopularQuestion(question);
    } catch (err) {
      console.error('[AnalyticsRepo] Failed to log chat interaction:', err);
    }
  }
}
