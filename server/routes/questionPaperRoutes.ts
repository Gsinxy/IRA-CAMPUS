import { Router, Request, Response } from 'express';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { db, storage, setDoc } from '../firebase.js';
import { collection, doc, getDocs, getDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { QuestionPaper } from '../../src/types.js';

const router = Router();

// Sample seed data to ensure instant student utility
const SAMPLE_QUESTION_PAPERS: Partial<QuestionPaper>[] = [
  {
    department: 'Economics',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper V',
    course: 'Microeconomics I',
    year: '2025',
    examType: 'Regular',
    fileName: 'Economics_Sem3_PaperV_Microeconomics_I_2025.pdf',
    keywords: ['Economics', 'Semester III', 'Microeconomics I', 'Paper V', '2025 Question Paper', 'Regular']
  },
  {
    department: 'Economics',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper V',
    course: 'Microeconomics I',
    year: '2024',
    examType: 'Regular',
    fileName: 'Economics_Sem3_PaperV_Microeconomics_I_2024.pdf',
    keywords: ['Economics', 'Semester III', 'Microeconomics I', 'Paper V', '2024 Question Paper', 'Regular']
  },
  {
    department: 'Economics',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper VI',
    course: 'Macroeconomics I',
    year: '2025',
    examType: 'Regular',
    fileName: 'Economics_Sem3_PaperVI_Macroeconomics_I_2025.pdf',
    keywords: ['Economics', 'Semester III', 'Macroeconomics I', 'Paper VI', '2025 Question Paper', 'Regular']
  },
  {
    department: 'Economics',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper VI',
    course: 'Macroeconomics I',
    year: '2024',
    examType: 'Regular',
    fileName: 'Economics_Sem3_PaperVI_Macroeconomics_I_2024.pdf',
    keywords: ['Economics', 'Semester III', 'Macroeconomics I', 'Paper VI', '2024 Question Paper', 'Regular']
  },
  {
    department: 'Economics',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper VII',
    course: 'Mathematical Methods for Economics I',
    year: '2024',
    examType: 'Regular',
    fileName: 'Economics_Sem3_PaperVII_Mathematical_Methods_2024.pdf',
    keywords: ['Economics', 'Semester III', 'Mathematical Methods for Economics I', 'Paper VII', '2024 Question Paper', 'Regular']
  },
  {
    department: 'Computer Science',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper V',
    course: 'Data Structures & Algorithms',
    year: '2025',
    examType: 'Regular',
    fileName: 'CS_Sem3_PaperV_DSA_2025.pdf',
    keywords: ['Computer Science', 'Semester III', 'Data Structures & Algorithms', 'Paper V', '2025 Question Paper', 'Regular']
  },
  {
    department: 'History',
    programme: 'UG',
    semester: 'Semester III',
    paper: 'Paper V',
    course: 'History of India (c. 1200 - 1707)',
    year: '2024',
    examType: 'Regular',
    fileName: 'History_Sem3_PaperV_History_of_India_2024.pdf',
    keywords: ['History', 'Semester III', 'History of India', 'Paper V', '2024 Question Paper', 'Regular']
  }
];

// Helper to seed sample papers if database is empty
async function seedDefaultQuestionPapersIfEmpty() {
  try {
    const snap = await getDocs(collection(db, 'question_papers'));
    if (snap.empty) {
      console.log('[QuestionPaper] Seeding default sample question papers...');
      for (let i = 0; i < SAMPLE_QUESTION_PAPERS.length; i++) {
        const item = SAMPLE_QUESTION_PAPERS[i];
        const deptSlug = (item.department || 'dept').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const semSlug = (item.semester || 'sem').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const paperSlug = (item.paper || 'paper').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const yearSlug = item.year || '2025';
        const docId = `qp_${deptSlug}_${semSlug}_${paperSlug}_${yearSlug}_${i + 1}`;

        const paperDoc: QuestionPaper = {
          id: docId,
          department: item.department || 'Economics',
          programme: item.programme || 'UG',
          semester: item.semester || 'Semester III',
          paper: item.paper || 'Paper V',
          course: item.course || 'Course Name',
          year: item.year || '2025',
          examType: item.examType || 'Regular',
          fileName: item.fileName,
          pdfUrl: '',
          isLegacy: true,
          keywords: item.keywords || [item.department!, item.semester!, item.course!, item.paper!, `${item.year} Question Paper`],
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'System Auto-Seed'
        };

        await setDoc(doc(db, 'question_papers', docId), paperDoc);
      }
      console.log('[QuestionPaper] Successfully seeded initial question papers.');
    }
  } catch (err: any) {
    console.warn('[QuestionPaper] Auto-seed note:', err.message);
  }
}

// Deprecated local file route - redirects to Firebase Storage URL if available
router.get('/file/:docId', async (req: Request, res: Response) => {
  try {
    const rawDocId = req.params.docId;
    const docId = rawDocId.endsWith('.pdf') ? rawDocId.slice(0, -4) : rawDocId;

    const docRef = doc(db, 'question_papers', docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.pdfUrl && data.pdfUrl.startsWith('https://firebasestorage')) {
        return res.redirect(data.pdfUrl);
      }
    }

    return res.status(404).json({
      error: 'Question paper PDF file not found. Local server storage is disabled. Please re-upload this paper to Firebase Storage.'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve question paper file.' });
  }
});

// GET all question papers (Public with optional filters)
router.get('/', async (req, res: Response) => {
  try {
    await seedDefaultQuestionPapersIfEmpty();
    const snap = await getDocs(collection(db, 'question_papers'));
    let list: QuestionPaper[] = [];
    snap.forEach(d => {
      const item = d.data() as QuestionPaper;
      const url = item.pdfUrl || '';
      const isLegacyRecord = !url || url.includes('/api/question-papers/file/') || url.includes('localhost') || !url.startsWith('https://');
      
      list.push({
        ...item,
        pdfUrl: url,
        isLegacy: isLegacyRecord
      });
    });

    const { department, programme, semester, year } = req.query;

    if (department && typeof department === 'string' && department !== 'All') {
      list = list.filter(item => item.department.toLowerCase() === department.toLowerCase());
    }
    if (programme && typeof programme === 'string' && programme !== 'All') {
      list = list.filter(item => item.programme.toLowerCase() === programme.toLowerCase());
    }
    if (semester && typeof semester === 'string' && semester !== 'All') {
      list = list.filter(item => item.semester.toLowerCase() === semester.toLowerCase());
    }
    if (year && typeof year === 'string' && year !== 'All') {
      list = list.filter(item => item.year === year);
    }

    // Sort by department, semester, paper number, and year descending
    list.sort((a, b) => {
      if (a.department !== b.department) return a.department.localeCompare(b.department);
      if (a.semester !== b.semester) return a.semester.localeCompare(b.semester);
      if (a.paper !== b.paper) return a.paper.localeCompare(b.paper);
      return b.year.localeCompare(a.year);
    });

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load question papers: ${err.message}` });
  }
});

// GET single question paper
router.get('/public/:id', async (req, res: Response) => {
  try {
    const { id } = req.params;
    const docRef = doc(db, 'question_papers', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ error: 'Question paper not found.' });
    }
    const data = snap.data() as QuestionPaper;
    const url = data.pdfUrl || '';
    const isLegacyRecord = !url || url.includes('/api/question-papers/file/') || url.includes('localhost') || !url.startsWith('https://');

    res.json({
      ...data,
      isLegacy: isLegacyRecord
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch question paper: ${err.message}` });
  }
});

