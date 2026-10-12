import { logSafeError } from './safeLog';
import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class GmailEmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Create Gmail transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  /**
   * Send verification email using Gmail SMTP
   */
  async sendVerificationEmail(email: string, token: string, name: string): Promise<boolean> {
    if (process.env.NOTIFICATIONS_ENABLED === 'false') return true;
    try {

      // Check if Gmail credentials are present
      if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.error('Gmail credentials not found in environment variables');
        return false;
      }

      // Create verification link
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${token}`;

      // Email content
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to 桐心成长!</h1>
            <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Bridging the gap between teachers and parents</p>
          </div>
          
          <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Hi ${name},</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Thank you for signing up for 桐心成长! To complete your registration and start using your account, 
              please verify your email address by clicking the button below.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block; 
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              If the button above doesn't work, you can also copy and paste this link into your browser:
            </p>
            
            <p style="background: #f8f9fa; padding: 15px; border-radius: 5px; word-break: break-all; color: #495057; font-size: 14px;">
              ${verificationUrl}
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 14px; margin: 0;">
                This verification link will expire in 24 hours. If you didn't create an account with 桐心成长, 
                you can safely ignore this email.
              </p>
            </div>
          </div>
        </div>
      `;

      const textContent = `
        Welcome to 桐心成长!
        
        Hi ${name},
        
        Thank you for signing up for 桐心成长! To complete your registration and start using your account, 
        please verify your email address by visiting this link:
        
        ${verificationUrl}
        
        This verification link will expire in 24 hours. If you didn't create an account with 桐心成长, 
        you can safely ignore this email.
        
        Best regards,
        The 桐心成长 Team
      `;

      // Send email
      const mailOptions = {
        from: `桐心成长 <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Verify Your 桐心成长 Account',
        html: htmlContent,
        text: textContent,
      };

      await this.transporter.sendMail(mailOptions);
      return true;

    } catch (error) {
      logSafeError('Failed to send verification email via Gmail:', error);
      return false;
    }
  }

  /**
   * Test Gmail connection
   */
  async testConnection(): Promise<boolean> {
    if (process.env.NOTIFICATIONS_ENABLED === 'false') return false;
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logSafeError('Gmail SMTP connection failed:', error);
      return false;
    }
  }
}

// Create singleton instance
export const gmailEmailService = new GmailEmailService();
