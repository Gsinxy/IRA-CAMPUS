import { Router, Response, Request } from 'express';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { DocumentRepository } from '../repositories/documentRepository.js';
import { OfficialDocumentRepository } from '../repositories/officialDocumentRepository.js';
import { RagService } from '../services/ragService.js';
import { GeminiService } from '../services/geminiService.js';
import { NvidiaService, getVerifiedNvidiaKey, parseNvidiaError } from '../services/nvidiaService.js';

const router = Router();

// Helper function for canonical query normalization
function canonicalNormalize(q: string): string {
  if (!q) return '';
  let res = q.toLowerCase();
  
  // Ignore/remove specific terms: "syllabus", "course", "paper", "show", "give", "explain", "details", "pdf", "subject"
  const ignoreTerms = ["syllabus", "course", "paper", "show", "give", "explain", "details", "pdf", "subject"];
  for (const term of ignoreTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    res = res.replace(regex, ' ');
  }

  // Also replace "sem" with "semester" to normalize semester variations
  res = res.replace(/\bsem\b/gi, 'semester');
  
  // Remove punctuation
  res = res.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ');
  
  // Replace Roman numerals with Arabic numerals
  const romanMap: Record<string, string> = {
    'xii': '12',
    'xi': '11',
    'x': '10',
    'ix': '9',
    'viii': '8',
    'vii': '7',
    'vi': '6',
    'v': '5',
    'iv': '4',
    'iii': '3',
    'ii': '2',
    'i': '1'
  };
  
  for (const [roman, arabic] of Object.entries(romanMap)) {
    const regex = new RegExp(`\\b${roman}\\b`, 'g');
    res = res.replace(regex, arabic);
  }
  
  // Ignore extra spaces (normalize multiple spaces to single space)
  res = res.replace(/\s+/g, ' ').trim();
  
  return res;
}

// Helper to determine if a normalized query matches a normalized target
function isMatch(normQuery: string, normTarget: string): boolean {
  if (!normQuery || !normTarget) return false;
  
  // Exact match
  if (normQuery === normTarget) return true;
  
  // StartsWith or Contains (case-insensitive and punctuation ignored, since they are already normalized)
  if (normQuery.startsWith(normTarget) || normTarget.startsWith(normQuery)) return true;
  if (normQuery.includes(normTarget) || normTarget.includes(normQuery)) return true;
  
  return false;
}

// Searches across all documents of category 'Syllabus' in the exact order requested:
// 1. course_index
// 2. semester_index
// 3. section_index
function tryNavigationIndexMatch(query: string, documents: any[]) {
  const normQuery = canonicalNormalize(query);
  if (!normQuery) return null;

  // 1. course_index search across all documents
  for (const doc of documents) {
    if (doc.course_index && Array.isArray(doc.course_index)) {
      for (const item of doc.course_index) {
        if (item && item.course) {
          const normCourse = canonicalNormalize(item.course);
          if (isMatch(normQuery, normCourse)) {
            return {
              document: doc,
              matchedItem: {
                title: item.course,
                startPage: item.start_page,
                endPage: item.end_page,
                type: 'course',
                semester: item.semester
              }
            };
          }
        }
      }
    }
  }

  // 2. semester_index search across all documents
  for (const doc of documents) {
    if (doc.semester_index && typeof doc.semester_index === 'object') {
      for (const [semName, value] of Object.entries(doc.semester_index)) {
        if (value && typeof value === 'object') {
          const val = value as any;
          const normSem = canonicalNormalize(semName);
          if (isMatch(normQuery, normSem)) {
            return {
              document: doc,
              matchedItem: {
                title: semName,
                startPage: val.start_page,
                endPage: val.end_page,
                type: 'semester'
              }
            };
          }
        }
      }
    }
  }

  // 3. section_index search across all documents
  for (const doc of documents) {
    if (doc.section_index && typeof doc.section_index === 'object') {
      for (const [secName, value] of Object.entries(doc.section_index)) {
        if (value && typeof value === 'object') {
          const val = value as any;
          const normSec = canonicalNormalize(secName);
          if (isMatch(normQuery, normSec)) {
            return {
              document: doc,
              matchedItem: {
                title: secName,
                startPage: val.start_page,
                endPage: val.end_page,
                type: 'section'
              }
            };
          }
        }
      }
    }
  }

  return null;
}

