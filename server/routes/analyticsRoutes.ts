import { Router, Response } from 'express';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { db, firebaseConfig, setDoc } from '../firebase.js';
import { DocumentRepository } from '../repositories/documentRepository.js';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { collection, doc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

const router = Router();

// Store active server-sent events connections for dashboard real-time syncing
let sseConnections: Response[] = [];

/**
 * Gather complete statistics directly from Firestore
 */
export async function getLiveAnalytics() {
  const defaultAnalytics = {
    totalQuestions: 0,
    dauToday: 0,
    dauYesterday: 0,
    dauGrowth: 0,
    averageResponseTime: 0,
    fastestResponseTime: 0,
    slowestResponseTime: 0,
    lastResponseTime: 0,
    dailyQuestions: [] as { date: string, count: number }[],
    popularQuestions: [] as { question: string, count: number }[],
    totalFeedbackCount: 0,
    positiveFeedbackPercentage: 0,
    negativeFeedbackPercentage: 0,
    knowledgeStats: {
      totalDocuments: 0,
      totalJsonFiles: 0,
      totalImportedUrls: 0,
      totalEmbeddings: 0,
      averageChunksPerDocument: 0,
      lastKnowledgeUpdate: '--',
      lastImportedFile: '--'
    },
    aiModelStats: {
      modelName: 'google/gemini-2.5-flash',
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
      averageTokensPerQuestion: 0
    },
    systemPerformance: {
      openRouterStatus: 'Offline' as any,
      vectorDbStatus: 'Online' as any,
      embeddingQueue: 'Idle' as any,
      averageRetrievalTime: 0,
      averageGenerationTime: 0
    },
    liveActivityFeed: [] as any[],
    recentChats: [] as any[]
  };

  try {
    const docs = await DocumentRepository.getAll();
    const totalDocs = docs.length;
    const totalJson = docs.filter(d => d.type === 'json' || d.fileName?.endsWith('.json')).length;
    const totalUrls = docs.filter(d => d.type === 'url' || d.sourceUrl).length;
    
    let totalChunks = 0;
    docs.forEach(d => {
      if (d.chunks && Array.isArray(d.chunks)) {
        totalChunks += d.chunks.length;
      }
    });
    const avgChunks = totalDocs > 0 ? parseFloat((totalChunks / totalDocs).toFixed(1)) : 0;
    
    let lastUpdate = '--';
    let lastFile = '--';
    if (totalDocs > 0) {
      const sortedDocs = [...docs].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      if (sortedDocs[0]) {
        lastUpdate = new Date(sortedDocs[0].uploadedAt).toLocaleString();
        lastFile = sortedDocs[0].title || sortedDocs[0].fileName || '--';
      }
    }

    defaultAnalytics.knowledgeStats = {
      totalDocuments: totalDocs,
      totalJsonFiles: totalJson,
      totalImportedUrls: totalUrls,
      totalEmbeddings: totalChunks,
      averageChunksPerDocument: avgChunks,
      lastKnowledgeUpdate: lastUpdate,
      lastImportedFile: lastFile
    };

    let orKeySet = false;
    try {
      const key = process.env.OPENROUTER_API_KEY;
      orKeySet = !!key && key.trim() !== '' && key !== 'MY_OPENROUTER_API_KEY' && key !== 'MY_NEW_API_KEY' && !key.includes('<MY_NEW_API_KEY>');
    } catch (_) {}
    defaultAnalytics.systemPerformance.openRouterStatus = orKeySet ? 'Online' : 'Offline (Using Gemini Native Fallback)';

    if (!db) {
      return defaultAnalytics;
    }

    const summaryRef = doc(db, 'analytics', 'summary');
    const summarySnap = await getDoc(summaryRef);
    if (summarySnap.exists()) {
      const sData = summarySnap.data();
      defaultAnalytics.totalQuestions = sData.totalQuestions || 0;
      
      const pos = sData.positiveFeedbackCount || 0;
      const neg = sData.negativeFeedbackCount || 0;
      const totFeed = pos + neg;
      defaultAnalytics.totalFeedbackCount = totFeed;
      defaultAnalytics.positiveFeedbackPercentage = totFeed > 0 ? Math.round((pos / totFeed) * 100) : 0;
      defaultAnalytics.negativeFeedbackPercentage = totFeed > 0 ? Math.round((neg / totFeed) * 100) : 0;

      defaultAnalytics.averageResponseTime = sData.averageResponseTime ? Math.round(sData.averageResponseTime) : 0;
      defaultAnalytics.fastestResponseTime = sData.fastestResponseTime || 0;
      defaultAnalytics.slowestResponseTime = sData.slowestResponseTime || 0;
      defaultAnalytics.lastResponseTime = sData.lastResponseTime || 0;

      const modelSettings = await SettingsRepository.get();
      defaultAnalytics.aiModelStats = {
        modelName: modelSettings.model || 'google/gemini-2.5-flash',
        totalTokens: sData.totalTokens || 0,
        promptTokens: sData.promptTokens || 0,
        completionTokens: sData.completionTokens || 0,
        estimatedCost: sData.estimatedCost ? parseFloat(sData.estimatedCost.toFixed(5)) : 0,
        averageTokensPerQuestion: sData.totalQuestions > 0 ? Math.round((sData.totalTokens || 0) / sData.totalQuestions) : 0
      };

      defaultAnalytics.systemPerformance.averageRetrievalTime = sData.averageRetrievalTime ? Math.round(sData.averageRetrievalTime) : 25;
      defaultAnalytics.systemPerformance.averageGenerationTime = sData.averageGenerationTime ? Math.round(sData.averageGenerationTime) : Math.max(0, defaultAnalytics.averageResponseTime - defaultAnalytics.systemPerformance.averageRetrievalTime);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const todaySessionsRef = collection(db, 'daily_usage', todayStr, 'active_sessions');
    const yesterdaySessionsRef = collection(db, 'daily_usage', yesterdayStr, 'active_sessions');
    
    let dauToday = 0;
    let dauYesterday = 0;
    try {
      const todaySessionsSnap = await getDocs(todaySessionsRef);
      dauToday = todaySessionsSnap.size;
    } catch (_) {}
    try {
      const yesterdaySessionsSnap = await getDocs(yesterdaySessionsRef);
      dauYesterday = yesterdaySessionsSnap.size;
    } catch (_) {}

    defaultAnalytics.dauToday = dauToday;
    defaultAnalytics.dauYesterday = dauYesterday;
    if (dauYesterday > 0) {
      defaultAnalytics.dauGrowth = parseFloat((((dauToday - dauYesterday) / dauYesterday) * 100).toFixed(1));
    } else {
      defaultAnalytics.dauGrowth = dauToday > 0 ? 100 : 0;
    }

    const dailyRef = collection(db, 'daily_usage');
    const dailySnap = await getDocs(dailyRef);
    const dailyList: { date: string, count: number }[] = [];
    dailySnap.forEach(docSnapshot => {
      const data = docSnapshot.data();
      dailyList.push({
        date: docSnapshot.id,
        count: data.questionsCount || 0
      });
    });
    defaultAnalytics.dailyQuestions = dailyList
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    const freqRef = collection(db, 'frequent_questions');
    const freqSnap = await getDocs(freqRef);
    const popular: { question: string, count: number }[] = [];
    freqSnap.forEach(docSnapshot => {
      const data = docSnapshot.data();
      popular.push({
        question: data.question || '',
        count: data.count || 0
      });
    });
    defaultAnalytics.popularQuestions = popular
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const logsRef = collection(db, 'chat_logs');
    const logsSnap = await getDocs(logsRef);
    const logsList: any[] = [];
    logsSnap.forEach(docSnapshot => {
      const data = docSnapshot.data();
      logsList.push({
        id: docSnapshot.id,
        ...data
      });
    });
    
    const sortedLogs = logsList.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    defaultAnalytics.recentChats = sortedLogs.slice(0, 20).map(log => ({
      id: log.id,
      question: log.question || '',
      time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
      responseTimeMs: log.responseTimeMs || 0,
      sourcesUsed: log.citations || [],
      feedback: log.feedback || null,
      timestamp: log.timestamp || '',
      answerSnippet: log.answer ? (log.answer.length > 100 ? log.answer.substring(0, 100) + '...' : log.answer) : ''
    }));

    defaultAnalytics.liveActivityFeed = sortedLogs.slice(0, 5).map(log => {
      const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
      return {
        time: timeStr,
        question: log.question || '',
        retrievedSource: log.citations && log.citations.length > 0 ? log.citations.join(', ') : 'None',
        status: 'Answered successfully',
        timestamp: log.timestamp || ''
      };
    });

  } catch (err: any) {
    console.error('[Analytics Service] Error assembling live analytics:', err);
  }

  return defaultAnalytics;
}

/**
 * Broadcast active real-time updates to all connected administrators
 */
export async function broadcastAnalyticsUpdate() {
  if (sseConnections.length === 0) return;
  try {
    const liveStats = await getLiveAnalytics();
    const payload = `data: ${JSON.stringify(liveStats)}\n\n`;
    sseConnections.forEach(res => {
      res.write(payload);
    });
  } catch (err) {
    console.error('[Analytics SSE Broadcast] Failed to broadcast update:', err);
  }
}

// GET analytics dashboard dataset (Admin Only)
router.get('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const stats = await getLiveAnalytics();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load live analytics: ${err.message}` });
  }
});

