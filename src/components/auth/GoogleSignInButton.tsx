import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type GoogleCredentialResponse = { credential?: string };

type GoogleAccounts = {
  id: {
    initialize: (options: Record<string, unknown>) => void;
    renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  };
};

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

let googleScriptPromise: Promise<void> | null = null;

const loadGoogleScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-edunet-google-identity]');
    const script = existing || document.createElement('script');
    const handleLoad = () => resolve();
    const handleError = () => {
      googleScriptPromise = null;
      reject(new Error('Google Identity Services failed to load.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.edunetGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  });

  return googleScriptPromise;
};

type Props = {
  onCredential: (credential: string) => void | Promise<void>;
  onError?: (message: string) => void;
  disabled?: boolean;
  locale?: string;
};

export const GoogleSignInButton: React.FC<Props> = ({
  onCredential,
  onError,
  disabled = false,
  locale = 'en',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [loadError, setLoadError] = useState('');
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId || disabled) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;
        containerRef.current.replaceChildren();
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: GoogleCredentialResponse) => {
            if (response.credential) void callbackRef.current(response.credential);
            else onError?.('Google did not return a credential.');
          },
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.min(containerRef.current.clientWidth || 360, 400),
          locale,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Google sign-in failed to load.';
        setLoadError(message);
        onError?.(message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, disabled, locale, onError]);

  if (!clientId) {
    return <Button type="button" variant="outline" className="w-full" disabled>Google sign-in is not configured</Button>;
  }
  if (loadError) {
    return <Button type="button" variant="outline" className="w-full" disabled>{loadError}</Button>;
  }
  if (disabled) {
    return <Button type="button" variant="outline" className="w-full" disabled>Google sign-in</Button>;
  }

  return <div ref={containerRef} className="flex min-h-10 w-full items-center justify-center" />;
};
