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

  // Implement semester normalization map for I-VIII
  const semesterRules = [
    { regex: /\b(?:1st|first|1|i)\s*(?:semester|sem)\b/gi, canonical: 'semester 1' },
    { regex: /\b(?:semester|sem)\s*(?:1st|first|1|i)\b/gi, canonical: 'semester 1' },

    { regex: /\b(?:2nd|second|2|ii)\s*(?:semester|sem)\b/gi, canonical: 'semester 2' },
    { regex: /\b(?:semester|sem)\s*(?:2nd|second|2|ii)\b/gi, canonical: 'semester 2' },

    { regex: /\b(?:3rd|third|3|iii)\s*(?:semester|sem)\b/gi, canonical: 'semester 3' },
    { regex: /\b(?:semester|sem)\s*(?:3rd|third|3|iii)\b/gi, canonical: 'semester 3' },

    { regex: /\b(?:4th|fourth|4|iv)\s*(?:semester|sem)\b/gi, canonical: 'semester 4' },
    { regex: /\b(?:semester|sem)\s*(?:4th|fourth|4|iv)\b/gi, canonical: 'semester 4' },

    { regex: /\b(?:5th|fifth|5|v)\s*(?:semester|sem)\b/gi, canonical: 'semester 5' },
    { regex: /\b(?:semester|sem)\s*(?:5th|fifth|5|v)\b/gi, canonical: 'semester 5' },

    { regex: /\b(?:6th|sixth|6|vi)\s*(?:semester|sem)\b/gi, canonical: 'semester 6' },
    { regex: /\b(?:semester|sem)\s*(?:6th|sixth|6|vi)\b/gi, canonical: 'semester 6' },

    { regex: /\b(?:7th|seventh|7|vii)\s*(?:semester|sem)\b/gi, canonical: 'semester 7' },
    { regex: /\b(?:semester|sem)\s*(?:7th|seventh|7|vii)\b/gi, canonical: 'semester 7' },

    { regex: /\b(?:8th|eighth|8|viii)\s*(?:semester|sem)\b/gi, canonical: 'semester 8' },
    { regex: /\b(?:semester|sem)\s*(?:8th|eighth|8|viii)\b/gi, canonical: 'semester 8' },
  ];

  for (const rule of semesterRules) {
    res = res.replace(rule.regex, rule.canonical);
  }

  // Ignore/remove specific terms: "syllabus", "course", "paper", "show", "give", "explain", "details", "pdf", "subject"
  const ignoreTerms = ["syllabus", "course", "paper", "show", "give", "explain", "details", "pdf", "subject"];
  for (const term of ignoreTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    res = res.replace(regex, ' ');
  }

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
  console.log(`\n=== [RUNTIME DEBUGGING TRACE FOR NAVIGATION INDEX] ===`);
  
  // [STEP 1] Raw query received
  console.log(`[STEP 1] Raw query received: "${query}"`);

  // [STEP 2] Query after normalization
  const normQuery = canonicalNormalize(query);
  console.log(`[STEP 2] Query after normalization: "${normQuery}"`);

  // [STEP 3] Total syllabus documents loaded from Firestore
  console.log(`[STEP 3] Total syllabus documents loaded from Firestore: ${documents.length}`);

  // [STEP 4] Economics document found? (true/false)
  const hasEconomicsDoc = documents.some(doc => {
    const titleMatch = doc.title && /economics/i.test(doc.title);
    const deptMatch = doc.department && /economics/i.test(doc.department);
    return titleMatch || deptMatch;
  });
  console.log(`[STEP 4] Economics document found? ${hasEconomicsDoc}`);

  // Compute counts for STEPS 5, 6, 7
  let totalSemCount = 0;
  let totalSecCount = 0;
  let totalCourseCount = 0;

  for (const doc of documents) {
    if (doc.semester_index && typeof doc.semester_index === 'object') {
      totalSemCount += Object.keys(doc.semester_index).length;
    }
    if (doc.section_index && typeof doc.section_index === 'object') {
      totalSecCount += Object.keys(doc.section_index).length;
    }
    if (doc.course_index && Array.isArray(doc.course_index)) {
      totalCourseCount += doc.course_index.length;
    }
  }

  // [STEP 5] semester_index count
  console.log(`[STEP 5] semester_index count: ${totalSemCount}`);
  // [STEP 6] section_index count
  console.log(`[STEP 6] section_index count: ${totalSecCount}`);
  // [STEP 7] course_index count
  console.log(`[STEP 7] course_index count: ${totalCourseCount}`);

  let semesterMatchFound = false;
  let courseMatchFound = false;
  let sectionMatchFound = false;
  let matchedObj: any = null;
  let finalResult: any = null;

  // Search course_index
  for (const doc of documents) {
    if (doc.course_index && Array.isArray(doc.course_index)) {
      for (const item of doc.course_index) {
        if (item && item.course) {
          const normCourse = canonicalNormalize(item.course);
          if (isMatch(normQuery, normCourse)) {
            courseMatchFound = true;
            matchedObj = item;
            finalResult = {
              document: doc,
              matchedItem: {
                title: item.course,
                startPage: item.start_page,
                endPage: item.end_page,
                type: 'course',
                semester: item.semester
              }
            };
            break;
          }
        }
      }
    }
    if (finalResult) break;
  }

  // Search semester_index (if course_index match not found yet)
  if (!finalResult) {
    for (const doc of documents) {
      if (doc.semester_index && typeof doc.semester_index === 'object') {
        for (const [semName, value] of Object.entries(doc.semester_index)) {
          if (value && typeof value === 'object') {
            const val = value as any;
            const normSem = canonicalNormalize(semName);
            if (isMatch(normQuery, normSem)) {
              semesterMatchFound = true;
              matchedObj = { semName, ...val };
              finalResult = {
                document: doc,
                matchedItem: {
                  title: semName,
                  startPage: val.start_page,
                  endPage: val.end_page,
                  type: 'semester'
                }
              };
              break;
            }
          }
        }
      }
      if (finalResult) break;
    }
  }

  // Search section_index (if match not found yet)
  if (!finalResult) {
    for (const doc of documents) {
      if (doc.section_index && typeof doc.section_index === 'object') {
        for (const [secName, value] of Object.entries(doc.section_index)) {
          if (value && typeof value === 'object') {
            const val = value as any;
            const normSec = canonicalNormalize(secName);
            if (isMatch(normQuery, normSec)) {
              sectionMatchFound = true;
              matchedObj = { secName, ...val };
              finalResult = {
                document: doc,
                matchedItem: {
                  title: secName,
                  startPage: val.start_page,
                  endPage: val.end_page,
                  type: 'section'
                }
              };
              break;
            }
          }
        }
      }
      if (finalResult) break;
    }
  }

  // [STEP 8] Semester match found? (true/false)
  console.log(`[STEP 8] Semester match found? ${semesterMatchFound}`);

  // [STEP 9] Course match found? (true/false)
  console.log(`[STEP 9] Course match found? ${courseMatchFound}`);

  // [STEP 10] Section match found? (true/false)
  console.log(`[STEP 10] Section match found? ${sectionMatchFound}`);

  // [STEP 11] Matched object JSON
  console.log(`[STEP 11] Matched object JSON: ${matchedObj ? JSON.stringify(matchedObj) : 'null'}`);

  // [STEP 12] startPage and endPage
  if (matchedObj) {
    const sPage = matchedObj.start_page !== undefined ? matchedObj.start_page : (matchedObj.startPage || -1);
    const ePage = matchedObj.end_page !== undefined ? matchedObj.end_page : (matchedObj.endPage || -1);
    console.log(`[STEP 12] startPage and endPage: ${sPage} and ${ePage}`);
  } else {
    console.log(`[STEP 12] startPage and endPage: N/A`);
  }

  // [STEP 13] pdfNavigation returned? (true/false)
  const pdfNavigationReturned = !!finalResult;
  console.log(`[STEP 13] pdfNavigation returned? ${pdfNavigationReturned}`);

  // [STEP 14] Fallback PDF search used? (true/false)
  const fallbackUsed = !finalResult;
  console.log(`[STEP 14] Fallback PDF search used? ${fallbackUsed}`);
  console.log(`=== END OF RUNTIME DEBUGGING TRACE ===\n`);

  return finalResult;
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
        // STEP 1: Extract from the user query
        const depts = [
          "Economics", "Commerce", "Physics", "Chemistry", "Mathematics", 
          "Political Science", "History", "English", "Odia", "Botany", 
          "Zoology", "Computer Science"
        ];
        
        // Setup alias mapping to standard department name
        const deptAliases: Record<string, string> = {
          "economics": "Economics",
          "eco": "Economics",
          "commerce": "Commerce",
          "com": "Commerce",
          "physics": "Physics",
          "phy": "Physics",
          "chemistry": "Chemistry",
          "chem": "Chemistry",
          "mathematics": "Mathematics",
          "maths": "Mathematics",
          "math": "Mathematics",
          "political science": "Political Science",
          "pol science": "Political Science",
          "pol. science": "Political Science",
          "pol sci": "Political Science",
          "history": "History",
          "english": "English",
          "eng": "English",
          "odia": "Odia",
          "botany": "Botany",
          "zoology": "Zoology",
          "computer science": "Computer Science",
          "comp science": "Computer Science",
          "comp. science": "Computer Science",
          "cs": "Computer Science"
        };

        let extractedDept: string | undefined = undefined;
        // Check for alias matching
        const sortedAliasKeys = Object.keys(deptAliases).sort((a, b) => b.length - a.length);
        for (const key of sortedAliasKeys) {
          const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          if (new RegExp(`\\b${escapedKey}\\b`, 'i').test(message)) {
            extractedDept = deptAliases[key];
            break;
          }
        }

        // Extract programme
        let extractedProg: 'UG' | 'PG' | undefined = undefined;
        if (/\b(?:ug|undergraduate|bachelors|b\.?sc|b\.?a|b\.?com)\b/i.test(message)) {
          extractedProg = 'UG';
        } else if (/\b(?:pg|postgraduate|masters|m\.?sc|m\.?a|m\.?com)\b/i.test(message)) {
          extractedProg = 'PG';
        }

        // Extract semester
        let extractedSem: string | undefined = undefined;
        const semRegex = /\b(?:semester|sem)\s*(\d+|[ivx]+)\b/i;
        const semMatch = message.match(semRegex);
        const ordinalSemRegex = /\b(\d+)(?:st|nd|rd|th)\s*(?:semester|sem)\b/i;
        const ordinalMatch = message.match(ordinalSemRegex);
        const wordSemRegex = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth)\s*(?:semester|sem)\b/i;
        const wordMatch = message.match(wordSemRegex);

        const wordToNum: Record<string, string> = {
          'first': '1', 'second': '2', 'third': '3', 'fourth': '4', 'fifth': '5', 'sixth': '6', 'seventh': '7', 'eighth': '8'
        };

        const romanMap: Record<string, string> = {
          '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII',
          'I': 'I', 'II': 'II', 'III': 'III', 'IV': 'IV', 'V': 'V', 'VI': 'VI', 'VII': 'VII', 'VIII': 'VIII'
        };

        if (semMatch) {
          const val = semMatch[1].toUpperCase();
          extractedSem = romanMap[val] || val;
        } else if (ordinalMatch) {
          const val = ordinalMatch[1];
          extractedSem = romanMap[val] || val;
        } else if (wordMatch) {
          const val = wordToNum[wordMatch[1].toLowerCase()];
          extractedSem = romanMap[val] || val;
        }

        // Extract course if present
        let extractedCourse: string | undefined = undefined;
        const paperRegex = /\b(?:paper)\s*(\d+|[ivx]+)\b/i;
        const paperMatch = message.match(paperRegex);
        if (paperMatch) {
          const val = paperMatch[1].toUpperCase();
          const mapped = romanMap[val] || val;
          extractedCourse = `Paper ${mapped}`;
        }

        // STEP 2: Load all official syllabus documents
        const syllabusDocs = allOfficialDocs.filter(d => d.category === 'Syllabus');

        // STEP 3 & STEP 5: Identify the target department
        let targetDepartment = extractedDept || studentProfile?.department;
        let isFallbackToProfile = !extractedDept && !!studentProfile?.department;

        // STEP 6: If multiple documents match, prefer: 1. exact department, 2. exact programme, 3. latest academic year
        let filteredDocs = syllabusDocs;
        if (targetDepartment) {
          filteredDocs = syllabusDocs.filter(d => d.department?.toLowerCase() === targetDepartment!.toLowerCase());
        }

        const targetProg = extractedProg || studentProfile?.programme;

        const sortedDocs = [...filteredDocs].sort((a, b) => {
          // 1. Exact department match
          const aDeptMatch = targetDepartment && a.department?.toLowerCase() === targetDepartment.toLowerCase() ? 1 : 0;
          const bDeptMatch = targetDepartment && b.department?.toLowerCase() === targetDepartment.toLowerCase() ? 1 : 0;
          if (aDeptMatch !== bDeptMatch) {
            return bDeptMatch - aDeptMatch;
          }

          // 2. Exact programme match
          const aProgMatch = targetProg && a.programme === targetProg ? 1 : 0;
          const bProgMatch = targetProg && b.programme === targetProg ? 1 : 0;
          if (aProgMatch !== bProgMatch) {
            return bProgMatch - aProgMatch;
          }

          // 3. Latest academic year
          const aYear = a.academicYear || '';
          const bYear = b.academicYear || '';
          if (aYear !== bYear) {
            return bYear.localeCompare(aYear); // e.g. "2023-24" > "2022-23"
          }

          return 0;
        });

        bestDoc = sortedDocs[0] || null;

        // Add debug logs required by Requirement 4
        console.log(`[DEPT ROUTING] Detected department: ${extractedDept || 'None (Using student profile fallback)'}`);
        console.log(`[DEPT ROUTING] Matched Firestore document: ${bestDoc ? 'Yes' : 'No'}`);
        if (bestDoc) {
          console.log(`[DEPT ROUTING] Document ID: ${bestDoc.documentId}`);
          console.log(`[DEPT ROUTING] Document title: ${bestDoc.title}`);
          console.log(`[DEPT ROUTING] Department metadata: ${bestDoc.department || 'None'}`);
          
          let reason = '';
          if (extractedDept) {
            reason += `Extracted department "${extractedDept}" from user query. `;
          } else if (studentProfile?.department) {
            reason += `Fell back to student profile department "${studentProfile.department}". `;
          } else {
            reason += `No department mentioned or found in student profile. `;
          }

          if (targetProg) {
            if (bestDoc.programme === targetProg) {
              reason += `Matched target programme "${targetProg}". `;
            } else {
              reason += `No document with target programme "${targetProg}" found; selected available programme. `;
            }
          }
          
          reason += `Selected latest academic year document: "${bestDoc.academicYear}".`;
          console.log(`[DEPT ROUTING] Reason this document was selected: ${reason}`);
        }

        // STEP 4: Only after the correct department document has been selected should the server search
        if (bestDoc) {
          const navMatch = tryNavigationIndexMatch(message, [bestDoc]);
          if (navMatch) {
            matchedItem = navMatch.matchedItem;
            console.log(`[DEBUG LOG] Fallback PDF search was used: No (Precise navigation index matched successfully: "${matchedItem.title}")`);
          } else {
            console.log(`[DEBUG LOG] Fallback PDF search was used: Yes (No navigation index match. Retrying fallback search.)`);
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

        let sseLogAccumulator = '';
        const words = finalResponse.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const chunk = words.slice(i, i + 3).join(' ') + ' ';
          const chunkData = `data: ${JSON.stringify({ text: chunk })}\n\n`;
          sseLogAccumulator += chunkData;
          res.write(chunkData);
          await new Promise(resolve => setTimeout(resolve, 30));
        }

        const doneChunk = `data: ${JSON.stringify({ done: true, citations: [], pdfNavigation })}\n\n`;
        sseLogAccumulator += doneChunk;
        res.write(doneChunk);
        
        console.log(`[DEBUG LOG] FULL API response sent to the frontend:\n${sseLogAccumulator}`);
        res.end();
        return;
      } else {
        console.log(`[Chat Route] No matching official document found for category "${category}". Gracefully falling back to standard RAG.`);
      }
    } catch (err: any) {
      console.error('[Official Doc Search Error]', err);
    }
  }

  console.log('[DEBUG LOG] Fallback PDF search was used: Yes (Falling back to standard semantic RAG search)');

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
