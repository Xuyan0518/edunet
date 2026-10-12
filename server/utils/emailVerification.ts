import { logSafeError } from './safeLog';
import { randomBytes } from 'crypto';
import { gmailEmailService } from './gmailEmailService';

export interface VerificationToken {
  token: string;
  expires: Date;
}

/**
 * Generate a random verification token
 */
export function generateVerificationToken(): VerificationToken {
  const token = randomBytes(32).toString('hex');
  const expires = new Date();
  expires.setHours(expires.getHours() + 24); // Token expires in 24 hours
  
  return { token, expires };
}

/**
 * Check if a verification token is expired
 */
export function isTokenExpired(expires: Date): boolean {
  return new Date() > expires;
}

/**
 * Validate verification token format
 */
export function isValidTokenFormat(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

/**
 * Send verification email using Gmail SMTP
 */
export async function sendVerificationEmail(email: string, token: string, name: string): Promise<boolean> {
  try {
    
    // Try Gmail SMTP first
    const emailSent = await gmailEmailService.sendVerificationEmail(email, token, name);
    
    if (emailSent) {
      return true;
    }
    return false;
    
  } catch (error) {
    logSafeError('Failed to send verification email:', error);
    return false;
  }
}

/**
 * Fallback email sending function (for development/testing)
 */
export async function sendVerificationEmailFallback(_email: string, _token: string, _name: string): Promise<boolean> {
  // Console output is not email delivery and must never expose a verification token.
  return false;
}
