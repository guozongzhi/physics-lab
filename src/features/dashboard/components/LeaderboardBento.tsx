import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";

import { Trophy, ArrowRight, Zap, Megaphone } from "lucide-react";

export interface TeamRankItem {
  rank: number;
  name: string;
  level: string;
  coins: number;
  projects: number;
}

export interface LabNewsItem {
  time: string;
  group: string;
  event: string;
  coin: number;
  variant: "growth" | "danger";
}

interface LeaderboardBentoProps {
  rankings: TeamRankItem[];
  news: LabNewsItem[];
  myGroupId?: string;
  onNavigate: (path: string) => void;
}

export const LeaderboardBento: React.FC<LeaderboardBentoProps> = ({
  rankings,
  news,
  onNavigate,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 小组天梯排名 */}
      <BentoCard variant="default" padding="md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-alert-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              研究小组天梯榜
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("/coins")}
            className="text-[11px] text-mission-600 dark:text-mission-400 hover:underline flex items-center gap-0.5"
          >
            完整榜单 <ArrowRight size={12} />
          </button>
        </div>

        <div className="space-y-2">
          {rankings.slice(0, 5).map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 text-xs hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                    item.rank === 1
                      ? "bg-alert-100 text-alert-700 dark:bg-alert-950 dark:text-alert-400"
                      : item.rank === 2
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : item.rank === 3
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                      : "text-slate-400"
                  }`}
                >
                  {item.rank}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {item.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{item.level}</span>
              </div>
              <div className="font-bold text-energy-600 dark:text-energy-400 flex items-center gap-1 font-mono">
                <Zap size={11} /> {item.coins}
              </div>
            </div>
          ))}
        </div>
      </BentoCard>

      {/* 实时能量流水与简讯 */}
      <BentoCard variant="default" padding="md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-mission-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              实验室动态资讯
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("/coins")}
            className="text-[11px] text-mission-600 dark:text-mission-400 hover:underline flex items-center gap-0.5"
          >
            收支账本 <ArrowRight size={12} />
          </button>
        </div>

        <div className="space-y-2">
          {news.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">暂无最新动态简讯</div>
          ) : (
            news.slice(0, 5).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 text-xs"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                    <strong>{item.group}</strong>: {item.event}
                  </span>
                </div>
                <span
                  className={`font-mono font-bold shrink-0 text-xs ${
                    item.coin >= 0 ? "text-growth-600" : "text-danger-600"
                  }`}
                >
                  {item.coin >= 0 ? `+${item.coin}` : item.coin} ⚡
                </span>
              </div>
            ))
          )}
        </div>
      </BentoCard>
    </div>
  );
};
