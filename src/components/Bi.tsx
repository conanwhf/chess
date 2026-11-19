export function Bi({ zh, en, className = '' }: { zh: string; en: string; className?: string }) {
  return <span className={`bi ${className}`}><span lang="zh-Hans">{zh}</span><span lang="en">{en}</span></span>;
}
