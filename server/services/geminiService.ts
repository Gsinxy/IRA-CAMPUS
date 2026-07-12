import { GoogleGenAI } from '@google/genai';
import { Response } from 'express';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { db, setDoc } from '../firebase.js';
import { doc } from 'firebase/firestore';

let aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') {
      console.warn('[Gemini Service] Warning: GEMINI_API_KEY is not defined or is placeholder.');
      return null;
    }
    try {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } catch (err) {
      console.error('[Gemini Service] Failed to initialize GoogleGenAI client:', err);
      return null;
    }
  }
  return aiClient;
}

/**
 * Generate embedding for text content using gemini-embedding-2-preview.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const ai = getGeminiClient();
  if (!ai) {
    return [];
  }
  try {
    const response = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: text,
    });
    
    // Resolve TS2551 by safely checking using type assertion
    const resAny = response as any;
    if (resAny && resAny.embedding && resAny.embedding.values) {
      return resAny.embedding.values;
    } else if (resAny && resAny.embeddings && Array.isArray(resAny.embeddings) && resAny.embeddings[0]?.values) {
      return resAny.embeddings[0].values;
    }
    return [];
  } catch (error) {
    console.error('[Gemini Service] Error fetching embedding from Gemini:', error);
    return [];
  }
}

/**
 * Helper to log AI processing logs back to Firestore analytics
 */
