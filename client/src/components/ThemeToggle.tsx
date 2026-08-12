import { useTheme } from '../context/ThemeContext';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
      className={`grid h-10 w-10 place-items-center rounded-xl text-lg shadow-soft backdrop-blur-md transition-all active:scale-95 ${className}`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
