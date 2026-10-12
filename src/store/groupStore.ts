import { create } from 'zustand';
import type { Group, User, ClassMeta, MemberRole } from '../types';
import { LS_KEYS, loadLS, saveLS } from '../lib/storage';
import { initMockData } from '../data/mockData';
import { groupsApi, usersApi, coinsApi } from '../lib/apiService';
import { syncToApi } from '../lib/syncQueue';
import { apiEnabled } from '../lib/apiClient';
import { reviveDates } from '../lib/reviveDates';

interface GroupState {
  groups: Group[];
  users: User[];
  classMeta: ClassMeta;
  addGroup: (name: string, initialCoins: number) => void;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  setLeader: (groupId: string, userId: string) => void;
  assignUserGroup: (userId: string, groupId: string | null, role?: MemberRole) => void;
  /** 学生自助加入小组：本地乐观更新 + 后台同步。成功后返回后端最新的成员信息。 */
  joinGroup: (userId: string, groupId: string) => Promise<void>;
  updateContributionRatio: (groupId: string, ratioRecord: Record<string, number>) => void;
  /** 教师调小组能量币；note 为发放/扣除理由（写进流水，学生可见） */
  updateGroupCoins: (groupId: string, delta: number, note?: string) => number;
  /** 仅本地余额变更，不触发后端同步（用于转账等由后端业务端点统一记账的场景）。 */
  adjustGroupCoinsLocal: (groupId: string, delta: number) => number;
  /** 批量重置所有小组能量为目标值（基线重置，不写逐组流水）。 */
  resetAllGroupCoins: (targetCoins: number) => void;
  /** 教师调整挑战奖励单价（简单/中等/困难） */
  updateChallengeRates: (rates: { coinEasy: number; coinMedium: number; coinHard: number }) => void;
  /** 教师开关挑战/招募窗口。minutes 为空＝不限时；学生窗口外不能"新开局"。 */
  updateActivityWindow: (payload: {
    challengeOpen: boolean;
    challengeMinutes: number | null;
    recruitOpen: boolean;
    recruitMinutes: number | null;
  }) => void;
  updateUserPersonalCoins: (userId: string, delta: number) => void;
  /** 教师调整某学生个人能量币：乐观更新 + 同步后端（后端同时记录团队流水）。 */
  adjustUserCoins: (userId: string, delta: number, note?: string) => void;
  updateUserAvatar: (userId: string, avatar: string) => void;
  getGroupUsers: (groupId: string) => User[];
  getUserById: (userId: string) => User | undefined;
  getGroupById: (groupId: string) => Group | undefined;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const loadUsersFromGroups = (): User[] => {
  const existingUsers = loadLS<User[] | null>('plab_users_cache', null);
  if (existingUsers && existingUsers.length > 0) return existingUsers;
  return [];
};

export const useGroupStore = create<GroupState>((set, get) => {
  if (!apiEnabled) initMockData();
  const initialGroups = apiEnabled ? [] : loadLS<Group[]>(LS_KEYS.GROUPS, []);
  const initialUsers = apiEnabled ? [] : loadUsersFromGroups();
  const initialClassMeta = loadLS<ClassMeta>(LS_KEYS.CLASS_META, {
    initialCoinsPerGroup: 500,
    termName: '',
    coinEasy: 1,
    coinMedium: 2,
    coinHard: 3,
    // 默认全开：老师是"主动去关"，不是"发现功能已经被锁上"
    challengeWindowOpen: true,
    challengeWindowMinutes: null,
    challengeWindowClosesAt: null,
    recruitWindowOpen: true,
    recruitWindowMinutes: null,
    recruitWindowClosesAt: null,
  });

  const persistAll = (groups: Group[], users: User[], classMeta: ClassMeta) => {
    saveLS(LS_KEYS.GROUPS, groups);
    saveLS('plab_users_cache', users);
    saveLS(LS_KEYS.CLASS_META, classMeta);
  };

  return {
    groups: initialGroups,
    users: initialUsers,
    classMeta: initialClassMeta,

    addGroup: (name, initialCoins) => {
      const { groups, users, classMeta } = get();
      // 在线模式：不本地造临时组，等后端返回真实 id 后再注入，避免成员被分配到
      // 随后端重拉而变化的临时 id；离线模式直接本地新增。
      if (apiEnabled) {
        syncToApi(async () => {
          await groupsApi.create(name, initialCoins);
          const fresh = await groupsApi.list();
          set({ groups: fresh });
          persistAll(fresh, get().users, get().classMeta);
        }, 'groups.create');
        return;
      }
      const id = `g_${uid()}`;
      const newGroup: Group = {
        id,
        name,
        logo: '#0D47A1',
        totalCoins: initialCoins,
        initialCoins,
        classId: null,
        contributionRatio: {},
      };
      const nextGroups = [...groups, newGroup];
      persistAll(nextGroups, users, classMeta);
      set({ groups: nextGroups });
    },

    deleteGroup: (id) => {
      const { groups, users, classMeta } = get();
      const nextGroups = groups.filter((g) => g.id !== id);
      const nextUsers = users.filter((u) => u.groupId !== id);
      persistAll(nextGroups, nextUsers, classMeta);
      set({ groups: nextGroups, users: nextUsers });
      syncToApi(() => groupsApi.remove(id), 'groups.remove');
    },

    renameGroup: (id, name) => {
      const { groups, users, classMeta } = get();
      const nextGroups = groups.map((g) => (g.id === id ? { ...g, name } : g));
      persistAll(nextGroups, users, classMeta);
      set({ groups: nextGroups });
      syncToApi(() => groupsApi.rename(id, name), 'groups.rename');
    },

    setLeader: (groupId, userId) => {
      const { groups, users, classMeta } = get();
      const nextUsers = users.map((u) => {
        if (u.groupId !== groupId) return u;
        return { ...u, role: (u.id === userId ? 'leader' : 'member') as MemberRole };
      });
      persistAll(groups, nextUsers, classMeta);
      set({ users: nextUsers });
      syncToApi(() => groupsApi.setLeader(groupId, userId), 'groups.setLeader');
    },

    assignUserGroup: (userId, groupId, role = 'member') => {
      const { groups, users, classMeta } = get();
      const nextUsers = users.map((u) =>
        u.id === userId
          ? { ...u, groupId, role: (groupId ? role : 'member') as MemberRole }
          : u
      );
      persistAll(groups, nextUsers, classMeta);
      set({ users: nextUsers });
      syncToApi(() => usersApi.assignGroup(userId, groupId, role), 'users.assignGroup');
    },

    joinGroup: async (userId, groupId) => {
      // 后端权威接口：POST /api/groups/{id}/join —— 由后端校验“尚未分配小组”。
      const joined = await groupsApi.join(groupId);
      const { groups, users, classMeta } = get();
      const exists = users.some((u) => u.id === userId);
      const merged = { ...joined, groupId, role: (joined.role || 'member') as MemberRole };
      const nextUsers = exists
        ? users.map((u) => (u.id === userId ? { ...u, ...merged } : u))
        : [...users, merged];
      persistAll(groups, nextUsers, classMeta);
      set({ users: nextUsers });
    },

    updateContributionRatio: (groupId, ratioRecord) => {
      const sum = Object.values(ratioRecord).reduce((acc, v) => acc + v, 0);
      if (sum !== 100) {
        throw new Error(`贡献比例之和必须为 100，当前为 ${sum}`);
      }
      const { groups, users, classMeta } = get();
      const nextGroups = groups.map((g) =>
        g.id === groupId ? { ...g, contributionRatio: { ...ratioRecord } } : g
      );
      persistAll(nextGroups, users, classMeta);
      set({ groups: nextGroups });
      syncToApi(
        () => groupsApi.updateContribution(groupId, ratioRecord),
        'groups.updateContribution'
      );
    },

    updateGroupCoins: (groupId, delta, note) => {
      const { groups, users, classMeta } = get();
      let newBalance = 0;
      const nextGroups = groups.map((g) => {
        if (g.id === groupId) {
          newBalance = Math.max(0, g.totalCoins + delta);
          return { ...g, totalCoins: newBalance };
        }
        return g;
      });
      persistAll(nextGroups, users, classMeta);
      set({ groups: nextGroups });
      syncToApi(() => groupsApi.adjustCoins(groupId, delta, note), 'groups.adjustCoins');
      return newBalance;
    },

    adjustGroupCoinsLocal: (groupId, delta) => {
      const { groups, users, classMeta } = get();
      let newBalance = 0;
      const nextGroups = groups.map((g) => {
        if (g.id === groupId) {
          newBalance = Math.max(0, g.totalCoins + delta);
          return { ...g, totalCoins: newBalance };
        }
        return g;
      });
      persistAll(nextGroups, users, classMeta);
      set({ groups: nextGroups });
      return newBalance;
    },

    resetAllGroupCoins: (targetCoins) => {
      const { groups, users, classMeta } = get();
      const nextGroups = groups.map((g) => ({ ...g, totalCoins: targetCoins }));
      persistAll(nextGroups, users, classMeta);
      set({ groups: nextGroups });
      syncToApi(() => groupsApi.resetCoins(targetCoins), 'groups.resetCoins');
    },

    /** 教师调整挑战奖励单价。奖励由题目难度累加得出，后端才是权威值。 */
    updateChallengeRates: (rates) => {
      const { groups, users, classMeta } = get();
      const nextMeta = { ...classMeta, ...rates };
      persistAll(groups, users, nextMeta);
      set({ classMeta: nextMeta });
      syncToApi(() => coinsApi.updateClassMeta(rates), 'classMeta.update');
    },

    /**
     * 教师开关挑战/招募窗口。本地存"开关 + 时长 + 到期时间"，到不到点由
     * `lib/activityWindow` 按当前时间现算——惰性判定，不需要定时器。
     * minutes 存下来是给界面回显选项用的：closesAt 会随时间衰减，分钟数不会。
     */
    updateActivityWindow: (payload) => {
      const { groups, users, classMeta } = get();
      const closesAt = (isOpen: boolean, minutes: number | null) =>
        isOpen && minutes ? new Date(Date.now() + minutes * 60000) : null;
      const nextMeta: ClassMeta = {
        ...classMeta,
        challengeWindowOpen: payload.challengeOpen,
        challengeWindowMinutes: payload.challengeOpen ? payload.challengeMinutes : null,
        challengeWindowClosesAt: closesAt(payload.challengeOpen, payload.challengeMinutes),
        recruitWindowOpen: payload.recruitOpen,
        recruitWindowMinutes: payload.recruitOpen ? payload.recruitMinutes : null,
        recruitWindowClosesAt: closesAt(payload.recruitOpen, payload.recruitMinutes),
      };
      persistAll(groups, users, nextMeta);
      set({ classMeta: nextMeta });
      syncToApi(async () => {
        const fresh = await coinsApi.updateActivityWindow(payload);
        // 后端算出的到期时间是权威值，回填对齐；同样要过 reviveDates——
        // 后端给的是无时区 UTC 串，直接 new Date 会早 8 小时。
        const revived = reviveDates(
          [fresh],
          ['challengeWindowClosesAt', 'recruitWindowClosesAt']
        )[0];
        set({ classMeta: { ...get().classMeta, ...revived } });
      }, 'classMeta.window');
    },

    updateUserPersonalCoins: (userId, delta) => {
      const { groups, users, classMeta } = get();
      const nextUsers = users.map((u) =>
        u.id === userId ? { ...u, personalCoins: u.personalCoins + delta } : u
      );
      persistAll(groups, nextUsers, classMeta);
      set({ users: nextUsers });
      // 后端个人币变动由“组内金币结算/结算流程”统一记账，此处无独立端点，仅本地乐观更新。
    },

    adjustUserCoins: (userId, delta, note) => {
      const { groups, users, classMeta } = get();
      const target = users.find((u) => u.id === userId);
      const nextUsers = users.map((u) =>
        u.id === userId ? { ...u, personalCoins: Math.max(0, u.personalCoins + delta) } : u
      );
      // 小组总能量随成员个人能量同步变化
      const nextGroups = target?.groupId
        ? groups.map((g) => (g.id === target.groupId ? { ...g, totalCoins: Math.max(0, g.totalCoins + delta) } : g))
        : groups;
      persistAll(nextGroups, nextUsers, classMeta);
      set({ users: nextUsers, groups: nextGroups });
      syncToApi(() => usersApi.adjustCoins(userId, delta, note), 'users.adjustCoins');
    },

    updateUserAvatar: (userId, avatar) => {
      const { groups, users, classMeta } = get();
      const nextUsers = users.map((u) =>
        u.id === userId ? { ...u, avatar } : u
      );
      persistAll(groups, nextUsers, classMeta);
      set({ users: nextUsers });
      syncToApi(() => usersApi.updateAvatar(userId, avatar), 'users.updateAvatar');
    },

    getGroupUsers: (groupId) => get().users.filter((u) => u.groupId === groupId),

    getUserById: (userId) => get().users.find((u) => u.id === userId),

    getGroupById: (groupId) => get().groups.find((g) => g.id === groupId),
  };
});
