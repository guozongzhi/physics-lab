import React from "react";
import { BentoCard, type BentoCardProps } from "./BentoCard";
import { cn } from "../../lib/utils";

export interface StatWidgetProps extends Omit<BentoCardProps, "title"> {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string | number;
    positive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
}

export const StatWidget: React.FC<StatWidgetProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  className,
  variant = "default",
  ...props
}) => {
  return (
    <BentoCard
      variant={variant}
      padding="md"
      className={cn("flex flex-col justify-between", className)}
      {...props}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {value}
        </div>
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center font-medium px-1.5 py-0.5 rounded",
                trend.positive
                  ? "bg-growth-50 dark:bg-growth-950/40 text-growth-700 dark:text-growth-300"
                  : "bg-danger-50 dark:bg-danger-950/40 text-danger-700 dark:text-danger-300"
              )}
            >
              {trend.positive ? "↑" : "↓"} {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-slate-500 dark:text-slate-400">{subtitle}</span>
          )}
        </div>
      )}
    </BentoCard>
  );
};
