import React from "react";
import { cva, type VariantProps } from "../utils/cva";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        mission:
          "bg-mission-50 dark:bg-mission-950/40 text-mission-700 dark:text-mission-300 border border-mission-200/80 dark:border-mission-800/60",
        energy:
          "bg-energy-50 dark:bg-energy-950/40 text-energy-700 dark:text-energy-300 border border-energy-200/80 dark:border-energy-800/60",
        growth:
          "bg-growth-50 dark:bg-growth-950/40 text-growth-700 dark:text-growth-300 border border-growth-200/80 dark:border-growth-800/60",
        nova:
          "bg-nova-50 dark:bg-nova-950/40 text-nova-700 dark:text-nova-300 border border-nova-200/80 dark:border-nova-800/60",
        alert:
          "bg-alert-50 dark:bg-alert-950/40 text-alert-700 dark:text-alert-300 border border-alert-200/80 dark:border-alert-800/60",
        danger:
          "bg-danger-50 dark:bg-danger-950/40 text-danger-700 dark:text-danger-300 border border-danger-200/80 dark:border-danger-800/60",
        neutral:
          "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700",
      },
      size: {
        sm: "text-[11px] px-2 py-0.5 rounded-md gap-1",
        md: "text-xs px-2.5 py-1 rounded-full gap-1.5",
        lg: "text-sm px-3 py-1.5 rounded-full gap-2",
      },
      dot: {
        true: "",
        false: "",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
      dot: "false",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant,
  size,
  icon,
  children,
  ...props
}) => {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
