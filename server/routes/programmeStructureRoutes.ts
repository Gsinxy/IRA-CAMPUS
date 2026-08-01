import { Router, Response } from 'express';
import { ProgrammeStructureRepository } from '../repositories/programmeStructureRepository.js';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { callGeminiDirect, ocrMultimodal } from '../services/geminiService.js';
import { ProgrammeStructure } from '../../src/types.js';

const router = Router();

// GET all programme structures
router.get('/', async (req, res: Response) => {
  try {
    const list = await ProgrammeStructureRepository.getAll();
    res.json(list || []);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load programme structures: ${err.message}` });
  }
});

// GET lookup by department and semester
router.get('/lookup', async (req, res: Response) => {
  try {
    const { department, semester, programme } = req.query;
    if (!department || !semester) {
      return res.status(400).json({ error: 'department and semester are required query parameters' });
    }
    const item = await ProgrammeStructureRepository.getByDeptAndSemester(
      String(department),
      String(semester),
      programme ? String(programme) : undefined
    );
    if (!item) {
      return res.status(404).json({ error: 'Programme structure not found for specified department and semester' });
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: `Lookup failed: ${err.message}` });
  }
});

// POST Extract JSON with AI (Admin Only)
router.post('/extract-ai', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { fileBase64, mimeType, textContent, department, programme, semester } = req.body;

    if (!fileBase64 && !textContent) {
      return res.status(400).json({ error: 'Please provide either a PDF file (fileBase64) or text content to extract JSON.' });
    }

    const deptStr = department || 'General';
    const progStr = programme || 'UG';
    const semStr = semester || 'Semester I';

    const promptText = `
You are an expert AI academic registrar. Analyze the provided syllabus text/document for Department: "${deptStr}", Programme: "${progStr}", Semester: "${semStr}".
Extract the complete semester programme structure and return a JSON object strictly following this format:
{
  "department": "${deptStr}",
  "programme": "${progStr}",
  "semester": "${semStr}",
  "title": "${deptStr} ${progStr} ${semStr}",
  "keywords": [
    "${deptStr.toLowerCase()} ${semStr.toLowerCase()}",
    "${semStr.toLowerCase()}",
    "subjects",
    "course structure"
  ],
  "content": {
    "corePapers": [
      { "paperNumber": "Paper V", "courseName": "Name of course paper" }
    ],
    "minor": ["Minor course name"],
    "sec": ["Skill enhancement course name"],
    "vac": ["Value added course name"],
    "aec": ["Ability enhancement course name"],
    "mdc": ["Multidisciplinary course name"]
  }
}

Return ONLY valid raw JSON with no markdown formatting or commentary.
`;

    let rawOutput = '';
    if (fileBase64 && mimeType) {
      rawOutput = await ocrMultimodal(fileBase64, mimeType, promptText);
    } else {
      const response = await callGeminiDirect([
        { role: 'user', content: `${promptText}\n\nDOCUMENT TEXT:\n${textContent}` }
      ], { responseFormatJson: true });
      rawOutput = response.text;
    }

    if (!rawOutput) {
      return res.status(500).json({ error: 'AI failed to generate extraction output. Please try again or check API keys.' });
    }

    // Clean JSON response
    let cleaned = rawOutput.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (parseErr: any) {
      console.warn('AI Output was not strictly valid JSON:', cleaned);
      return res.status(500).json({ 
        error: `Failed to parse AI output as valid JSON: ${parseErr.message}`,
        rawOutput: cleaned 
      });
    }

    res.json({ success: true, extractedJson: parsedJson });
  } catch (err: any) {
    console.error('Extract AI error:', err);
    res.status(500).json({ error: `Extract JSON with AI failed: ${err.message}` });
  }
});

// GET single by ID
router.get('/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    const item = await ProgrammeStructureRepository.getById(id);
    if (!item) {
      return res.status(404).json({ error: 'Programme structure not found' });
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST save/update programme structure (Admin Only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const data: ProgrammeStructure = req.body;
    
    if (!data.department || !data.semester) {
      return res.status(400).json({ error: 'Department and Semester are required fields.' });
    }

    const deptClean = data.department.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    const progClean = (data.programme || 'ug').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    const semClean = data.semester.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');

    // Store exactly ONE JSON document for each Department + Programme + Semester
    // Example Document ID: economics_ug_semester_iii
    const docId = `${deptClean}_${progClean}_${semClean}`;

    const nowStr = new Date().toISOString();
    const updatedStructure: ProgrammeStructure = {
      ...data,
      id: docId,
      department: data.department.trim(),
      programme: (data.programme || 'UG').trim(),
      semester: data.semester.trim(),
      title: data.title || `${data.department} ${data.programme || 'UG'} ${data.semester}`,
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      content: data.content && typeof data.content === 'object' ? data.content : {},
      updatedAt: nowStr,
      updatedBy: req.admin?.email || 'Admin'
    };

    await ProgrammeStructureRepository.save(updatedStructure);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Saved/Updated Knowledge JSON for ${data.department} (${data.semester}) [Doc ID: ${docId}]`,
      String(clientIp)
    );

    res.status(200).json({ success: true, programmeStructure: updatedStructure });
  } catch (err: any) {
    console.error('Failed to save programme structure:', err);
    res.status(500).json({ error: `Failed to save programme structure: ${err.message}` });
  }
});

// DELETE programme structure (Admin Only)
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await ProgrammeStructureRepository.getById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Programme structure not found' });
    }

    await ProgrammeStructureRepository.delete(id);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Deleted Programme Structure for ${existing.department} (${existing.semester})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'Programme structure deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete programme structure: ${err.message}` });
  }
});

export default router;
