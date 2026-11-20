import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Bi } from './Bi';
import { useLanguage } from '../language';

export function Modal({ zh, en, children, onClose }: { zh: string; en: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLanguage();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-label={t(zh, en)} onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="modal-header"><h2><Bi zh={zh} en={en} /></h2><button className="icon-button" onClick={onClose} aria-label={t('关闭', 'Close')} title={t('关闭', 'Close')}><X /></button></div>
    {children}
  </dialog>;
}
