import { Router, Response } from 'express';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { DocumentRepository } from '../repositories/documentRepository.js';
import { FaqsRepository } from '../repositories/faqsRepository.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { ScrapperService } from '../services/scrapperService.js';
import { DocumentService } from '../services/documentService.js';
import { NvidiaService } from '../services/nvidiaService.js';
import { GeminiService } from '../services/geminiService.js';
import { convertJsonToSearchableChunks } from '../utils/helpers.js';
import { CollegeDocument } from '../../src/types.js';
import { db, setDoc } from '../firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { Type } from '@google/genai';

const router = Router();

// GET all documents metadata list
router.get('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const list = await DocumentRepository.getAll();
    const metadata = list.map((d: any) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      category: d.category,
      size: d.size,
      uploadedAt: d.uploadedAt,
      uploadedBy: d.uploadedBy,
      chunksCount: d.chunks ? d.chunks.length : 0,
      aiStatus: d.aiStatus,
      aiError: d.aiError,
      sourceUrl: d.sourceUrl
    }));
    res.json(metadata);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST check if URL already exists
router.post('/check-url', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    const list = await DocumentRepository.getAll();
    const existingDoc = list.find((d: any) => d.sourceUrl === url);
    if (existingDoc) {
      return res.json({
        exists: true,
        docId: existingDoc.id,
        title: existingDoc.title,
        message: 'This webpage has already been imported.'
      });
    }
    return res.json({ exists: false });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to check URL: ${err.message}` });
  }
});

// POST fetch URL text content
router.post('/fetch-url', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    const page = await ScrapperService.fetchAndParseUrl(url);
    const wordCount = page.rawText.split(/\s+/).filter(Boolean).length;
    res.json({
      title: page.title,
      url,
      characterCount: page.rawText.length,
      wordCount,
      rawText: page.rawText
    });
  } catch (err: any) {
    console.error('[Fetch URL Route Error]', err);
    res.status(400).json({ error: 'Unable to fetch the webpage. Please verify the URL.' });
  }
});

// POST crawl internal links
router.post('/detect-links', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { url: baseUrl } = req.body;
  if (!baseUrl) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  try {
    const fetchRes = await fetch(baseUrl);
    if (!fetchRes.ok) {
      throw new Error(`HTTP error! status: ${fetchRes.status}`);
    }
    const html = await fetchRes.text();
    const formattedText = ScrapperService.htmlToFormattedText(html); // We can parse direct anchors
    // Let's use the actual regex / cheerio anchor parser
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    const categoryKeywords: { [key: string]: string[] } = {
      'About': ['about', 'history', 'profile', 'mission', 'vision', 'overview', 'our story', 'about-us', 'about_us', 'heritage', 'campus', 'president', 'principal', 'leadership'],
      'Admission': ['admission', 'apply', 'enrollment', 'prospectus', 'intake', 'registration', 'eligibility'],
      'Departments': ['department', 'programme', 'dept', 'physics', 'chemistry', 'mathematics', 'biology', 'humanities', 'computer science', 'commerce', 'arts', 'science', 'electronics', 'mechanical', 'civil'],
      'Faculty': ['faculty', 'staff', 'teachers', 'directory', 'professors', 'teaching', 'members'],
      'Courses': ['course', 'curriculum', 'syllabus', 'degree', 'undergraduate', 'postgraduate', 'btech', 'mtech', 'bsc', 'msc', 'ba', 'ma', 'phd', 'program'],
      'Hostel': ['hostel', 'accommodation', 'residential', 'housing', 'dorm', 'mess'],
      'Library': ['library', 'e-resource', 'book', 'journal', 'reading room'],
      'Scholarships': ['scholarship', 'financial aid', 'fee concession', 'concession', 'stipend', 'fellowship'],
      'Fees': ['fee', 'tuition', 'payment', 'charge', 'dues'],
      'Placements': ['placement', 'career', 'recruit', 'recruiters', 'internship', 'jobs', 'training', 'alumni'],
      'Notices': ['notice', 'announcement', 'circular', 'news', 'event', 'tender'],
      'Contact': ['contact', 'reach', 'address', 'map', 'feedback', 'location'],
      'Administration': ['administration', 'governing', 'trust', 'vice chancellor', 'dean', 'registrar', 'committee'],
      'IQAC': ['iqac', 'quality assurance'],
      'NAAC': ['naac', 'accreditation'],
      'Academics': ['academic', 'calendar', 'regulation', 'exam', 'result', 'timetable', 'schedule']
    };

    const linkMap = new Map<string, { url: string; label: string; category: string }>();

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const anchorText = $(el).text().replace(/\s+/g, ' ').trim();
      if (!href) return;

      const trimmedHref = href.trim();
      if (
        trimmedHref.startsWith('javascript:') ||
        trimmedHref.startsWith('mailto:') ||
        trimmedHref.startsWith('tel:') ||
        trimmedHref.startsWith('#') ||
        !trimmedHref
      ) {
        return;
      }

      try {
        const resolvedUrl = new URL(trimmedHref, baseUrl).toString();
        const resolvedUrlObj = new URL(resolvedUrl);
        const baseUrlObj = new URL(baseUrl);

        // Filter: Keep only internal links (same domain)
        const resHost = resolvedUrlObj.hostname.replace(/^www\./i, '');
        const baseHost = baseUrlObj.hostname.replace(/^www\./i, '');
        if (resHost !== baseHost) {
          return;
        }

        // Skip exact match with home page URL to avoid importing homepage text over and over
        const normUrl = resolvedUrlObj.href.replace(/\/+$/, '');
        const normBase = baseUrlObj.href.replace(/\/+$/, '');
        if (normUrl === normBase) {
          return;
        }

        let matchedCategory = 'General';
        let matchedScore = 0;
        const combinedText = `${anchorText} ${resolvedUrlObj.pathname} ${resolvedUrlObj.search}`.toLowerCase();

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
          for (const kw of keywords) {
            if (combinedText.includes(kw)) {
              let score = 0;
              if (anchorText.toLowerCase().includes(kw)) {
                score += 10;
              }
              if (resolvedUrlObj.pathname.toLowerCase().includes(kw)) {
                score += 5;
              }
              if (score > matchedScore) {
                matchedScore = score;
                matchedCategory = category;
              }
            }
          }
        }

        if (anchorText.length < 2) return;

        // Clean up label to be more user friendly if it's too long
        let cleanLabel = anchorText;
        if (cleanLabel.length > 50) {
          cleanLabel = cleanLabel.substring(0, 47) + '...';
        }

        const existing = linkMap.get(normUrl);
        // Only keep if not existing, or if we have a better category classification
        if (!existing || (matchedCategory !== 'General' && existing.category === 'General')) {
          linkMap.set(normUrl, {
            url: resolvedUrl,
            label: cleanLabel,
            category: matchedCategory
          });
        }
      } catch (_) {
        // Skip invalid URL structures
      }
    });

    const detectedLinks = Array.from(linkMap.values());
    return res.json({ detectedLinks });
  } catch (err: any) {
    console.error('Failed to detect links:', err);
    return res.status(500).json({ error: `Unable to detect internal links: ${err.message}` });
  }
});

// POST crawler import single webpage URL
router.post('/import-single-url', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { url, label, category: selectedCategory, importedBy } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    const timestamp = new Date().toISOString();
    logs.push(`[${timestamp}] ${msg}`);
    console.log(`[Import Single URL] ${msg}`);
  };

  log(`Starting import pipeline for URL: ${url}`);

  let currentStage: 'Fetch' | 'Clean' | 'AI Extraction' | 'Embedding' | 'Save' = 'Fetch';
  let httpStatus: number | null = null;

  try {
    // 1. Fetch webpage synchronously
    log(`Fetching URL: ${url}`);
    let fetchRes;
    try {
      fetchRes = await fetch(url);
      httpStatus = fetchRes.status;
      log(`Fetched HTTP status: ${fetchRes.status}`);
    } catch (fetchErr: any) {
      log(`Fetch error: ${fetchErr.message}`);
      return res.status(400).json({
        error: `Fetch failed: ${fetchErr.message}`,
        stage: 'Fetch',
        status: null,
        logs
      });
    }

    if (!fetchRes.ok) {
      log(`Fetch failed with HTTP status ${fetchRes.status}`);
      return res.status(fetchRes.status >= 400 && fetchRes.status < 600 ? fetchRes.status : 400).json({
        error: `HTTP error! status: ${fetchRes.status}`,
        stage: 'Fetch',
        status: httpStatus,
        logs
      });
    }

    const html = await fetchRes.text();
    log(`Downloaded HTML content. Size: ${html.length} characters`);

    // 2. Clean HTML thoroughly
    currentStage = 'Clean';
    log(`Cleaning HTML content...`);
    const cleanedText = ScrapperService.htmlToFormattedText(html);

    if (!cleanedText || cleanedText.length < 10) {
      log(`Clean failed: No substantial content found.`);
      return res.status(400).json({
        error: 'No substantial readable content found on the webpage after cleaning.',
        stage: 'Clean',
        status: httpStatus,
        logs
      });
    }

    log(`Successfully cleaned HTML. Extracted text size: ${cleanedText.length} characters.`);
    const trimmedText = cleanedText.substring(0, 15000);

    // Get title from title tag if available
    let computedTitle = label || 'Extracted Webpage';
    try {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        computedTitle = titleMatch[1].trim();
      }
    } catch (e) {}

    // 3. Save as a Pending placeholder document in the database
    currentStage = 'Save';
    log(`Creating Pending database entry for document "${computedTitle}"...`);
    const docId = `doc-url-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const currentTimestamp = new Date().toISOString();

    const savedDoc: CollegeDocument = {
      id: docId,
      title: computedTitle,
      type: 'url',
      category: selectedCategory || 'Campus Info',
      content: trimmedText,
      size: `${Math.round(trimmedText.length / 102) / 10} KB`,
      uploadedAt: currentTimestamp,
      uploadedBy: importedBy || 'Intelligent Crawler',
      keywords: [selectedCategory || 'Campus Info'],
      summary: 'Extracting knowledge and generating embeddings in the background...',
      faqs: [],
      entities: {
        departments: [],
        facultyMembers: [],
        courses: [],
        fees: [],
        contacts: [],
        dates: []
      },
      sourceUrl: url,
      aiStatus: 'Pending',
      aiError: null,
      chunks: [],
      embedding: []
    };

    await DocumentRepository.save(savedDoc);
    log(`Saved placeholder document successfully to Firestore.`);

    // 4. Add document to background AI processing queue
    log(`Pushing document to background AI processing queue...`);
    DocumentService.addToAIQueue({
      docId,
      url,
      label: computedTitle,
      category: selectedCategory || 'Campus Info',
      importedBy: importedBy || 'Intelligent Crawler'
    });

    log(`Crawl and fetch complete. Document queued for AI structured extraction in the background.`);
    
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Document Upload: Crawled and queued URL: "${savedDoc.title}" (${savedDoc.category})`,
      String(clientIp)
    );

    return res.json({ 
      success: true, 
      docId, 
      title: savedDoc.title, 
      category: savedDoc.category,
      aiExtractionFailed: false,
      aiExtractionError: null,
      logs
    });

  } catch (err: any) {
    log(`Critical pipeline error: ${err.message || err}`);
    return res.status(500).json({
      error: `Failed to import webpage: ${err.message}`,
      stage: currentStage,
      status: httpStatus,
      logs
    });
  }
});

// POST batch imports JSON configurations
router.post('/import-json', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { documents, importedBy } = req.body;
  
  const logs: string[] = [];
  const log = (msg: string) => {
    const formatted = `[${new Date().toISOString()}] ${msg}`;
    logs.push(formatted);
    console.log(formatted);
  };

  log("[Stage 1] JSON received");

  if (!documents || !Array.isArray(documents)) {
    log("Error: Documents payload is missing or not an array");
    return res.status(400).json({ error: 'An array of documents is required for JSON import.', logs });
  }

  log(`Received ${documents.length} document configurations for batch JSON import.`);

  try {
    const currentTimestamp = new Date().toISOString();
    const importedIds: string[] = [];

    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      if (!d || typeof d !== 'object') {
        log(`Error: Document #${i + 1} is invalid JSON structure.`);
        return res.status(400).json({ error: `Invalid JSON structure for document #${i + 1}`, logs });
      }

      // Generate document ID from filename (without .json) as required by Requirement 2
      let docId = '';
      if (d.fileName) {
        docId = d.fileName.split('/').pop()!.replace(/\.json$/i, '');
      } else {
        docId = `doc-json-${Date.now()}-${Math.floor(Math.random() * 1000)}-${i}`;
      }

      log(`[Stage 2] JSON parsed for file: ${d.fileName || 'unknown'} -> Generated ID: ${docId}`);

      // Validate all required fields
      let title = d.title || '';
      if (!title) {
        if (d.fileName) {
          const baseName = d.fileName.replace(/\.json$/i, '');
          title = baseName.split(/[-_]/).map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        } else {
          title = `Imported JSON Document #${i + 1}`;
        }
      }

      let content = d.content || '';
      if (!content) {
        const parts: string[] = [];
        for (const [key, val] of Object.entries(d)) {
          if (['title', 'content', 'chunks', 'rawJson', 'fileName'].includes(key)) continue;
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            parts.push(`${key}: ${val}`);
          } else if (Array.isArray(val)) {
            parts.push(`${key}:\n` + val.map(v => typeof v === 'object' ? JSON.stringify(v) : `  - ${v}`).join('\n'));
          } else if (typeof val === 'object' && val !== null) {
            parts.push(`${key}:\n` + JSON.stringify(val, null, 2));
          }
        }
        content = parts.join('\n\n');
      }

      if (!title.trim()) {
        log(`Error: Document #${i + 1} title is empty and could not be resolved.`);
        return res.status(400).json({ error: `Document #${i + 1} title is empty and could not be resolved.`, logs });
      }
      if (!content.trim()) {
        log(`Error: Document "${title}" content is empty.`);
        return res.status(400).json({ error: `Document "${title}" content is empty.`, logs });
      }

      const entities = d.entities || {
        departments: [],
        facultyMembers: [],
        courses: [],
        fees: [],
        contacts: [],
        dates: []
      };

      if (d.headOfDepartment && entities.facultyMembers && !entities.facultyMembers.includes(d.headOfDepartment)) {
        entities.facultyMembers.push(d.headOfDepartment);
      }
      if (d.faculty && Array.isArray(d.faculty)) {
        d.faculty.forEach((member: any) => {
          const name = typeof member === 'object' ? (member.name || member.fullName) : member;
          if (name && entities.facultyMembers && !entities.facultyMembers.includes(name)) {
            entities.facultyMembers.push(name);
          }
        });
      }

      // Preserve original JSON exactly under rawJson as required by Requirement 2 and 3
      const rawJsonExact = d.rawJson || d;

      // Requirement 3: The Firestore document must contain every field
      const completeDoc: any = {
        id: docId,
        title: title,
        summary: d.summary || title,
        content: content,
        faqs: Array.isArray(d.faqs) ? d.faqs : [],
        keywords: Array.isArray(d.keywords) ? d.keywords : [d.category || 'Campus Info'],
        entities: entities,
        contactInformation: d.contactInformation || d.contact_information || null,
        metadata: Array.isArray(d.metadata) ? d.metadata : [],
        sourceUrl: d.sourceUrl || d.source_url || null,
        rawJson: rawJsonExact,
        uploadedAt: currentTimestamp,
        updatedAt: currentTimestamp,
        category: d.category || 'Campus Info',
        type: 'json',
        uploadedBy: importedBy || 'JSON Importer',
        chunks: [], // empty before indexing starts
        embedding: [] // empty before indexing starts
      };

      log("[Stage 3] Firestore document object created: " + JSON.stringify({ id: completeDoc.id, title: completeDoc.title }));

      // Save COMPLETE document to Firestore before any indexing starts (Requirement 2 & 4 & 5)
      log("[Stage 4] Firestore write started for: " + docId);
      try {
        await DocumentRepository.save(completeDoc);
      } catch (writeErr: any) {
        log(`Error [Stage 4] Firestore write failed: ${writeErr.message}`);
        return res.status(500).json({ error: `Firestore write failed: ${writeErr.message}`, logs });
      }

      log("[Stage 5] Firestore write completed for: " + docId);

      // Immediately read back the same document from Firestore and verify that every expected field exists (Requirement 7)
      log(`Verifying Firestore persistence for: ${docId}`);
      const docSnap = await DocumentRepository.getById(docId);
      if (!docSnap) {
        const errMsg = `Verification failed: Document "${docId}" does not exist in Firestore after write.`;
        log(errMsg);
        return res.status(500).json({ error: errMsg, logs });
      }

      const requiredFields = [
        'id', 'title', 'summary', 'content', 'faqs', 'keywords', 'entities',
        'contactInformation', 'metadata', 'sourceUrl', 'rawJson', 'uploadedAt',
        'updatedAt', 'category', 'type', 'uploadedBy', 'chunks', 'embedding'
      ];
      for (const f of requiredFields) {
        if ((docSnap as any)[f] === undefined) {
          const errMsg = `Verification failed: Document "${docId}" is missing expected field "${f}" in Firestore.`;
          log(errMsg);
          return res.status(500).json({ error: errMsg, logs });
        }
      }
      log(`✓ Verified initial write: All ${requiredFields.length} expected fields exist in Firestore.`);

      // Generate chunks and embeddings (Requirement 4)
      log("[Stage 6] Embedding generation started for: " + docId);
      const rawChunks = convertJsonToSearchableChunks({
        ...completeDoc,
        title,
        content,
        entities
      });

      const docChunks = rawChunks.map((chunkText: string, idx: number) => ({
        id: `${docId}-chunk-${idx}`,
        text: chunkText,
        embedding: [] as number[]
      }));

      log(`Generating embeddings for ${docChunks.length} chunks...`);
      for (const chunk of docChunks) {
        try {
          const vector = await GeminiService.getEmbedding(chunk.text);
          if (vector && vector.length > 0) {
            chunk.embedding = vector;
          }
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit safety
      }
      
      completeDoc.chunks = docChunks;
      completeDoc.embedding = (docChunks[0] && docChunks[0].embedding) || [];
      completeDoc.updatedAt = new Date().toISOString();

      // Save embeddings back to Firestore (Requirement 4)
      try {
        await DocumentRepository.save(completeDoc);
        log("[Stage 7] Embedding saved for: " + docId);
      } catch (saveEmbErr: any) {
        log(`Error [Stage 7] Saving embeddings failed: ${saveEmbErr.message}`);
        return res.status(500).json({ error: `Failed to save embeddings: ${saveEmbErr.message}`, logs });
      }

      // Read back again and print verification report (Requirement 7 & 8)
      const finalDoc = await DocumentRepository.getById(docId);
      const finalChunkCount = (finalDoc && finalDoc.chunks) ? finalDoc.chunks.length : 0;
      const finalEmbeddingCount = (finalDoc && finalDoc.chunks) ? finalDoc.chunks.filter((c: any) => c.embedding && c.embedding.length > 0).length : 0;

      // Print verification report
      console.log(`\n=============================================`);
      console.log(`✓ Firestore connected`);
      console.log(`✓ Collection: knowledge`);
      console.log(`✓ Document ID: ${docId}`);
      console.log(`✓ Fields saved: ${requiredFields.join(', ')}`);
      console.log(`✓ Chunk count: ${finalChunkCount}`);
      console.log(`✓ Embedding count: ${finalEmbeddingCount}`);
      console.log(`=============================================\n`);

      log(`[Verification Report]`);
      log(`✓ Firestore connected`);
      log(`✓ Collection: knowledge`);
      log(`✓ Document ID: ${docId}`);
      log(`✓ Fields saved`);
      log(`✓ Chunk count: ${finalChunkCount}`);
      log(`✓ Embedding count: ${finalEmbeddingCount}`);

      log("[Stage 8] Index updated for document: " + docId);
      importedIds.push(docId);
    }

    log("[Stage 9] Import completed");

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `JSON Import: Imported ${importedIds.length} document configurations successfully`,
      String(clientIp)
    );

    return res.json({
      success: true,
      importedCount: importedIds.length,
      importedIds: importedIds,
      logs
    });

  } catch (err: any) {
    console.error('Batch JSON import failed:', err);
    return res.status(500).json({ error: `Failed to import JSON files: ${err.message}`, logs });
  }
});

