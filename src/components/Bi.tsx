import { useLanguage } from '../language';

export function Bi({ zh, en, className = '' }: { zh: string; en: string; className?: string }) {
  const { t } = useLanguage();
  return <span className={`bi ${className}`}>{t(zh, en)}</span>;
}
