import { DocumentRepository } from '../repositories/documentRepository.js';
import { CollegeDocument } from '../../src/types.js';
import { cosineSimilarity, keywordSimilarity, getUnrelatedFallbackMessage } from '../utils/helpers.js';

const RELEVANCE_THRESHOLD = 0.12;

export interface ScoredDocument {
  doc: CollegeDocument;
  score: number;
}

export interface RetrievalResult {
  isRelevant: boolean;
  systemInstruction: string;
  uniqueCitations: any[];
  topChunks: any[];
  retrievedEntities: any[];
  fullPromptContext: string;
  fallbackResponse?: string;
  retrievalTimeMs: number;
}

export class RagService {
  /**
   * Search Firestore documents and build a complete grounding context for the LLM.
   */
  static async retrieveAndBuildPrompt(
    message: string,
    queryVector: number[]
  ): Promise<RetrievalResult> {
    const retrievalStartTime = Date.now();
    const qClean = message.trim().toLowerCase();

    // 1. Load all documents from Firestore
    const docs = await DocumentRepository.getAll();

    // 2. Compute query classification
    const generalCollegePatterns = [
      'about college', 'college info', 'college history', 'about ira', 'ira overview',
      'about this institution', 'about the institution', 'about institution',
      'what is this college', 'what is the college', 'what is this institution',
      'describe the campus', 'describe campus', 'describe the college', 'describe college',
      'give an overview', 'campus overview', 'college overview',
      'tell me about the college', 'overview of the campus', 'overview of college',
      'tell me about this institution', 'what is this institution', 'institution details',
      'tell me about the campus', 'campus details', 'describe the institution',
      'what is this institution', 'about the campus', 'describe this institution',
      'describe this campus', 'what is this college?', 'tell me about the college',
      'about this institution', 'what courses are offered', 'courses offered',
      'which courses', 'list of courses', 'programs offered', 'what programmes',
      'about the courses', 'which programs', 'available courses', 'tell me about the courses',
      'courses are offered', 'tell me about the college', 'what is this institution?',
      'give me an overview of the campus', 'describe the college', 'what courses are offered?'
    ];

    const isGeneralCollegeQuery = generalCollegePatterns.some(pat => qClean.includes(pat)) ||
      (qClean.includes('college') && (qClean.includes('tell') || qClean.includes('info') || qClean.includes('detail') || qClean.includes('describe') || qClean.includes('overview'))) ||
      (qClean.includes('campus') && (qClean.includes('tell') || qClean.includes('info') || qClean.includes('detail') || qClean.includes('describe') || qClean.includes('overview'))) ||
      (qClean.includes('institution') && (qClean.includes('tell') || qClean.includes('info') || qClean.includes('detail') || qClean.includes('describe') || qClean.includes('overview'))) ||
      qClean === 'about' || qClean === 'overview' || qClean === 'college' || qClean === 'campus';

    const scoredDocuments: ScoredDocument[] = [];
    let maxDocScore = 0;

    for (const doc of docs) {
      // Score Title
      const titleScore = keywordSimilarity(doc.title || '', message) * 0.95;

      // Score fileName
      const fileNameScore = doc.fileName ? keywordSimilarity(doc.fileName, message) * 0.95 : 0;

      // Score Summary
      const summaryScore = doc.summary ? keywordSimilarity(doc.summary, message) * 0.85 : 0;

      // Score Original Content
      const contentScore = doc.content ? keywordSimilarity(doc.content, message) * 0.6 : 0;

      // Score FAQs
      let bestFaqScore = 0;
      if (doc.faqs && Array.isArray(doc.faqs)) {
        for (const faq of doc.faqs) {
          const faqText = `FAQ Question: ${faq.question}\nFAQ Answer: ${faq.answer}`;
          const score = keywordSimilarity(faqText, message) * 0.9;
          if (score > bestFaqScore) {
            bestFaqScore = score;
          }
        }
      }

      // Score Keywords
      let bestKeywordScore = 0;
      if (doc.keywords && Array.isArray(doc.keywords)) {
        for (const kw of doc.keywords) {
          const score = keywordSimilarity(kw, message) * 0.85;
          if (score > bestKeywordScore) {
            bestKeywordScore = score;
          }
        }
      }

      // Score Structured Entities (departments, facultyMembers, courses, fees, contacts, etc.)
      let bestEntityScore = 0;
      if (doc.entities) {
        const ent = doc.entities;
        const entityTexts: string[] = [];
        if (ent.departments) entityTexts.push(...ent.departments);
        if (ent.facultyMembers) entityTexts.push(...ent.facultyMembers);
        if (ent.courses) entityTexts.push(...ent.courses);
        if (ent.contacts) entityTexts.push(...ent.contacts);
        if (ent.dates) entityTexts.push(...ent.dates);
        if (ent.fees) {
          ent.fees.forEach((f: any) => {
            if (typeof f === 'object' && f !== null) {
              entityTexts.push(`${f.courseOrService || ''} ${f.amount || ''}`);
            } else {
              entityTexts.push(String(f));
            }
          });
        }
        for (const text of entityTexts) {
          const score = keywordSimilarity(text, message) * 0.85;
          if (score > bestEntityScore) {
            bestEntityScore = score;
          }
        }
      }

      // Score Metadata
      let bestMetadataScore = 0;
      if (doc.metadata && Array.isArray(doc.metadata)) {
        for (const m of doc.metadata) {
          const metaText = `${m.key} ${m.value}`;
          const score = keywordSimilarity(metaText, message) * 0.8;
          if (score > bestMetadataScore) {
            bestMetadataScore = score;
          }
        }
      }

      // Score chunks.text
      let bestChunkScore = 0;
      for (const chunk of doc.chunks || []) {
        let score = 0;
        if (queryVector.length > 0 && chunk.embedding && chunk.embedding.length > 0) {
          const cosSim = cosineSimilarity(queryVector, chunk.embedding);
          const kwSim = keywordSimilarity(chunk.text, message);
          score = cosSim * 0.8 + kwSim * 0.2;
        } else {
          score = keywordSimilarity(chunk.text, message);
        }
        if (score > bestChunkScore) {
          bestChunkScore = score;
        }
      }

      // Score raw original JSON if present
      let bestRawJsonScore = 0;
      if (doc.type === 'json' && doc.rawJson) {
        const flatText = JSON.stringify(doc.rawJson);
        bestRawJsonScore = keywordSimilarity(flatText, message) * 0.75;
      }

      // Combined document score calculation
      let docScore = Math.max(
        titleScore,
        fileNameScore,
        summaryScore,
        contentScore,
        bestFaqScore,
        bestKeywordScore,
        bestEntityScore,
        bestMetadataScore,
        bestChunkScore,
        bestRawJsonScore
      );

      // Identify general overview or Prospectus files
      let isAboutDoc = false;
      const docTitleLower = (doc.title || '').toLowerCase();
      if (
        docTitleLower.includes('about college') ||
        docTitleLower.includes('profile & history') ||
        docTitleLower.includes('facilities, faculty') ||
        docTitleLower.includes('admission prospectus') ||
        docTitleLower.includes('about us') ||
        docTitleLower.includes('general campus info') ||
        (doc.category && doc.category.toLowerCase().includes('campus info'))
      ) {
        isAboutDoc = true;
      }

      // Apply query boosting
      if (isGeneralCollegeQuery && isAboutDoc) {
        docScore = Math.max(docScore, 0.95);
      }

      if (docScore > maxDocScore) {
        maxDocScore = docScore;
      }

      scoredDocuments.push({
        doc,
        score: docScore
      });
    }

    const retrievalTimeMs = Date.now() - retrievalStartTime;

    // Check if score is below relevance threshold
    if (maxDocScore < RELEVANCE_THRESHOLD) {
      return {
        isRelevant: false,
        systemInstruction: '',
        uniqueCitations: [],
        topChunks: [],
        retrievedEntities: [],
        fullPromptContext: '',
        fallbackResponse: getUnrelatedFallbackMessage(message),
        retrievalTimeMs
      };
    }

    // Sort and grab top 4 matched documents
    const matchedDocs = scoredDocuments
      .filter(sd => sd.score >= RELEVANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    // Assembly of flat chunks for debugging & logging
    const topChunks = matchedDocs.flatMap(sd =>
      (sd.doc.chunks || []).map((chunk: any) => ({
        docId: sd.doc.id,
        docTitle: sd.doc.title,
        text: chunk.text,
        score: sd.score
      }))
    );

    const contextBlocks: string[] = [];
    const retrievedEntities: any[] = [];

    for (const item of matchedDocs) {
      const { doc } = item;

      // Entity summaries for debugging
      if (doc.entities) {
        retrievedEntities.push({
          docId: doc.id,
          docTitle: doc.title,
          entities: doc.entities
        });
      }

      const docParts: string[] = [];
      docParts.push(`DOCUMENT TITLE: ${doc.title}`);
      if (doc.fileName) docParts.push(`DOCUMENT FILE NAME: ${doc.fileName}`);
      docParts.push(`Category: ${doc.category || 'N/A'}`);
      if (doc.summary) docParts.push(`Document Summary: ${doc.summary}`);
      if (doc.keywords && doc.keywords.length > 0) docParts.push(`Keywords: ${doc.keywords.join(', ')}`);

      docParts.push(`\n--- FULL TEXT CONTENT ---`);
      docParts.push(doc.content || '');

      if (doc.chunks && doc.chunks.length > 0) {
        docParts.push(`\n--- INDIVIDUAL CHUNKS (PRESERVED PARAGRAPHS) ---`);
        doc.chunks.forEach((chunk: any, idx: number) => {
          docParts.push(`[Chunk ${idx + 1}]:\n${chunk.text}`);
        });
      }

      if (doc.faqs && doc.faqs.length > 0) {
        docParts.push(`\n--- FREQUENTLY ASKED QUESTIONS ---`);
        doc.faqs.forEach((faq: any, idx: number) => {
          docParts.push(`Q: ${faq.question}\nA: ${faq.answer}`);
        });
      }

      if (doc.type === 'json' || doc.rawJson) {
        docParts.push(`\n--- COMPLETE ORIGINAL JSON DATA ---`);
        docParts.push(JSON.stringify(doc.rawJson || doc, null, 2));
      }

      contextBlocks.push(docParts.join('\n'));
    }

    const context = contextBlocks.join('\n\n==================================================\n\n');

    const entitiesGrounding = retrievedEntities.map(re => {
      const ent = re.entities;
      const parts: string[] = [];
      if (ent.departments && ent.departments.length > 0) {
        parts.push(`Departments: ${ent.departments.join(', ')}`);
      }
      if (ent.facultyMembers && ent.facultyMembers.length > 0) {
        parts.push(`Faculty Members: ${ent.facultyMembers.join(', ')}`);
      }
      if (ent.courses && ent.courses.length > 0) {
        parts.push(`Courses: ${ent.courses.join(', ')}`);
      }
      if (ent.fees && ent.fees.length > 0) {
        const feeList = ent.fees.map((f: any) => {
          if (typeof f === 'object' && f !== null) {
            return `${f.courseOrService || 'Fee'}: ${f.amount || ''}`;
          }
          return String(f);
        }).join('; ');
        parts.push(`Fees & Charges: ${feeList}`);
      }
      if (ent.contacts && ent.contacts.length > 0) {
        parts.push(`Contacts: ${ent.contacts.join(', ')}`);
      }
      if (ent.dates && ent.dates.length > 0) {
        parts.push(`Key Dates: ${ent.dates.join(', ')}`);
      }

      // Match parent document metadata
      const docObj = docs.find(d => d.id === re.docId);
      if (docObj && docObj.metadata && docObj.metadata.length > 0) {
        const metaList = docObj.metadata.map((m: any) => `${m.key}: ${m.value}`).join('; ');
        parts.push(`Metadata Attributes: ${metaList}`);
      }

      return `[Structured Metadata & Entities for: ${re.docTitle}]\n${parts.join('\n')}`;
    }).join('\n\n');

    const fullPromptContext = `${context}\n\n=================================\nSTRUCTURED ENTITIES & METADATA:\n=================================\n${entitiesGrounding}`;

    const citations = matchedDocs.map((item) => {
      const isJsonDoc = item.doc.type === 'json' || item.doc.id.includes('-json-');
      const displayTitle = (isJsonDoc && item.doc.fileName) ? item.doc.fileName : item.doc.title;
      return {
        docId: item.doc.id,
        title: displayTitle,
        snippet: item.doc.summary || (item.doc.content.length > 200 ? item.doc.content.substring(0, 200) + '...' : item.doc.content)
      };
    });

    const uniqueCitations = citations.filter((c, idx, self) =>
      self.findIndex(t => t.docId === c.docId) === idx
    );

    const systemInstruction = `You are IRA, the official AI Campus Information Assistant for IRA Campus (a premium higher education institution).
Your core goal is to answer questions from prospective students, current students, parents, faculty, and visitors accurately, politely, and fully based ONLY on the provided college context.

College Grounded Knowledge Context:
"""
${fullPromptContext}
"""

Instructions:
1. If relevant documents are retrieved, ALWAYS answer using them. Never ignore retrieved context.
2. Always base your response directly on the Grounded Knowledge Context. You are expected to REASON, ANALYZE, COUNT, SUMMARIZE, COMPARE, AND INFER answers from the provided context.
   - You MUST reason over structured JSON fields when answering. For example:
     * Count faculty members from the faculty array.
     * Identify the HOD from the "headOfDepartment" field.
     * List departments from the departments array.
     * Summarize the "content" field.
     * Answer FAQs directly from the FAQ objects.
   - If the JSON contains:
     {
       "headOfDepartment": "Dr. XYZ"
     }
     and the user asks: "Who is the HOD of Chemistry?", you MUST answer exactly: "The Head of the Chemistry Department is Dr. XYZ."
   - If the JSON contains a faculty array, you MUST count, compare, summarize, and list faculty members.
3. If the exact fact is missing, explain what IS available. Never immediately redirect users to the Administrative Dean.
4. Only use the "contact the college" message (e.g., "I do not have verified official records regarding that topic... please contact admissions...") when absolutely no relevant document exists after searching all searchable fields and indexed JSON documents.
5. If a department document is retrieved but the HOD is not listed, say:
"The available Chemistry Department records do not specify the Head of Department. However, the department was established in 1962 and currently has 9 teaching faculty members."
6. If you are answering using information from an imported JSON file, you MUST explicitly display the source document used at the end of your response, formatted exactly like:
"Source: chemistry-department.json" (or whatever the actual JSON file name is).
7. Be professional, warm, welcoming, and concise. Formulate answers using clear headings, tables, or lists where helpful.
8. Support multilingual responses (English, Hindi, Odia, etc.) naturally based on the user's inquiry, translating the grounded facts accurately.
9. In your answer, reference the sources using citation numbers corresponding to the source titles provided in the context (e.g. "according to the Admission Prospectus [Source 1]...").
10. Suggest 2-3 logical follow-up questions at the end of the text response in a separate section (e.g., "[SUGGESTIONS]: Question 1? | Question 2?").

7. CRITICAL SAFETY BOUNDARY: You act ONLY as an official College Information Assistant.
   - If the user asks a question that is NOT related to the college (such as science, history, economics, programming, mathematics, health, politics, current affairs, general knowledge, coding, or any unrelated topic), you MUST NOT attempt to answer it or use external knowledge.
   - Instead, you MUST politely refuse to answer and redirect them to the general AI platform link: [Open IRA AI](https://ira-ai-production.up.railway.app)

   Follow these exact response patterns based on the type of unrelated question:
   
   - For economics, science, or general academic topics (e.g., "What is the Phillips Curve?"):
     "I'm the official IRA CAMPUS AI Assistant, designed specifically to answer questions about our college.

Your question is outside my area of expertise.

For general AI assistance, please visit:

[Open IRA AI](https://ira-ai-production.up.railway.app)"

   - For coding/programming questions (e.g., "Write Python code for a calculator."):
     "I'm focused on official college information.

For coding assistance, please use:

[Open IRA AI](https://ira-ai-production.up.railway.app)"

   - For general knowledge definitions or unrelated concepts (e.g., "What is Artificial Intelligence?"):
     "That is a general knowledge question.

Please use our general AI platform:

[Open IRA AI](https://ira-ai-production.up.railway.app)"

   - For any other unrelated questions:
     "I'm the official IRA CAMPUS AI Assistant, designed specifically to answer questions about our college.

Your question appears to be outside the scope of the college knowledge base.

For general knowledge, coding, research, or other AI assistance, please use our general AI platform:

[Open IRA AI](https://ira-ai-production.up.railway.app)

I'm always here to help with anything related to our college."

Do not provide follow-up questions/suggestions or standard college contact info for non-college queries.`;

    return {
      isRelevant: true,
      systemInstruction,
      uniqueCitations,
      topChunks,
      retrievedEntities,
      fullPromptContext,
      retrievalTimeMs
    };
  }
}
