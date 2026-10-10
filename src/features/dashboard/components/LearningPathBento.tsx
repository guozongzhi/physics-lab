import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import { CheckCircle2, CircleDot, ArrowRight, Sparkles } from "lucide-react";

export interface PathStep {
  id: string;
  name: string;
  badge?: boolean;
  done?: boolean;
  statusLabel?: string;
}

interface LearningPathBentoProps {
  steps: PathStep[];
  completedCount: number;
  onNavigate: (path: string) => void;
}

export const LearningPathBento: React.FC<LearningPathBentoProps> = ({
  steps,
  completedCount,
  onNavigate,
}) => {
  return (
    <BentoCard variant="default" padding="lg" className="lg:h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-growth-50 dark:bg-growth-950/40 text-growth-600 dark:text-growth-400">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              科研能力星系路径
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              面向高中物理课题研究的 11 步沉浸式成长图谱
            </p>
          </div>
        </div>
        <Badge variant="growth" size="sm">
          {completedCount} / {steps.length} 达标
        </Badge>
      </div>

      {/* 阶段节点网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {steps.map((step, idx) => {
          const isDone = step.done;
          return (
            <div
              key={step.id}
              className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                isDone
                  ? "bg-growth-50/40 dark:bg-growth-950/20 border-growth-200 dark:border-growth-900/60 text-growth-900 dark:text-growth-200"
                  : "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 text-slate-600 dark:text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] opacity-60">#{idx + 1}</span>
                {isDone ? (
                  <CheckCircle2 size={14} className="text-growth-600 dark:text-growth-400 shrink-0" />
                ) : (
                  <CircleDot size={14} className="text-slate-400 shrink-0" />
                )}
              </div>
              <div className="font-bold text-xs truncate">{step.name}</div>
              <div className="mt-1 text-[10px] opacity-75">
                {isDone ? "✅ 已掌握" : "待攻关"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <span className="text-slate-500">按阶段顺序攻关可解锁额外团队津贴</span>
        <button
          type="button"
          onClick={() => onNavigate("/theory/topics")}
          className="text-mission-600 dark:text-mission-400 hover:underline flex items-center gap-1 font-medium"
        >
          查看全景学习图谱 <ArrowRight size={13} />
        </button>
      </div>
    </BentoCard>
  );
};
