import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompass, faRightFromBracket, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { MapTypeToggle } from './MapTypeToggle';
import type { MapType } from './MapTypeToggle';

interface NavbarProps {
  mapType?: MapType;
  onMapTypeChange?: (type: MapType) => void;
  search?: ReactNode;
}

export function Navbar({ mapType, onMapTypeChange, search }: NavbarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Small screens: solid compact bar (uniform icons), search wraps on its own line.
  // lg+: floating glass bar; search sits on the same line, Explore right before it.
  const btn =
    'glass grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base text-slate-600 transition-colors hover:brightness-105 dark:text-slate-200 lg:flex lg:h-10 lg:w-auto lg:items-center lg:justify-center lg:gap-1.5 lg:px-3 lg:py-0 lg:text-sm lg:font-semibold';

  // Profile chip: no background (bare).
  const bare =
    'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700 sm:flex sm:h-10 sm:w-auto sm:items-center sm:gap-2 sm:py-0 sm:text-base sm:font-bold';

  // FihSpot logo: same glassy background as Explore (btn) on lg+.
  const logoBtn =
    'glass grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-800 transition-colors hover:brightness-105 dark:text-slate-100 sm:flex sm:h-10 sm:w-auto sm:items-center sm:gap-2 sm:px-3 sm:py-0 sm:text-base sm:font-bold';

  const logoutBtn = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="fixed inset-x-0 top-0 z-[1350] flex flex-wrap items-center justify-between gap-x-1 gap-y-2 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 lg:pointer-events-none lg:flex-nowrap lg:gap-2 lg:px-3 lg:pt-[max(env(safe-area-inset-top),0.75rem)] lg:pb-3">
      <div className="flex min-w-0 items-center gap-1 lg:pointer-events-auto lg:gap-1.5">
        <button
          onClick={() => navigate('/')}
          title={t('app.title')}
          className={logoBtn}
        >
          <Logo className="h-5 w-5 text-brand-600" />
          <span className="hidden sm:inline">FihSpot</span>
        </button>

        {user && (
          <button
            onClick={() => navigate('/profile')}
            title={t('nav.profile')}
            className={`${bare} text-slate-800 sm:rounded-xl sm:px-2 dark:text-slate-100`}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/60">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden max-w-[160px] truncate text-sm font-medium text-slate-700 sm:inline dark:text-slate-200">
              {user.name}
            </span>
          </button>
        )}
      </div>

      <div className="order-3 flex w-full min-w-0 items-center gap-1 lg:order-none lg:pointer-events-auto lg:absolute lg:left-1/2 lg:top-1/2 lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:gap-2">
        <button
          onClick={() => navigate('/pois')}
          aria-label={t('nav.explore')}
          title={t('nav.explore')}
          className={btn}
        >
          <FontAwesomeIcon icon={faCompass} className="h-4 w-4 text-brand-500" />
          <span className="hidden lg:inline">{t('nav.explore')}</span>
        </button>
        {search && <div className="min-w-0 flex-1 lg:w-96 lg:flex-none">{search}</div>}
      </div>

      <div className="flex min-w-0 items-center gap-1 lg:pointer-events-auto lg:gap-2">
        {user?.role === 'ADMIN' && (
          <button
            onClick={() => navigate('/admin')}
            aria-label={t('nav.admin')}
            title={t('nav.admin')}
            className={btn}
          >
            <FontAwesomeIcon icon={faShieldHalved} className="h-4 w-4 text-amber-500" />
            <span className="hidden lg:inline">{t('nav.admin')}</span>
          </button>
        )}
        <ThemeToggle className={btn} />
        {mapType && onMapTypeChange && <MapTypeToggle mapType={mapType} onChange={onMapTypeChange} />}
        <LanguageToggle className={btn} />
        {user ? (
          <button onClick={logoutBtn} aria-label={t('nav.logout')} title={t('nav.logout')} className={btn}>
            <FontAwesomeIcon icon={faRightFromBracket} className="h-4 w-4" />
            <span className="hidden lg:inline">{t('nav.logout')}</span>
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="btn-glossy rounded-xl border-brand-500/40 bg-brand-500/20 px-4 py-2 text-sm font-semibold text-brand-700 transition-all hover:brightness-105 dark:border-brand-400/40 dark:bg-brand-500/25 dark:text-brand-200"
          >
            {t('nav.login')}
          </button>
        )}
      </div>
    </header>
  );
}
