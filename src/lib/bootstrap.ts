/**
 * 数据引导层。
 *
 * 当启用后端（VITE_API_BASE_URL 已配置）时：
 *   - 登录后调用 bootstrapFromApi()，从后端批量拉取全量数据，
 *     直接注入各 Zustand store 的内存状态。
 *   - 页面组件继续同步读取 store 字段（groups/users/projects...），读路径零改动。
 *
 * 未启用后端时：本模块不做任何事，前端保持原有 localStorage 离线模式。
 */
import { apiEnabled, api } from './apiClient';
import { useQuestionBankStore } from '../store/questionBankStore';
import type { ReviewableQuestion } from '../types';
import {
  groupsApi,
  usersApi,
  theoryApi,
  projectsApi,
  recruitmentsApi,
  showcaseApi,
} from './apiService';
import { useGroupStore } from '../store/groupStore';
import { useProjectStore } from '../store/projectStore';
import { useCoinStore } from '../store/coinStore';
import { useTheoryStore } from '../store/theoryStore';
import { useSafetyStore } from '../store/safetyStore';
import { coinsApi } from './apiService';
import { reviveDates } from './reviveDates';
import type { QuizSession } from '../types';

let loaded = false;
let loadingPromise: Promise<void> | null = null;
let generation = 0;

export function isBootstrapped(): boolean {
  return loaded;
}

export function resetBootstrap(): void {
  generation++;
  loaded = false;
  loadingPromise = null;
}

/**
 * 从后端拉取全量数据并注入各 store。幂等：重复调用返回同一 Promise。
 */
export async function bootstrapFromApi(force = false): Promise<void> {
  if (!apiEnabled) return;
  if (loaded && !force) return;
  if (loadingPromise && !force) return loadingPromise;

  const myGeneration = ++generation;
  const currentPromise = (async () => {
    const pick = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

    // 所有接口完成后统一检查；任何失败都不注入部分快照，避免混合新旧账号数据。
    const [
      rGroups, rUsers, rTopics, rQuestions, rChallenges, rProjects, rRecruits, rShowcase, rCoinTxs, rClassMeta, rQuizSessions, rReviewQuestions,
    ] = await Promise.allSettled([
      groupsApi.list(),
      usersApi.list(),
      theoryApi.topics(),
      theoryApi.questions(),
      theoryApi.challenges(),
      projectsApi.list(),
      recruitmentsApi.list(),
      showcaseApi.list(),
      coinsApi.transactions(),
      coinsApi.classMeta(),
      theoryApi.quizSessions(),
      api.get<ReviewableQuestion[]>('/api/review-questions'),
    ]);

    const results = [rGroups, rUsers, rTopics, rQuestions, rChallenges, rProjects, rRecruits, rShowcase, rCoinTxs, rClassMeta, rQuizSessions, rReviewQuestions];
    const failed = results.find((result) => result.status === 'rejected');
    if (failed && failed.status === 'rejected') throw failed.reason;
    if (myGeneration !== generation) {
      if (loadingPromise && loadingPromise !== currentPromise) await loadingPromise;
      return;
    }

    const reviewed = pick(rReviewQuestions);
    if (reviewed) useQuestionBankStore.setState({questions:reviewed});
    const groups = pick(rGroups);
    const users = pick(rUsers);
    const rawClassMeta = pick(rClassMeta);
    // 窗口到期时间也走 reviveDates：后端给的是无时区 UTC 串，不补 Z 会被当成本地时间，
    // 东八区整体早 8 小时——窗口的"开/关"会因此判错。
    const classMeta = rawClassMeta
      ? reviveDates([rawClassMeta], ['challengeWindowClosesAt', 'recruitWindowClosesAt'])[0]
      : null;
    if (groups != null || users != null || classMeta != null) {
      useGroupStore.setState({
        ...(groups != null ? { groups } : {}),
        ...(users != null ? { users } : {}),
        ...(classMeta != null ? { classMeta } : {}),
      });
    }

    const topics = pick(rTopics);
    const questions = pick(rQuestions);
    const challenges = pick(rChallenges);
    const quizSessions = pick(rQuizSessions);

    // 安全题与理论题共用 questions 表，必须在这里分流：
    //   - 带 safetyCategory 的 → safetyStore（安全考核用）
    //   - 其余 → theoryStore（理论题库）
    // 分流是必须的：安全题本不该出现在理论测验的抽题池里。
    const safetyQuestions = questions ? questions.filter((q) => q.safetyCategory) : null;
    const theoryQuestions = questions ? questions.filter((q) => !q.safetyCategory) : null;
    if (safetyQuestions != null) {
      useSafetyStore.setState({ questions: safetyQuestions });
    }

    // 后端按创建时间倒序返回，这里翻成时间正序存——LearningHub 的「最近测验成绩」
    // 做的是 reverse().slice(0,4)，倒序存会取到最旧的四条。
    // 只保留本人的记录（后端已按 user_id 过滤）。
    const orderedSessions =
      quizSessions != null
        ? reviveDates(quizSessions, ['createdAt']).sort(
            (a: QuizSession, b: QuizSession) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        : null;

    if (topics != null || theoryQuestions != null || challenges != null || orderedSessions != null) {
      useTheoryStore.setState({
        ...(topics != null ? { topics } : {}),
        ...(theoryQuestions != null ? { questions: theoryQuestions } : {}),
        ...(challenges != null ? { challenges: reviveDates(challenges, ['deadline']) } : {}),
        ...(orderedSessions != null ? { quizSessions: orderedSessions } : {}),
      });
    }

    const projects = pick(rProjects);
    const recruitments = pick(rRecruits);
    const showcase = pick(rShowcase);
    if (projects != null || recruitments != null || showcase != null) {
      useProjectStore.setState({
        ...(projects != null ? { projects: reviveDates(projects, ['startDate', 'dueDate']) } : {}),
        ...(recruitments != null ? { recruitments: reviveDates(recruitments, ['deadline']) } : {}),
        ...(showcase != null ? { showcaseItems: reviveDates(showcase, ['createdAt']) } : {}),
      });
    }

    const coinTxs = pick(rCoinTxs);
    if (coinTxs != null) {
      useCoinStore.setState({
        // 后端返回最新在前，这里归一化为时间正序（与离线模式的追加顺序一致），
        // 避免依赖数组顺序的展示逻辑（如 reverse+slice）取错区间
        coinTxs: reviveDates(coinTxs, ['createdAt']).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      });
    }

    loaded = true;
  })();
  loadingPromise = currentPromise;

  try {
    await currentPromise;
  } finally {
    if (loadingPromise === currentPromise) loadingPromise = null;
  }
}
