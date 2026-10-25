import { Languages } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

export default function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  const label = locale === 'zh-CN' ? 'Switch to English' : '切换为中文';
  return <button type="button" className="workspace-language-switch" aria-label={label} title={label}
    onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}>
    <Languages size={17} aria-hidden="true" /><span>{locale === 'zh-CN' ? 'EN' : '中文'}</span>
  </button>;
}