// POST extract pasted webpage raw content
router.post('/extract', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Pasted website/webpage content is required for extraction.' });
  }

  try {
    console.log(`Analyzing pasted content via OpenRouter for AI structured knowledge extraction...`);

    const systemPrompt = `You are a professional knowledge extraction engine for a college campus assistant.
Your job is to analyze college documents/webpages and extract highly structured information.
You MUST respond with a single, valid JSON object following this JSON Schema exactly:
{
  "title": "A descriptive, clear, and concise title for the provided content (e.g., 'Admission Guidelines 2026' or 'BCA Semester 3 Syllabus')",
  "category": "Exactly one of: Admissions, Academics, Fees, Placements, Hostel, Campus Info",
  "keywords": ["3-8 keywords or search phrases relevant to this document"],
  "summary": "A concise 2-3 sentence summary of the entire content",
  "faqs": [
    { "question": "A frequently asked question that is answered by the content", "answer": "A detailed but direct answer to the question based ONLY on the content" }
  ],
  "chunks": ["Divide the content into 2-5 high-quality, self-contained, and searchable paragraphs or informational chunks (each chunk should be 100-500 words, capturing specific facts, eligibility rules, tables, or syllabus details perfectly). You MUST preserve any tables, numbered lists, or faculty lists in their entirety within the chunk where they appear. Do not truncate tables or lists across chunks."],
  "metadata": [
    { "key": "Name of the metadata attribute (e.g., 'Target Audience', 'Estimated Read Time', 'Document Language')", "value": "Value of the metadata attribute" }
  ],
  "entities": {
    "departments": ["List of academic or administrative departments mentioned (e.g., ['Computer Science & Engineering', 'Economics', 'Basic Sciences'])"],
    "facultyMembers": ["List of faculty members, teachers, HODs, or deans mentioned (e.g., ['Dr. Ramesh Chandra Panda', 'Dr. Sunita Mohanty', 'Mrs. Meera Sen'])"],
    "courses": ["List of academic courses, degrees, or programs mentioned (e.g., ['B.Tech', 'BCA', 'MCA'])"],
    "fees": [
      { "courseOrService": "The course, degree, or service the fee is for (e.g., 'B.Tech CSE', 'Category A (AC Double Sharing)', 'Application Fee')", "amount": "The exact fee amount (e.g., '$150,000 per year', '$1,000')" }
    ],
    "contacts": ["List of contact numbers, email addresses, or office locations mentioned (e.g., 'dean@iracampus.edu', '+91-674-2567890')"],
    "dates": ["List of critical dates, deadlines, or timelines mentioned (e.g., 'May 1st, 2026', 'July 31st, 2026')"]
  }
}
Do not include any thinking block, markdown code fence like \`\`\`json, or extra text. Return ONLY the raw JSON object.`;

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

    const response = await NvidiaService.callWithFallback([
      { role: 'user', content: `Please perform full structured College Knowledge Extraction on the following raw copied text/website content. Formulate and return high-fidelity results adhering exactly to the schema:\n\n${content}` }
    ], systemPrompt, true, extractionSchema);

    let cleanedText = response.text.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    }
    
    const data = JSON.parse(cleanedText);
    res.json(data);
  } catch (err: any) {
    console.error('AI Extraction failed:', err);
    res.status(500).json({ error: `AI Knowledge Extraction failed: ${err.message || err}` });
  }
});

