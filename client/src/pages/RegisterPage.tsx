import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Logo } from '../components/Logo';
import { GoogleButton } from '../components/GoogleButton';
import { Spinner } from '../components/Spinner';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageToggle } from '../components/LanguageToggle';

export function RegisterPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      toast(t('auth.accountCreated'), 'success');
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.registerError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-brand-50 px-4 py-10 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
      <div className="fixed right-4 top-[max(env(safe-area-inset-top),1rem)] z-50 flex items-center gap-2">
        <ThemeToggle className="text-slate-600 dark:text-slate-200" />
        <LanguageToggle className="text-slate-600 dark:text-slate-200" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong w-full max-w-sm rounded-3xl p-6"
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <Logo className="h-10 w-10 text-emerald-600" />
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{t('auth.registerTitle')}</h1>
          <p className="text-sm text-slate-400">{t('auth.registerSubtitle')}</p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:bg-rose-950"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            label={t('fields.name')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('fields.namePlaceholder')}
          />
          <Input
            label={t('fields.email')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('fields.emailPlaceholder')}
          />
          <Input
            label={t('fields.password')}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('fields.passwordPlaceholder')}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Spinner /> : t('auth.signUp')}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          {t('auth.or')}
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <GoogleButton />

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
