import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Badge } from "@/design-system/components/Badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Zap } from "lucide-react";
import { formatAxisTick } from "@/lib/utils";

interface ClassEnergyGroup {
  id: string;
  name: string;
  coins: number;
  classId?: string;
  memberCount: number;
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
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3">
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

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.groups} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} tickFormatter={formatAxisTick} />
                <Tooltip
                  formatter={(val: number | string, _name: string, item: { payload: ClassEnergyGroup }) => [
                    `${val} ⚡ (${item.payload.memberCount} 人)`,
                    "小组能量",
                  ]}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="coins" fill="#FF8A34" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </BentoCard>
      ))}
    </div>
  );
};
