import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import type { EnergyStudent } from "@/components/leaderboard/RankAvatars";
import EnergyLadder from "@/components/leaderboard/EnergyLadder";
import { Zap } from "lucide-react";

interface ClassEnergyGroup {
  id: string;
  name: string;
  coins: number;
  classId?: string;
  memberCount: number;
  students: EnergyStudent[];
}

interface ClassBarItem {
  classId: string;
  className: string;
  groups: ClassEnergyGroup[];
}

interface ClassEnergyBarsProps {
  barByClass: ClassBarItem[];
}

export const ClassEnergyBars: React.FC<ClassEnergyBarsProps> = ({ barByClass }) => {
  if (barByClass.length === 0) {
    return (
      <BentoCard variant="default" padding="lg" className="text-center py-10 text-xs text-slate-400">
        暂无小组能量数据
      </BentoCard>
    );
  }

  return (
    <div className="space-y-4">
      {barByClass.map((c) => (
        <BentoCard key={c.classId} variant="default" padding="md">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-energy-50 dark:bg-energy-950/40 text-energy-600 dark:text-energy-400">
                <Zap size={15} />
              </span>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {c.className} · 小组科研能量天梯 (⚡)
              </h3>
            </div>
            <Badge variant="energy" size="sm">
              {c.groups.length} 个科研小组
            </Badge>
          </div>

          <EnergyLadder rows={c.groups} />
        </BentoCard>
      ))}
    </div>
  );
};
