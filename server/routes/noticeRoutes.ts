import { Router, Response } from 'express';
import { NoticesRepository } from '../repositories/noticesRepository.js';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { Notice } from '../../src/types.js';

const router = Router();

// GET all notices
router.get('/', async (req, res: Response) => {
  try {
    const list = await NoticesRepository.getAll();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load notices: ${err.message}` });
  }
});

// POST save/update notice (Admin Only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const notice: Notice = req.body;
    if (!notice.id || !notice.title || !notice.content) {
      return res.status(400).json({ error: 'id, title, and content are required.' });
    }
    await NoticesRepository.save(notice);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Saved or Updated college notice: "${notice.title}" (ID: ${notice.id})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'Notice saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save notice: ${err.message}` });
  }
});

// DELETE notice (Admin Only)
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const notice = await NoticesRepository.getById(id);
    await NoticesRepository.delete(id);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Deleted college notice: "${notice?.title || id}" (ID: ${id})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'Notice deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete notice: ${err.message}` });
  }
});

export default router;
