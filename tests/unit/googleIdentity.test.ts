import { beforeEach, describe, expect, it, vi } from 'vitest';

const googleMocks = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class OAuth2Client {
    verifyIdToken = googleMocks.verifyIdToken;
  },
}));

import { GoogleIdentityError, verifyGoogleCredential } from '../../server/auth/googleIdentity';

beforeEach(() => {
  googleMocks.verifyIdToken.mockReset();
});

describe('verifyGoogleCredential', () => {
  it('returns a normalized identity from a verified Google payload', async () => {
    googleMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-subject',
        email: 'Person@Example.com',
        email_verified: true,
        name: 'Example Person',
        picture: 'https://example.com/avatar.png',
      }),
    });

    await expect(verifyGoogleCredential('credential', 'client-id')).resolves.toEqual({
      subject: 'google-subject',
      email: 'person@example.com',
      name: 'Example Person',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(googleMocks.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'credential',
      audience: 'client-id',
    });
  });

  it('rejects a payload without a verified email', async () => {
    googleMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-subject', email: 'person@example.com', email_verified: false }),
    });

    await expect(verifyGoogleCredential('credential', 'client-id')).rejects.toMatchObject({
      code: 'invalid_google_credential',
    });
  });

  it('reports missing server configuration separately', async () => {
    await expect(verifyGoogleCredential('credential', '')).rejects.toEqual(
      expect.objectContaining<Partial<GoogleIdentityError>>({ code: 'google_not_configured' }),
    );
  });
});
