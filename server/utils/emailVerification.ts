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
    console.log('Attempting to send verification email via Gmail SMTP...');
    
    // Try Gmail SMTP first
    const emailSent = await gmailEmailService.sendVerificationEmail(email, token, name);
    
    if (emailSent) {
      console.log('Email sent successfully via Gmail SMTP');
      return true;
    }
    
    console.log('Gmail SMTP failed, falling back to console email...');
    return false;
    
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}

/**
 * Fallback email sending function (for development/testing)
 */
export async function sendVerificationEmailFallback(email: string, token: string, name: string): Promise<boolean> {
  try {
    // This is a fallback for development/testing when Gmail is not configured
    const verificationUrl = `http://localhost:3001/verify-email?token=${token}`;
    
    console.log('=== VERIFICATION EMAIL (DEVELOPMENT MODE) ===');
    console.log(`To: ${email}`);
    console.log(`Subject: Verify Your EduNet Account`);
    console.log(`Verification Link: ${verificationUrl}`);
    console.log('=============================================');
    
    return true;
  } catch (error) {
    console.error('Fallback email error:', error);
    return false;
  }
}
