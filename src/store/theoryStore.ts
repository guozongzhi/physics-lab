import { create } from 'zustand';
import type { PhysicsTopic, Question, QuizSession, Challenge, ChallengeSubmission } from '../types';
import { LS_KEYS, loadLS, saveLS } from '../lib/storage';
import { useCoinStore } from './coinStore';
import { useGroupStore } from './groupStore';

import { theoryApi, groupsApi, usersApi, coinsApi } from '../lib/apiService';
import { syncToApi } from '../lib/syncQueue';
import { reviveDates } from '../lib/reviveDates';
import { windowState, windowClosedMessage } from '../lib/activityWindow';
import { apiEnabled } from '../lib/apiClient';
import { challengeRewardFor } from '../lib/challengePricing';

/**
 * 结算/挑战写操作后，后端已改动小组余额与交易流水，也可能新增/更新挑战。
 * 这里重拉挑战与结算相关数据并注入对应 store，纠正本地乐观值与后端的差异。
 */
async function refetchAfterChallenge(): Promise<void> {
  const [challenges, groups, users, coinTxs] = await Promise.all([
    theoryApi.challenges(),
    groupsApi.list(),
    usersApi.list(),
    coinsApi.transactions(),
  ]);
  useTheoryStore.setState({ challenges: reviveDates(challenges, ['deadline']) });
  useGroupStore.setState({ groups, users });
  useCoinStore.setState({ coinTxs: reviveDates(coinTxs, ['createdAt']) });
}

interface TheoryState {
  topics: PhysicsTopic[];
  questions: Question[];
  quizSessions: QuizSession[];
  challenges: Challenge[];
  /**
   * 开始一次测验。在线时由后端建会话（异步）；离线或后端不可用时退回本地抽题。
   * userId 由调用方传入（本地兜底时用来给会话打归属），避免 store 之间互相 import 成环。
   */
  startQuiz: (topicId: string, userId?: string | null) => Promise<QuizSession>;
  submitAnswer: (sessionId: string, qid: string, answer: Question['answer']) => void;
  gradeQuiz: (sessionId: string) => QuizSession;
  /**
   * 创建挑战。**不接受调用方传奖励**——按所选题目难度与教师设的单价算
   * （`lib/challengePricing.ts`）。在线时后端还会自己算一遍作为权威值。
   */
  createChallenge: (params: {
    title: string;
    creatorGroupId: string;
    topicId: string;
    questionIds: string[];
    deadline: Date;
  }) => Challenge;
  acceptChallenge: (challengeId: string, solverGroupId: string) => Question[];
  submitChallengeAnswers: (
    challengeId: string,
    solverGroupId: string,
    answers: Record<string, Question['answer']>
  ) => { accuracy: number; earned: number };
  getTopicQuestions: (topicId: string) => Question[];
}

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isAnswerCorrect = (question: Question, userAnswer: Question['answer'] | undefined): boolean => {
  if (question.type === 'multiple') {
    // 拷贝后再排序，避免就地修改持久化的题目答案
    const correct = [...(question.answer as number[])].sort().join(',');
    const user = Array.isArray(userAnswer) ? [...userAnswer].sort().join(',') : '';
    return correct === user;
  }
  if (question.type === 'judge') {
    return Boolean(userAnswer) === Boolean(question.answer);
  }
  return Number(userAnswer) === Number(question.answer);
};

