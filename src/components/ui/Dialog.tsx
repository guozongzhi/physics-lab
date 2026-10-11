import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Dialog({ open, onClose, title, children, footer, size = 'md', className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    ) ?? []).filter((el) => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (panel?.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? focusable()[0] ?? panel)?.focus());
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog owns keyboard handling when dialogs are nested.
      const dialogs = document.querySelectorAll('.workspace-dialog-panel');
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { e.preventDefault(); panel?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="workspace-dialog">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title !== undefined ? titleId : undefined}
            aria-label={title === undefined ? '操作窗口' : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'workspace-dialog-panel',
              sizeMap[size],
              className
            )}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-physics-50">
                <div id={titleId} className="font-serif text-lg font-semibold text-physics-800">{title}</div>
                <button
                  onClick={onClose}
                  className="text-ink-400 hover:text-ink-700 rounded-lg p-1.5 hover:bg-ink-50 transition"
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="px-5 py-4">{children}</div>
            {footer !== undefined && (
              <div className="px-5 py-3.5 border-t border-physics-50 bg-ink-50/60 rounded-b-xl2 flex justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>, document.body
  );
}
