import React from "react";
import type { Project } from '@/types';
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { FlaskConical, Plus, ArrowRight, ShieldCheck, Clock } from "lucide-react";

interface ActiveProjectBentoProps {
  projects: Project[];
  hasGroup: boolean;
  onNavigate: (path: string) => void;
  onCreateProject?: () => void;
}

export const ActiveProjectBento: React.FC<ActiveProjectBentoProps> = ({
  projects,
  hasGroup,
  onNavigate,
  onCreateProject,
}) => {
  const currentProject = projects[0];

  return (
    <BentoCard
      variant="default"
      padding="lg"
      className="flex flex-col justify-between lg:h-full"
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-mission-50 dark:bg-mission-950/40 text-mission-600 dark:text-mission-400">
              <FlaskConical size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                本组重点科研项目
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                当前进行中的实验研发与阶段攻关
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onNavigate("/projects")}
            rightIcon={<ArrowRight size={13} />}
          >
            全部项目 ({projects.length})
          </Button>
        </div>

        {!hasGroup ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            您尚未加入任何研究小组，加入后即可认领或立项科研课题。
          </div>
        ) : !currentProject ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-slate-500">本组暂无处于进行中的课题项目</p>
            {onCreateProject && (
              <Button size="sm" variant="primary" leftIcon={<Plus size={14} />} onClick={onCreateProject}>
                发起新科研立项
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-mission-600 dark:text-mission-400 uppercase tracking-wider">
                  课题方向：{currentProject.topic || "物理综合探索"}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {currentProject.title}
                </h3>
              </div>
              <Badge
                variant={
                  currentProject.status === "done"
                    ? "growth"
                    : currentProject.status === "review"
                    ? "alert"
                    : "mission"
                }
                size="sm"
              >
                {currentProject.status === "done"
                  ? "已结题"
                  : currentProject.status === "review"
                  ? "审核中"
                  : "研发中"}
              </Badge>
            </div>

            {/* 研发进度 */}
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> 里程碑进度
                </span>
                <span>{currentProject.progress || 0}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-mission-500 to-growth-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, currentProject.progress || 0))}%`,
                  }}
                />
              </div>
            </div>

            {/* 器材与安全认证情况 */}
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              <span className="text-slate-500">实验器材:</span>
              {currentProject.equipmentList && currentProject.equipmentList.length > 0 ? (
                currentProject.equipmentList.slice(0, 3).map((eq, idx) => (
                  <Badge key={idx} variant="neutral" size="sm">
                    {eq.name}
                  </Badge>
                ))
              ) : (
                <span className="text-slate-400">常规教具</span>
              )}

              <div className="ml-auto flex items-center gap-1 text-growth-600 dark:text-growth-400 font-medium">
                <ShieldCheck size={14} />
                <span>安全规程已就绪</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {currentProject && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            预估完成报酬：<strong className="text-energy-600">+{currentProject.rewardCoins || 100} ⚡</strong>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate(`/projects`)}
          >
            进入实验看板
          </Button>
        </div>
      )}
    </BentoCard>
  );
};
