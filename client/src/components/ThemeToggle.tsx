import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? t('theme.enableLight') : t('theme.enableDark')}
      title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
      className={`grid h-10 w-10 place-items-center rounded-xl text-lg shadow-soft backdrop-blur-md transition-all active:scale-95 ${className}`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
