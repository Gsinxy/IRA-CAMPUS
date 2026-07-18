import { Router, Response } from 'express';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { OfficialDocumentRepository } from '../repositories/officialDocumentRepository.js';
import { OfficialDocument } from '../../src/types.js';

const router = Router();

// GET all official documents (Admin only)
router.get('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const list = await OfficialDocumentRepository.getAll();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all official documents for students (Public, metadata only for fast list)
router.get('/public-list', async (req, res) => {
  try {
    const list = await OfficialDocumentRepository.getAll();
    const publicList = list.map(d => ({
      documentId: d.documentId,
      title: d.title,
      category: d.category,
      department: d.department,
      programme: d.programme,
      nepVersion: d.nepVersion,
      academicYear: d.academicYear,
      pdfUrl: d.pdfUrl,
      uploadDate: d.uploadDate,
      uploadedBy: d.uploadedBy,
      fileSize: d.fileSize,
      totalPages: d.totalPages
    }));
    res.json(publicList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET public single document by ID (including fileBase64)
router.get('/public/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const docObj = await OfficialDocumentRepository.getById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Official document not found' });
    }
    res.json(docObj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET single official document (Admin only)
router.get('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  try {
    const docObj = await OfficialDocumentRepository.getById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Official document not found' });
    }
    res.json(docObj);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST save/upload official document (Admin only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { title, category, department, programme, nepVersion, academicYear, fileBase64, pdfUrl, fileSize, totalPages, uploadedBy, semester_index, section_index, course_index, nep, total_pages } = req.body;
  
  if (!title || !category || !academicYear) {
    return res.status(400).json({ error: 'Title, Category, and Academic Year are required.' });
  }
  
  const finalDept = department || req.body.department;
  const finalProg = programme || req.body.programme;
  const finalNep = nep || nepVersion || req.body.nepVersion;
  const finalPages = total_pages || totalPages || req.body.totalPages || 1;

  if (category === 'Syllabus' && (!finalDept || !finalProg)) {
    return res.status(400).json({ error: 'Department and Programme are required for Syllabus category.' });
  }

  try {
    const documentId = `doc-off-${Date.now()}`;
    const newDoc: OfficialDocument = {
      documentId,
      title,
      category,
      department: finalDept,
      programme: finalProg,
      nepVersion: finalNep,
      academicYear,
      pdfUrl: pdfUrl || '',
      uploadDate: new Date().toISOString(),
      uploadedBy: uploadedBy || 'Staff Admin',
      fileSize: fileSize || '0 KB',
      totalPages: finalPages,
      fileBase64,
      semester_index: semester_index || undefined,
      section_index: section_index || undefined,
      course_index: course_index || undefined
    };
    
    await OfficialDocumentRepository.save(newDoc);
    res.status(201).json(newDoc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update official document indexes & details (Admin only)
router.put('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  const { title, department, programme, nepVersion, academicYear, semester_index, section_index, course_index, nep, total_pages, totalPages } = req.body;

  try {
    const existingDoc = await OfficialDocumentRepository.getById(id);
    if (!existingDoc) {
      return res.status(404).json({ error: 'Official document not found' });
    }

    const finalDept = department !== undefined ? department : existingDoc.department;
    const finalProg = programme !== undefined ? programme : existingDoc.programme;
    const finalNep = nep !== undefined ? nep : (nepVersion !== undefined ? nepVersion : existingDoc.nepVersion);
    const finalPages = total_pages !== undefined ? total_pages : (totalPages !== undefined ? totalPages : existingDoc.totalPages);

    const updatedDoc: OfficialDocument = {
      ...existingDoc,
      title: title !== undefined ? title : existingDoc.title,
      department: finalDept,
      programme: finalProg,
      nepVersion: finalNep,
      academicYear: academicYear !== undefined ? academicYear : existingDoc.academicYear,
      totalPages: finalPages,
      semester_index: semester_index !== undefined ? semester_index : existingDoc.semester_index,
      section_index: section_index !== undefined ? section_index : existingDoc.section_index,
      course_index: course_index !== undefined ? course_index : existingDoc.course_index
    };

    if ('navigationIndex' in updatedDoc) {
      delete (updatedDoc as any).navigationIndex;
    }

    await OfficialDocumentRepository.save(updatedDoc);
    res.json(updatedDoc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE official document (Admin only)
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  const { id } = req.params;
  try {
    const docObj = await OfficialDocumentRepository.getMetadataById(id);
    if (!docObj) {
      return res.status(404).json({ error: 'Official document not found' });
    }
    await OfficialDocumentRepository.delete(id);
    res.json({ success: true, message: `Successfully deleted official document "${docObj.title}"` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