// POST /api/chat - Structured RAG chat endpoint
router.post('/', async (req: Request, res: Response) => {
  const { message, history, sessionId, studentProfile } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message query is required' });
  }

  const globalStartTime = Date.now();
  const sessionIdentifier = sessionId || 'anon-session';

  // 1. Log query attempt to global analytics increment
  await AnalyticsRepository.incrementPopularQuestion(message);

  const msgLower = message.toLowerCase();

  const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, 'i').test(message);

  // Determine if student is asking for a syllabus or official document
  const isSyllabusQuery = hasWord('syllabus') || 
                          hasWord('semester') || 
                          hasWord('sem') || 
                          hasWord('paper') || 
                          hasWord('unit') || 
                          hasWord('vac') || 
                          hasWord('sec') || 
                          hasWord('aec') || 
                          hasWord('mdc') ||
                          msgLower.includes('development economics') ||
                          hasWord('course');

  const isOfficialDocQuery = isSyllabusQuery || 
                             hasWord('prospectus') || 
                             hasWord('calendar') || 
                             msgLower.includes('examination rules') || 
                             msgLower.includes('exam rules') || 
                             hasWord('circular');

  if (isOfficialDocQuery) {
    try {
      const allOfficialDocs = await OfficialDocumentRepository.getAll();
      
      let category: 'Syllabus' | 'Prospectus' | 'Academic Calendar' | 'Examination Rules' | 'Circulars' | 'Other Documents' = 'Syllabus';
      if (msgLower.includes('prospectus')) {
        category = 'Prospectus';
      } else if (msgLower.includes('calendar')) {
        category = 'Academic Calendar';
      } else if (msgLower.includes('examination rules') || msgLower.includes('exam rules')) {
        category = 'Examination Rules';
      } else if (msgLower.includes('circular')) {
        category = 'Circulars';
      }

      let bestDoc = null;
      let matchedItem = null;

      if (category === 'Syllabus') {
        const syllabusDocs = allOfficialDocs.filter(d => d.category === 'Syllabus');
        
        // Step 1, 2 & 3: Load navigation indexes across all syllabus documents and try to match query first!
        const navMatch = tryNavigationIndexMatch(message, syllabusDocs);
        if (navMatch) {
          bestDoc = navMatch.document;
          matchedItem = navMatch.matchedItem;
        } else {
          // Fallback to department-specific lookup if no navigation index match is found
          // Detect department and programme
          let targetDepartment = studentProfile?.department;
          let targetProgramme = studentProfile?.programme;
          let targetAcademicYear = studentProfile?.academicYear;

          // Force detection from query first
          const depts = [
            "Economics", "Commerce", "Physics", "Chemistry", "Mathematics", 
            "Political Science", "History", "English", "Odia", "Botany", 
            "Zoology", "Computer Science"
          ];
          for (const d of depts) {
            if (new RegExp(`\\b${d}\\b`, 'i').test(message)) {
              targetDepartment = d;
            }
          }

          if (new RegExp(`\\bUG\\b|\\bUndergraduate\\b`, 'i').test(message)) {
            targetProgramme = 'UG';
          } else if (new RegExp(`\\bPG\\b|\\bPostgraduate\\b`, 'i').test(message)) {
            targetProgramme = 'PG';
          }

          if (!targetDepartment) {
            console.log('[Chat Route] Syllabus query but target department not specified. Gracefully falling back to general RAG.');
          } else {
            let matchedDocs = syllabusDocs.filter(d => d.department?.toLowerCase() === targetDepartment.toLowerCase());

            if (matchedDocs.length === 0) {
              console.log(`[Chat Route] Syllabus query but no matched syllabus docs for department "${targetDepartment}". Gracefully falling back to general RAG.`);
            } else {
              // Automatically select the correct one using department, programme, academic year
              if (matchedDocs.length > 1) {
                if (targetProgramme) {
                  const progMatch = matchedDocs.filter(d => d.programme === targetProgramme);
                  if (progMatch.length > 0) matchedDocs = progMatch;
                }
                if (targetAcademicYear) {
                  const yearMatch = matchedDocs.filter(d => d.academicYear === targetAcademicYear);
                  if (yearMatch.length > 0) matchedDocs = yearMatch;
                }
              }
              
              bestDoc = matchedDocs[0];
            }
          }
        }
      } else {
        const categoryDocs = allOfficialDocs.filter(d => d.category === category);
        if (categoryDocs.length > 0) {
          bestDoc = categoryDocs[0];
        }
      }

      if (bestDoc) {
        let pdfNavigation: any = null;
        let finalResponse = '';

        if (matchedItem) {
          pdfNavigation = {
            documentId: bestDoc.documentId,
            docId: bestDoc.documentId,
            title: bestDoc.title,
            sectionTitle: matchedItem.title,
            startPage: matchedItem.startPage,
            endPage: matchedItem.endPage,
            semester: matchedItem.semester || undefined,
            matchedBy: matchedItem.type
          };
          
          const typeLabel = matchedItem.type === 'course' ? 'Course Syllabus' : matchedItem.type === 'semester' ? 'Semester Syllabus' : 'Section Syllabus';
          const detailsLabel = matchedItem.semester ? ` (${matchedItem.semester})` : '';
          
          finalResponse = `📖 **${matchedItem.title}**\n\nI have successfully located the ${typeLabel} for **${matchedItem.title}**${detailsLabel} inside the official syllabus **"${bestDoc.title}"**.\n\nOpening the built-in PDF Viewer and jumping directly to **Pages ${matchedItem.startPage}–${matchedItem.endPage}**.\n\nPlease check the panel on the right side of your screen to browse the content.`;
        } else {
          // Fallback legacy search
          let extractedKeyword = '';
          const semRegex = /(?:semester|sem)\s*(\d+|[ivx]+)/i;
          const semMatch = message.match(semRegex);
          const paperRegex = /(?:paper)\s*(\d+|[ivx]+)/i;
          const paperMatch = message.match(paperRegex);
          const unitRegex = /(?:unit)\s*(\d+|[ivx]+)/i;
          const unitMatch = message.match(unitRegex);

          const romanMap: Record<string, string> = {
            '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII',
            'I': 'I', 'II': 'II', 'III': 'III', 'IV': 'IV', 'V': 'V', 'VI': 'VI', 'VII': 'VII', 'VIII': 'VIII'
          };

          if (semMatch) {
            const val = semMatch[1].toUpperCase();
            const mapped = romanMap[val] || val;
            extractedKeyword = `Semester ${mapped}`;
          } else if (paperMatch) {
            const val = paperMatch[1].toUpperCase();
            const mapped = romanMap[val] || val;
            extractedKeyword = `Paper ${mapped}`;
          } else if (unitMatch) {
            const val = unitMatch[1].toUpperCase();
            const mapped = romanMap[val] || val;
            extractedKeyword = `Unit ${mapped}`;
          } else {
            const specialKw = ['sec', 'vac', 'aec', 'mdc'];
            const foundSpecial = specialKw.find(kw => new RegExp(`\\b${kw}\\b`, 'i').test(msgLower));
            if (foundSpecial) {
              extractedKeyword = foundSpecial.toUpperCase();
            } else {
              let clean = message.replace(/(?:show|view|find|get|search|display|open|syllabus|for|the|of)\b/ig, '').trim();
              clean = clean.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim();
              if (clean.length > 2) {
                extractedKeyword = clean;
              } else {
                extractedKeyword = bestDoc.title;
              }
            }
          }

          pdfNavigation = {
            docId: bestDoc.documentId,
            documentId: bestDoc.documentId,
            keyword: extractedKeyword,
            title: bestDoc.title
          };

          finalResponse = `📄 **Official ${bestDoc.category} Document**\n\nI have successfully located the official document **"${bestDoc.title}"** inside our official repository.\n\nOpening the built-in PDF Viewer and searching for: **"${pdfNavigation.keyword}"**.\n\nPlease check the panel on the right side of your screen to browse the document, jump between matching highlights, or download/print the official PDF.`;
        }

        const totalDuration = Date.now() - globalStartTime;

        await AnalyticsRepository.logChatInteraction(
          message,
          finalResponse,
          totalDuration,
          0,
          30,
          60,
          0,
          'Official Document Navigator',
          [bestDoc.title],
          sessionIdentifier
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const words = finalResponse.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const chunk = words.slice(i, i + 3).join(' ') + ' ';
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 30));
        }

        res.write(`data: ${JSON.stringify({ done: true, citations: [], pdfNavigation })}\n\n`);
        res.end();
        return;
      } else {
        console.log(`[Chat Route] No matching official document found for category "${category}". Gracefully falling back to standard RAG.`);
      }
    } catch (err: any) {
      console.error('[Official Doc Search Error]', err);
    }
  }

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

  // The rest of standard RAG / chat route continues below  }

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

  const temperature = settings.temperature !== undefined ? settings.temperature : 0.2;
  const maxTokens = settings.maxTokens || 4096;

  let nvidiaKey = '';
  try {
    nvidiaKey = getVerifiedNvidiaKey();
  } catch (keyErr: any) {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      console.warn(`[NVIDIA Key Info] ${keyErr.message}. Automatically falling back to native Gemini stream...`);
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
      console.error(`[NVIDIA Key Error] ${keyErr.message}. Bypassing fallback as GEMINI_API_KEY is not configured.`);
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ error: `NVIDIA initialization failed: ${keyErr.message}` })}\n\n`);
      res.end();
    }
    return;
  }

  // 5. Stream from NVIDIA Build API
  console.log(`[NVIDIA Stream] Starting request using model "${model}"...`);
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
    let nvidiaRes: any = null;
    let streamAttempts = 0;
    const maxStreamAttempts = 3;

    while (streamAttempts < maxStreamAttempts) {
      streamAttempts++;
      try {
        nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${nvidiaKey}`
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

        if (!nvidiaRes.ok) {
          const errText = await nvidiaRes.text();
          const status = nvidiaRes.status;
          const detailedErrorText = parseNvidiaError(status, errText, 'Streaming API Call');
          console.warn(`[NVIDIA Stream API Error] Status ${status}. Output: ${errText}. Attempt ${streamAttempts}/${maxStreamAttempts}`);
          
          throw new Error(detailedErrorText);
        }
        break; // Success
      } catch (err: any) {
        if (streamAttempts >= maxStreamAttempts) {
          throw err;
        }
        console.warn(`[NVIDIA Stream Retry] Error occurred on attempt ${streamAttempts}: ${err.message}. Retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!nvidiaRes || !nvidiaRes.ok) {
      throw new Error('Failed to obtain a valid NVIDIA stream response after retries.');
    }

    const reader = nvidiaRes.body?.getReader();
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
    
    // Cost mapping helper (Estimating $0.075 / $0.30 per 1M tokens for NVIDIA models)
    const estimatedCost = (totalPromptTokens * 0.075 + totalCompletionTokens * 0.30) / 1000000;

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
    console.error('[NVIDIA Stream Execution Error] Falling back to Gemini...', err);
    const duration = Date.now() - globalStartTime;
    await AnalyticsRepository.addAILogEntry({
      model,
      processingTimeMs: duration,
      status: 'Failed',
      retries: 0,
      error: err.message || 'NVIDIA Streaming failure',
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
      console.warn(`[NVIDIA Stream Error] Bypassing fallback as GEMINI_API_KEY is not configured.`);
      res.write(`data: ${JSON.stringify({ error: `NVIDIA stream execution error: ${err.message}` })}\n\n`);
      res.end();
    }
  }
});

export default router;
