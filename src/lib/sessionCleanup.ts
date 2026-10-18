/**
 * 退出登录时清掉「属于这个人」的数据，避免共享电脑上换人登录读到上一个人的记录。
 *
 * 在线模式清除所有从服务端加载的业务快照，避免接口失败或账号切换时
 * 展示上一位用户的班级、项目、题目与流水。
 * 本地审核草稿由独立 store 管理，不在这里删除。
 *
 * 是否调用由调用方按 `apiEnabled` 判断：离线模式没有后端可回填，清了会把本地演示数据清光。
 * 这里不自己判断也不 import apiClient，免得形成 sessionCleanup → apiClient 的循环依赖。
 */
import { clearSessionStorage } from './storage';
import { useQuestionBankStore } from '../store/questionBankStore';
import { useTheoryStore } from '../store/theoryStore';
import { useCoinStore } from '../store/coinStore';
import { useGroupStore } from '../store/groupStore';
import { useProjectStore } from '../store/projectStore';
import { useSafetyStore } from '../store/safetyStore';

export function clearBusinessData(): void {
  useQuestionBankStore.setState({ questions: [] });
  useGroupStore.setState({ groups: [], users: [] });
  useProjectStore.setState({ projects: [], recruitments: [], showcaseItems: [] });
  useTheoryStore.setState({ topics: [], questions: [], challenges: [], quizSessions: [] });
  useSafetyStore.setState({ questions: [] });
  useCoinStore.setState({ coinTxs: [], transfers: [] });
  // 数据重新引导时外壳还会 initAuth，必须保留当前登录身份。
  clearSessionStorage({ preserveCurrentUser: true });
}

/** 只清 localStorage 里的个人数据。401 分支做整页跳转、拿不到 store 时也能单独用。 */
export function clearPersonalKeys(): void {
  clearSessionStorage();
}