async function addAILogToFirestore(logEntry: {
  model: string;
  processingTimeMs: number;
  tokens: number;
  cost: number;
  status: 'Success' | 'Failed';
  retries: number;
  promptSnippet: string;
}) {
  try {
    const id = `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();
    await setDoc(doc(db, 'analytics_ai_logs', id), {
      ...logEntry,
      id,
      timestamp
    });
  } catch (err) {
    console.error('[Gemini Service] Failed to write AI log to Firestore:', err);
  }
}

/**
 * Execute native Gemini API call directly as fallback
 */
export async function callGeminiDirect(
  messages: any[],
  options: {
    responseFormatJson?: boolean;
    systemPrompt?: string;
    responseSchema?: any;
  } = {}
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number }; cost?: number }> {
  console.log('[Gemini Direct] Initiating native Google GenAI API request as fallback...');
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('Google GenAI Client could not be initialized. Please verify GEMINI_API_KEY is configured in Secrets.');
  }

  const contents = messages.map(msg => {
    let role = msg.role;
    if (role === 'assistant') role = 'model';
    return {
      role: role,
      parts: [{ text: msg.content }]
    };
  });

  const config: any = {
    temperature: 0.2
  };
  if (options.systemPrompt) {
    config.systemInstruction = options.systemPrompt;
  }
  if (options.responseFormatJson) {
    config.responseMimeType = "application/json";
  }
  if (options.responseSchema) {
    config.responseSchema = options.responseSchema;
  }

  const startTime = Date.now();
  let response;
  let chosenModel = 'gemini-3.5-flash';
  try {
    response = await ai.models.generateContent({
      model: chosenModel,
      contents: contents,
      config: config
    });
  } catch (err: any) {
    console.warn(`[Gemini Direct] Primary model ${chosenModel} failed. Error:`, err.message || err);
    console.log('[Gemini Direct] Attempting fallback to gemini-2.5-flash...');
    chosenModel = 'gemini-2.5-flash';
    response = await ai.models.generateContent({
      model: chosenModel,
      contents: contents,
      config: config
    });
  }

  const text = response.text || '';
  const duration = Date.now() - startTime;
  const promptTokens = response.usageMetadata?.promptTokenCount || 0;
  const completionTokens = response.usageMetadata?.candidatesTokenCount || 0;
  const totalTokens = response.usageMetadata?.totalTokenCount || Math.ceil((text.length + JSON.stringify(messages).length) / 4);

  await addAILogToFirestore({
    model: `${chosenModel} (Native Fallback)`,
    processingTimeMs: duration,
    tokens: totalTokens,
    cost: 0,
    status: 'Success',
    retries: 0,
    promptSnippet: messages[messages.length - 1]?.content?.substring(0, 200) || ''
  });

  return {
    text,
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    cost: 0
  };
}

/**
 * Stream Gemini output directly to Express SSE response
 */
export async function streamGeminiDirect(
  res: Response,
  systemInstruction: string,
  history: any[],
  message: string,
  uniqueCitations: any[],
  topChunks: any[],
  retrievedEntities: any[],
  fullPromptContext: string,
  sessionId?: string,
  onFinishCallback?: () => void
): Promise<void> {
  console.log('[Gemini SSE Direct] Initiating native Google GenAI streaming response as fallback...');
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('Google GenAI Client could not be initialized.');
  }

  const contents = [
    ...(history || []).map((h: any) => {
      let role = h.role === 'user' ? 'user' : 'model';
      return {
        role,
        parts: [{ text: h.content }]
      };
    }),
    {
      role: 'user',
      parts: [{ text: message }]
    }
  ];

  const startTime = Date.now();
  let accumulatedResponseText = '';
  let responseStream;
  let chosenModel = 'gemini-3.5-flash';

  try {
    try {
      responseStream = await ai.models.generateContentStream({
        model: chosenModel,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2
        }
      });
    } catch (streamErr: any) {
      console.warn(`[Gemini SSE Direct] Primary stream model ${chosenModel} failed. Error:`, streamErr.message || streamErr);
      console.log('[Gemini SSE Direct] Attempting fallback stream to gemini-2.5-flash...');
      chosenModel = 'gemini-2.5-flash';
      responseStream = await ai.models.generateContentStream({
        model: chosenModel,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2
        }
      });
    }

    for await (const chunk of responseStream) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        accumulatedResponseText += chunkText;
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    const duration = Date.now() - startTime;
    const totalTokens = Math.ceil((systemInstruction.length + accumulatedResponseText.length) / 4);

    try {
      await addAILogToFirestore({
        model: `${chosenModel} (Native Fallback SSE)`,
        processingTimeMs: duration,
        tokens: totalTokens,
        cost: 0,
        status: 'Success',
        retries: 0,
        promptSnippet: message.substring(0, 200)
      });

      // Log real-time chat interaction to Firestore
      await AnalyticsRepository.logChatInteraction(
        message,
        accumulatedResponseText,
        duration,
        35, // average/estimated retrieval time
        Math.ceil(systemInstruction.length / 4),
        Math.ceil(accumulatedResponseText.length / 4),
        0, // native fallback has 0 cost on client-side simulation
        `${chosenModel} (Native SSE Fallback)`,
        uniqueCitations.map(c => c.title),
        sessionId || 'anon-session'
      );
    } catch (e) {
      console.error('[Gemini Service] Failed to log SSE Gemini response:', e);
    }

    res.write(`data: ${JSON.stringify({
      done: true,
      citations: uniqueCitations,
      debug: {
        retrievedChunks: topChunks.map(c => ({ docTitle: c.docTitle, text: c.text, score: c.score })),
        retrievedEntities: retrievedEntities,
        totalTokens,
        finalPromptContext: fullPromptContext
      }
    }) }\n\n`);
    res.end();

    if (onFinishCallback) {
      onFinishCallback();
    }
  } catch (err: any) {
    console.error('[Gemini Service] Gemini SSE Direct stream failed:', err);
    res.write(`data: ${JSON.stringify({ error: `Fallback Gemini Streaming failed: ${err.message}` })}\n\n`);
    res.end();
  }
}

/**
 * Multimodal layout extraction / OCR via Gemini
 */
export async function ocrMultimodal(fileBase64: string, mimeType: string, prompt: string): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) return '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: fileBase64
          }
        },
        prompt
      ]
    });
    return response.text || '';
  } catch (err) {
    console.error('Gemini OCR Multimodal failed:', err);
    throw err;
  }
}

/**
 * Class wrapper for modular backend import mapping
 */
export class GeminiService {
  static getEmbedding(text: string): Promise<number[]> {
    return getEmbedding(text);
  }

  static streamNativeFallback(
    res: Response,
    systemInstruction: string,
    history: any[],
    message: string,
    uniqueCitations: any[],
    topChunks: any[],
    retrievedEntities: any[],
    fullPromptContext: string,
    sessionId?: string,
    onFinishCallback?: () => void
  ): Promise<void> {
    return streamGeminiDirect(
      res,
      systemInstruction,
      history,
      message,
      uniqueCitations,
      topChunks,
      retrievedEntities,
      fullPromptContext,
      sessionId,
      onFinishCallback
    );
  }

  static ocrMultimodal(fileBase64: string, mimeType: string, prompt: string): Promise<string> {
    return ocrMultimodal(fileBase64, mimeType, prompt);
  }
}
