import { useLocale } from '@/i18n/useLocale';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  title: string;
  value: number | string;
  delta?: string;
  trend?: 'up' | 'down';
  colorClass?: string;
  footer?: ReactNode;
  className?: string;
}

export default function StatCard({
  icon: Icon,
  title,
  value,
  delta,
  trend,
  colorClass = 'bg-grad-physics',
  footer,
  className,
}: StatCardProps) {
  const { tx } = useLocale();
  return (
    <div className={cn('card-base card-hover p-5 relative overflow-hidden', className)}>
      <div className="flex items-start justify-between">
        <div className="relative">
          <div
            className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg',
              colorClass
            )}
          >
            <Icon className="w-6 h-6" strokeWidth={2} />
          </div>
          <div
            className={cn(
              'absolute -top-6 -left-6 w-16 h-16 rounded-full blur-2xl opacity-30',
              colorClass
            )}
          />
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-500 font-medium">{tx(title)}</p>
          <p className="mt-1 font-mono text-3xl font-bold text-ink-800 tracking-tight tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {delta && (
            <div
              className={cn(
                'mt-1 inline-flex items-center gap-1 text-xs font-semibold',
                trend === 'up' ? 'text-lab-600' : trend === 'down' ? 'text-risk-600' : 'text-ink-500'
              )}
            >
              {trend === 'up' ? (
                <TrendingUp className="w-3 h-3" />
              ) : trend === 'down' ? (
                <TrendingDown className="w-3 h-3" />
              ) : null}
              <span>{delta}</span>
            </div>
          )}
        </div>
      </div>
      {footer && <div className="mt-4 pt-3 border-t border-physics-50/80">{footer}</div>}
    </div>
  );
}
