import { Response } from 'express';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { callGeminiDirect, streamGeminiDirect } from './geminiService.js';
import { db, setDoc } from '../firebase.js';
import { doc } from 'firebase/firestore';

export function getVerifiedNvidiaKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (
    !key ||
    key.trim() === '' ||
    key === 'MY_NVIDIA_API_KEY' ||
    key === 'MY_NEW_API_KEY' ||
    key.includes('<MY_NEW_API_KEY>')
  ) {
    throw new Error('NVIDIA API Key Verification Failed: NVIDIA_API_KEY is missing, empty, or a placeholder.');
  }
  return key;
}

export function parseNvidiaError(status: number, responseText: string, stage: string = 'AI Pipeline'): string {
  let parsedErrorMsg = '';
  let errorCode = '';
  try {
    const parsed = JSON.parse(responseText);
    if (parsed.error) {
      parsedErrorMsg = parsed.error.message || '';
      errorCode = parsed.error.code || '';
    }
  } catch (e) {
    // Not valid JSON
  }

  let suggestedReason = 'Unknown issue';
  if (status === 400) {
    suggestedReason = 'The request payload is invalid, or the selected model is not supported or misconfigured.';
  } else if (status === 401) {
    suggestedReason = 'The NVIDIA API Key provided is invalid or has expired. Please check your key.';
  } else if (status === 403) {
    suggestedReason = 'Access is forbidden. This model may be restricted or your request was blocked.';
  } else if (status === 404) {
    suggestedReason = 'The requested model or resource could not be found on NVIDIA Build API.';
  } else if (status === 429) {
    suggestedReason = 'Rate limit exceeded. You are making too many requests too quickly.';
  } else if (status >= 500) {
    suggestedReason = 'NVIDIA is experiencing an internal server error or gateway timeout. Please retry shortly.';
  }

  const exactMessage = parsedErrorMsg || responseText || 'No detailed error message provided';

  return `[NVIDIA Error]
- HTTP Status: ${status}
- Exact NVIDIA error message: ${exactMessage}${errorCode ? ` (Code: ${errorCode})` : ''}
- Response body: ${responseText}
- Failed pipeline stage: ${stage}
- Suggested reason: ${suggestedReason}`;
}

async function addAILogToFirestore(logEntry: {
  model: string;
  processingTimeMs: number;
  tokens: number;
  cost: number;
  status: 'Success' | 'Failed';
  retries: number;
  promptSnippet: string;
  error?: string;
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
    console.error('[NVIDIA Service] Failed to write AI log to Firestore:', err);
  }
}

/**
 * Execute a standard, non-streaming NVIDIA Build API request
 */
