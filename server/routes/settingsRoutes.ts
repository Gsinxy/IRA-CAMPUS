import { Router, Response } from 'express';
import { SettingsRepository } from '../repositories/settingsRepository.js';
import { adminAuthMiddleware, AdminRequest } from '../middleware/adminAuth.js';
import { AnalyticsRepository } from '../repositories/analyticsRepository.js';

const router = Router();

// GET AI settings
router.get('/', async (req, res: Response) => {
  try {
    const settings = await SettingsRepository.get();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to load settings: ${err.message}` });
  }
});

// POST update AI settings (Admin Only)
router.post('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const updatedSettings = req.body;
    await SettingsRepository.save(updatedSettings);

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await AnalyticsRepository.logAuditEvent(
      req.admin?.email || 'admin@ira.edu',
      `Updated AI Model and Pipeline parameters: ${JSON.stringify(updatedSettings)}`,
      String(clientIp)
    );

    res.json({ success: true, message: 'AI configuration settings updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to update settings: ${err.message}` });
  }
});

export default router;
