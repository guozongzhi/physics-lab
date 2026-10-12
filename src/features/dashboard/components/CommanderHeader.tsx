import React from "react";
import type { User, Group } from '@/types';
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { Users, Zap, Sparkles } from "lucide-react";

interface CommanderHeaderProps {
  user: User | null;
  group: Group | null;
  level: number;
  myCoins: number;
  upgradeNeed: number;
  levelProgress: number;
  pathProgress: number;
  completedSteps: number;
  totalSteps: number;
  showPwdHint: boolean;
  onOpenClassmates: () => void;
  onOpenChangePwd: () => void;
  onDismissPwdHint: () => void;
}

export const CommanderHeader: React.FC<CommanderHeaderProps> = ({
  user,
  group,
  level,
  myCoins,
  upgradeNeed,
  levelProgress,
  pathProgress,
  completedSteps,
  totalSteps,
  showPwdHint,
  onOpenClassmates,
  onOpenChangePwd,
  onDismissPwdHint,
}) => {
  return (
    <div className="space-y-4">
      {/* 初始密码安全警示 */}
      {showPwdHint && (
        <div className="student-password-hint flex items-center justify-between p-3.5 rounded-xl bg-alert-50 dark:bg-alert-950/40 border border-alert-200 dark:border-alert-800/60 text-alert-800 dark:text-alert-200 text-xs">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-alert-500/20 text-alert-600 dark:text-alert-400 font-bold">
              !
            </span>
            <span>当前正在使用初始默认密码，为确保科研成果数据安全，建议尽快修改。</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onOpenChangePwd}>
              立即修改
            </Button>
            <button
              type="button"
              onClick={onDismissPwdHint}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1"
            >
              稍后
            </button>
          </div>
        </div>
      )}

      {/* 指挥官全息档案卡 */}
      <BentoCard variant="accent" padding="lg" className="mission-hero relative overflow-hidden">
        <div className="student-commander-grid grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* 左侧：身份与所属编制 */}
          <div className="student-commander-identity lg:col-span-7 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="student-commander-avatar w-16 h-16 rounded-2xl bg-gradient-to-br from-mission-500 to-nova-600 flex items-center justify-center text-white text-2xl font-black shadow-md shadow-mission-500/20 shrink-0">
              {user?.name?.[0] || "U"}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {user?.name || "未知研究员"}
                </h1>
                <Badge variant="mission" size="sm">
                  LV.{level} 研究员
                </Badge>
                {group ? (
                  <Badge variant="nova" size="sm">
                    {group.name}
                  </Badge>
                ) : (
                  <Badge variant="alert" size="sm">
                    待分配小组
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>班级编号：{user?.classId || "未指定"}</span>
                <span>•</span>
                <button
                  type="button"
                  onClick={onOpenClassmates}
                  className="text-mission-600 dark:text-mission-400 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <Users size={12} /> 查看班级名册
                </button>
              </p>
            </div>
          </div>

          {/* 右侧：科研能量与流程总进度 */}
          <div className="student-commander-metrics lg:col-span-5 grid grid-cols-2 gap-4 border-t lg:border-t-0 lg:border-l border-slate-200/80 dark:border-slate-800/80 pt-4 lg:pt-0 lg:pl-6">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Zap size={13} className="text-energy-500" />
                <span>小组储备能量</span>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                {myCoins} <span className="text-xs font-normal text-energy-600">⚡</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                距升级还需 {upgradeNeed} ⚡
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Sparkles size={13} className="text-growth-500" />
                <span>学习路径进度</span>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                {pathProgress}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                已达标 {completedSteps}/{totalSteps} 阶段
              </div>
            </div>
          </div>
        </div>

        {/* 等级进度标尺 */}
        <div className="student-commander-ruler mt-5 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
            <span>当前段位：LV.{level}</span>
            <span>距 LV.{level + 1} 尚存 {100 - levelProgress}% 跨度</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-mission-500 via-nova-500 to-energy-500 transition-all duration-500 rounded-full"
              style={{ width: `${levelProgress}%` }}
            />
          </div>
        </div>
      </BentoCard>
    </div>
  );
};
