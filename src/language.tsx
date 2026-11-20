import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'zh' | 'en';
export const LANGUAGE_KEY = 'little-chess.language';
export const systemLanguage = (language: string): Language => language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const LanguageContext = createContext({ language: 'en' as Language, automatic: true, error: '', clearError: () => {}, change: (_: Language | null) => {}, t: (_zh: string, en: string) => en });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved !== null && saved !== 'zh' && saved !== 'en') throw new Error('Invalid language setting');
      return { saved: saved as Language | null, error: '' };
    } catch (error) { return { saved: null, error: String(error) }; }
  });
  const [preference, setPreference] = useState(boot.saved);
  const [system, setSystem] = useState(() => systemLanguage(navigator.language));
  const [error, setError] = useState(boot.error);
  useEffect(() => {
    const update = () => setSystem(systemLanguage(navigator.language));
    window.addEventListener('languagechange', update);
    return () => window.removeEventListener('languagechange', update);
  }, []);
  const language = preference ?? system;
  const change = (next: Language | null) => {
    setPreference(next);
    try {
      if (next === null) localStorage.removeItem(LANGUAGE_KEY);
      else localStorage.setItem(LANGUAGE_KEY, next);
      setError('');
    } catch (error) { setError(String(error)); }
  };
  useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-Hans' : 'en'; }, [language]);
  return <LanguageContext.Provider value={{ language, automatic: preference === null, error, clearError: () => setError(''), change, t: (zh, en) => language === 'zh' ? zh : en }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
