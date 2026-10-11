import { useCallback } from 'react';
import { useI18n } from '@/context/I18nContext';
// Paired UI copy uses the existing persisted language context; narratives remain untouched.
export function useWebCopy() {
  const { language } = useI18n();
  return useCallback((zh: string, en: string) => language === 'zh-CN' ? zh : en, [language]);
}
