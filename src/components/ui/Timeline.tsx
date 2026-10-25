import { useLocale } from '@/i18n/useLocale';
import { cn } from '@/lib/utils';

type TimelineEventType = 'info' | 'success' | 'warning' | 'energy';

interface TimelineEvent {
  id: string;
  time: string;
  actor: string;
  content: string;
  type?: TimelineEventType;
  onClick?: () => void;
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const typeDotMap: Record<TimelineEventType, string> = {
  info: 'bg-physics-400 ring-physics-100',
  success: 'bg-lab-400 ring-lab-100',
  warning: 'bg-risk-400 ring-risk-100',
  energy: 'bg-energy-400 ring-energy-100',
};

const typeChipMap: Record<TimelineEventType, string> = {
  info: 'chip-physics',
  success: 'chip-lab',
  warning: 'chip-risk',
  energy: 'chip-energy',
};

export default function Timeline({ events, className }: TimelineProps) {
  const { tx } = useLocale();
  return (
    <div className={cn('relative pl-1.5', className)}>
      <div
        className="absolute left-[18px] top-2 bottom-2 w-0.5 rounded-full"
        style={{
          background:
            'linear-gradient(180deg,rgba(13,71,161,0.35) 0%,rgba(255,107,53,0.25) 50%,rgba(0,191,165,0.35) 100%)',
          boxShadow:
            '0 0 8px rgba(13,71,161,0.2),0 0 8px rgba(255,107,53,0.15)',
        }}
      />
      <div className="flex flex-col gap-4">
        {events.map((ev) => {
          const t: TimelineEventType = ev.type || 'info';
          const clickable = !!ev.onClick;
          return (
            <div
              key={ev.id}
              className={cn(
                'relative pl-10 group',
                clickable && 'cursor-pointer'
              )}
              onClick={ev.onClick}
            >
              <div
                className={cn(
                  'absolute left-0 top-1.5 w-4 h-4 rounded-full ring-4',
                  typeDotMap[t]
                )}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-xs', typeChipMap[t])}>
                  {ev.actor}
                </span>
                <span className="text-xs text-ink-400 font-mono">{ev.time}</span>
              </div>
              <p
                className={cn(
                  'mt-1.5 text-sm text-ink-700 leading-relaxed',
                  clickable &&
                    'group-hover:text-physics-700 group-hover:bg-physics-50/50 -mx-2 px-2 py-1 rounded-lg transition-all'
                )}
              >
                {ev.content}
              </p>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-center py-8 text-ink-400 text-sm">
            {tx("暂无动态")}</div>
        )}
      </div>
    </div>
  );
}
