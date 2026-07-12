import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getGooglePublicKeys, getFirebaseProjectId } from '../utils/jwt.js';

// Authorized Administrator Whitelist
export const ADMIN_EMAILS = [
  "naiknirmal654@gmail.com"
];

export interface AdminRequest extends Request {
  admin?: {
    uid: string;
    email: string;
  };
}

export async function adminAuthMiddleware(req: AdminRequest, res: Response, next: NextFunction) {
  let idToken = '';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    idToken = authHeader.split('Bearer ')[1];
  } else if (req.query && req.query.token) {
    idToken = req.query.token as string;
  }

  if (!idToken) {
    return res.status(403).json({ error: 'Access Denied: No authentication token provided' });
  }

  try {
    const firebaseProjectId = getFirebaseProjectId();

    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return res.status(403).json({ error: 'Access Denied: Invalid token format' });
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    const kid = header.kid;
    if (!kid) {
      return res.status(403).json({ error: 'Access Denied: Missing key ID' });
    }

    const publicKeys = await getGooglePublicKeys();
    const publicKey = publicKeys[kid];
    if (!publicKey) {
      return res.status(403).json({ error: 'Access Denied: Unknown key ID certificate' });
    }

    const decoded = jwt.verify(idToken, publicKey, {
      audience: firebaseProjectId,
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      algorithms: ['RS256']
    }) as any;

    if (!decoded || !decoded.email) {
      return res.status(403).json({ error: 'Access Denied: Token does not contain email' });
    }

    const email = decoded.email.toLowerCase();
    if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) {
      return res.status(403).json({ error: 'Access Denied: User is not an authorized administrator' });
    }

    req.admin = {
      uid: decoded.sub,
      email: email
    };

    next();
  } catch (err: any) {
    console.error('[Admin Auth] Token verification failed:', err.message);
    return res.status(403).json({ error: `Access Denied: ${err.message}` });
  }
}
