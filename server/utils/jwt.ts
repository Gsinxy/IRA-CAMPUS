import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

let cachedPublicKeys: { [key: string]: string } = {};
let publicKeysLastFetched = 0;

export async function getGooglePublicKeys(): Promise<{ [key: string]: string }> {
  const now = Date.now();
  // Cache keys for 1 hour to prevent unnecessary fetches
  if (now - publicKeysLastFetched > 3600000 || Object.keys(cachedPublicKeys).length === 0) {
    try {
      const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
      if (res.ok) {
        cachedPublicKeys = await res.json();
        publicKeysLastFetched = now;
      } else {
        console.error('[Admin Auth Utility] Error fetching Google public keys:', res.statusText);
      }
    } catch (err: any) {
      console.error('[Admin Auth Utility] Failed to fetch Google public keys:', err.message);
    }
  }
  return cachedPublicKeys;
}

export function getFirebaseProjectId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.projectId) {
        return config.projectId;
      }
    }
  } catch (err) {
    // Ignore error and fallback
  }
  return 'ira-campus-4983a'; // default fallback
}
