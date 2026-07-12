import { Response } from 'express';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { callGeminiDirect, streamGeminiDirect } from './geminiService.js';
import { db, setDoc } from '../firebase.js';
import { doc } from 'firebase/firestore';

export function getVerifiedOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (
    !key ||
    key.trim() === '' ||
    key === 'MY_OPENROUTER_API_KEY' ||
    key === 'MY_NEW_API_KEY' ||
    key.includes('<MY_NEW_API_KEY>')
  ) {
    throw new Error('OpenRouter API Key Verification Failed: OPENROUTER_API_KEY is missing, empty, or a placeholder.');
  }
  return key;
}

export function parseOpenRouterError(status: number, responseText: string, stage: string = 'AI Pipeline'): string {
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
    suggestedReason = 'The OpenRouter API Key provided is invalid or has expired. Please check your key.';
  } else if (status === 402) {
    suggestedReason = 'Your OpenRouter account has insufficient credits. Please purchase credits at https://openrouter.ai/settings/credits.';
  } else if (status === 403) {
    suggestedReason = 'Access is forbidden. This model may be restricted or your request was blocked.';
  } else if (status === 404) {
    suggestedReason = 'The requested model or resource could not be found on OpenRouter.';
  } else if (status === 429) {
    suggestedReason = 'Rate limit exceeded. You are making too many requests too quickly.';
  } else if (status >= 500) {
    suggestedReason = 'OpenRouter is experiencing an internal server error or gateway timeout. Please retry shortly.';
  }

  const exactMessage = parsedErrorMsg || responseText || 'No detailed error message provided';

  return `[OpenRouter Error]
- HTTP Status: ${status}
- Exact OpenRouter error message: ${exactMessage}${errorCode ? ` (Code: ${errorCode})` : ''}
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
    console.error('[OpenRouter Service] Failed to write AI log to Firestore:', err);
  }
}

/**
 * Execute a standard, non-streaming OpenRouter API request
 */
export async function callOpenRouter(
  messages: any[],
  options: {
    responseFormatJson?: boolean;
    systemPrompt?: string;
    responseSchema?: any;
  } = {}
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number }; cost?: number }> {
  let apiKey: string;
  try {
    apiKey = getVerifiedOpenRouterKey();
  } catch (keyErr: any) {
    console.warn(`[OpenRouter Key Warning] ${keyErr.message}. Automatically falling back to native Gemini SDK.`);
    return await callGeminiDirect(messages, options);
  }

  const settings = await SettingsRepository.get();
  const model = settings.model || 'google/gemini-2.5-flash';

  console.log(`[OpenRouter Audit] Model configured: "${model}"`);
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

  if (options.responseFormatJson) {
    payload.response_format = { type: 'json_object' };
  }

  let attempts = 0;
  const maxAttempts = settings.retryAttempts || 3;
  let lastError: any = null;
  const startTime = Date.now();

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://iracampus.edu',
          'X-Title': 'IRA Campus'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        const status = response.status;
        const detailedErrorText = parseOpenRouterError(status, errText, 'OpenRouter API Call');
        console.warn(`[OpenRouter Info] API Call failed with status ${status}. Falling back to native Gemini Direct... Details: ${detailedErrorText}`);

        try {
          return await callGeminiDirect(messages, options);
        } catch (geminiErr: any) {
          console.error('[Gemini Direct Fallback Failed]', geminiErr);
          throw new Error(`OpenRouter failed (${detailedErrorText}) and Gemini fallback failed too: ${geminiErr.message}`);
        }
      }

      const data = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenRouter returned an empty choices array.');
      }

      const text = data.choices[0].message?.content || '';
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

      let estimatedCost = 0;
      if (model.includes('gemini-2.5-flash')) {
        estimatedCost = (promptTokens * 0.075 + completionTokens * 0.30) / 1000000;
      } else if (model.includes('gemini-2.5-pro')) {
        estimatedCost = (promptTokens * 1.25 + completionTokens * 5.00) / 1000000;
      } else if (model.includes('gpt-5') || model.includes('gpt-4')) {
        estimatedCost = (promptTokens * 2.50 + completionTokens * 10.00) / 1000000;
      } else if (model.includes('claude')) {
        estimatedCost = (promptTokens * 3.00 + completionTokens * 15.00) / 1000000;
      } else {
        estimatedCost = (promptTokens * 0.1 + completionTokens * 0.2) / 1000000;
      }

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
        console.warn(`OpenRouter network error. Retrying in ${delay}ms (Attempt ${attempts}/${maxAttempts})... Err: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  console.warn(`[OpenRouter Info] Network failed repeatedly. Falling back to native Gemini Direct...`);
  try {
    return await callGeminiDirect(messages, options);
  } catch (geminiErr: any) {
    console.error('[Gemini Direct Fallback Failed]', geminiErr);
    throw lastError || geminiErr;
  }
}

/**
 * Class wrapper for modular backend import mapping
 */
export class OpenRouterService {
  static getVerifiedKey(): string {
    return getVerifiedOpenRouterKey();
  }

  static callWithFallback(
    messages: any[], 
    systemPrompt?: string, 
    responseFormatJson: boolean = true,
    responseSchema?: any
  ): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number }; cost?: number }> {
    return callOpenRouter(messages, { systemPrompt, responseFormatJson, responseSchema });
  }

  static async testConnection(): Promise<void> {
    console.log('[OpenRouter Connection Test] Initiating startup connection test...');
    try {
      const key = getVerifiedOpenRouterKey();
      const settings = await SettingsRepository.get();
      const model = settings.model || 'google/gemini-2.5-flash';
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://iracampus.edu',
          'X-Title': 'IRA Campus'
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
        const detailedErrorText = parseOpenRouterError(response.status, errText, 'Startup Connection Test');
        console.warn(`[OpenRouter Info] Startup connection test returned status ${response.status}. The app remains 100% functional via seamless native Google Gemini fallback.\nDetails: ${detailedErrorText}`);
        return;
      }

      console.log('✅ OpenRouter Connected Successfully');
      console.log(`Active Model: ${model}`);
    } catch (err: any) {
      console.warn(`[OpenRouter Info] Connection test bypassed: ${err.message}. Seamlessly falling back to native Google Gemini SDK.`);
    }
  }
}
