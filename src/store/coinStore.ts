import { create } from 'zustand';
import type { CoinTransaction, CoinSource, Challenge, Recruitment, Project } from '../types';
import { LS_KEYS, loadLS, saveLS } from '../lib/storage';
import { useGroupStore } from './groupStore';
import { apiEnabled } from '../lib/apiClient';
import { useAuthStore } from './authStore';
import type { CoinTransferRequest } from '../lib/api/coins';
import { coinsApi, groupsApi } from '../lib/apiService';
import { windowState, windowClosedMessage } from '../lib/activityWindow';

/**
 * 能量币 store。
 *
 * 后端模式下的记账契约（避免双重记账）：
 *   - 交易记录与小组余额由后端在对应业务端点内统一生成：
 *       · 教师金币变动 → groupStore.updateGroupCoins → POST /groups/{id}/coins
 *       · 挑战结算 → POST /challenges/{id}/submit（后端 settle_challenge）
 *       · 招募结算 → PUT /recruitments/{id}/resolve（后端 settle_recruitment）
 *       · 项目完成 → POST /projects/{id}/done（后端 settle_project_done）
 *       · 组间转账 → transferCoins 提交申请，教师审核通过后后端原子记账
 *   - 因此本 store 的 addTx / settleXxx 仅做“本地乐观更新”，用于即时展示流水，
 *     不再单独向后端推送交易；下次 bootstrapFromApi 重拉时以后端为准对齐。
 */

