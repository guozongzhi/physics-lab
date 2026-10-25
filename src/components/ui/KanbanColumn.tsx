import { useLocale } from '@/i18n/useLocale';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  statusKey: string;
  title: string;
  accentClass: string;
  items: ReactNode[];
  className?: string;
}

export default function KanbanColumn({
  statusKey,
  title,
  accentClass,
  items,
  className,
}: KanbanColumnProps) {
  const { tx } = useLocale();
  void statusKey;
  return (
    <div className={cn('kanban-col', className)}>
      <div
        className={cn(
          'rounded-xl px-3 py-2.5 flex items-center justify-between bg-gradient-to-r text-white shadow-sm',
          accentClass
        )}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white/90 shadow-sm" />
          <h3 className="font-semibold text-sm tracking-wide">{tx(title)}</h3>
        </div>
        <span className="min-w-[24px] h-6 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-xs font-bold px-2">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 flex-1 min-h-0">
        {items.length > 0 ? (
          items.map((item, idx) => (
            <div key={idx} className="transition-all duration-200 hover:translate-y-[-1px]">
              {item}
            </div>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-physics-100 rounded-xl2 text-ink-400 text-xs min-h-[80px]">
            {tx("暂无任务")}</div>
        )}
      </div>
    </div>
  );
}
