import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[1200] flex items-center justify-between p-3">
      <button
        onClick={() => navigate('/')}
        className="pointer-events-auto flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-base font-bold text-slate-800 shadow-soft backdrop-blur-md dark:bg-slate-800/80 dark:text-slate-100"
      >
        <Logo className="h-5 w-5 text-brand-600" />
        FihSpot
      </button>

      <div className="pointer-events-auto flex items-center gap-2">
        <ThemeToggle className="bg-white/80 text-slate-600 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700" />
        {user ? (
          <>
            <button
              onClick={() => navigate('/profile')}
              title="Mon profil"
              className="hidden items-center gap-2 rounded-xl bg-white/80 px-3 py-1.5 shadow-soft backdrop-blur-md transition-colors hover:bg-white sm:flex dark:bg-slate-800/80 dark:hover:bg-slate-700"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="max-w-[160px] truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                {user.name}
              </span>
            </button>
            <button
              onClick={() => navigate('/profile')}
              aria-label="Mon profil"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/80 shadow-soft backdrop-blur-md transition-colors hover:bg-white sm:hidden dark:bg-slate-800/80 dark:hover:bg-slate-700"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-soft backdrop-blur-md transition-colors hover:text-rose-600 dark:bg-slate-800/80 dark:text-slate-300"
            >
              Déconnexion
            </button>
          </>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-float transition-colors hover:bg-brand-700"
          >
            Se connecter
          </button>
        )}
      </div>
    </header>
  );
}
