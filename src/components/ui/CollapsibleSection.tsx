import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = true,
  className = '',
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('glass-card glass-card-hover rounded-[28px] overflow-hidden', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-center justify-between text-left hover:bg-mission-50/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon && <div className="shrink-0">{icon}</div>}
          <div>
            {subtitle && (
              <span className="mission-label">{subtitle}</span>
            )}
            <h3 className={cn(
              'text-[18px] font-extrabold text-ink-800',
              subtitle && 'mt-1'
            )}>
              {title}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-[11px] font-semibold transition-colors',
            isOpen ? 'text-mission-600' : 'text-ink-400'
          )}>
            {isOpen ? '收起' : '展开'}
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-8 h-8 rounded-xl bg-ink-100 flex items-center justify-center text-ink-500"
          >
            <ChevronDown size={18} />
          </motion.div>
        </div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-0">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
