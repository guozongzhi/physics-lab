import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { FileCheck, Snowflake, AlertTriangle, ArrowRight } from "lucide-react";
import type { ReviewableQuestion } from '@/types';

interface AuditAndAlertBentoProps {
  pendingQuestions: ReviewableQuestion[];
  frozenProjects: { id: string; name: string; groupName: string }[];
  overdueRecruits: { id: string; title: string; owner: string; overdueDays: number; bids: number }[];
  onApproveQuestion: (id: string) => void;
  onNavigate: (path: string) => void;
}

export const AuditAndAlertBento: React.FC<AuditAndAlertBentoProps> = ({
  pendingQuestions,
  frozenProjects,
  overdueRecruits,
  onApproveQuestion,
  onNavigate,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 待审核题库 */}
      <BentoCard variant="default" padding="md" className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
            <div className="flex items-center gap-2">
              <FileCheck size={16} className="text-mission-500" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                学生提题待审
              </h3>
            </div>
            <Badge variant={pendingQuestions.length > 0 ? "alert" : "neutral"} size="sm">
              {pendingQuestions.length} 待批
            </Badge>
          </div>

          <div className="space-y-2">
            {pendingQuestions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">当前没有待审核题目</div>
            ) : (
              pendingQuestions.slice(0, 3).map((q) => (
                <div
                  key={q.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 text-xs flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {q.stem}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      提交人：{q.submittedByName || "学生"}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="growth"
                    className="h-7 px-2 text-[11px] shrink-0"
                    onClick={() => onApproveQuestion(q.id)}
                  >
                    通过
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => onNavigate("/teacher/question-bank")}
            className="text-[11px] text-mission-600 dark:text-mission-400 hover:underline flex items-center gap-1 font-medium"
          >
            进入题库审核中心 <ArrowRight size={12} />
          </button>
        </div>
      </BentoCard>

      {/* 冻结项目预警 */}
      <BentoCard variant="default" padding="md" className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
            <div className="flex items-center gap-2">
              <Snowflake size={16} className="text-alert-500" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                冻结课题预警
              </h3>
            </div>
            <Badge variant={frozenProjects.length > 0 ? "danger" : "growth"} size="sm">
              {frozenProjects.length} 冻结
            </Badge>
          </div>

          <div className="space-y-2">
            {frozenProjects.length === 0 ? (
              <div className="py-6 text-center text-xs text-growth-600 dark:text-growth-400">
                全班项目运转正常，无异常冻结
              </div>
            ) : (
              frozenProjects.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl bg-danger-50/40 dark:bg-danger-950/20 border border-danger-200/50 dark:border-danger-800/40 text-xs"
                >
                  <p className="font-semibold text-danger-900 dark:text-danger-200 truncate">
                    {p.name}
                  </p>
                  <span className="text-[10px] text-danger-600 dark:text-danger-400">
                    所属：{p.groupName}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => onNavigate("/projects")}
            className="text-[11px] text-mission-600 dark:text-mission-400 hover:underline flex items-center gap-1 font-medium"
          >
            处理异常项目 <ArrowRight size={12} />
          </button>
        </div>
      </BentoCard>

      {/* 超期招募提醒 */}
      <BentoCard variant="default" padding="md" className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-energy-500" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                超期招募提醒
              </h3>
            </div>
            <Badge variant={overdueRecruits.length > 0 ? "alert" : "neutral"} size="sm">
              {overdueRecruits.length} 逾期
            </Badge>
          </div>

          <div className="space-y-2">
            {overdueRecruits.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">暂无超时招募</div>
            ) : (
              overdueRecruits.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 text-xs flex items-center justify-between"
                >
                  <div className="truncate">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {r.title}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {r.owner} · 投标 {r.bids} 人
                    </span>
                  </div>
                  <span className="text-alert-600 text-[11px] font-bold shrink-0">
                    逾期 {r.overdueDays} 天
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => onNavigate("/projects")}
            className="text-[11px] text-mission-600 dark:text-mission-400 hover:underline flex items-center gap-1 font-medium"
          >
            查看招募市场 <ArrowRight size={12} />
          </button>
        </div>
      </BentoCard>
    </div>
  );
};
