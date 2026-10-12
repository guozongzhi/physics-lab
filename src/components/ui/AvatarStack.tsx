import { applyAvatarFallback } from '@/lib/imageFallback';
import type { User } from '@/types';
import { User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AvatarStackProps {
  users: User[];
  max?: number;
  size?: 24 | 28 | 32 | 40;
  className?: string;
}

export default function AvatarStack({ users, max = 4, size = 28, className }: AvatarStackProps) {
  const shown = users.slice(0, max);
  const extra = Math.max(0, users.length - max);
  const colors = ['#0D47A1', '#FF6B35', '#00BFA5', '#E53935', '#7C4DFF', '#FF9800'];

  return (
    <div className={cn('inline-flex items-center -space-x-2', className)}>
      {shown.map((u, i) => (
        <div
          key={u.id}
          className="relative rounded-full ring-2 ring-white shadow-sm overflow-hidden"
          style={{ width: size, height: size, background: colors[i % colors.length], zIndex: shown.length - i }}
        >
          {u.avatar ? (
            <img src={u.avatar} onError={applyAvatarFallback} alt={u.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white">
              <UserIcon size={size * 0.55} />
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          className="rounded-full ring-2 ring-white bg-ink-100 text-ink-600 font-semibold flex items-center justify-center"
          style={{ width: size, height: size, fontSize: size * 0.38, zIndex: 0 }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
