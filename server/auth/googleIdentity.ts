import { OAuth2Client } from 'google-auth-library';

export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export class GoogleIdentityError extends Error {
  constructor(
    message: string,
    public readonly code: 'google_not_configured' | 'invalid_google_credential',
  ) {
    super(message);
    this.name = 'GoogleIdentityError';
  }
}

let client: OAuth2Client | null = null;

export const verifyGoogleCredential = async (
  credential: string,
  clientId = process.env.GOOGLE_CLIENT_ID,
): Promise<VerifiedGoogleIdentity> => {
  if (!clientId) {
    throw new GoogleIdentityError('Google sign-in is not configured.', 'google_not_configured');
  }

  client ||= new OAuth2Client();

  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const subject = payload?.sub?.trim();
    const email = payload?.email?.trim().toLowerCase();

    if (!subject || !email || payload?.email_verified !== true) {
      throw new GoogleIdentityError('Google account email could not be verified.', 'invalid_google_credential');
    }

    return {
      subject,
      email,
      name: payload?.name?.trim() || email.split('@')[0],
      avatarUrl: payload?.picture?.trim() || null,
    };
  } catch (error) {
    if (error instanceof GoogleIdentityError) throw error;
    throw new GoogleIdentityError('Google sign-in could not be verified.', 'invalid_google_credential');
  }
};
