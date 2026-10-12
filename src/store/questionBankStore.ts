/**
 * 题库审核 store —— 教师上传题目 + 学生提交题目 + 审核/反馈/修改
 *
 * 在线数据由服务端持久化并按身份读取；离线数据保存在localStorage。
 *  - 学生提交的题目进入 pending 状态，等待教师审核
 *  - 教师上传的题目直接为 approved
 *  - 教师可对任意题目写反馈（学生端可见）、修改题目内容、通过/驳回
 */
import { create } from 'zustand';
import { api, apiEnabled } from '../lib/apiClient';
import { loadLS, saveLS } from '../lib/storage';
import type { ReviewableQuestion, ReviewStatus, QuestionType } from '../types';

const LS_KEY = 'plab_review_questions';

export interface ReviewableInput {
  type: QuestionType;
  stem: string;
  options: string[];
  answer: number | number[] | boolean;
  knowledgePoint?: string;
  difficulty?: 1 | 2 | 3;
}

const uid = () => `rq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** 初始示例数据：若干学生提交的待审核题 + 教师已通过题 */
function seedQuestions(): ReviewableQuestion[] {
  return [
    {
      id: uid(), type: 'single',
      stem: '在串联电路中，总电阻与各分电阻的关系是？',
      options: ['总电阻等于各分电阻之和', '总电阻小于任意分电阻', '总电阻等于分电阻的平均值', '总电阻与分电阻无关'],
      answer: 0, knowledgePoint: '串联电路', difficulty: 1,
      submittedBy: 'u-01', submittedByName: '张一鸣', submittedAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
      reviewStatus: 'pending',
    },
    {
      id: uid(), type: 'multiple',
      stem: '以下哪些现象可以说明光的波动性？（多选）',
      options: ['光的干涉', '光的衍射', '光电效应', '光的偏振'],
      answer: [0, 1, 3], knowledgePoint: '光的波粒二象性', difficulty: 2,
      submittedBy: 'u-07', submittedByName: '李文博', submittedAt: new Date(Date.now() - 3600_000 * 26).toISOString(),
      reviewStatus: 'pending',
    },
    {
      id: uid(), type: 'judge',
      stem: '物体在恒力作用下一定做匀加速直线运动。（判断）',
      options: ['正确', '错误'],
      answer: false, knowledgePoint: '牛顿第二定律', difficulty: 2,
      submittedBy: 'u-12', submittedByName: '王思琪', submittedAt: new Date(Date.now() - 3600_000 * 50).toISOString(),
      reviewStatus: 'rejected',
      teacherFeedback: '题目表述不严谨：恒力与初速度不共线时做曲线运动（如平抛），应补充"初速度为零或与力共线"的前提。修改后重新提交。',
      feedbackAt: new Date(Date.now() - 3600_000 * 48).toISOString(),
    },
    {
      id: uid(), type: 'single',
      stem: '楞次定律的核心思想是？',
      options: ['感应电流方向总与原磁场方向相反', '感应电流的磁场总是阻碍引起感应电流的磁通量变化', '感应电动势与磁通量成正比', '感应电流总与原电流方向相反'],
      answer: 1, knowledgePoint: '电磁感应', difficulty: 2,
      submittedBy: 'u-03', submittedByName: '陈浩宇', submittedAt: new Date(Date.now() - 3600_000 * 80).toISOString(),
      reviewStatus: 'approved',
      teacherFeedback: '题干清晰，选项干扰项设计合理，已纳入挑战题库。',
      feedbackAt: new Date(Date.now() - 3600_000 * 72).toISOString(),
      edited: true, editedBy: 'teacher',
    },
    {
      id: uid(), type: 'single',
      stem: '一物体做匀速圆周运动，下列说法正确的是？',
      options: ['速度不变', '加速度不变', '向心力大小不变方向时刻改变', '线速度大小不变方向不变'],
      answer: 2, knowledgePoint: '圆周运动', difficulty: 1,
      submittedBy: null, submittedByName: '教师上传', submittedAt: new Date(Date.now() - 3600_000 * 120).toISOString(),
      reviewStatus: 'approved',
    },
  ];
}

function loadInitial(): ReviewableQuestion[] {
  const cached = loadLS<ReviewableQuestion[] | null>(LS_KEY, null);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  return seedQuestions();
}

interface QuestionBankState {
  questions: ReviewableQuestion[];
  /** 教师上传：直接 approved */
  uploadQuestion: (input: ReviewableInput, teacherName: string) => ReviewableQuestion | Promise<ReviewableQuestion>;
  /** 学生提交：pending */
  submitQuestion: (input: ReviewableInput, userId: string, userName: string) => ReviewableQuestion | Promise<ReviewableQuestion>;
  approveQuestion: (id: string, feedback?: string) => void | Promise<void>;
  rejectQuestion: (id: string, feedback: string) => void | Promise<void>;
  /** 教师修改题目（在原题上编辑，标记 edited） */
  editQuestion: (id: string, patch: Partial<ReviewableInput>, teacherName: string) => void | Promise<void>;
  /** 教师写反馈（学生可见） */
  setFeedback: (id: string, feedback: string, teacherName: string) => void | Promise<void>;
  deleteQuestion: (id: string) => void | Promise<void>;
  /** 批量导入教师上传题目 */
  importTeacherQuestions: (raw: unknown[], teacherName: string) => number | Promise<number>;
}

const persist = (questions: ReviewableQuestion[]) => saveLS(LS_KEY, questions);

function toReviewable(input: ReviewableInput): Omit<ReviewableQuestion, keyof ({ id: string; submittedBy: string | null; submittedByName: string; submittedAt: string; reviewStatus: ReviewStatus })> {
  return {
    type: input.type,
    stem: input.stem,
    options: input.options,
    answer: input.answer,
    knowledgePoint: input.knowledgePoint || '',
    difficulty: input.difficulty || 1,
  };
}

export const useQuestionBankStore = create<QuestionBankState>((set, get) => ({
  questions: apiEnabled ? [] : loadInitial(),

  uploadQuestion: (input, teacherName) => {
    if (apiEnabled) return api.post<ReviewableQuestion>('/api/review-questions', input).then(q => { set({questions:[q,...get().questions]});return q; });
    const q: ReviewableQuestion = {
      ...toReviewable(input),
      id: uid(),
      submittedBy: null,
      submittedByName: teacherName,
      submittedAt: new Date().toISOString(),
      reviewStatus: 'approved',
    };
    const questions = [q, ...get().questions];
    persist(questions);
    set({ questions });
    return q;
  },

  submitQuestion: (input, userId, userName) => {
    if (apiEnabled) return api.post<ReviewableQuestion>('/api/review-questions', input).then(q => { set({questions:[q,...get().questions]});return q; });
    const q: ReviewableQuestion = {
      ...toReviewable(input),
      id: uid(),
      submittedBy: userId,
      submittedByName: userName,
      submittedAt: new Date().toISOString(),
      reviewStatus: 'pending',
    };
    const questions = [q, ...get().questions];
    persist(questions);
    set({ questions });
    return q;
  },

  approveQuestion: (id, feedback) => {
    if (apiEnabled) return api.patch<ReviewableQuestion>(`/api/review-questions/${id}`, {reviewStatus:'approved', ...(feedback !== undefined ? {teacherFeedback:feedback} : {})}).then(q => {set({questions:get().questions.map(old=>old.id===id?q:old)});});
    const now = new Date().toISOString();
    const questions = get().questions.map((q) =>
      q.id === id
        ? { ...q, reviewStatus: 'approved' as ReviewStatus, teacherFeedback: feedback ?? q.teacherFeedback, feedbackAt: feedback ? now : q.feedbackAt }
        : q
    );
    persist(questions);
    set({ questions });
  },

  rejectQuestion: (id, feedback) => {
    if (apiEnabled) return api.patch<ReviewableQuestion>(`/api/review-questions/${id}`, {reviewStatus:'rejected', teacherFeedback:feedback}).then(q => {set({questions:get().questions.map(old=>old.id===id?q:old)});});
    const now = new Date().toISOString();
    const questions = get().questions.map((q) =>
      q.id === id
        ? { ...q, reviewStatus: 'rejected' as ReviewStatus, teacherFeedback: feedback, feedbackAt: now }
        : q
    );
    persist(questions);
    set({ questions });
  },

  editQuestion: (id, patch, teacherName) => {
    if (apiEnabled) return api.patch<ReviewableQuestion>(`/api/review-questions/${id}`, patch).then(q => {set({questions:get().questions.map(old=>old.id===id?q:old)});});
    const questions = get().questions.map((q) =>
      q.id === id
        ? { ...q, ...patch, edited: true, editedBy: teacherName }
        : q
    );
    persist(questions);
    set({ questions });
  },

  setFeedback: (id, feedback, teacherName) => {
    if (apiEnabled) return api.patch<ReviewableQuestion>(`/api/review-questions/${id}`, {teacherFeedback:feedback}).then(q => {set({questions:get().questions.map(old=>old.id===id?q:old)});});
    const now = new Date().toISOString();
    const questions = get().questions.map((q) =>
      q.id === id ? { ...q, teacherFeedback: feedback, feedbackAt: now, editedBy: teacherName } : q
    );
    persist(questions);
    set({ questions });
  },

  deleteQuestion: (id) => {
    if (apiEnabled) return api.delete(`/api/review-questions/${id}`).then(()=>{set({questions:get().questions.filter(q=>q.id!==id)});});
    const questions = get().questions.filter((q) => q.id !== id);
    persist(questions);
    set({ questions });
  },

  importTeacherQuestions: (raw, teacherName) => {
    if (apiEnabled) return api.post<{imported:number}>('/api/review-questions/import', {questions:raw}).then(async result=>{set({questions:await api.get<ReviewableQuestion[]>('/api/review-questions')});return result.imported;});
    const valid = ['single', 'multiple', 'judge'];
    const incoming: ReviewableQuestion[] = [];
    for (const candidate of raw) {
      const item = candidate as Record<string, unknown>;
      if (!item || typeof item !== 'object') continue;
      const stem = String(item.stem || '').trim();
      let options = Array.isArray(item.options) ? item.options.map((o: unknown) => String(o).trim()).filter(Boolean) : [];
      const type: QuestionType = valid.includes(String(item.type)) ? item.type as QuestionType : 'single';
      let answer: unknown = item.answer;
      if (type === 'judge') {
        answer = answer === true || answer === 'true' || answer === '正确' || answer === 1;
        if (options.length !== 2 || options[0] !== '正确' || options[1] !== '错误') options = ['正确', '错误'];
      } else if (type === 'multiple') {
        const arr = Array.isArray(answer) ? answer : [answer];
        answer = arr.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n < options.length);
      } else {
        const n = Array.isArray(answer) ? Number(answer[0]) : Number(answer);
        answer = Number.isInteger(n) && n >= 0 && n < options.length ? n : 0;
      }
      if (!stem || options.length < 2) continue;
      incoming.push({
        id: uid(), type, stem, options, answer: answer as ReviewableQuestion['answer'],
        knowledgePoint: String(item.knowledgePoint || '').trim(),
        difficulty: ([1, 2, 3].includes(Number(item.difficulty)) ? Number(item.difficulty) : 1) as 1 | 2 | 3,
        submittedBy: null, submittedByName: teacherName,
        submittedAt: new Date().toISOString(), reviewStatus: 'approved',
      });
    }
    const questions = [...incoming, ...get().questions];
    persist(questions);
    set({ questions });
    return incoming.length;
  },
}));
