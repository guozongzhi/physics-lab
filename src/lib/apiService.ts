/**
 * 后端资源服务门面：把 REST 端点封装为按业务领域组织的方法，
 * 返回结构与前端 src/data/mockData.ts 的类型保持一致（camelCase）。
 *
 * 供后续 store 接入后端时调用；apiEnabled 为 false 时不应被使用。
 */
import { api } from './apiClient';
import type {
  Group,
  SchoolClass,
  User,
  PhysicsTopic,
  Question,
  QuizSession,
  Challenge,
  Project,
  Recruitment,
  ShowcaseItem,
  ClassMeta,
  SafetyCategory,
  ShowcaseCategory,
} from '../data/mockData';

// ---------- Auth (self-service) ----------
export const authApi = {
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post<{ ok: boolean }>('/api/auth/change-password', { oldPassword, newPassword }),
};

// ---------- Classes ----------
export const classesApi = {
  list: () => api.get<SchoolClass[]>('/api/classes'),
  create: (name: string) => api.post<SchoolClass>('/api/classes', { name }),
  rename: (id: string, name: string) => api.patch<SchoolClass>(`/api/classes/${id}`, { name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/classes/${id}`),
  listStudents: (classId: string) => api.get<User[]>(`/api/classes/${classId}/students`),
  uploadStudents: (classId: string, students: { name: string; username?: string; password?: string }[]) =>
    api.post<User[]>(`/api/classes/${classId}/students/batch`, { students }),
  deleteStudent: (userId: string) => api.delete<{ ok: boolean }>(`/api/students/${userId}`),
  /**
   * 教师把一个学生的密码重置为系统初始密码（学生忘记密码时的唯一出路）。
   * 新密码由服务端从配置取，这里不传——返回值带上重置后的密码，方便老师转告学生。
   */
  resetStudentPassword: (userId: string) =>
    api.post<{ ok: boolean; password: string }>(`/api/students/${userId}/password/reset`),
};

// ---------- Admin: Teacher management ----------
export interface TeacherInfo {
  id: string;
  username: string;
  name: string;
  avatar: string;
}

export const teachersApi = {
  list: () => api.get<TeacherInfo[]>('/api/teachers'),
  create: (username: string, password: string, name?: string) =>
    api.post<TeacherInfo>('/api/teachers', { username, password, name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/teachers/${id}`),
  resetPassword: (id: string, password: string) =>
    api.patch<{ ok: boolean }>(`/api/teachers/${id}/password`, { password }),
};

// ---------- Groups / Users ----------
export const groupsApi = {
  list: (classId?: string) =>
    api.get<Group[]>(`/api/groups${classId ? `?class_id=${classId}` : ''}`),
  create: (name: string, initialCoins: number, classId?: string) =>
    api.post<Group>('/api/groups', { name, initialCoins, classId }),
  rename: (id: string, name: string) => api.patch<Group>(`/api/groups/${id}`, { name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/groups/${id}`),
  updateContribution: (groupId: string, ratioRecord: Record<string, number>) =>
    api.put<Group>(`/api/groups/${groupId}/contribution`, { ratioRecord }),
  setLeader: (groupId: string, userId: string) =>
    api.put<{ ok: boolean }>(`/api/groups/${groupId}/leader/${userId}`),
  /** 教师调币；note 为发放/扣除理由，会写进流水并对学生可见 */
  adjustCoins: (groupId: string, delta: number, note?: string) =>
    api.post<{ balanceAfter: number }>(`/api/groups/${groupId}/coins`, { delta, note }),
  resetCoins: (targetCoins: number) =>
    api.post<{ ok: boolean; count: number; targetCoins: number }>('/api/groups/reset-coins', { targetCoins }),
  join: (groupId: string) => api.post<User>(`/api/groups/${groupId}/join`),
};

export const usersApi = {
  list: (groupId?: string) =>
    api.get<User[]>(`/api/users${groupId ? `?group_id=${groupId}` : ''}`),
  listByClass: (classId: string) =>
    api.get<User[]>(`/api/users?class_id=${classId}`),
  listUnassigned: () => api.get<User[]>('/api/users?unassigned=true'),
  get: (userId: string) => api.get<User>(`/api/users/${userId}`),
  updateAvatar: (userId: string, avatar: string) =>
    api.put<User>(`/api/users/${userId}/avatar`, { avatar }),
  assignGroup: (userId: string, groupId: string | null, role: 'leader' | 'member' = 'member') =>
    api.put<User>(`/api/users/${userId}/group`, { groupId, role }),
  adjustCoins: (userId: string, delta: number, note?: string) =>
    api.post<{ ok: boolean; personalCoins: number }>(`/api/users/${userId}/coins`, { delta, note }),
  resetEarned: (userId: string) =>
    api.post<{ ok: boolean; userId: string }>(`/api/users/${userId}/earned-reset`),
};

// ---------- Admin: Group class transfer ----------
export const adminGroupsApi = {
  moveClass: (groupId: string, classId: string) =>
    api.patch<Group>(`/api/groups/${groupId}/class`, { classId }),
};

// ---------- Theory ----------
export const theoryApi = {
  topics: () => api.get<PhysicsTopic[]>('/api/topics'),
  questions: (topicId?: string) =>
    api.get<Question[]>(`/api/questions${topicId ? `?topic_id=${topicId}` : ''}`),
  startQuiz: (topicId: string) => api.post<QuizSession>('/api/quiz/start', { topicId }),
  submitAnswer: (sessionId: string, qid: string, answer: unknown) =>
    api.post<QuizSession>(`/api/quiz/${sessionId}/answer`, { qid, answer }),
  gradeQuiz: (sessionId: string) => api.post<QuizSession>(`/api/quiz/${sessionId}/grade`),
  challenges: () => api.get<Challenge[]>('/api/challenges'),
  /** 当前用户自己的答题会话（后端按 user_id 过滤，倒序返回） */
  quizSessions: () => api.get<QuizSession[]>('/api/quiz/sessions'),
  /** 创建挑战。**不传 reward**——奖励由后端按所选题目难度与教师设的单价算出 */
  createChallenge: (payload: {
    title: string;
    topicId: string;
    questionIds: string[];
    deadline: string;
  }) => api.post<Challenge>('/api/challenges', payload),
  challengeQuestions: (challengeId: string) =>
    api.get<Question[]>(`/api/challenges/${challengeId}/questions`),
  submitChallenge: (challengeId: string, answers: Record<string, unknown>) =>
    api.post<Challenge>(`/api/challenges/${challengeId}/submit`, { answers }),
};

// ---------- Projects / Recruitments / Showcase ----------
export const projectsApi = {
  list: () => api.get<Project[]>('/api/projects'),
  get: (id: string) => api.get<Project>(`/api/projects/${id}`),
  create: (payload: Partial<Project> & { title: string; topic: string }) =>
    api.post<Project>('/api/projects', payload),
  update: (id: string, payload: Partial<Project>) =>
    api.put<Project>(`/api/projects/${id}`, payload),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/projects/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put<Project>(`/api/projects/${id}/status`, { status }),
  updateProgress: (id: string, progress: number) =>
    api.put<Project>(`/api/projects/${id}/progress`, { progress }),
  markDone: (id: string) => api.post<Project>(`/api/projects/${id}/done`),
  markSafetyPass: (id: string) => api.post<Project>(`/api/projects/${id}/safety-pass`),
};

export const recruitmentsApi = {
  list: (projectId?: string) =>
    api.get<Recruitment[]>(`/api/recruitments${projectId ? `?project_id=${projectId}` : ''}`),
  create: (payload: {
    projectId: string;
    title: string;
    description: string;
    skills: string[];
    reward: number;
    deadline: string;
  }) => api.post<Recruitment>('/api/recruitments', payload),
  bid: (recId: string, payload: { userId: string; skillDesc: string; hours: number }) =>
    api.post<Recruitment>(`/api/recruitments/${recId}/bid`, payload),
  assign: (recId: string, userId: string) =>
    api.put<Recruitment>(`/api/recruitments/${recId}/assign`, { userId }),
  resolve: (recId: string, result: 'success' | 'partial' | 'fail') =>
    api.put<Recruitment>(`/api/recruitments/${recId}/resolve`, { result }),
};

export const showcaseApi = {
  list: () => api.get<ShowcaseItem[]>('/api/showcase'),
  create: (payload: {
    projectId?: string;
    title: string;
    coverImage: string;
    groupId: string;
    description?: string;
    category: ShowcaseCategory;
  }) => api.post<ShowcaseItem>('/api/showcase', payload),
  toggleLove: (showcaseId: string) =>
    api.post<ShowcaseItem>(`/api/showcase/${showcaseId}/love`),
  /** 学生修改本组作品（改后置回待审批）；教师/管理员修改则保留原状态 */
  update: (
    showcaseId: string,
    payload: { title?: string; coverImage?: string; description?: string; category?: ShowcaseCategory }
  ) => api.put<ShowcaseItem>(`/api/showcase/${showcaseId}`, payload),
  /** 教师下架作品；已奖励的能量币不回滚 */
  remove: (showcaseId: string) => api.delete<{ ok: boolean }>(`/api/showcase/${showcaseId}`),
  /** 教师审批：通过时可带 coins 奖励该小组；驳回时必须带 reason */
  review: (
    showcaseId: string,
    payload: { action: 'approve' | 'reject'; coins?: number; reason?: string }
  ) => api.post<ShowcaseItem>(`/api/showcase/${showcaseId}/review`, payload),
};

// ---------- Coins / Rankings / Meta ----------
export interface GroupRankRow {
  groupId: string;
  name: string;
  totalCoins: number;
  rank: number;
}
export interface PersonalRankRow {
  userId: string;
  name: string;
  personalCoins: number;
  groupId: string;
  rank: number;
}

// ---------- Safety exam records ----------
export interface SafetyRecord {
  id: string;
  category: string;
  score: number;
  passed: boolean;
  createdAt: string;
  /** 来自哪条教师指派；自由练习为 null */
  assignmentId?: string | null;
}

export const safetyApi = {
  /**
   * 提交一次考核结果。带 assignmentId 时后端会忽略传入的 passed，
   * 改由该指派的及格线推导（防止伪造通过）。
   */
  record: (category: string, score: number, passed: boolean, assignmentId?: string | null) =>
    api.post<SafetyRecord>('/api/safety/records', { category, score, passed, assignmentId }),
  myRecords: () => api.get<SafetyRecord[]>('/api/safety/records'),
};

// ---------- Safety exam assignments（教师指派） ----------
export interface SafetyAssignment {
  id: string;
  title: string;
  category: string;
  questionCount: number;
  timeLimit: number; // 分钟
  passScore: number;
  deadline: string | null;
  classId: string | null;
  groupId: string | null;
  createdBy: string;
  createdAt: string;
}

export const safetyAssignmentApi = {
  /** 教师/管理员返回全部；学生只返回指派给自己班级或小组的 */
  list: () => api.get<SafetyAssignment[]>('/api/safety/assignments'),
  get: (id: string) => api.get<SafetyAssignment>(`/api/safety/assignments/${id}`),
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

export const coinsApi = {
  transactions: (groupId?: string) =>
    api.get(`/api/coin-transactions${groupId ? `?group_id=${groupId}` : ''}`),
  rankings: () =>
    api.get<{ groupRanking: GroupRankRow[]; personalRanking: PersonalRankRow[] }>('/api/rankings'),
  classMeta: () => api.get<ClassMeta>('/api/class-meta'),
  /** 教师调整挑战奖励单价（按题目难度） */
  updateClassMeta: (rates: { coinEasy: number; coinMedium: number; coinHard: number }) =>
    api.put<ClassMeta>('/api/class-meta', rates),
  /** 教师开关挑战/招募窗口。minutes 为空＝不限时（不自动关闭） */
  updateActivityWindow: (payload: {
    challengeOpen: boolean;
    challengeMinutes: number | null;
    recruitOpen: boolean;
    recruitMinutes: number | null;
  }) => api.put<ClassMeta>('/api/activity-window', payload),
  transfer: (payload: { sourceGroupId: string; targetGroupId: string; amount: number; note?: string }) =>
    api.post<{ refId: string; sourceBalanceAfter: number; targetBalanceAfter: number }>(
      '/api/coins/transfer',
      payload
    ),
};
