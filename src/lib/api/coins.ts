import { api } from '../apiClient';
import type { ClassMeta, CoinTransaction } from '../../types';

// ---------- Coins / Rankings / Meta ----------
export interface GroupRankRow {
  groupId: string;
  name: string;
  totalCoins: number;
  rank: number;
}
export interface PersonalRankRow {
  userId: string;
  name: string;
  personalCoins: number;
  groupId: string;
  rank: number;
}

export const coinsApi = {
  transactions: (groupId?: string) =>
    api.get<CoinTransaction[]>(`/api/coin-transactions${groupId ? `?group_id=${groupId}` : ''}`),
  rankings: () =>
    api.get<{ groupRanking: GroupRankRow[]; personalRanking: PersonalRankRow[] }>('/api/rankings'),
  classMeta: () => api.get<ClassMeta>('/api/class-meta'),
  /** 教师调整挑战奖励单价（按题目难度） */
  updateClassMeta: (rates: { coinEasy: number; coinMedium: number; coinHard: number }) =>
    api.put<ClassMeta>('/api/class-meta', rates),
  /** 教师开关挑战/招募窗口。minutes 为空＝不限时（不自动关闭） */
  updateActivityWindow: (payload: {
    challengeOpen: boolean;
    challengeMinutes: number | null;
    recruitOpen: boolean;
    recruitMinutes: number | null;
  }) => api.put<ClassMeta>('/api/activity-window', payload),
  transfer: (payload: { sourceGroupId: string; targetGroupId: string; amount: number; note?: string }) =>
    api.post<{ refId: string; sourceBalanceAfter: number; targetBalanceAfter: number }>(
      '/api/coins/transfer',
      payload
    ),
};
