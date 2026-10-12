import React from "react";
import { BentoCard } from "@/design-system/components/BentoCard";
import { Button } from "@/design-system/components/Button";

import { ArrowRightLeft, Download } from "lucide-react";
import type { CoinTransaction } from '@/types';

interface RecentTxItem extends CoinTransaction {
  timeLabel: string;
  groupName: string;
}

interface RecentLedgerBentoProps {
  transactions: RecentTxItem[];
  allCsvRows: Record<string, unknown>[];
  onExportCSV: (filename: string, rows: Record<string, unknown>[]) => void;
}

export const RecentLedgerBento: React.FC<RecentLedgerBentoProps> = ({
  transactions,
  allCsvRows,
  onExportCSV,
}) => {
  return (
    <BentoCard variant="default" padding="lg">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-energy-50 dark:bg-energy-950/40 text-energy-600 dark:text-energy-400">
            <ArrowRightLeft size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              全班科研能量流通台账
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              实时追踪小组奖励、对赌挑战分账、转账与扣罚明细
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          leftIcon={<Download size={13} />}
          onClick={() => onExportCSV("班级能量账本明细.csv", allCsvRows)}
        >
          导出完整账本 ({allCsvRows.length} 条)
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-medium pb-2">
              <th className="py-2.5 px-3">时间</th>
              <th className="py-2.5 px-3">受影响小组</th>
              <th className="py-2.5 px-3">收支理由/来源</th>
              <th className="py-2.5 px-3 text-right">能量变动</th>
              <th className="py-2.5 px-3 text-right">结算后余额</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {transactions.slice(0, 10).map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors">
                <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                  {tx.timeLabel}
                </td>
                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                  {tx.groupName}
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                  {tx.note || tx.source}
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-bold">
                  <span className={tx.delta >= 0 ? "text-growth-600" : "text-danger-600"}>
                    {tx.delta >= 0 ? `+${tx.delta}` : tx.delta} ⚡
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                  {tx.balanceAfter} ⚡
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
};
