import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Button } from "@/design-system/components/Button";
import { BarChart3, Download } from "lucide-react";
import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { formatAxisTick } from "@/lib/utils";
import type { SchoolClass } from '@/types';

interface DataInsightsBentoProps {
  insightClass: string;
  classes: SchoolClass[];
  onClassChange: (c: string) => void;
  coinTrend: { date: string; value: number }[];
  recruitStatus: { name: string; value: number; color: string }[];
  classScale: { name: string; 小组: number; 学生: number }[];
  onExportCSV: (filename: string, rows: Record<string, unknown>[]) => void;
}

export const DataInsightsBento: React.FC<DataInsightsBentoProps> = ({
  insightClass,
  classes,
  onClassChange,
  coinTrend,
  recruitStatus,
  classScale,
  onExportCSV,
}) => {
  return (
    <BentoCard variant="default" padding="lg" className="space-y-4">
      {/* 顶部标题与班级筛选 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-mission-50 dark:bg-mission-950/40 text-mission-600 dark:text-mission-400">
            <BarChart3 size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              班级宏观数据洞察
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              近 30 天能量流转轨迹、招募供需与班级编制
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={insightClass}
            onChange={(e) => onClassChange(e.target.value)}
            className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 cursor-pointer min-w-[130px]"
          >
            <option value="all">全部班级范围</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download size={13} />}
            onClick={() => onExportCSV("能量币30天趋势.csv", coinTrend)}
          >
            导出趋势
          </Button>
        </div>
      </div>

      {/* 三列图表布局 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {/* 1. 能量币走势 */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
            能量币日流转趋势 (⚡)
          </span>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ReLineChart data={coinTrend} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} interval={5} />
                <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} tickFormatter={formatAxisTick} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid rgba(255,255,255,0.9)" }} />
                <Line type="monotone" dataKey="value" stroke="#4F7CFF" strokeWidth={2.5} dot={false} />
              </ReLineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. 招募状态分布 */}
        <div className="lg:col-span-3 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              招募市场分布
            </span>
            <button
              type="button"
              onClick={() => onExportCSV("招募状态分布.csv", recruitStatus)}
              className="text-[11px] text-mission-600 hover:underline"
            >
              CSV
            </button>
          </div>
          <div className="h-[180px] w-full">
            {recruitStatus.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                暂无招募记录
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={recruitStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3}>
                    {recruitStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 3. 班级规模分布 */}
        <div className="lg:col-span-4 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              班级学生与小组规模
            </span>
            <button
              type="button"
              onClick={() => onExportCSV("班级规模.csv", classScale)}
              className="text-[11px] text-mission-600 hover:underline"
            >
              CSV
            </button>
          </div>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classScale} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="学生" fill="#4F7CFF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="小组" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </BentoCard>
  );
};
