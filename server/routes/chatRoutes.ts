import { Router, Response, Request } from 'express';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { RagService } from '../services/ragService.js';
import { GeminiService } from '../services/geminiService.js';
import { OpenRouterService } from '../services/openRouterService.js';

const router = Router();

// POST /api/chat - Structured RAG chat endpoint
router.post('/', async (req: Request, res: Response) => {
  const { message, history, sessionId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message query is required' });
  }

  const globalStartTime = Date.now();
  const sessionIdentifier = sessionId || 'anon-session';

  // 1. Log query attempt to global analytics increment
  await AnalyticsRepository.incrementPopularQuestion(message);

  let queryVector: number[] = [];
  try {
    queryVector = await GeminiService.getEmbedding(message);
  } catch (err) {
    console.warn('[Chat Route] Could not generate query vector embedding:', err);
  }

  // 2. Perform Hybrid Semantic RAG Retrieval and assemble LLM prompt grounding context
  const retrievalResult = await RagService.retrieveAndBuildPrompt(message, queryVector);
  const {
    isRelevant,
    systemInstruction,
    uniqueCitations,
    topChunks,
    retrievedEntities,
    fullPromptContext,
    fallbackResponse,
    retrievalTimeMs
  } = retrievalResult;

  // 3. Fallback routing for out-of-scope/unrelated questions
  if (!isRelevant) {
    const totalDuration = Date.now() - globalStartTime;
    const finalFallback = fallbackResponse || "I am the official college assistant. I couldn't find relevant official records.";
    
    await AnalyticsRepository.logChatInteraction(
      message,
      finalFallback,
      totalDuration,
      retrievalTimeMs,
      50, // estimated prompt tokens
      30, // estimated completion tokens
      0,  // free fallback
      'Fallback Routing Engine',
      [],
      sessionIdentifier
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ text: finalFallback })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, citations: [] })}\n\n`);
    res.end();
    return;
  }

  // Register document access for first matched source
  if (uniqueCitations.length > 0 && uniqueCitations[0].title) {
    await AnalyticsRepository.incrementDocAccessCount(uniqueCitations[0].title);
  }

  // 4. Retrieve settings & select API channel
  const settings = await SettingsRepository.get();
  const model = settings.model || 'google/gemini-2.5-flash';
  const temperature = settings.temperature !== undefined ? settings.temperature : 0.2;
  const maxTokens = settings.maxTokens || 4096;

  let openRouterKey = '';
  try {
    openRouterKey = OpenRouterService.getVerifiedKey();
  } catch (keyErr: any) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      console.warn(`[OpenRouter Key Info] ${keyErr.message}. Automatically falling back to native Gemini stream...`);
      try {
        await GeminiService.streamNativeFallback(
          res,
          systemInstruction,
          history,
          message,
          uniqueCitations,
          topChunks,
          retrievedEntities,
          fullPromptContext,
          sessionIdentifier
        );
      } catch (geminiErr: any) {
        console.error('[Gemini Fallback Streaming Failed]', geminiErr);
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ error: `Fallback Gemini Streaming failed: ${geminiErr.message}` })}\n\n`);
        res.end();
      }
    } else {
      console.error(`[OpenRouter Key Error] ${keyErr.message}. Bypassing fallback as GEMINI_API_KEY is not configured.`);
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ error: `OpenRouter initialization failed: ${keyErr.message}` })}\n\n`);
      res.end();
    }
    return;
  }

  // 5. Stream from OpenRouter
  console.log(`[OpenRouter Stream] Starting request using model "${model}"...`);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const messagesPayload = [
    ...(history || []).map((h: any) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    })),
    { role: 'user', content: message }
  ];

  let accumulatedResponseText = '';
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  try {
    let currentMaxTokens = maxTokens;
    let openRouterRes: any = null;
    let streamAttempts = 0;
    const maxStreamAttempts = 3;

    while (streamAttempts < maxStreamAttempts) {
      streamAttempts++;
      try {
        openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'https://iracampus.edu',
            'X-Title': 'IRA Campus'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemInstruction },
              ...messagesPayload
            ],
            temperature,
            max_tokens: currentMaxTokens,
            stream: true
          })
        });

        if (!openRouterRes.ok) {
          const errText = await openRouterRes.text();
          const status = openRouterRes.status;
          console.warn(`[OpenRouter API Error] Status ${status}. Output: ${errText}. Attempt ${streamAttempts}/${maxStreamAttempts}`);
          
          if (status === 402) {
            const match = errText.match(/but can only afford (\d+)/i);
            let affordable = 0;
            if (match) {
              affordable = parseInt(match[1], 10);
            }
            if (affordable > 0) {
              const nextMaxTokens = Math.max(100, affordable - 10);
              if (currentMaxTokens > nextMaxTokens) {
                console.warn(`[OpenRouter Stream 402 Auto-Heal] Reducing max_tokens from ${currentMaxTokens} to ${nextMaxTokens} and retrying...`);
                currentMaxTokens = nextMaxTokens;
                if (streamAttempts < maxStreamAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue;
                }
              }
            } else {
              const nextMaxTokens = Math.max(256, Math.floor(currentMaxTokens / 2));
              if (currentMaxTokens > nextMaxTokens) {
                console.warn(`[OpenRouter Stream 402 Auto-Heal] Halving max_tokens from ${currentMaxTokens} to ${nextMaxTokens} and retrying...`);
                currentMaxTokens = nextMaxTokens;
                if (streamAttempts < maxStreamAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue;
                }
              }
            }
          }
          
          throw new Error(`OpenRouter returned status ${status}: ${errText}`);
        }
        break; // Success
      } catch (err: any) {
        if (streamAttempts >= maxStreamAttempts) {
          throw err;
        }
        console.warn(`[OpenRouter Stream Retry] Error occurred on attempt ${streamAttempts}: ${err.message}. Retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!openRouterRes || !openRouterRes.ok) {
      throw new Error('Failed to obtain a valid OpenRouter stream response after retries.');
    }

    const reader = openRouterRes.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const data = JSON.parse(dataStr);
              const chunkText = data.choices?.[0]?.delta?.content || '';
              if (chunkText) {
                accumulatedResponseText += chunkText;
                res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
              }
              if (data.usage) {
                totalPromptTokens = data.usage.prompt_tokens || totalPromptTokens;
                totalCompletionTokens = data.usage.completion_tokens || totalCompletionTokens;
              }
            } catch (_) {}
          }
        }
      }
    }

    const duration = Date.now() - globalStartTime;
    const totalTokens = totalPromptTokens + totalCompletionTokens || Math.ceil((systemInstruction.length + accumulatedResponseText.length) / 4);
    
    // Cost mapping helper
    let estimatedCost = 0;
    if (model.includes('gemini-2.5-flash')) {
      estimatedCost = (totalPromptTokens * 0.075 + totalCompletionTokens * 0.30) / 1000000;
    } else if (model.includes('gemini-2.5-pro')) {
      estimatedCost = (totalPromptTokens * 1.25 + totalCompletionTokens * 5.00) / 1000000;
    } else if (model.includes('gpt-5') || model.includes('gpt-4')) {
      estimatedCost = (totalPromptTokens * 2.50 + totalCompletionTokens * 10.00) / 1000000;
    } else if (model.includes('claude')) {
      estimatedCost = (totalPromptTokens * 3.00 + totalCompletionTokens * 15.00) / 1000000;
    } else {
      estimatedCost = (totalTokens * 0.15) / 1000000;
    }

    // Save model performance log to Firestore
    await AnalyticsRepository.addAILogEntry({
      model,
      processingTimeMs: duration,
      tokens: totalTokens,
      cost: estimatedCost,
      status: 'Success',
      retries: 0,
      promptSnippet: message.substring(0, 200)
    });

    // Save student chat interaction to Firestore
    await AnalyticsRepository.logChatInteraction(
      message,
      accumulatedResponseText,
      duration,
      retrievalTimeMs,
      totalPromptTokens || Math.ceil(systemInstruction.length / 4),
      totalCompletionTokens || Math.ceil(accumulatedResponseText.length / 4),
      estimatedCost,
      model,
      uniqueCitations.map(c => c.title),
      sessionIdentifier
    );

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

  } catch (err: any) {
    console.error('[OpenRouter Stream Execution Error] Falling back to Gemini...', err);
    const duration = Date.now() - globalStartTime;
    await AnalyticsRepository.addAILogEntry({
      model,
      processingTimeMs: duration,
      status: 'Failed',
      retries: 0,
      error: err.message || 'Streaming failure',
      promptSnippet: message.substring(0, 200)
    });

    // Trigger direct native Gemini backup streaming if key is configured
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        await GeminiService.streamNativeFallback(
          res,
          systemInstruction,
          history,
          message,
          uniqueCitations,
          topChunks,
          retrievedEntities,
          fullPromptContext,
          sessionIdentifier
        );
      } catch (geminiErr: any) {
        console.error('[Gemini Direct SSE Fallback Failed]', geminiErr);
        res.write(`data: ${JSON.stringify({ error: `Fallback Gemini Streaming failed: ${geminiErr.message}` })}\n\n`);
        res.end();
      }
    } else {
      console.warn(`[OpenRouter Stream Error] Bypassing fallback as GEMINI_API_KEY is not configured.`);
      res.write(`data: ${JSON.stringify({ error: `OpenRouter stream execution error: ${err.message}` })}\n\n`);
      res.end();
    }
  }
});

export default router;
