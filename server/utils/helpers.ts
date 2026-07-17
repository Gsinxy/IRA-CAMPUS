import { auth } from '../firebase.js';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Compute cosine similarity between two vectors
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Fallback text keyword similarity
export function keywordSimilarity(text: unknown, query: unknown): number {
  let textStr = '';
  if (text !== null && text !== undefined) {
    if (typeof text === 'string') {
      textStr = text;
    } else if (typeof text === 'object') {
      try {
        textStr = JSON.stringify(text);
      } catch {
        textStr = String(text);
      }
    } else {
      textStr = String(text);
    }
  }

  let queryStr = '';
  if (query !== null && query !== undefined) {
    if (typeof query === 'string') {
      queryStr = query;
    } else if (typeof query === 'object') {
      try {
        queryStr = JSON.stringify(query);
      } catch {
        queryStr = String(query);
      }
    } else {
      queryStr = String(query);
    }
  }

  if (!textStr || !queryStr) return 0;

  let queryWords: string[] = [];
  try {
    queryWords = queryStr.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  } catch {
    queryWords = [];
  }

  let textLower = '';
  try {
    textLower = textStr.toLowerCase();
  } catch {
    textLower = textStr;
  }

  if (queryWords.length === 0) return 0;

  let matchCount = 0;
  for (const word of queryWords) {
    if (textLower.includes(word)) {
      matchCount += 1.5; // Bonus for matching keyword
      // Additional bonus if matched as a whole word
      try {
        const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
        if (wordRegex.test(textLower)) {
          matchCount += 1.0;
        }
      } catch {
        // Regex failure safety
      }
    }
  }
  return matchCount / queryWords.length;
}

// Generate fallback replies for unrelated questions
export function getUnrelatedFallbackMessage(message: string): string {
  const qClean = message.trim().toLowerCase();
  
  if (qClean.includes('python') || qClean.includes('code') || qClean.includes('programming') || qClean.includes('javascript') || qClean.includes('calculator')) {
    return `I'm focused on official college information.

For coding assistance, please use:

[Open IRA AI](https://ira-ai-production.up.railway.app)`;
  }
  
  if (qClean.includes('phillips curve') || qClean.includes('economics') || qClean.includes('science') || qClean.includes('math') || qClean.includes('history')) {
    return `I'm the official IRA CAMPUS AI Assistant, designed specifically to answer questions about our college.

Your question is outside my area of expertise.

For general AI assistance, please visit:

[Open IRA AI](https://ira-ai-production.up.railway.app)`;
  }

  if (qClean.includes('artificial intelligence') || qClean.includes('machine learning') || qClean.includes('define') || qClean.includes('what is')) {
    // If it's general knowledge and doesn't mention our college or campus
    if (!qClean.includes('college') && !qClean.includes('campus') && !qClean.includes('ira') && !qClean.includes('admission') && !qClean.includes('hostel')) {
      return `That is a general knowledge question.

Please use our general AI platform:

[Open IRA AI](https://ira-ai-production.up.railway.app)`;
    }
  }

  return `I'm the official IRA CAMPUS AI Assistant, designed specifically to answer questions about our college.

Your question appears to be outside the scope of the college knowledge base.

For general knowledge, coding, research, or other AI assistance, please use our general AI platform:

[Open IRA AI](https://ira-ai-production.up.railway.app]

I'm always here to help with anything related to our college.`;
}

export function convertJsonToSearchableChunks(d: any): string[] {
  const chunks: string[] = [];

  // 1. Title
  chunks.push(`Document Title: ${d.title}`);

  // 2. Summary
  if (d.summary) {
    chunks.push(`Document Summary: ${d.summary}`);
  }

  // 3. Content
  if (d.content) {
    chunks.push(`Document Content:\n${d.content}`);
  }

  // 4. FAQs
  if (d.faqs && Array.isArray(d.faqs)) {
    d.faqs.forEach((faq: any, idx: number) => {
      chunks.push(`FAQ #${idx + 1}:\nQuestion: ${faq.question}\nAnswer: ${faq.answer}`);
    });
  }

  // 5. Keywords
  if (d.keywords && Array.isArray(d.keywords)) {
    chunks.push(`Keywords: ${d.keywords.join(', ')}`);
  }

  // 6. Structured Entities
  if (d.entities) {
    const ent = d.entities;
    if (ent.departments && ent.departments.length > 0) {
      chunks.push(`Departments associated with ${d.title}: ${ent.departments.join(', ')}`);
    }
    if (ent.facultyMembers && ent.facultyMembers.length > 0) {
      chunks.push(`Faculty Members associated with ${d.title}: ${ent.facultyMembers.join(', ')}`);
    }
    if (ent.courses && ent.courses.length > 0) {
      chunks.push(`Courses associated with ${d.title}: ${ent.courses.join(', ')}`);
    }
    if (ent.fees && ent.fees.length > 0) {
      const feeList = ent.fees.map((f: any) => {
        if (typeof f === 'object' && f !== null) {
          return `${f.courseOrService || 'Fee'}: ${f.amount || ''}`;
        }
        return String(f);
      }).join('; ');
      chunks.push(`Fees & Charges associated with ${d.title}: ${feeList}`);
    }
    if (ent.contacts && ent.contacts.length > 0) {
      chunks.push(`Contact Contacts associated with ${d.title}: ${ent.contacts.join(', ')}`);
    }
    if (ent.dates && ent.dates.length > 0) {
      chunks.push(`Key Dates associated with ${d.title}: ${ent.dates.join(', ')}`);
    }
  }

  // 7. Metadata Attributes
  if (d.metadata && Array.isArray(d.metadata)) {
    d.metadata.forEach((m: any) => {
      chunks.push(`Metadata Attribute: ${m.key} is ${m.value}`);
    });
  }

  // 8. Arbitrary top-level structured fields (e.g. headOfDepartment, faculty list, departments array, etc.)
  const coreProperties = ['id', 'title', 'type', 'category', 'content', 'size', 'uploadedAt', 'uploadedBy', 'chunks', 'keywords', 'summary', 'faqs', 'metadata', 'entities', 'importDate', 'lastUpdated', 'importedBy', 'rawJson', 'fileName'];
  
  for (const [key, val] of Object.entries(d)) {
    if (coreProperties.includes(key)) continue;

    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      chunks.push(`Field ${key}: ${val}`);
    } else if (Array.isArray(val)) {
      if (key === 'faculty' || key === 'facultyMembers' || key === 'departments' || key === 'courses') {
        chunks.push(`List of ${key}:\n` + val.map((v, idx) => {
          if (typeof v === 'object' && v !== null) {
            return `Item #${idx + 1}:\n` + Object.entries(v).map(([k, vv]) => `  ${k}: ${typeof vv === 'object' ? JSON.stringify(vv) : vv}`).join('\n');
          }
          return `  - ${v}`;
        }).join('\n'));
      } else {
        chunks.push(`Field list ${key}:\n` + val.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', '));
      }
    } else if (typeof val === 'object' && val !== null) {
      chunks.push(`Structured field ${key}:\n` + JSON.stringify(val, null, 2));
    }
  }

  // 9. If chunks.text is present, also add them explicitly to ensure they are searchable
  if (d.chunks && Array.isArray(d.chunks)) {
    d.chunks.forEach((c: any) => {
      const txt = typeof c === 'string' ? c : (c.text || '');
      if (txt && !chunks.includes(txt)) {
        chunks.push(txt);
      }
    });
  }

  return chunks;
}

