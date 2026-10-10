import React from "react";
import { cva, type VariantProps } from "../utils/cva";
import { cn } from "../../lib/utils";

const bentoCardVariants = cva(
  "immersive-bento rounded-2xl transition-all duration-200 relative overflow-hidden backdrop-blur-md",
  {
    variants: {
      variant: {
        default:
          "bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:border-slate-300 dark:hover:border-slate-700/80",
        interactive:
          "bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 hover:border-mission-500/50 dark:hover:border-mission-500/50 hover:shadow-lg hover:shadow-mission-500/5 hover:-translate-y-0.5 cursor-pointer active:translate-y-0",
        accent:
          "bg-gradient-to-br from-mission-50/50 via-white/80 to-slate-50/50 dark:from-mission-950/20 dark:via-slate-900/70 dark:to-slate-900/90 border border-mission-200/60 dark:border-mission-800/40 shadow-sm",
        energy:
          "bg-gradient-to-br from-energy-50/50 via-white/80 to-slate-50/50 dark:from-energy-950/20 dark:via-slate-900/70 dark:to-slate-900/90 border border-energy-200/60 dark:border-energy-800/40 shadow-sm",
        flat: "bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50",
      },
      padding: {
        none: "p-0",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
);

export interface BentoCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bentoCardVariants> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const BentoCard = React.forwardRef<HTMLDivElement, BentoCardProps>(
  ({ className, variant, padding, header, footer, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(bentoCardVariants({ variant, padding }), className)}
        {...props}
      >
        {header && (
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800/60 mb-4">
            {header}
          </div>
        )}
        <div>{children}</div>
        {footer && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 mt-4">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

BentoCard.displayName = "BentoCard";
