import { DocumentRepository } from '../repositories/documentRepository.js';
import { FaqsRepository } from '../repositories/faqsRepository.js';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { NvidiaService } from './nvidiaService.js';
import { GeminiService } from './geminiService.js';
import { CollegeDocument } from '../../src/types.js';
import { Type } from '@google/genai';

export interface QueueItem {
  docId: string;
  url?: string;
  label: string;
  category: string;
  importedBy?: string;
}

const aiProcessingQueue: QueueItem[] = [];
let isProcessingQueue = false;

export class DocumentService {
  /**
   * Add a document to the background AI extraction queue
   */
  static addToAIQueue(item: QueueItem) {
    aiProcessingQueue.push(item);
    this.triggerQueueProcessing();
  }

  /**
   * Triggers processing loop of items in the queue
   */
  private static async triggerQueueProcessing() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (aiProcessingQueue.length > 0) {
      const current = aiProcessingQueue.shift()!;
      console.log(`[AI QUEUE] Processing document ${current.docId} (${current.label})...`);
      
      try {
        await this.updateDocAIStatus(current.docId, 'Processing');
        await this.processDocumentExtraction(current);
        await this.updateDocAIStatus(current.docId, 'Completed');
        console.log(`[AI QUEUE] Successfully processed document ${current.docId}`);
      } catch (error: any) {
        console.error(`[AI QUEUE] Error processing document ${current.docId}:`, error);
        await this.updateDocAIStatus(current.docId, 'Retry Required', error.message || String(error));
      }

      const settings = await SettingsRepository.get();
      const delay = settings.delayBetweenRequests || 3000;
      console.log(`[AI QUEUE] Delaying ${delay}ms before next queue item...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    isProcessingQueue = false;
  }

  /**
   * Helper to update document status in Firestore
   */
  private static async updateDocAIStatus(
    docId: string, 
    status: 'Pending' | 'Processing' | 'Completed' | 'Retry Required', 
    errorMsg?: string
  ) {
    const docObj = await DocumentRepository.getById(docId);
    if (docObj) {
      docObj.aiStatus = status;
      docObj.aiError = errorMsg || null;
      docObj.updatedAt = new Date().toISOString();
      await DocumentRepository.save(docObj);
    }
  }

  /**
   * Executes structured extraction via LLM
   */
  private static async processDocumentExtraction(item: QueueItem) {
    const docObj = await DocumentRepository.getById(item.docId);
    if (!docObj) {
      throw new Error(`Document ${item.docId} not found in Firestore.`);
    }

    const trimmedText = docObj.content.substring(0, 15000);

    const systemPrompt = `You are a professional knowledge extraction engine for a college campus assistant.
Your job is to analyze college documents/webpages and extract highly structured information.
You MUST respond with a single, valid JSON object following this JSON Schema exactly:
{
  "title": "string (the title of the page)",
  "category": "string (exactly one of: Admissions, Academics, Fees, Placements, Hostel, Campus Info)",
  "keywords": ["array of strings (3 to 8 search keywords)"],
  "summary": "string (2-3 sentences summarising the content)",
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "chunks": ["array of strings (divide content into 2-5 high-quality paragraphs of 100-500 words each capturing specific rules or details)"],
  "metadata": [
    { "key": "string", "value": "string" }
  ],
  "entities": {
    "departments": ["string"],
    "facultyMembers": ["string"],
    "courses": ["string"],
    "fees": [
      { "courseOrService": "string", "amount": "string" }
    ],
    "contacts": ["string"],
    "dates": ["string"]
  }
}

Do not include any thinking block, markdown code fence like \`\`\`json, or extra text. Return ONLY the raw JSON object.`;

    const userPrompt = `Please perform structured extraction on the following document content:\n\n${trimmedText}`;

    const extractionSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        category: { type: Type.STRING },
        keywords: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        summary: { type: Type.STRING },
        faqs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING }
            },
            required: ["question", "answer"]
          }
        },
        chunks: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        metadata: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING },
              value: { type: Type.STRING }
            },
            required: ["key", "value"]
          }
        },
        entities: {
          type: Type.OBJECT,
          properties: {
            departments: { type: Type.ARRAY, items: { type: Type.STRING } },
            facultyMembers: { type: Type.ARRAY, items: { type: Type.STRING } },
            courses: { type: Type.ARRAY, items: { type: Type.STRING } },
            fees: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  courseOrService: { type: Type.STRING },
                  amount: { type: Type.STRING }
                },
                required: ["courseOrService", "amount"]
              }
            },
            contacts: { type: Type.ARRAY, items: { type: Type.STRING } },
            dates: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: [
            "departments", "facultyMembers", "courses", "fees", "contacts", "dates"
          ]
        }
      },
      required: [
        "title", "category", "keywords", "summary", "faqs", "chunks", "metadata", "entities"
      ]
    };

    let resultText = '';
    try {
      const response = await NvidiaService.callWithFallback([
        { role: 'user', content: userPrompt }
      ], systemPrompt, true, extractionSchema);
      resultText = response.text;
    } catch (err: any) {
      throw new Error(`AI Extraction failed: ${err.message}`);
    }

    let data: any = null;
    try {
      let cleanedText = resultText.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      }
      data = JSON.parse(cleanedText);
    } catch (e: any) {
      console.error("[AI QUEUE] Failed to parse JSON response:", resultText);
      throw new Error(`AI extraction returned invalid JSON payload: ${e.message}`);
    }

    // Refresh document reference and apply updates
    const refreshedDoc = await DocumentRepository.getById(item.docId);
    if (!refreshedDoc) {
      throw new Error(`Document ${item.docId} vanished from Firestore during extraction.`);
    }

    refreshedDoc.title = data.title || refreshedDoc.title;
    refreshedDoc.category = item.category || data.category || refreshedDoc.category;
    refreshedDoc.keywords = data.keywords || [];
    refreshedDoc.summary = data.summary || '';
    refreshedDoc.faqs = data.faqs || [];
    refreshedDoc.entities = data.entities || {
      departments: [],
      facultyMembers: [],
      courses: [],
      fees: [],
      contacts: [],
      dates: []
    };

    // Split extracted content into structural chunks
    const docId = item.docId;
    refreshedDoc.chunks = (data.chunks || []).map((chunkText: string, idx: number) => ({
      id: `${docId}-chunk-${idx}`,
      text: chunkText,
      embedding: [] as number[]
    }));

    refreshedDoc.aiStatus = 'Completed';
    refreshedDoc.aiError = null;
    refreshedDoc.updatedAt = new Date().toISOString();

    // Save extracted text properties
    await DocumentRepository.save(refreshedDoc);

    // Save newly extracted FAQs globally
    if (data.faqs && data.faqs.length > 0) {
      try {
        const globalFaqs = await FaqsRepository.getAll();
        for (const faq of data.faqs) {
          if (!globalFaqs.some(f => f.question.toLowerCase() === faq.question.toLowerCase())) {
            await FaqsRepository.save({
              id: `faq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              question: faq.question,
              answer: faq.answer,
              category: refreshedDoc.category
            });
          }
        }
      } catch (faqErr) {
        console.error(`[AI QUEUE] Error saving extracted FAQs globally:`, faqErr);
      }
    }

    // Generate vector embeddings in background
    console.log(`[AI QUEUE] Generating vector embeddings for ${refreshedDoc.chunks.length} chunks...`);
    for (const chunk of refreshedDoc.chunks) {
      try {
        const vector = await GeminiService.getEmbedding(chunk.text);
        if (vector && vector.length > 0) {
          chunk.embedding = vector;
        }
      } catch (embErr) {
        console.error(`[AI QUEUE] Embedding generation failed for chunk:`, embErr);
      }
    }

    // Save embeddings to Firestore
    await DocumentRepository.save(refreshedDoc);
  }

  /**
   * Initializes queue on server startup to resume pending tasks
   */
  static async initializeAIQueue() {
    try {
      const docs = await DocumentRepository.getAll();
      let count = 0;
      for (const docObj of docs) {
        if (docObj.aiStatus === 'Pending' || docObj.aiStatus === 'Processing' || docObj.aiStatus === 'Retry Required') {
          // Reset status to Pending for retry/pending files
          if (docObj.aiStatus === 'Retry Required' || docObj.aiStatus === 'Processing') {
            docObj.aiStatus = 'Pending';
            docObj.aiError = null;
            await DocumentRepository.save(docObj);
          }
          this.addToAIQueue({
            docId: docObj.id,
            url: docObj.sourceUrl,
            label: docObj.title,
            category: docObj.category,
            importedBy: docObj.uploadedBy
          });
          count++;
        }
      }
      if (count > 0) {
        console.log(`[AI QUEUE] Initialized queue on startup with ${count} pending/retry documents.`);
      }
    } catch (err) {
      console.error('[AI QUEUE] Initialization failed:', err);
    }
  }
}
