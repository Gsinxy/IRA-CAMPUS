import { Router, Response } from 'express';
import { FaqsRepository } from '../repositories/faqsRepository.js';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';
import { FAQ } from '../../src/types.js';

const router = Router();

// GET all FAQs
router.get('/', async (req, res: Response) => {
  try {
    const list = await FaqsRepository.getAll();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load FAQs: ${err.message}` });
  }
});

// POST save/update FAQ (Admin Only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const faq: FAQ = req.body;
    if (!faq.id || !faq.question || !faq.answer) {
      return res.status(400).json({ error: 'id, question, and answer are required.' });
    }
    await FaqsRepository.save(faq);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Saved or Updated FAQ item: "${faq.question}" (ID: ${faq.id})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'FAQ saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save FAQ: ${err.message}` });
  }
});

// DELETE FAQ (Admin Only)
router.delete('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const faq = await FaqsRepository.getById(id);
    await FaqsRepository.delete(id);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Deleted FAQ item: "${faq?.question || id}" (ID: ${id})`,
      String(clientIp)
    );

    res.json({ success: true, message: 'FAQ deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete FAQ: ${err.message}` });
  }
});

export default router;
