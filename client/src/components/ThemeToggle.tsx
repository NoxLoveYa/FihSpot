import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? t('theme.enableLight') : t('theme.enableDark')}
      title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
      className={`glass grid h-10 w-10 place-items-center rounded-xl text-base transition-all hover:brightness-105 active:scale-95 ${className}`}
    >
      <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
    </button>
  );
}
