import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from './Spinner';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleButton() {
  const { t } = useTranslation();
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { googleLogin } = useAuth();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.authConfig().then(({ googleClientId }) => setGoogleClientId(googleClientId)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!googleClientId) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp) => {
          setPending(true);
          try {
            await googleLogin(resp.credential);
          } catch {
            toast(t('google.error'), 'error');
          } finally {
            setPending(false);
          }
        },
      });
      if (ref.current) {
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          shape: 'pill',
          theme: 'outline',
          width: '100%',
          text: 'continue_with',
        });
      }
    };
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [googleClientId, googleLogin, toast, t]);

  if (!googleClientId) return null;

  return (
    <div className="w-full">
      {pending ? (
        <div className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-200">
          <Spinner className="border-brand-300 border-t-brand-600" />
        </div>
      ) : (
        <div ref={ref} className="flex justify-center [&>div]:w-full [&>div>div]:w-full" />
      )}
    </div>
  );
}
