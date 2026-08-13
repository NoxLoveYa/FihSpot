import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
import type { Language } from '../i18n';

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current: Language = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const next: Language = current === 'fr' ? 'en' : 'fr';

  return (
    <button
      onClick={() => changeLanguage(next)}
      aria-label={t(`language.to${next === 'en' ? 'English' : 'French'}`)}
      title={t(`language.to${next === 'en' ? 'English' : 'French'}`)}
      className={`glass grid h-10 w-10 place-items-center rounded-xl text-xs font-bold uppercase tracking-wide transition-all hover:brightness-105 active:scale-95 ${className}`}
    >
      {current}
    </button>
  );
}
