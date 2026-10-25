import { create } from 'zustand';
import { english } from './en';

export type Locale = 'zh-CN' | 'en';
export const LOCALE_KEY = 'physicslab.locale';

function readLocale(): Locale {
  try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh-CN'; }
  catch { return 'zh-CN'; }
}

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.title = locale === 'en'
    ? 'Physics Mission Control · Learning Platform'
    : '创新物理实验室 · 学习管理平台';
}

export function translate(locale: Locale, source: string | null | undefined, values: Record<string, string | number | null | undefined> = {}): string {
  const text = source ?? '';
  const template = locale === 'en' && Object.prototype.hasOwnProperty.call(english, text) ? english[text] : text;
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : token);
}

const initialLocale = readLocale();
applyLocale(initialLocale);

export const useLocaleStore = create<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>((set) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* Session-only when storage is unavailable. */ }
    applyLocale(locale);
    set({ locale });
  },
}));

export function useLocale() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return { locale, setLocale, tx: (source: string | null | undefined, values?: Record<string, string | number | null | undefined>) => translate(locale, source, values) };
}
