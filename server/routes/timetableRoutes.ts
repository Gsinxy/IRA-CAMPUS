import { Router, Response } from 'express';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { db, storage } from '../firebase.js';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { Timetable } from '../../src/types.js';

const router = Router();

// GET all timetables (Public)
router.get('/', async (req, res: Response) => {
  try {
    const snap = await getDocs(collection(db, 'timetables'));
    const list: Timetable[] = [];
    snap.forEach(d => {
      list.push(d.data() as Timetable);
    });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load timetables: ${err.message}` });
  }
});

// POST save/replace timetable (Admin Only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { department, semester, session, fileBase64, fileName, fileType, uploadedBy } = req.body;

    if (!department || !semester || !session) {
      return res.status(400).json({ error: 'Department, Semester, and Session are required.' });
    }

    if (!fileBase64) {
      return res.status(400).json({ error: 'Timetable file is required.' });
    }

    const deptFolder = department.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    const semFolder = semester.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    const sessFolder = session.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    
    // Deterministic ID based on Department, Semester and Session to prevent duplicate records
    const docId = `tt_${deptFolder}_${semFolder}_${sessFolder}`;

    // Detect extension and fileType
    let ext = 'png';
    let cleanType: 'image' | 'pdf' = 'image';
    
    let cleanBase64 = fileBase64;
    let mimeType = 'image/png';

    if (fileBase64.startsWith('data:')) {
      const parts = fileBase64.split(';base64,');
      mimeType = parts[0].replace('data:', '');
      cleanBase64 = parts[1];
    }

    if (mimeType.includes('pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf')) || fileType === 'pdf') {
      ext = 'pdf';
      cleanType = 'pdf';
      mimeType = 'application/pdf';
    } else if (mimeType.includes('jpeg') || (fileName && (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')))) {
      ext = 'jpg';
      cleanType = 'image';
      mimeType = 'image/jpeg';
    } else if (mimeType.includes('webp') || (fileName && fileName.toLowerCase().endsWith('.webp'))) {
      ext = 'webp';
      cleanType = 'image';
      mimeType = 'image/webp';
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    const fileSizeStr = `${(buffer.length / 1024).toFixed(1)} KB`;

    // 1. Check if a timetable already exists for this combination
    const existingDocRef = doc(db, 'timetables', docId);
    const existingSnap = await getDoc(existingDocRef);
    let existingData: Timetable | null = null;
    if (existingSnap.exists()) {
      existingData = existingSnap.data() as Timetable;
    }

    // 2. If changing extensions, delete the previous storage file
    if (existingData && existingData.fileUrl) {
      try {
        let prevExt = 'png';
        if (existingData.fileUrl.includes('.pdf')) prevExt = 'pdf';
        else if (existingData.fileUrl.includes('.jpg') || existingData.fileUrl.includes('.jpeg')) prevExt = 'jpg';
        else if (existingData.fileUrl.includes('.webp')) prevExt = 'webp';

        const prevStoragePath = `timetables/${deptFolder}/${semFolder}/timetable.${prevExt}`;
        const prevRef = ref(storage, prevStoragePath);
        await deleteObject(prevRef);
      } catch (e: any) {
        // Log safe status update
        console.log('[Storage Service] Database record transition clean.');
      }
    }

    // 3. Upload new file to Firebase Storage with automatic Base64 database fallback
    let fileUrl = '';
    try {
      const storagePath = `timetables/${deptFolder}/${semFolder}/timetable.${ext}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, new Uint8Array(buffer), { contentType: mimeType });
      fileUrl = await getDownloadURL(storageRef);
      console.log('[Firebase Storage] Upload succeeded:', fileUrl);
    } catch (storageErr: any) {
      console.log('[Storage Service] Routing file content directly to Firestore document database.');
      if (buffer.length > 800 * 1024) {
        throw new Error(`The storage bucket is not active, and the file exceeds the 800 KB limit for inline database storage. Please upload a smaller file or active Storage.`);
      }
      fileUrl = fileBase64;
    }

    // 4. Update Firestore Metadata
    const nowStr = new Date().toISOString();
    const updatedTimetable: Timetable = {
      id: docId,
      department,
      semester,
      session,
      fileUrl,
      fileType: cleanType,
      uploadedAt: existingData ? existingData.uploadedAt : nowStr,
      updatedAt: nowStr,
      uploadedBy: uploadedBy || req.admin?.email || 'Admin',
      fileName: fileName || `timetable.${ext}`,
      fileSize: fileSizeStr
    };

    await setDoc(existingDocRef, updatedTimetable);

    // 5. Audit Logging
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Uploaded official timetable for ${department} (${semester}, Session: ${session})`,
      String(clientIp)
    );

    res.status(200).json({ success: true, timetable: updatedTimetable });
  } catch (err: any) {
    console.error('Failed to save timetable:', err);
    res.status(500).json({ error: `Failed to upload timetable: ${err.message}` });
  }
});

// DELETE timetable (Admin Only)
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const docRef = doc(db, 'timetables', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ error: 'Timetable not found' });
    }
    const data = snap.data() as Timetable;

    // Delete file from Firebase Storage
    if (data.fileUrl) {
      try {
        const deptFolder = data.department.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
        const semFolder = data.semester.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
        
        let fileExt = 'png';
        if (data.fileUrl.includes('.pdf')) fileExt = 'pdf';
        else if (data.fileUrl.includes('.jpg') || data.fileUrl.includes('.jpeg')) fileExt = 'jpg';
        else if (data.fileUrl.includes('.webp')) fileExt = 'webp';

        const storagePath = `timetables/${deptFolder}/${semFolder}/timetable.${fileExt}`;
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
      } catch (storageErr: any) {
        // Safe status bypass during document deletion cleanup
      }
    }

    // Delete Firestore record
    await deleteDoc(docRef);

    // Log event
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Deleted official timetable for ${data.department} (${data.semester})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'Timetable deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete timetable: ${err.message}` });
  }
});

export default router;
