import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Logo } from '../components/Logo';
import { GoogleButton } from '../components/GoogleButton';
import { Spinner } from '../components/Spinner';
import { ThemeToggle } from '../components/ThemeToggle';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      toast('Bienvenue !', 'success');
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-emerald-50 px-4 py-10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle className="bg-white/80 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-soft dark:bg-slate-800"
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <Logo className="h-10 w-10 text-brand-600" />
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">FihSpot</h1>
          <p className="text-sm text-slate-400">Connectez-vous pour explorer</p>
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
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
          />
          <Input
            label="Mot de passe"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Spinner /> : 'Se connecter'}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          ou
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <GoogleButton />

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Pas encore de compte ?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline">
            Créer un compte
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
