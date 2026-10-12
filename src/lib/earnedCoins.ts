import type { CoinTransaction } from '@/types';

/**
 * 计算每个学生的「累计获得」能量币。
 *
 * 口径：该学生名下、**最近一次清零之后**的**正向**流水增量之和。
 *   - 只取正增量：标签是"获得"，把转账/扣减的负数也算进去会显示成负数，误导学生；
 *   - 尊重 source='reset' 标记（教师端「清零累计获得」写入）：只统计该标记之后的流水，
 *     于是清零后归 0，而历史流水一条不删。
 *
 * 教师端（学生名单）与学生端（我的小组）共用此函数，避免两处口径走偏。
 */
export function computeEarnedByUser(coinTxs: CoinTransaction[]): Record<string, number> {
  const at = (d: Date | string) => new Date(d).getTime();

  const lastReset: Record<string, number> = {};
  for (const tx of coinTxs) {
    if (tx.source !== 'reset' || !tx.userId) continue;
    const t = at(tx.createdAt);
    if (!lastReset[tx.userId] || t > lastReset[tx.userId]) lastReset[tx.userId] = t;
  }

  const earned: Record<string, number> = {};
  for (const tx of coinTxs) {
    if (!tx.userId || tx.delta <= 0) continue;
    if (lastReset[tx.userId] && at(tx.createdAt) <= lastReset[tx.userId]) continue;
    earned[tx.userId] = (earned[tx.userId] || 0) + tx.delta;
  }
  return earned;
}

/** 判断某学生名下是否存在清零标记（用于界面提示）。 */
export function hasBeenReset(coinTxs: CoinTransaction[], userId: string): boolean {
  return coinTxs.some((tx) => tx.source === 'reset' && tx.userId === userId);
}
