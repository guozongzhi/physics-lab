import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";


export interface ClassStatItem {
  label: string;
  value: number | string;
  suffix: string;
  tint?: string;
}

interface ClassStatsBentoProps {
  stats: ClassStatItem[];
}

export const ClassStatsBento: React.FC<ClassStatsBentoProps> = ({ stats }) => {
  return (
    <BentoCard variant="default" padding="lg">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            班级物理教学宏观态势
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            全班科研攻关、安全考核与协作指标一览
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((item, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between"
          >
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {item.label}
            </span>
            <div className="mt-2 text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
              {item.value}{" "}
              <span className="text-xs font-normal text-slate-500">{item.suffix}</span>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
};
