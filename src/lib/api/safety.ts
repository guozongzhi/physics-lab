import { api } from '../apiClient';
import { reviveDates } from '../reviveDates';
import type { Question, SafetyCategory } from '../../types';

// ---------- Safety exam records ----------
export interface SafetyRecord {
  id: string;
  category: string;
  score: number;
  passed: boolean;
  createdAt: Date;
  /** 来自哪条教师指派；自由练习为 null */
  assignmentId?: string | null;
}

/**
 * 安全模块不走 `bootstrapFromApi`，是页面自己直接调 API 的，
 * 所以把时间反序列化放在这里——否则所有消费方都要各自记得处理。
 *
 * 不处理的话：后端 datetime 是**无时区 UTC** 串，`new Date('2026-11-20T06:00:00')`
 * 会被当成本地时间，东八区整体早 8 小时。指派的截止时间既用于显示、也用于
 * 「是否过期」，会让学生的待办**提前 8 小时消失**。
 */
const reviveAssignments = (rows: SafetyAssignment[]) =>
  reviveDates(rows, ['deadline', 'createdAt']);
const reviveRecords = (rows: SafetyRecord[]) => reviveDates(rows, ['createdAt']);

export const safetyApi = {
  startExam: (category: string, assignmentId?: string | null, projectId?: string | null) =>
    api.post<{ id: string; questions: Question[]; passScore: number }>(
      '/api/safety/exams/start', { category, assignmentId, projectId }
    ),
  submitExam: (id: string, answers: Record<string, unknown>) =>
    api.post<SafetyRecord>(`/api/safety/exams/${id}/submit`, { answers }),
  myRecords: () => api.get<SafetyRecord[]>('/api/safety/records').then(reviveRecords),
};

// ---------- Safety exam assignments（教师指派） ----------
export interface SafetyAssignment {
  id: string;
  title: string;
  category: string;
  questionCount: number;
  timeLimit: number; // 分钟
  passScore: number;
  deadline: Date | null;
  classId: string | null;
  groupId: string | null;
  createdBy: string;
  createdAt: Date;
}

export const safetyAssignmentApi = {
  /** 教师/管理员返回全部；学生只返回指派给自己班级或小组的 */
  list: () => api.get<SafetyAssignment[]>('/api/safety/assignments').then(reviveAssignments),
  get: (id: string) =>
    api
      .get<SafetyAssignment>(`/api/safety/assignments/${id}`)
      .then((a) => reviveAssignments([a])[0]),
  create: (payload: {
    title: string;
    category: string;
    questionCount: number;
    timeLimit: number;
    passScore: number;
    deadline?: string | null;
    classId?: string | null;
    groupId?: string | null;
  }) => api.post<SafetyAssignment>('/api/safety/assignments', payload),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/safety/assignments/${id}`),
};

/**
 * 安全题库（服务端权威）。安全题与理论题共用 questions 表，靠 safetyCategory 区分。
 * 教师端维护的改动经由这里落库，所有学生设备都能取到。
 */
export const safetyBankApi = {
  list: (category?: string) =>
    api.get<Question[]>(`/api/safety/questions${category ? `?category=${category}` : ''}`),
  create: (payload: SafetyQuestionPayload) =>
    api.post<Question>('/api/safety/questions', payload),
  update: (id: string, patch: Partial<SafetyQuestionPayload>) =>
    api.patch<Question>(`/api/safety/questions/${id}`, patch),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/safety/questions/${id}`),
  importQuestions: (questions: SafetyQuestionPayload[], mode: 'merge' | 'replace') =>
    api.post<{ imported: number; total: number }>('/api/safety/questions/import', { questions, mode }),
  reset: () => api.post<Question[]>('/api/safety/questions/reset'),
};

export interface SafetyQuestionPayload {
  type: Question['type'];
  stem: string;
  options: string[];
  answer: Question['answer'];
  knowledgePoint?: string;
  difficulty?: number;
  safetyCategory: SafetyCategory;
}
