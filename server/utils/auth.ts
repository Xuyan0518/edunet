import crypto from 'crypto';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { teachersTable, parentsTable, adminsTable } from '../schema';

// Secret key for token signing (in production, use environment variable)
const SECRET_KEY = process.env.JWT_SECRET || 'edunet-secret-key-change-in-production';

export interface AuthUser {
  id: string;
  role: 'teacher' | 'parent' | 'admin';
  email: string;
  name: string;
}

export interface RequestWithAuth extends Express.Request {
  user?: AuthUser;
}

/**
 * Generate a signed token for a user
 */
export function generateToken(user: AuthUser): string {
  const payload = {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    timestamp: Date.now(),
  };

  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payloadString)
    .digest('hex');

  const token = Buffer.from(payloadString).toString('base64') + '.' + signature;
  return token;
}

/**
 * Verify and decode a token
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) {
      return null;
    }

    const payloadString = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(payloadString)
      .digest('hex');

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(payloadString);
    
    // Check if token is expired (optional: 7 days expiry)
    const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (Date.now() - payload.timestamp > TOKEN_EXPIRY) {
      return null;
    }

    return {
      id: payload.id,
      role: payload.role,
      email: payload.email,
      name: payload.name,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Verify user exists in database and is still valid
 */
export async function verifyUserInDb(user: AuthUser): Promise<boolean> {
  try {
    if (user.role === 'teacher') {
      const teachers = await db
        .select()
        .from(teachersTable)
        .where(eq(teachersTable.id, user.id));
      
      if (teachers.length === 0) return false;
      const teacher = teachers[0];
      
      // Check if teacher is still approved and verified
      return teacher.status === 'approved' && teacher.emailVerified === 'true';
    }
    
    if (user.role === 'parent') {
      const parents = await db
        .select()
        .from(parentsTable)
        .where(eq(parentsTable.id, user.id));
      
      if (parents.length === 0) return false;
      const parent = parents[0];
      
      // Check if parent is still approved and verified
      return parent.status === 'approved' && parent.emailVerified === 'true';
    }
    
    if (user.role === 'admin') {
      const admins = await db
        .select()
        .from(adminsTable)
        .where(eq(adminsTable.id, user.id));
      
      return admins.length > 0;
    }
    
    return false;
  } catch (error) {
    console.error('Error verifying user in database:', error);
    return false;
  }
}
