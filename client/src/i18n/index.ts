import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { fr } from './locales/fr';

const LANGUAGE_KEY = 'fihspot_lang';

export const supportedLanguages = ['en', 'fr'] as const;
export type Language = (typeof supportedLanguages)[number];

export function isSupportedLanguage(value: string | null): value is Language {
  return value === 'en' || value === 'fr';
}

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (isSupportedLanguage(stored)) return stored;
  const navLang = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
  return navLang.startsWith('fr') ? 'fr' : 'en';
}

export function changeLanguage(lang: Language) {
  localStorage.setItem(LANGUAGE_KEY, lang);
  return i18n.changeLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

function applyLanguageMeta(lng: string) {
  document.documentElement.lang = lng;
  document.title = i18n.t('app.title');
}

i18n.on('languageChanged', applyLanguageMeta);
applyLanguageMeta(i18n.language);

export default i18n;
