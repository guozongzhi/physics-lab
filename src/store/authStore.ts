import { create } from 'zustand';
import type { CurrentUser, UserRole } from '../types';
import { LS_KEYS, loadLS, saveLS } from '../lib/storage';
import { apiEnabled, apiLogin, apiLogout, apiRegister, getToken, RegisterPayload } from '../lib/apiClient';
import { clearBusinessData } from '../lib/sessionCleanup';
import { resetSyncQueue } from '../lib/syncQueue';
import { resetBootstrap } from '../lib/bootstrap';

interface AuthState extends CurrentUser {
  /** 登录用户显示名（后端模式下由 JWT 登录结果填充）。 */
  name: string | null;
  /** 认证请求进行中。 */
  authLoading: boolean;
  /** 最近一次认证错误信息。 */
  authError: string | null;

  // 离线模式（localStorage）保留的同步方法
  loginStudent: (params: { userId: string; groupId: string }) => void;
  loginTeacher: () => void;
  /** 学生自助加入小组后，同步当前登录态的 groupId。 */
  setGroupId: (groupId: string | null) => void;
  /** 本人改完密码后调用：清掉「还在用初始密码」标记，首页提示随之消失。 */
  markPasswordChanged: () => void;

  // 后端模式（JWT）异步方法
  loginWithApi: (username: string, password: string) => Promise<CurrentUser & { name: string }>;
  registerWithApi: (payload: RegisterPayload) => Promise<CurrentUser & { name: string }>;

  logout: () => void;
  init: () => void;
}

const persist = (state: CurrentUser & { name?: string | null }) => {
  saveLS(LS_KEYS.CURRENT_USER, state);
};

export const useAuthStore = create<AuthState>((set) => {
  const initial = loadLS<CurrentUser & { name?: string | null }>(LS_KEYS.CURRENT_USER, {
    userId: null,
    classId: null,
    groupId: null,
    role: null,
    name: null,
  });
  // 后端模式下，若无 token 则视为未登录（避免残留的 localStorage 用户态）
  const validForApi = !apiEnabled || Boolean(getToken());

  return {
    userId: validForApi ? initial.userId : null,
    classId: validForApi ? initial.classId : null,
    groupId: validForApi ? initial.groupId : null,
    role: validForApi ? initial.role : null,
    name: validForApi ? initial.name ?? null : null,
    authLoading: false,
    authError: null,

    init: () => {
      const saved = loadLS<CurrentUser & { name?: string | null }>(LS_KEYS.CURRENT_USER, {
        userId: null,
        classId: null,
        groupId: null,
        role: null,
        name: null,
      });
      if (apiEnabled && !getToken()) {
        set({ userId: null, classId: null, groupId: null, role: null, name: null });
        return;
      }
      set(saved);
    },

    loginStudent: ({ userId, groupId }) => {
      const next = { userId, classId: null, groupId, role: 'student' as UserRole, name: null };
      persist(next);
      set(next);
    },

    loginTeacher: () => {
      const next = { userId: 'teacher', classId: null, groupId: null, role: 'teacher' as UserRole, name: '教师' };
      persist(next);
      set(next);
    },

    setGroupId: (groupId) => {
      set((state) => {
        const next = {
          userId: state.userId,
          classId: state.classId,
          groupId,
          role: state.role,
          name: state.name,
          isDefaultPassword: state.isDefaultPassword,
        };
        persist(next);
        return { groupId };
      });
    },

    markPasswordChanged: () => {
      set((state) => {
        const next = {
          userId: state.userId,
          classId: state.classId,
          groupId: state.groupId,
          role: state.role,
          name: state.name,
          isDefaultPassword: false,
        };
        persist(next);
        return { isDefaultPassword: false };
      });
    },

    loginWithApi: async (username, password) => {
      set({ authLoading: true, authError: null });
      try {
        const result = await apiLogin(username, password);
        const next = {
          userId: result.userId,
          classId: result.classId,
          groupId: result.groupId,
          role: result.role as UserRole,
          name: result.name,
          isDefaultPassword: Boolean(result.isDefaultPassword),
        };
        persist(next);
        set({ ...next, authLoading: false, authError: null });
        return next;
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : undefined) || '登录失败，请检查用户名或密码';
        set({ authLoading: false, authError: msg });
        throw err;
      }
    },

    registerWithApi: async (payload) => {
      set({ authLoading: true, authError: null });
      try {
        const result = await apiRegister(payload);
        const next = {
          userId: result.userId,
          classId: result.classId,
          groupId: result.groupId,
          role: result.role as UserRole,
          name: result.name,
        };
        persist(next);
        set({ ...next, authLoading: false, authError: null });
        return next;
      } catch (err: unknown) {
        const msg = (err instanceof Error ? err.message : undefined) || '注册失败，请稍后重试';
        set({ authLoading: false, authError: msg });
        throw err;
      }
    },

    logout: () => {
      resetSyncQueue();
      apiLogout();
      // 在线模式清掉「属于这个人」的业务数据，避免共享电脑上换人登录读到上一个人的记录。
      // 离线模式没有后端可回填，不清——否则本地演示数据（分组/项目/流水）会被清光。
      if (apiEnabled) {
        clearBusinessData();
        resetBootstrap(); // 下次登录重新拉一遍，别复用本轮的 loaded 标记
      }
      const next = { userId: null, classId: null, groupId: null, role: null, name: null, isDefaultPassword: false };
      persist(next);
      set({ ...next, authError: null });
    },
  };
});