// GET analytics dashboard real-time SSE channel (Admin Only)
router.get('/live', adminAuthMiddleware, (req: AdminRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Push immediate snapshot
  getLiveAnalytics().then(data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }).catch(err => {
    console.error('[Analytics SSE] Error sending initial payload:', err);
  });

  sseConnections.push(res);

  req.on('close', () => {
    sseConnections = sseConnections.filter(conn => conn !== res);
  });
});

// POST clear all analytics logs and summaries (Admin Only)
router.post('/clear', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  if (!db) {
    return res.status(503).json({ error: 'Firestore is not initialized.' });
  }

  try {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      'Cleared all real-time analytics summary, logs, feedback, and session records',
      String(clientIp)
    );

    // 1. Reset central summary document
    const summaryRef = doc(db, 'analytics', 'summary');
    await setDoc(summaryRef, {
      totalQuestions: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
      averageResponseTime: 0,
      fastestResponseTime: 0,
      slowestResponseTime: 0,
      lastResponseTime: 0,
      averageRetrievalTime: 0,
      averageGenerationTime: 0,
      positiveFeedbackCount: 0,
      negativeFeedbackCount: 0
    });

    // 2. Clear chat logs
    const logsSnap = await getDocs(collection(db, 'chat_logs'));
    for (const d of logsSnap.docs) {
      await deleteDoc(doc(db, 'chat_logs', d.id));
    }

    // 3. Clear performance logs
    const perfSnap = await getDocs(collection(db, 'performance_logs'));
    for (const d of perfSnap.docs) {
      await deleteDoc(doc(db, 'performance_logs', d.id));
    }

    // 4. Clear feedback logs
    const feedSnap = await getDocs(collection(db, 'feedback'));
    for (const d of feedSnap.docs) {
      await deleteDoc(doc(db, 'feedback', d.id));
    }

    // 5. Clear frequent questions
    const freqSnap = await getDocs(collection(db, 'frequent_questions'));
    for (const d of freqSnap.docs) {
      await deleteDoc(doc(db, 'frequent_questions', d.id));
    }

    // 6. Clear daily usage records
    const dailySnap = await getDocs(collection(db, 'daily_usage'));
    for (const d of dailySnap.docs) {
      const sessSnap = await getDocs(collection(db, 'daily_usage', d.id, 'active_sessions'));
      for (const s of sessSnap.docs) {
        await deleteDoc(doc(db, 'daily_usage', d.id, 'active_sessions', s.id));
      }
      await deleteDoc(doc(db, 'daily_usage', d.id));
    }

    await broadcastAnalyticsUpdate();

    res.json({ success: true, message: 'All analytics data cleared successfully.' });
  } catch (err: any) {
    console.error('[Analytics Clear] Error resetting stats:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
