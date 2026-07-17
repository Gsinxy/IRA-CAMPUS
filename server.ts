import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyFirebaseConnections } from './server/firebase.js';
import { DocumentService } from './server/services/documentService.js';
import { NvidiaService } from './server/services/nvidiaService.js';
import { SettingsRepository } from './server/repositories/settingsRepository.js';

// Route Imports
import adminRouter from './server/routes/adminRoutes.js';
import settingsRouter from './server/routes/settingsRoutes.js';
import noticesRouter from './server/routes/noticeRoutes.js';
import faqRouter from './server/routes/faqRoutes.js';
import feedbackRouter from './server/routes/feedbackRoutes.js';
import analyticsRouter from './server/routes/analyticsRoutes.js';
import documentRouter from './server/routes/documentRoutes.js';
import chatRouter from './server/routes/chatRoutes.js';

import fs from 'fs';

let resolvedFilename = '';
let resolvedDirname = '';

try {
  // If compiled to CommonJS, __filename and __dirname are defined in the outer scope
  resolvedFilename = __filename;
  resolvedDirname = __dirname;
} catch (err) {
  // ESM Fallback (development)
  try {
    resolvedFilename = fileURLToPath(import.meta.url);
    resolvedDirname = path.dirname(resolvedFilename);
  } catch (esmErr: any) {
    throw new Error(`CRITICAL SYSTEM ERROR: Failed to resolve directory paths. Error: ${esmErr.message}`);
  }
}

// Validate that resolved paths are non-empty strings
if (!resolvedFilename || typeof resolvedFilename !== 'string') {
  throw new Error('CRITICAL PATH ERROR: resolvedFilename must be a non-empty string.');
}
if (!resolvedDirname || typeof resolvedDirname !== 'string') {
  throw new Error('CRITICAL PATH ERROR: resolvedDirname must be a non-empty string.');
}

const isProduction = process.env.NODE_ENV === 'production';

async function validateEnvironment() {
  console.log('[Bootstrap] Validating environment variables and system paths...');

  // 1. Validate GEMINI_API_KEY (Optional)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.trim() === '' || geminiKey === 'MY_GEMINI_API_KEY') {
    console.log('[Bootstrap] Note: GEMINI_API_KEY is not defined or is a placeholder. Native Gemini features or fallbacks will be unavailable.');
  } else {
    console.log('✓ GEMINI_API_KEY loaded successfully (Optional).');
  }

  // 2. Load settings to see if provider is NVIDIA
  let activeProvider = 'Nvidia'; // Default fallback
  try {
    const settings = await SettingsRepository.get();
    activeProvider = settings.provider || 'Nvidia';
    console.log(`[Bootstrap] Configured active AI provider is: "${activeProvider}"`);
  } catch (dbErr: any) {
    console.warn(`[Bootstrap] Failed to fetch settings from Firestore. Defaulting provider check to "Nvidia". Error: ${dbErr.message}`);
  }

  // 3. Validate NVIDIA_API_KEY (Primary & Required)
  const nvKey = process.env.NVIDIA_API_KEY;
  const isMissingOrPlaceholder = !nvKey ||
    nvKey.trim() === '' ||
    nvKey === 'MY_NVIDIA_API_KEY' ||
    nvKey === 'MY_NEW_API_KEY' ||
    nvKey.includes('<MY_NEW_API_KEY>');

  if (isMissingOrPlaceholder) {
    console.warn(
      '⚠️ WARNING: The NVIDIA_API_KEY environment variable is missing, empty, or a placeholder. ' +
      'Please configure a valid NVIDIA_API_KEY in your environment secrets to use NVIDIA-powered features.'
    );
  } else {
    console.log('✓ NVIDIA API key loaded successfully.');
  }

  // 4. Validate Firebase Config Path
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!configPath || typeof configPath !== 'string') {
    throw new Error('CRITICAL PATH ERROR: Failed to resolve Firebase config path.');
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`CRITICAL CONFIGURATION ERROR: Firebase config file is missing at: "${configPath}".`);
  }
  console.log('✓ Firebase configuration file path validated.');

  // 5. Validate Production Build Directory if in production
  if (isProduction) {
    const distDir = resolvedDirname.endsWith('dist') || resolvedDirname.endsWith('dist/')
      ? resolvedDirname
      : path.join(resolvedDirname, 'dist');
    if (!distDir || typeof distDir !== 'string') {
      throw new Error('CRITICAL PATH ERROR: Failed to resolve production build path.');
    }
    if (!fs.existsSync(distDir)) {
      throw new Error(`CRITICAL PRODUCTION ERROR: The production build directory "dist" is missing at: "${distDir}". Please build the frontend first.`);
    }
    const indexFile = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
      throw new Error(`CRITICAL PRODUCTION ERROR: Production entry point "index.html" is missing at: "${indexFile}".`);
    }
    console.log('✓ Production static assets directory and files validated.');
  }
}

async function bootstrap() {
  await validateEnvironment();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
    const distDir = resolvedDirname.endsWith('dist') || resolvedDirname.endsWith('dist/')
      ? resolvedDirname
      : path.join(resolvedDirname, 'dist');
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

    // 2. Perform NVIDIA startup connection test
    try {
      await NvidiaService.testConnection();
    } catch (testErr) {
      console.warn('[Bootstrap] NVIDIA startup check bypassed:', testErr);
    }
  });
}

bootstrap().catch((err) => {
  console.error('❌ Critical system bootstrap failed:', err);
  process.exit(1);
});