// POST save manual extracted webpage structured results
router.post('/save-extracted', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id, title, category, content, keywords, summary, faqs, chunks, metadata, entities, sourceUrl, importedBy } = req.body;
  if (!title || !category || !content) {
    return res.status(400).json({ error: 'Title, Category, and Original Content are required.' });
  }

  try {
    let targetDoc: any = null;
    let isUpdate = false;

    if (id) {
      targetDoc = await DocumentRepository.getById(id);
      if (targetDoc) {
        isUpdate = true;
      }
    }

    const currentTimestamp = new Date().toISOString();
    const docId = isUpdate ? id : `doc-${Date.now()}`;

    // 1. Map chunks and prepare chunk list
    const finalChunks = (chunks || []).map((chunkText: string, idx: number) => ({
      id: `${docId}-chunk-${idx}`,
      text: chunkText,
      embedding: [] as number[]
    }));

    // 2. Generate embeddings synchronously
    console.log(`[Save Extracted] Generating vector embeddings for ${finalChunks.length} chunks synchronously...`);
    for (const chunk of finalChunks) {
      try {
        const vector = await GeminiService.getEmbedding(chunk.text);
        if (vector && vector.length > 0) {
          chunk.embedding = vector;
        }
      } catch (embErr: any) {
        console.error(`[Save Extracted] Synchronous embedding generation failed for chunk:`, embErr);
      }
    }

    const savedDoc: CollegeDocument = {
      id: docId,
      title,
      type: 'url',
      category,
      content,
      size: `${Math.round(content.length / 102) / 10} KB`,
      uploadedAt: isUpdate ? (targetDoc.uploadedAt || currentTimestamp) : currentTimestamp,
      uploadedBy: isUpdate ? (targetDoc.uploadedBy || importedBy || 'AI Extractor Portal') : (importedBy || 'AI Extractor Portal'),
      keywords: keywords || [],
      summary: summary || '',
      faqs: faqs || [],
      metadata: metadata || [],
      entities: entities || {
        departments: [],
        facultyMembers: [],
        courses: [],
        fees: [],
        contacts: [],
        dates: []
      },
      sourceUrl: sourceUrl || targetDoc?.sourceUrl || null,
      chunks: finalChunks,
      embedding: (finalChunks[0] && finalChunks[0].embedding) || []
    };

    // 3. Save to Firestore "knowledge" collection
    await DocumentRepository.save(savedDoc);

    // 4. Save FAQs globally if extracted
    if (faqs && faqs.length > 0) {
      try {
        const currentFaqs = await FaqsRepository.getAll();
        for (const faq of faqs) {
          if (!currentFaqs.some(f => f.question.toLowerCase() === faq.question.toLowerCase())) {
            await FaqsRepository.save({
              id: `faq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              question: faq.question,
              answer: faq.answer,
              category: category,
              documentId: docId
            });
          }
        }
      } catch (faqErr) {
        console.error('Error adding extracted FAQs globally:', faqErr);
      }
    }

    // 5. Verify by reading the document back from Firestore
    console.log(`[Save Extracted] Verifying database persistence for document: ${docId}`);
    const verifiedDoc = await DocumentRepository.getById(docId);
    if (!verifiedDoc) {
      throw new Error(`Verification failed: Document "${docId}" could not be read back from Firestore.`);
    }
    console.log(`[Save Extracted] Verification succeeded. Successfully read back document: "${verifiedDoc.title}"`);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Document Upload: Saved structured knowledge: "${title}" (${category})`,
      String(clientIp)
    );

    res.json(verifiedDoc);
  } catch (err: any) {
    console.error('Failed to save extracted knowledge document:', err);
    res.status(500).json({ error: `Failed to save extracted knowledge: ${err.message}` });
  }
});

// POST upload PDF/image file and parse multimodal layout
router.post('/upload', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { title, type, category, content, url, fileBase64, mimeType } = req.body;
  if (!title || !type || !category) {
    return res.status(400).json({ error: 'Title, Type, and Category are required' });
  }

  try {
    let finalContent = '';

    if (type === 'url') {
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const page = await ScrapperService.fetchAndParseUrl(url);
      finalContent = page.rawText;
    } else if (fileBase64 && mimeType) {
      console.log(`Sending file ${title} (${mimeType}) to NVIDIA/Gemini for multimodal text extraction...`);
      const extractionPrompt = 'Extract and read all textual content from this file accurately. Keep the organization structural layout (like headings and tables) clear and neat. Return only the extracted text without any conversational preamble.';
      try {
        const fileDataUrl = `data:${mimeType};base64,${fileBase64}`;
        const result = await NvidiaService.callWithFallback([
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: extractionPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: fileDataUrl
                }
              }
            ]
          }
        ], 'You are a professional layout OCR engine.');
        finalContent = result.text || '';
      } catch (nvErr: any) {
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
          console.warn(`[NVIDIA OCR Warning] ${nvErr.message}. Falling back to native Google GenAI OCR client...`);
          try {
            const result = await GeminiService.ocrMultimodal(fileBase64, mimeType, extractionPrompt);
            finalContent = result || '';
          } catch (geminiErr: any) {
            console.error('[Gemini Direct OCR Fallback Failed]', geminiErr);
            throw new Error(`Both NVIDIA and Gemini Multimodal OCR failed: ${geminiErr.message}`);
          }
        } else {
          console.error(`[NVIDIA OCR Error] ${nvErr.message}. Bypassing fallback as GEMINI_API_KEY is not configured.`);
          throw nvErr;
        }
      }
    } else {
      finalContent = content || '';
    }

    if (!finalContent.trim()) {
      return res.status(400).json({ error: 'Extracted document content is empty' });
    }

    const docId = `doc-${Date.now()}`;
    const currentTimestamp = new Date().toISOString();
    const newDoc: CollegeDocument = {
      id: docId,
      title,
      type,
      category,
      content: finalContent,
      size: `${Math.round(finalContent.length / 102) / 10} KB`,
      uploadedAt: currentTimestamp,
      uploadedBy: 'Campus Staff',
      keywords: [category],
      summary: finalContent.substring(0, 200) + '...',
      faqs: [],
      entities: {
        departments: [],
        facultyMembers: [],
        courses: [],
        fees: [],
        contacts: [],
        dates: []
      },
      chunks: [],
      embedding: [],
      fileBase64: type === 'pdf' || (mimeType && mimeType.includes('pdf')) ? fileBase64 : (type === 'file' ? fileBase64 : undefined),
      mimeType: type === 'pdf' || (mimeType && mimeType.includes('pdf')) ? 'application/pdf' : mimeType,
      fileName: title.endsWith('.pdf') ? title : (type === 'pdf' ? `${title}.pdf` : title)
    };

    await DocumentRepository.save(newDoc);

    // Generate embeddings in background
    setTimeout(async () => {
      try {
        const docChunks = convertJsonToSearchableChunks(newDoc).map((chunkText: string, idx: number) => ({
          id: `${docId}-chunk-${idx}`,
          text: chunkText,
          embedding: [] as number[]
        }));
        for (const chunk of docChunks) {
          const vector = await GeminiService.getEmbedding(chunk.text);
          if (vector && vector.length > 0) {
            chunk.embedding = vector;
          }
        }
        newDoc.chunks = docChunks;
        newDoc.updatedAt = new Date().toISOString();
        await DocumentRepository.save(newDoc);
      } catch (err) {
        console.error('Error generating document embedding in background:', err);
      }
    }, 500);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Document Upload: Manually uploaded document: "${title}" (${category})`,
      String(clientIp)
    );

    res.json(newDoc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE document
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  
  try {
    const docObj = await DocumentRepository.getById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const docTitle = docObj.title || 'Unknown Document';
    const fileName = docObj.fileName || 'No File Name';
    const chunkCount = docObj.chunks?.length || 0;
    
    // Count embeddings: check global document embedding and each chunk's embedding
    const globalEmbeddingCount = (docObj.embedding && docObj.embedding.length > 0) ? 1 : 0;
    const chunkEmbeddingCount = docObj.chunks?.filter(c => c.embedding && c.embedding.length > 0).length || 0;
    const embeddingCount = globalEmbeddingCount + chunkEmbeddingCount;
    const timestamp = new Date().toISOString();

    // 1. Delete associated global FAQs to prevent orphaned knowledge remnants
    let deletedFaqCount = 0;
    try {
      const globalFaqs = await FaqsRepository.getAll();
      const nestedFaqQuestions = new Set((docObj.faqs || []).map(f => f.question.toLowerCase()));
      const faqsToDelete = globalFaqs.filter(f => 
        f.documentId === id || 
        nestedFaqQuestions.has(f.question.toLowerCase())
      );
      
      for (const faq of faqsToDelete) {
        await FaqsRepository.delete(faq.id);
        deletedFaqCount++;
        console.log(`[Document Delete] Deleted related global FAQ: "${faq.question}" (ID: ${faq.id})`);
      }
    } catch (faqErr: any) {
      console.error('[Document Delete] Error cleaning up associated global FAQs:', faqErr);
    }

    // 2. Permanently delete the document record itself (including nested chunks and embeddings)
    await DocumentRepository.delete(id);

    // 3. Log detailed audit event
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Knowledge Delete: Deleted document: "${docTitle}" (ID: ${id}, File Name: ${fileName}, Chunk Count: ${chunkCount}, Embedding Count: ${embeddingCount}, Deleted FAQs: ${deletedFaqCount}, Timestamp: ${timestamp})`,
      String(clientIp)
    );

    res.json({ 
      message: 'Document deleted successfully',
      details: {
        docId: id,
        title: docTitle,
        fileName,
        chunkCount,
        embeddingCount,
        deletedFaqs: deletedFaqCount,
        timestamp
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST retry missing queue elements
router.post('/retry-all', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const docs = await DocumentRepository.getAll();
    let count = 0;
    for (const docObj of docs) {
      if (docObj.aiStatus === 'Retry Required') {
        docObj.aiStatus = 'Pending';
        docObj.aiError = null;
        await DocumentRepository.save(docObj);

        DocumentService.addToAIQueue({
          docId: docObj.id,
          url: docObj.sourceUrl || undefined,
          label: docObj.title,
          category: docObj.category,
          importedBy: docObj.uploadedBy || 'AI Extractor Portal'
        });
        count++;
      }
    }
    res.json({ success: true, count, message: `Successfully re-queued ${count} failed documents.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST retry specific document queue item
router.post('/retry/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  try {
    const docObj = await DocumentRepository.getById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Document not found' });
    }

    docObj.aiStatus = 'Pending';
    docObj.aiError = null;
    await DocumentRepository.save(docObj);

    DocumentService.addToAIQueue({
      docId: docObj.id,
      url: docObj.sourceUrl || undefined,
      label: docObj.title,
      category: docObj.category,
      importedBy: docObj.uploadedBy || 'AI Extractor Portal'
    });

    res.json({ success: true, message: 'Document added back to AI processing queue.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST rebuild complete vector database embeddings
router.post('/rebuild', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    console.log('[Rebuild] Starting full vector database rebuild and cleaning stale knowledge...');
    const docs = await DocumentRepository.getAll();
    const docIds = new Set(docs.map(d => d.id));

    // 1. Clean up orphaned and stale global FAQs (e.g. from deleted documents)
    let deletedFaqCount = 0;
    try {
      const globalFaqs = await FaqsRepository.getAll();
      for (const faq of globalFaqs) {
        const hasSyllabus = faq.question?.toLowerCase().includes('syllabus') || faq.answer?.toLowerCase().includes('syllabus');
        const isSyllabusOrphan = hasSyllabus && !docs.some(d => d.title?.toLowerCase().includes('syllabus') || d.content?.toLowerCase().includes('syllabus'));
        
        const isOrphanedByDocId = faq.documentId && !docIds.has(faq.documentId);

        if (isOrphanedByDocId || isSyllabusOrphan) {
          await FaqsRepository.delete(faq.id);
          deletedFaqCount++;
          console.log(`[Rebuild] Deleted orphaned/stale FAQ: "${faq.question}" (ID: ${faq.id})`);
        }
      }
    } catch (faqErr) {
      console.error('[Rebuild] Failed to clean up global FAQs:', faqErr);
    }

    // 2. Regenerate embeddings for currently available documents only (deleting stale embeddings)
    let regeneratedEmbeddingCount = 0;
    for (const docObj of docs) {
      if (!docObj.chunks || docObj.chunks.length === 0) {
        console.log(`[Rebuild] Skipping document "${docObj.title}" (ID: ${docObj.id}) - no chunks available.`);
        continue;
      }

      console.log(`[Rebuild] Regenerating embeddings for document "${docObj.title}" (Chunks: ${docObj.chunks.length})...`);
      for (const chunk of docObj.chunks) {
        try {
          const vector = await GeminiService.getEmbedding(chunk.text);
          if (vector && vector.length > 0) {
            chunk.embedding = vector;
            regeneratedEmbeddingCount++;
          }
        } catch (embErr) {
          console.error(`[Rebuild] Failed to generate embedding for chunk in document ${docObj.id}:`, embErr);
        }
      }

      // Sync document-level embedding (used for metadata/indexing checks)
      docObj.embedding = (docObj.chunks[0] && docObj.chunks[0].embedding) || [];
      docObj.updatedAt = new Date().toISOString();
      await DocumentRepository.save(docObj);
    }

    // 3. Log administrative audit log
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Knowledge Rebuild: Rebuilt knowledge index. Regenerated ${regeneratedEmbeddingCount} chunk embeddings. Deleted ${deletedFaqCount} orphaned global FAQs.`,
      String(clientIp)
    );

    res.json({ 
      success: true, 
      message: `AI Knowledge Base vectors completely rebuilt successfully! Regenerated ${regeneratedEmbeddingCount} chunk embeddings, cleared ${deletedFaqCount} orphaned FAQs.` 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET public list of all documents (metadata only, no base64) for students
router.get('/public-list', async (req, res) => {
  try {
    const list = await DocumentRepository.getAll();
    const publicList = list.map((d: any) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      category: d.category,
      fileName: d.fileName || d.title,
      size: d.size,
      uploadedAt: d.uploadedAt
    }));
    res.json(publicList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET public single document by ID (including base64 for student viewing)
router.get('/public/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const docObj = await DocumentRepository.getById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(docObj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single document by ID
router.get('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  try {
    const docObj = await DocumentRepository.getById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(docObj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update / edit a document (re-embed & re-index only this document)
router.put('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  const { documentJson } = req.body;

  if (!documentJson) {
    return res.status(400).json({ error: 'documentJson is required.' });
  }

  try {
    let editedObj: any;
    try {
      editedObj = typeof documentJson === 'string' ? JSON.parse(documentJson) : documentJson;
    } catch (parseErr: any) {
      return res.status(400).json({ error: `Invalid JSON format: ${parseErr.message}` });
    }

    const existingDoc = await DocumentRepository.getById(id);
    if (!existingDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Merge and update properties
    let title = editedObj.title || existingDoc.title;
    let category = editedObj.category || existingDoc.category;
    let content = editedObj.content || existingDoc.content || '';

    // If it's a JSON type, let's extract fields from the edited rawJson if the user edited it
    if (existingDoc.type === 'json') {
      existingDoc.rawJson = editedObj;
      title = editedObj.title || title;
      category = editedObj.category || category;
      content = editedObj.content || content;
    }

    existingDoc.title = title;
    existingDoc.category = category;
    existingDoc.content = content;
    existingDoc.summary = editedObj.summary !== undefined ? editedObj.summary : existingDoc.summary;
    existingDoc.faqs = Array.isArray(editedObj.faqs) ? editedObj.faqs : (existingDoc.faqs || []);
    existingDoc.keywords = Array.isArray(editedObj.keywords) ? editedObj.keywords : (existingDoc.keywords || []);
    existingDoc.entities = editedObj.entities || existingDoc.entities || {
      departments: [],
      facultyMembers: [],
      courses: [],
      fees: [],
      contacts: [],
      dates: []
    };
    (existingDoc as any).contactInformation = editedObj.contactInformation || editedObj.contact_information || (existingDoc as any).contactInformation || null;
    existingDoc.metadata = Array.isArray(editedObj.metadata) ? editedObj.metadata : (existingDoc.metadata || []);
    existingDoc.sourceUrl = editedObj.sourceUrl || editedObj.source_url || existingDoc.sourceUrl || null;
    existingDoc.size = `${Math.round(content.length / 102) / 10} KB`;
    existingDoc.updatedAt = new Date().toISOString();

    // Re-index / Re-embed only this document
    console.log(`[Edit Doc] Generating new chunks for updated document: "${title}"`);
    const rawChunks = convertJsonToSearchableChunks(existingDoc);
    const docChunks = rawChunks.map((chunkText: string, idx: number) => ({
      id: `${id}-chunk-${idx}`,
      text: chunkText,
      embedding: [] as number[]
    }));

    console.log(`[Edit Doc] Generating embeddings for ${docChunks.length} chunks...`);
    for (const chunk of docChunks) {
      try {
        const vector = await GeminiService.getEmbedding(chunk.text);
        if (vector && vector.length > 0) {
          chunk.embedding = vector;
        }
      } catch (embErr: any) {
        console.error(`[Edit Doc] Failed to get embedding for chunk:`, embErr.message);
      }
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit safety
    }

    existingDoc.chunks = docChunks;
    existingDoc.embedding = (docChunks[0] && docChunks[0].embedding) || [];

    // Save back to Firestore
    await DocumentRepository.save(existingDoc);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Knowledge Edit: Redesigned/Updated document: "${title}" (ID: ${id})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'Knowledge source updated successfully.', document: existingDoc });
  } catch (err: any) {
    console.error('Failed to edit knowledge document:', err);
    res.status(500).json({ error: `Failed to edit knowledge document: ${err.message}` });
  }
});

export default router;
