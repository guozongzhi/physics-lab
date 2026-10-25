import { useLocale } from '@/i18n/useLocale';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

/** A docked desktop directory that becomes a modal drawer on narrow screens. */
export default function AdaptiveNavigation({ title, summary, navigation, children, width = 280 }: {
  title: string; summary: string; navigation: ReactNode; children: ReactNode; width?: number;
}) {
  const { tx } = useLocale();
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const resize = () => { setMobile(query.matches); setOpen(!query.matches); };
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = oldOverflow; };
  }, [mobile, open]);
  const directory = <div ref={panel} id={id} className="adaptive-navigation-panel" role={mobile && open ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-label={tx(title)} hidden={!open} onClick={(event) => {
        if (mobile && (event.target as HTMLElement).closest('[data-nav-select]')) close();
      }} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (!mobile || event.key !== 'Tab') return;
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []).filter((item) => item.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <div className="adaptive-navigation-heading"><strong>{tx(title)}</strong><button aria-label={tx("关闭{0}", { 0: tx(title) })} onClick={close}><X size={18} /></button></div>
        {navigation}
      </div>;
  return <div className={`adaptive-navigation ${open ? 'is-open' : 'is-closed'}`} style={{ '--navigation-width': `${width}px` } as CSSProperties}>
    <div className="adaptive-navigation-toolbar">
      <button ref={trigger} className="btn-outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}{open ? tx("收起{0}", { 0: tx(title) }) : tx("展开{0}", { 0: tx(title) })}
      </button><span>{summary}</span>
    </div>
    <div className="adaptive-navigation-layout">
      {!mobile && directory}
      {mobile && open && createPortal(<><button className="adaptive-navigation-backdrop" aria-label={tx("点击遮罩关闭{0}", { 0: tx(title) })} onClick={close} />{directory}</>, document.body)}
      <div className="adaptive-navigation-content">{children}</div>
    </div>
  </div>;
}