// POST upload/create question paper (Admin Only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const department = req.body.department;
    const programme = req.body.programme;
    const semester = req.body.semester;
    const paper = req.body.paper || req.body.paperNumber;
    const course = req.body.course || req.body.courseName;
    const year = req.body.year || req.body.examYear;
    const examType = req.body.examType;
    const fileBase64 = req.body.fileBase64;
    const fileName = req.body.fileName;
    const keywords = req.body.keywords;
    const uploadedBy = req.body.uploadedBy;

    if (!department || !programme || !semester || !paper || !course || !year || !examType) {
      return res.status(400).json({
        error: 'Department, Programme, Semester, Paper Number, Course Name, Year, and Exam Type are required.'
      });
    }

    const deptClean = department.trim();
    const progClean = programme.trim();
    const semClean = semester.trim();
    const paperClean = paper.trim();
    const courseClean = course.trim();
    const yearClean = year.trim();
    const examTypeClean = examType.trim();

    const deptSlug = deptClean.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const semSlug = semClean.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const paperSlug = paperClean.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const courseSlug = courseClean.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const yearSlug = yearClean.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const typeSlug = examTypeClean.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const docId = `qp_${deptSlug}_${semSlug}_${paperSlug}_${courseSlug}_${yearSlug}_${typeSlug}_${Date.now()}`;

    let cleanBase64 = '';
    let pdfUrl = req.body.pdfUrl || '';

    // If client already uploaded directly to Firebase Storage and passed HTTPS pdfUrl
    if (pdfUrl && typeof pdfUrl === 'string' && pdfUrl.startsWith('https://')) {
      console.log("Upload successful");
      console.log("Storage URL");
      console.log(pdfUrl);
    } else {
      if (!fileBase64 || typeof fileBase64 !== 'string') {
        return res.status(400).json({ error: 'PDF file is required for question paper creation.' });
      }

      if (fileBase64.startsWith('data:')) {
        const parts = fileBase64.split(';base64,');
        cleanBase64 = parts[1] || parts[0];
      } else {
        cleanBase64 = fileBase64;
      }

      if (!cleanBase64.trim()) {
        return res.status(400).json({ error: 'PDF upload failed. Invalid or empty PDF content.' });
      }

      if (!storage) {
        return res.status(500).json({ error: 'Firebase Storage instance is not initialized. Unable to store PDF.' });
      }

      try {
        const buffer = Buffer.from(cleanBase64, 'base64');
        const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        
        // Exact specified Storage path format: question_papers/{department}/{semester}/{paper}/{year}.pdf
        const storagePath = `question_papers/${deptSlug}/${semSlug}/${paperSlug}/${yearSlug}.pdf`;
        const fileRef = ref(storage, storagePath);

        let downloadURL = '';
        try {
          await uploadBytes(fileRef, uint8Array, { contentType: 'application/pdf' });
          downloadURL = await getDownloadURL(fileRef);
          console.log("Upload successful");
          console.log("Storage URL");
          console.log(downloadURL);
        } catch (stgErr: any) {
          console.warn('[QuestionPaper Storage Notice]: Firebase Cloud Storage bucket unprovisioned or unavailable. Storing persistent Data URI in Firestore:', stgErr?.message || stgErr);
          downloadURL = `data:application/pdf;base64,${cleanBase64}`;
        }

        pdfUrl = downloadURL;
      } catch (stgErr: any) {
        console.error('[QuestionPaper Storage Error]:', stgErr?.message || stgErr);
        return res.status(500).json({ error: `Firebase Storage upload failed: ${stgErr?.message || 'Storage error'}` });
      }
    }

    if (!pdfUrl || typeof pdfUrl !== 'string' || (!pdfUrl.startsWith('http') && !pdfUrl.startsWith('data:'))) {
      return res.status(500).json({ error: 'PDF storage failed. Valid HTTPS pdfUrl or Data URI required.' });
    }

    // Build keywords
    let keywordList: string[] = [];
    if (Array.isArray(keywords)) {
      keywordList = keywords.map(k => String(k).trim()).filter(Boolean);
    } else if (typeof keywords === 'string' && keywords.trim()) {
      keywordList = keywords.split(',').map(k => k.trim()).filter(Boolean);
    }

    const defaultKeywords = [
      deptClean,
      progClean,
      semClean,
      paperClean,
      courseClean,
      yearClean,
      examTypeClean,
      `${deptClean} ${semClean}`,
      `${courseClean} Question Paper`,
      `${paperClean} ${yearClean}`
    ];

    defaultKeywords.forEach(kw => {
      if (!keywordList.includes(kw)) {
        keywordList.push(kw);
      }
    });

    const newPaper: Record<string, any> = {
      id: docId,
      department: deptClean,
      programme: progClean,
      semester: semClean,
      paper: paperClean,
      course: courseClean,
      year: yearClean,
      examType: examTypeClean,
      pdfUrl: pdfUrl,
      fileName: fileName || `${deptSlug}_${semSlug}_${paperSlug}_${yearClean}.pdf`,
      keywords: keywordList,
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || req.admin?.email || 'Admin',
      isLegacy: false
    };

    console.log("Download URL:");
    console.log(pdfUrl);

    await setDoc(doc(db, 'question_papers', docId), newPaper);

    console.log("Saved Firestore document:");
    console.log(newPaper);

    res.status(201).json({
      message: 'Question Paper created successfully.',
      questionPaper: newPaper
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save question paper: ${err.message}` });
  }
});

// DELETE question paper (Admin Only)
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const docRef = doc(db, 'question_papers', id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({ error: 'Question paper document not found.' });
    }

    const data = snap.data() as QuestionPaper;

    // Remove from storage if pdfUrl exists and is in Firebase Storage
    if (data.pdfUrl && data.pdfUrl.includes('firebasestorage')) {
      try {
        const fileRef = ref(storage, data.pdfUrl);
        await deleteObject(fileRef);
        console.log('[QuestionPaper] Deleted Firebase Storage object for:', data.pdfUrl);
      } catch (e: any) {
        console.warn('[QuestionPaper] Storage delete notice:', e?.message || e);
      }
    }

    await deleteDoc(docRef);
    res.json({ message: 'Question paper deleted successfully.', id });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete question paper: ${err.message}` });
  }
});

export default router;
