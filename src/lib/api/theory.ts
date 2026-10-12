import { api } from '../apiClient';
import { parseApiDate } from '../dateReviver';
import type { Challenge, PhysicsTopic, Question, QuizSession } from '../../types';

/** 挑战投稿时间为 Date；题库投稿时间则仍为 string，按领域契约转换。 */
function reviveChallenge(challenge: Challenge): Challenge {
  return { ...challenge, submissions: challenge.submissions.map((submission) => ({
    ...submission, submittedAt: parseApiDate(submission.submittedAt) as Date,
  })) };
}

// ---------- Theory ----------
export const theoryApi = {
  topics: () => api.get<PhysicsTopic[]>('/api/topics'),
  questions: (topicId?: string) =>
    api.get<Question[]>(`/api/questions${topicId ? `?topic_id=${topicId}` : ''}`),
  startQuiz: (topicId: string) => api.post<QuizSession>('/api/quiz/start', { topicId }),
  submitAnswer: (sessionId: string, qid: string, answer: unknown) =>
    api.post<QuizSession>(`/api/quiz/${sessionId}/answer`, { qid, answer }),
  gradeQuiz: (sessionId: string) => api.post<QuizSession>(`/api/quiz/${sessionId}/grade`),
  challenges: () => api.get<Challenge[]>('/api/challenges').then((rows) => rows.map(reviveChallenge)),
  /** 当前用户自己的答题会话（后端按 user_id 过滤，倒序返回） */
  quizSessions: () => api.get<QuizSession[]>('/api/quiz/sessions'),
  /** 创建挑战。**不传 reward**——奖励由后端按所选题目难度与教师设的单价算出 */
  createChallenge: (payload: {
    title: string;
    topicId: string;
    questionIds: string[];
    deadline: string;
  }) => api.post<Challenge>('/api/challenges', payload).then(reviveChallenge),
  challengeQuestions: (challengeId: string) =>
    api.get<Question[]>(`/api/challenges/${challengeId}/questions`),
  submitChallenge: (challengeId: string, answers: Record<string, unknown>) =>
    api.post<Challenge>(`/api/challenges/${challengeId}/submit`, { answers }).then(reviveChallenge),
};
