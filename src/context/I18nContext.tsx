import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations, type Language, type TranslationKey } from '@/i18n/translations';

const STORAGE_KEY = 'edunet-language';

type I18nContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const getStoredLanguage = (): Language => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'zh-CN') return stored;
  return 'zh-CN';
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const t = useMemo(() => {
    return (key: TranslationKey, params?: Record<string, string | number>) => {
      const dict = translations[language] ?? translations['zh-CN'];
      let template = dict[key] ?? translations.en[key] ?? key;
      if (params) {
        for (const [paramKey, value] of Object.entries(params)) {
          template = template.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
        }
      }
      return template;
    };
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
};
