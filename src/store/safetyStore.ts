/**
 * 安全题库 store —— 教师维护安全考核题的单一数据源
 *
 * 两种模式：
 *  - **在线**（配置了 VITE_API_BASE_URL）：数据在**后端** questions 表（靠 safety_category 区分）。
 *    登录/刷新时由 bootstrapFromApi 拉取注入；写操作为乐观更新 + syncToApi 落库，
 *    成功后用服务端列表替换。**教师改的题因此能下发到所有学生的设备**。
 *  - **离线**（未配置）：退回纯 localStorage（键 plab_safety_questions），
 *    首次使用以内置题库 buildSafetyQuestions() 兜底，仅用于无后端的演示。
 */
import { create } from 'zustand';
import type { Question, SafetyCategory } from '../types';
import { loadLS, saveLS } from '../lib/storage';
import { buildSafetyQuestions } from '../data/safetyContent';
import { apiEnabled } from '../lib/apiClient';
import { safetyBankApi } from '../lib/apiService';
import { syncToApi } from '../lib/syncQueue';

const LS_KEY = 'plab_safety_questions';

const uid = () => `sq-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface SafetyQuestionInput {
  type: Question['type'];
  stem: string;
  options: string[];
  answer: Question['answer'];
  knowledgePoint: string;
  safetyCategory: SafetyCategory;
  difficulty?: 1 | 2 | 3;
}

function loadInitial(): Question[] {
  const cached = loadLS<Question[] | null>(LS_KEY, null);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  return buildSafetyQuestions();
}

/** 清洗并校验导入的题目，返回合法题目数组 */
export function normalizeQuestions(raw: unknown[]): Question[] {
  const validCats: SafetyCategory[] = ['electric', 'thermal', 'optical', 'mechanical', 'radiation', 'chemical', 'combined'];
  const out: Question[] = [];
  for (const candidate of raw) {
    const item = candidate as Record<string, unknown>;
    if (!item || typeof item !== 'object') continue;
    const cat: SafetyCategory = validCats.includes(item.safetyCategory as SafetyCategory) ? item.safetyCategory as SafetyCategory : 'combined';
    const stem = String(item.stem || '').trim();
    const options = Array.isArray(item.options) ? item.options.map((o: unknown) => String(o).trim()).filter(Boolean) : [];
    const type: Question['type'] = ['single', 'multiple', 'judge'].includes(String(item.type)) ? item.type as Question['type'] : 'single';
    const rawAnswer: unknown = item.answer;
    let answer: Question['answer'];
    if (type === 'judge') {
      answer = rawAnswer === true || rawAnswer === 'true' || rawAnswer === '正确' || rawAnswer === 1;
      if (options.length !== 2 || options[0] !== '正确' || options[1] !== '错误') {
        options.splice(0, options.length, '正确', '错误');
      }
    } else if (type === 'multiple') {
      const arr = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
      answer = arr
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
    } else {
      const n = Array.isArray(rawAnswer) ? Number(rawAnswer[0]) : Number(rawAnswer);
      answer = Number.isInteger(n) && n >= 0 && n < options.length ? n : 0;
    }
    if (!stem || options.length < 2) continue;
    out.push({
      id: String(item.id || uid()),
      type,
      stem,
      options,
      answer,
      knowledgePoint: String(item.knowledgePoint || '').trim(),
      difficulty: ([1, 2, 3].includes(Number(item.difficulty)) ? Number(item.difficulty) : 1) as 1 | 2 | 3,
      safetyCategory: cat,
    });
  }
  return out;
}

interface SafetyState {
  questions: Question[];
  addQuestion: (q: SafetyQuestionInput) => Question;
  updateQuestion: (id: string, patch: Partial<SafetyQuestionInput>) => void;
  deleteQuestion: (id: string) => void;
  /** 导入题目：merge=按题干去重合并，replace=整体替换 */
  importQuestions: (raw: unknown[], mode: 'merge' | 'replace') => number;
  resetToDefault: () => void;
}

const persist = (questions: Question[]) => saveLS(LS_KEY, questions);

export const useSafetyStore = create<SafetyState>((set, get) => ({
  questions: loadInitial(),

  addQuestion: (q) => {
    const question: Question = {
      id: uid(),
      difficulty: 1,
      ...q,
    } as Question;
    const questions = [...get().questions, question];
    persist(questions);
    set({ questions });
    if (apiEnabled) {
      // 乐观更新后再落库；成功后用服务端列表替换（本地临时 id 会被真实 id 取代）
      syncToApi(async () => {
        await safetyBankApi.create({
          type: question.type,
          stem: question.stem,
          options: question.options,
          answer: question.answer,
          knowledgePoint: question.knowledgePoint,
          difficulty: question.difficulty,
          safetyCategory: question.safetyCategory!,
        });
        set({ questions: await safetyBankApi.list() });
      }, 'safety.create');
    }
    return question;
  },

  updateQuestion: (id, patch) => {
    const questions = get().questions.map((q) => (q.id === id ? { ...q, ...patch } : q));
    persist(questions);
    set({ questions });
    if (apiEnabled) {
      syncToApi(async () => {
        await safetyBankApi.update(id, patch);
        set({ questions: await safetyBankApi.list() });
      }, 'safety.update');
    }
  },

  deleteQuestion: (id) => {
    const questions = get().questions.filter((q) => q.id !== id);
    persist(questions);
    set({ questions });
    if (apiEnabled) {
      syncToApi(async () => {
        await safetyBankApi.remove(id);
        set({ questions: await safetyBankApi.list() });
      }, 'safety.delete');
    }
  },

  importQuestions: (raw, mode) => {
    const incoming = normalizeQuestions(raw);
    let added: number;
    if (mode === 'replace') {
      persist(incoming);
      set({ questions: incoming });
      added = incoming.length;
    } else {
      // merge：按题干去重，已存在的跳过
      const existingStems = new Set(get().questions.map((q) => q.stem));
      const fresh = incoming.filter((q) => !existingStems.has(q.stem));
      const questions = [...get().questions, ...fresh];
      persist(questions);
      set({ questions: questions });
      added = fresh.length;
    }
    if (apiEnabled) {
      syncToApi(async () => {
        const res = await safetyBankApi.importQuestions(
          incoming.map((q) => ({
            type: q.type,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            knowledgePoint: q.knowledgePoint,
            difficulty: q.difficulty,
            safetyCategory: q.safetyCategory!,
          })),
          mode
        );
        set({ questions: await safetyBankApi.list() });
        return res;
      }, 'safety.import');
    }
    return added;
  },

  resetToDefault: () => {
    const questions = buildSafetyQuestions();
    persist(questions);
    set({ questions });
    if (apiEnabled) {
      syncToApi(async () => {
        await safetyBankApi.reset();
        set({ questions: await safetyBankApi.list() });
      }, 'safety.reset');
    }
  },
}));
