import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyFirebaseConnections } from './server/firebase.js';
import { DocumentService } from './server/services/documentService.js';
import { OpenRouterService } from './server/services/openRouterService.js';

// Route Imports
import adminRouter from './server/routes/adminRoutes.js';
import settingsRouter from './server/routes/settingsRoutes.js';
import noticesRouter from './server/routes/noticeRoutes.js';
import faqRouter from './server/routes/faqRoutes.js';
import feedbackRouter from './server/routes/feedbackRoutes.js';
import analyticsRouter from './server/routes/analyticsRoutes.js';
import documentRouter from './server/routes/documentRoutes.js';
import chatRouter from './server/routes/chatRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  const PORT = 3000;

  console.log('[Bootstrap] Initializing Firebase app...');

  // Middleware Setup
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Root level health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // REST API Routes
  app.use('/api/admin', adminRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/notices', noticesRouter);
  app.use('/api/faqs', faqRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/documents', documentRouter);
  app.use('/api/chat', chatRouter);

  // Alias /api/extract to /api/documents/extract
  app.post('/api/extract', (req, res, next) => {
    req.url = '/extract';
    documentRouter(req, res, next);
  });

  // Serve Frontend Single Page Application (SPA)
  if (isProduction) {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    // Dynamically mount Vite dev server in middleware mode
    console.log('[Bootstrap] Development mode: programmatically mounting Vite middleware...');
    import('vite').then((viteModule) => {
      viteModule.createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      }).then((vite) => {
        app.use(vite.middlewares);
      });
    });
  }

  // Startup background procedures
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`=======================================================`);
    console.log(`🚀 IRA Campus Backend Running on http://localhost:${PORT}`);
    console.log(`=======================================================`);

    // Run Firestore diagnostics asynchronously
    verifyFirebaseConnections().catch((fErr) => {
      console.warn('[Bootstrap] Firestore diagnostics run returned an error:', fErr);
    });

    // 1. Initialize background AI processing queue for pending documents
    try {
      await DocumentService.initializeAIQueue();
    } catch (qErr) {
      console.error('[Bootstrap] Failed to initialize AI Queue:', qErr);
    }

    // 2. Perform OpenRouter startup connection test
    try {
      await OpenRouterService.testConnection();
    } catch (testErr) {
      console.warn('[Bootstrap] OpenRouter startup check bypassed:', testErr);
    }
  });
}

bootstrap().catch((err) => {
  console.error('❌ Critical system bootstrap failed:', err);
  process.exit(1);
});
