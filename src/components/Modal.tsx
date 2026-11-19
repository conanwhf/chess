import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Bi } from './Bi';

export function Modal({ zh, en, children, onClose }: { zh: string; en: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-label={`${zh} / ${en}`} onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="modal-header"><h2><Bi zh={zh} en={en} /></h2><button className="icon-button" onClick={onClose} aria-label="关闭 / Close" title="关闭 / Close"><X /></button></div>
    {children}
  </dialog>;
}