export const useTheoryStore = create<TheoryState>((set, get) => {
  const initialTopics = loadLS<PhysicsTopic[]>(LS_KEYS.TOPICS, []);
  const initialQuestions = loadLS<Question[]>(LS_KEYS.QUESTIONS, []);
  const initialQuizSessions = loadLS<QuizSession[]>(LS_KEYS.QUIZ_SESSIONS, []);
  const initialChallenges = loadLS<Challenge[]>(LS_KEYS.CHALLENGES, []);

  const persist = (
    topics: PhysicsTopic[],
    questions: Question[],
    quizSessions: QuizSession[],
    challenges: Challenge[]
  ) => {
    saveLS(LS_KEYS.TOPICS, topics);
    saveLS(LS_KEYS.QUESTIONS, questions);
    // 在线时测验记录以后端为准（登录/刷新由 bootstrap 拉回），刻意不写本地：
    // 既避免与服务端漂移，也防止共享电脑上换人登录读到上一个人的记录。
    if (!apiEnabled) saveLS(LS_KEYS.QUIZ_SESSIONS, quizSessions);
    saveLS(LS_KEYS.CHALLENGES, challenges);
  };

  return {
    topics: initialTopics,
    questions: initialQuestions,
    quizSessions: initialQuizSessions,
    challenges: initialChallenges,

    getTopicQuestions: (topicId) => {
      return get().questions.filter((q) => q.topicId === topicId);
    },

    // 在线时由后端建会话：成绩可追溯、换设备也在、能按学生归属。
    // 离线（未配后端）或后端不可用时退回本地抽题，保证学生至少能测完。
    // 本地建的会话会打上当前用户，便于离线时按人筛选。
    startQuiz: async (topicId, userId) => {
      const { questions, quizSessions, topics, challenges } = get();

      if (apiEnabled) {
        const remote = await theoryApi.startQuiz(topicId);
        const session = reviveDates([remote], ['createdAt'])[0] as QuizSession;
        const next = [...quizSessions, session];
        persist(topics, questions, next, challenges);
        set({ quizSessions: next });
        return session;
      }

      const topicQuestions = questions.filter((q) => q.topicId === topicId);
      if (topicQuestions.length === 0) {
        throw new Error('该主题暂无题目');
      }

      const kpMap: Record<string, Question[]> = {};
      topicQuestions.forEach((q) => {
        if (!kpMap[q.knowledgePoint]) kpMap[q.knowledgePoint] = [];
        kpMap[q.knowledgePoint].push(q);
      });
      const kps = Object.keys(kpMap);
      const picked: Question[] = [];
      const perKp = Math.max(1, Math.floor(10 / kps.length));
      kps.forEach((kp) => {
        const pool = kpMap[kp];
        const take = Math.min(perKp, pool.length);
        const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, take);
        picked.push(...shuffled);
      });
      while (picked.length < 10 && topicQuestions.length > picked.length) {
        const remain = topicQuestions.filter((q) => !picked.includes(q));
        picked.push(remain[Math.floor(Math.random() * remain.length)]);
      }
      const session: QuizSession = {
        id: `qs_${uid()}`,
        userId: userId ?? null,
        topicId,
        questions: picked.slice(0, 10),
        userAnswers: {},
        score: 0,
        passed: false,
        blindPoints: [],
        graded: false,
        createdAt: new Date(),
      };
      const next = [...quizSessions, session];
      persist(topics, questions, next, challenges);
      set({ quizSessions: next });
      return session;
    },

    submitAnswer: (sessionId, qid, answer) => {
      const { quizSessions, topics, questions, challenges } = get();
      const next = quizSessions.map((s) =>
        s.id === sessionId
          ? { ...s, userAnswers: { ...s.userAnswers, [qid]: answer } }
          : s
      );
      persist(topics, questions, next, challenges);
      set({ quizSessions: next });
    },

    gradeQuiz: (sessionId) => {
      const { quizSessions, topics, questions, challenges } = get();
      let gradedSession: QuizSession | null = null;
      const next = quizSessions.map((s) => {
        if (s.id !== sessionId) return s;
        let correct = 0;
        const blindSet = new Set<string>();
        s.questions.forEach((q) => {
          const userAns = s.userAnswers[q.id];
          if (userAns !== undefined && isAnswerCorrect(q, userAns)) {
            correct++;
          } else {
            blindSet.add(q.knowledgePoint);
          }
        });
        const total = s.questions.length || 1;
        const score = Math.round((correct / total) * 100);
        gradedSession = {
          ...s,
          score,
          passed: score >= 80,
          blindPoints: Array.from(blindSet),
          graded: true,
        };
        return gradedSession;
      });
      persist(topics, questions, next, challenges);
      set({ quizSessions: next });
      return gradedSession!;
    },

    createChallenge: ({ title, creatorGroupId, topicId, questionIds, deadline }) => {
      const { topics, questions, quizSessions, challenges } = get();

      // 窗口关闭时不能"新开局"。前端先拦一道（离线模式也需要），后端才是权威。
      // 注意只拦新建——已开的挑战照常作答，否则押金会卡住。
      if (!windowState(useGroupStore.getState().classMeta).challenge) {
        throw new Error(windowClosedMessage('challenge'));
      }

      // 奖励由题目难度算出来，定价权在教师。在线时后端会独立再算一遍（权威值）。
      const pickedQuestions = questions.filter((q) => questionIds.includes(q.id));
      const reward = challengeRewardFor(pickedQuestions, useGroupStore.getState().classMeta);

      useCoinStore.getState().addTx(creatorGroupId, {
        source: 'challenge',
        refId: `pre_${uid()}`,
        delta: -reward,
        note: `创建挑战「${title}」预扣能量币`,
      });

      const challenge: Challenge = {
        id: `ch_${uid()}`,
        title,
        creatorGroupId,
        topicId,
        questionIds,
        reward,
        deadline,
        status: 'open',
        submissions: [],
      };
      const next = [...challenges, challenge];
      persist(topics, questions, quizSessions, next);
      set({ challenges: next });
      // 后端会预扣悬赏并生成自己的挑战 ID，创建成功后重拉对齐挑战与余额。
      syncToApi(async () => {
        await theoryApi.createChallenge({
          title,
          topicId,
          questionIds,
          deadline: (deadline instanceof Date ? deadline : new Date(deadline)).toISOString(),
        });
        await refetchAfterChallenge();
      }, 'challenges.create');
      return challenge;
    },

    acceptChallenge: (challengeId) => {
      const { challenges, questions } = get();
      const challenge = challenges.find((c) => c.id === challengeId);
      if (!challenge) return [];
      const qs = challenge.questionIds
        .map((qid) => questions.find((q) => q.id === qid))
        .filter(Boolean) as Question[];
      if (qs.length === 0) {
        return questions
          .filter((q) => q.topicId === challenge.topicId)
          .slice(0, 10)
          .map((q) => ({ ...q }));
      }
      return qs.map((q) => ({ ...q }));
    },

    submitChallengeAnswers: (challengeId, solverGroupId, answers) => {
      const { topics, questions, quizSessions, challenges } = get();
      let accuracy = 0;
      let earned = 0;

      const nextChallenges = challenges.map((c) => {
        if (c.id !== challengeId) return c;
        const qs = c.questionIds
          .map((qid) => questions.find((q) => q.id === qid))
          .filter(Boolean) as Question[];
        const actualQs =
          qs.length > 0
            ? qs
            : questions.filter((q) => q.topicId === c.topicId).slice(0, 10);
        let correct = 0;
        actualQs.forEach((q) => {
          const ua = answers[q.id];
          if (ua !== undefined && isAnswerCorrect(q, ua)) correct++;
        });
        const total = actualQs.length || 1;
        accuracy = correct / total;

        const result = useCoinStore.getState().settleChallenge(c, solverGroupId, accuracy);
        earned = result.solverReward;

        const submission: ChallengeSubmission = {
          groupId: solverGroupId,
          answers,
          accuracy,
          earned,
          submittedAt: new Date(),
        };
        return { ...c, submissions: [...c.submissions, submission] };
      });

      persist(topics, questions, quizSessions, nextChallenges);
      set({ challenges: nextChallenges });
      // 后端按当前 JWT 用户组重新评分并正式结算，完成后重拉对齐余额与挑战流水。
      syncToApi(async () => {
        await theoryApi.submitChallenge(challengeId, answers);
        await refetchAfterChallenge();
      }, 'challenges.submit');
      return { accuracy, earned };
    },
  };
});