interface CoinState {
  coinTxs: CoinTransaction[];
  transfers: CoinTransferRequest[];
  loadTransfers: () => Promise<void>;
  reviewTransfer: (id: string, decision: 'approve' | 'reject', note: string) => Promise<void>;
  addTx: (
    groupId: string,
    tx: { source: CoinSource; refId: string; delta: number; note: string },
    userId?: string
  ) => CoinTransaction;
  settleChallenge: (
    challenge: Challenge,
    solverGroupId: string,
    accuracy: number
  ) => { solverReward: number; creatorRefund: number };
  settleRecruitment: (
    recruitment: Recruitment,
    result: 'success' | 'partial' | 'fail',
    ownerGroupId?: string
  ) => { assigneePay: number; ownerRefund: number };
  settleProjectDone: (project: Project) => Record<string, number>;
  /** 提交转账申请，审核通过前不变更余额或流水。 */
  transferCoins: (
    fromGroupId: string,
    toGroupId: string,
    amount: number,
    note: string,
    userId?: string
  ) => Promise<void>;
  getRankings: () => {
    groupRanking: { groupId: string; name: string; totalCoins: number; rank: number }[];
    personalRanking: { userId: string; name: string; personalCoins: number; groupId: string; rank: number }[];
  };
}

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const useCoinStore = create<CoinState>((set, get) => {
  const initialTxs = loadLS<CoinTransaction[]>(LS_KEYS.COIN_TXS, []);

  const persist = (txs: CoinTransaction[]) => {
    saveLS(LS_KEYS.COIN_TXS, txs);
  };

  return {
    coinTxs: initialTxs,
    transfers: apiEnabled ? [] : loadLS<CoinTransferRequest[]>(LS_KEYS.COIN_TRANSFERS, []),
    loadTransfers: async () => {
      if (!apiEnabled) return;
      const userId = useAuthStore.getState().userId;
      const [transfers, groups, coinTxs] = await Promise.all([
        coinsApi.transfers(), groupsApi.list(), coinsApi.transactions(),
      ]);
      if (useAuthStore.getState().userId !== userId) return;
      useGroupStore.setState({ groups });
      set({ transfers, coinTxs });
    },
    reviewTransfer: async (id, decision, note) => {
      const auth = useAuthStore.getState();
      if (auth.role !== 'teacher' && auth.role !== 'admin') throw new Error('只有教师可以审核');
      let reviewed: CoinTransferRequest;
      if (apiEnabled) {
        reviewed = await coinsApi.reviewTransfer(id, decision, note);
        if (useAuthStore.getState().userId !== auth.userId) return;
      } else {
        const request = get().transfers.find((t) => t.id === id);
        if (!request || request.status !== 'pending') throw new Error('该申请已审核，请刷新列表');
        const { getGroupById } = useGroupStore.getState();
        const source = getGroupById(request.sourceGroupId);
        const target = getGroupById(request.targetGroupId);
        if (!source || !target) throw new Error('转账小组已不存在');
        if (auth.classId && (source.classId !== auth.classId || target.classId !== auth.classId)) {
          throw new Error('只能操作本班资源');
        }
        if (decision === 'approve') {
          if (source.totalCoins < request.amount) throw new Error('当前余额不足，无法通过审核');
          get().addTx(source.id, { source: 'transfer', refId: id, delta: -request.amount,
            note: `转账给「${target.name}」${request.note ? `：${request.note}` : ''}` }, request.requestedBy);
          get().addTx(target.id, { source: 'transfer', refId: id, delta: request.amount,
            note: `收到「${source.name}」转账${request.note ? `：${request.note}` : ''}` });
        }
        reviewed = { ...request, status: decision === 'approve' ? 'approved' : 'rejected',
          reviewedBy: auth.userId || undefined, reviewedAt: new Date(), reviewNote: note.trim() };
      }
      const transfers = get().transfers.map((t) => t.id === id ? reviewed : t);
      set({ transfers });
      if (!apiEnabled) saveLS(LS_KEYS.COIN_TRANSFERS, transfers);
    },

    addTx: (groupId, tx, userId) => {
      // 仅本地乐观更新（后端由业务端点统一记账），不触发 groupsApi.adjustCoins
      const balanceAfter = useGroupStore.getState().adjustGroupCoinsLocal(groupId, tx.delta);
      const newTx: CoinTransaction = {
        id: uid(),
        groupId,
        userId,
        source: tx.source,
        refId: tx.refId,
        delta: tx.delta,
        balanceAfter,
        createdAt: new Date(),
        note: tx.note,
      };
      const nextTxs = [...get().coinTxs, newTx];
      persist(nextTxs);
      set({ coinTxs: nextTxs });
      return newTx;
    },

    transferCoins: async (fromGroupId, toGroupId, amount, note) => {
      const auth = useAuthStore.getState();
      const { getGroupById, getUserById } = useGroupStore.getState();
      const user = auth.userId ? getUserById(auth.userId) : undefined;
      if (auth.role !== 'student' || user?.role !== 'leader' || user.groupId !== fromGroupId) {
        throw new Error('只有本组组长可以发起转账申请');
      }
      if (!windowState(useGroupStore.getState().classMeta).transfer) {
        throw new Error(windowClosedMessage('transfer'));
      }
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('转账金额必须为正整数');
      if (fromGroupId === toGroupId) throw new Error('不能转账给自己小组');
      const source = getGroupById(fromGroupId);
      const target = getGroupById(toGroupId);
      if (!source || !target) throw new Error('小组不存在');
      if (source.classId !== target.classId) throw new Error('只能操作本班资源');
      if (source.totalCoins < amount) throw new Error('小组能量币不足');
      const request: CoinTransferRequest = apiEnabled
        ? await coinsApi.transfer({ sourceGroupId: fromGroupId, targetGroupId: toGroupId, amount, note: note.trim() })
        : { id: uid(), sourceGroupId: fromGroupId, targetGroupId: toGroupId, amount,
            note: note.trim(), requestedBy: user.id, status: 'pending', createdAt: new Date(), reviewNote: '' };
      if (useAuthStore.getState().userId !== auth.userId) return;
      const transfers = [request, ...get().transfers];
      set({ transfers });
      if (!apiEnabled) saveLS(LS_KEYS.COIN_TRANSFERS, transfers);
    },

    settleChallenge: (challenge, solverGroupId, accuracy) => {
      const reward = Math.floor(challenge.reward * accuracy);
      const bonus = accuracy >= 0.95 ? Math.floor(challenge.reward * 0.2) : 0;
      const solverReward = reward + bonus;
      const creatorRefund = challenge.reward - reward;

      const addTx = get().addTx;

      addTx(solverGroupId, {
        source: 'challenge',
        refId: challenge.id,
        delta: solverReward,
        note: `挑战「${challenge.title}」答对奖励${accuracy >= 0.95 ? '(含卓越加成)' : ''}`,
      });

      if (creatorRefund > 0) {
        addTx(challenge.creatorGroupId, {
          source: 'challenge',
          refId: challenge.id,
          delta: creatorRefund,
          note: `挑战「${challenge.title}」剩余能量币回收`,
        });
      }

      return { solverReward, creatorRefund };
    },

    settleRecruitment: (recruitment, result, ownerGroupId) => {
      const { addTx } = get();
      const { getUserById } = useGroupStore.getState();
      const assigneeUser = recruitment.assigneeUserId
        ? getUserById(recruitment.assigneeUserId)
        : undefined;
      const assigneeGroupId = assigneeUser?.groupId;

      // 押金在发布招募时就已从发包组扣下，这里只按结果分账，不再增发能量币。
      // 改动前发布的存量招募没有 escrowPaid，在此补扣（扣不满就按实际扣到的算）。
      let escrowed = recruitment.escrowPaid ?? 0;
      if (escrowed <= 0 && ownerGroupId && recruitment.reward > 0) {
        const before = useGroupStore.getState().getGroupById(ownerGroupId)?.totalCoins ?? 0;
        const tx = addTx(ownerGroupId, {
          source: 'recruit',
          refId: recruitment.id,
          delta: -recruitment.reward,
          note: `招募「${recruitment.title}」补扣押金`,
        });
        escrowed = before - tx.balanceAfter;
      }

      const assigneePay =
        result === 'success' ? escrowed : result === 'partial' ? Math.floor(escrowed / 2) : 0;

      let paid = 0;
      if (assigneePay > 0 && assigneeGroupId) {
        addTx(
          assigneeGroupId,
          {
            source: 'recruit',
            refId: recruitment.id,
            delta: assigneePay,
            note: `招募「${recruitment.title}」${result === 'success' ? '全额' : '部分'}酬劳`,
          },
          recruitment.assigneeUserId
        );
        paid = assigneePay;
      }

      // 没付出去的一律退回发包组（含中标学生没有小组的情况），不让能量币消失
      const ownerRefund = escrowed - paid;
      if (ownerRefund > 0 && ownerGroupId) {
        addTx(ownerGroupId, {
          source: 'recruit',
          refId: recruitment.id,
          delta: ownerRefund,
          note: `招募「${recruitment.title}」${result === 'fail' ? '失败' : '剩余'}押金退回`,
        });
      }

      return { assigneePay: paid, ownerRefund };
    },

    settleProjectDone: (project) => {
      const { addTx } = get();
      const { getGroupById, getGroupUsers, updateUserPersonalCoins } = useGroupStore.getState();
      const group = getGroupById(project.ownerGroupId);
      const userEarnings: Record<string, number> = {};

      if (!group) return userEarnings;

      const members = getGroupUsers(project.ownerGroupId);
      const totalReward = project.rewardCoins;

      // 与后端 settle_project_done 保持一致：比例表覆盖不到本组成员时（历史遗留的失效 id），
      // 按人头均分兜底，避免"项目做完了谁都拿不到个人能量"这种静默失败。
      const ratioSum = members.reduce((s, m) => s + (group.contributionRatio[m.id] || 0), 0);
      if (members.length > 0 && ratioSum > 0) {
        members.forEach((member) => {
          const personalEarning = Math.floor((totalReward * (group.contributionRatio[member.id] || 0)) / 100);
          if (personalEarning > 0) {
            userEarnings[member.id] = personalEarning;
            updateUserPersonalCoins(member.id, personalEarning);
          }
        });
      } else if (members.length > 0) {
        const share = Math.floor(totalReward / members.length);
        const remainder = totalReward - share * members.length;
        members.forEach((member, i) => {
          const personalEarning = share + (i < remainder ? 1 : 0);
          if (personalEarning > 0) {
            userEarnings[member.id] = personalEarning;
            updateUserPersonalCoins(member.id, personalEarning);
          }
        });
      }

      addTx(project.ownerGroupId, {
        source: 'project',
        refId: project.id,
        delta: totalReward,
        note: `项目「${project.title}」完成奖励`,
      });

      return userEarnings;
    },

    getRankings: () => {
      const { groups, users } = useGroupStore.getState();

      const groupRanking = [...groups]
        .sort((a, b) => b.totalCoins - a.totalCoins)
        .map((g, idx) => ({
          groupId: g.id,
          name: g.name,
          totalCoins: g.totalCoins,
          rank: idx + 1,
        }));

      const personalRanking = [...users]
        .sort((a, b) => b.personalCoins - a.personalCoins)
        .map((u, idx) => ({
          userId: u.id,
          name: u.name,
          personalCoins: u.personalCoins,
          groupId: u.groupId,
          rank: idx + 1,
        }));

      return { groupRanking, personalRanking };
    },
  };
});