export async function callNvidia(
  messages: any[],
  options: {
    responseFormatJson?: boolean;
    systemPrompt?: string;
    responseSchema?: any;
  } = {}
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number }; cost?: number }> {
  let apiKey: string;
  try {
    apiKey = getVerifiedNvidiaKey();
  } catch (keyErr: any) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      console.warn(`[NVIDIA Key Warning] ${keyErr.message}. Automatically falling back to native Gemini SDK.`);
      return await callGeminiDirect(messages, options);
    } else {
      throw keyErr;
    }
  }

  const settings = await SettingsRepository.get();
  let model = settings.model || 'meta/llama-3.1-8b-instruct';

  // Fallback map for incompatible OpenRouter/Gemini models
  if (
    model.includes('gemini') ||
    model.includes('gpt') ||
    model.includes('claude') ||
    model.includes('google/') ||
    model.includes('anthropic/') ||
    model.includes('openai/') ||
    !model.includes('/')
  ) {
    model = 'meta/llama-3.1-8b-instruct';
  }

  console.log(`[NVIDIA Audit] Model configured: "${model}"`);
  const temperature = settings.temperature !== undefined ? settings.temperature : 0.2;
  const maxTokens = settings.maxTokens || 4096;

  const payload: any = {
    model: model,
    messages: [
      ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
      ...messages
    ],
    temperature: temperature,
    max_tokens: maxTokens,
  };

  // Note: NVIDIA Build API supports JSON format on some models, if responseFormatJson is true, we can supply JSON instruction
  if (options.responseFormatJson) {
    // Some models do not support response_format type json_object directly, 
    // so we can append a reminder to the messages to ensure we get valid JSON, or pass response_format if compatible.
    payload.response_format = { type: 'json_object' };
  }

  let attempts = 0;
  const maxAttempts = settings.retryAttempts || 3;
  let lastError: any = null;
  const startTime = Date.now();

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        const status = response.status;
        const detailedErrorText = parseNvidiaError(status, errText, 'NVIDIA API Call');

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
          console.warn(`[NVIDIA Info] API Call failed with status ${status}. Falling back to native Gemini Direct... Details: ${detailedErrorText}`);
          try {
            return await callGeminiDirect(messages, options);
          } catch (geminiErr: any) {
            console.error('[Gemini Direct Fallback Failed]', geminiErr);
            throw new Error(`NVIDIA failed (${detailedErrorText}) and Gemini fallback failed too: ${geminiErr.message}`);
          }
        } else {
          throw new Error(detailedErrorText);
        }
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const bodyText = await response.text();
        throw new Error(`NVIDIA returned unexpected content-type "${contentType}" instead of JSON. Body: ${bodyText.substring(0, 300)}`);
      }

      const data = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error('NVIDIA returned an empty choices array.');
      }

      const text = data.choices[0].message?.content || '';
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

      // NVIDIA Build API model pricing (extremely low, estimating $0.075/$0.30 per 1M tokens)
      const estimatedCost = (promptTokens * 0.075 + completionTokens * 0.30) / 1000000;
      const duration = Date.now() - startTime;

      await addAILogToFirestore({
        model,
        processingTimeMs: duration,
        tokens: totalTokens,
        cost: estimatedCost,
        status: 'Success',
        retries: attempts - 1,
        promptSnippet: typeof messages[messages.length - 1]?.content === 'string'
          ? messages[messages.length - 1]?.content?.substring(0, 200)
          : '[Multimodal Payload]'
      });

      return {
        text,
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
        cost: estimatedCost
      };

    } catch (err: any) {
      lastError = err;
      if (attempts < maxAttempts) {
        const delay = attempts === 1 ? 2000 : attempts === 2 ? 5000 : 10000;
        console.warn(`NVIDIA network error. Retrying in ${delay}ms (Attempt ${attempts}/${maxAttempts})... Err: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    console.warn(`[NVIDIA Info] Network failed repeatedly. Falling back to native Gemini Direct...`);
    try {
      return await callGeminiDirect(messages, options);
    } catch (geminiErr: any) {
      console.error('[Gemini Direct Fallback Failed]', geminiErr);
      throw lastError || geminiErr;
    }
  } else {
    throw lastError || new Error('NVIDIA network request failed repeatedly and no Gemini API Key is configured for fallback.');
  }
}

/**
 * Class wrapper for modular backend import mapping
 */
export class NvidiaService {
  static getVerifiedKey(): string {
    return getVerifiedNvidiaKey();
  }

  static callWithFallback(
    messages: any[], 
    systemPrompt?: string, 
    responseFormatJson: boolean = true,
    responseSchema?: any
  ): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number }; cost?: number }> {
    return callNvidia(messages, { systemPrompt, responseFormatJson, responseSchema });
  }

  static async testConnection(): Promise<void> {
    console.log('[NVIDIA Connection Test] Initiating startup connection test...');
    try {
      const key = getVerifiedNvidiaKey();
      const settings = await SettingsRepository.get();
      let model = settings.model || 'meta/llama-3.1-8b-instruct';

      if (
        model.includes('gemini') ||
        model.includes('gpt') ||
        model.includes('claude') ||
        model.includes('google/') ||
        model.includes('anthropic/') ||
        model.includes('openai/') ||
        !model.includes('/')
      ) {
        model = 'meta/llama-3.1-8b-instruct';
      }
      
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        const detailedErrorText = parseNvidiaError(response.status, errText, 'Startup Connection Test');
        if (response.status === 401) {
          console.error(`❌ NVIDIA connection test: Authentication failed. Invalid or expired API Key.`);
        } else {
          console.error(`❌ NVIDIA connection test failed with status ${response.status}. Details: ${detailedErrorText}`);
        }
        return;
      }

      console.log('✓ NVIDIA connection test: Authentication succeeded.');
      console.log(`Active Model: ${model}`);
    } catch (err: any) {
      console.error(`❌ NVIDIA connection test failed: ${err.message}`);
    }
  }
}
