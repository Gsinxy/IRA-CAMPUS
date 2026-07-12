import { Router, Response } from 'express';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';

const router = Router();

// POST log admin login
router.post('/login-event', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      'Login',
      String(clientIp)
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST log admin logout
router.post('/logout-event', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      'Logout',
      String(clientIp)
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
