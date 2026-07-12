import { Router, Response, Request } from 'express';
import { FeedbackRepository } from '../repositories/feedbackRepository.js';

const router = Router();

// POST feedback on answers
router.post('/', async (req: Request, res: Response) => {
  const { logId, value } = req.body;
  if (!logId || !value) {
    return res.status(400).json({ error: 'logId and value (positive/negative) are required' });
  }

  try {
    await FeedbackRepository.addFeedback(logId, value);
    res.json({ success: true, message: 'Feedback recorded successfully' });
  } catch (err: any) {
    console.error('[Feedback Route] Failed to record feedback:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
