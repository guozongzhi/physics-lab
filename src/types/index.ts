// 用户接口：定义学生用户的基本信息
export interface User {
  id: string;
  name: string;
  avatar: string;
  groupId: string;
  role: 'leader' | 'member';
  personalCoins: number;
}

// 小组接口：定义学习小组的信息
export interface Group {
  id: string;
  name: string;
  logo: string;
  members: User[];
  totalCoins: number;
  initialCoins: number;
  contributionRatio: Record<string, number>;
}

// 物理主题接口：定义理论学习模块的主题结构
export interface PhysicsTopic {
  id: string;
  title: string;
  outline: { chapter: string; points: string[] }[];
  aiMaterial: string;
}

// 思维导图节点接口：定义AI生成的思维导图节点
export interface MindMapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  children?: string[];
}

// 题目接口：定义单选题、多选题、判断题的通用结构
export interface Question {
  id: string;
  type: 'single' | 'multiple' | 'judge';
  stem: string;
  options: string[];
  answer: number | number[] | boolean;
  knowledgePoint: string;
  difficulty: 1 | 2 | 3;
  topicId?: string;
  safetyCategory?: SafetyCategory;
}

// 答题会话接口：定义一次智能检测的完整记录
export interface QuizSession {
  id: string;
  topicId: string;
  questions: Question[];
  userAnswers: Record<string, number | number[] | boolean>;
  score: number;
  passed: boolean;
  blindPoints: string[];
}

// 挑战接口：定义小组之间发起的答题挑战
export interface Challenge {
  id: string;
  title: string;
  creatorGroupId: string;
  targetGroupIds: string[] | 'all';
  questionBankId: string;
  reward: number;
  deadline: Date;
  status: 'open' | 'closed';
  submissions: { groupId: string; accuracy: number; earned: number }[];
}

// 项目状态枚举：定义项目在看板中可能处于的状态
export type ProjectStatus = 'planning' | 'progress' | 'review' | 'done' | 'failed' | 'frozen';

// 项目接口：定义项目式学习的完整项目结构
export interface Project {
  id: string;
  title: string;
  topic: string;
  ownerGroupId: string;
  startDate: Date;
  dueDate: Date;
  progress: number;
  status: ProjectStatus;
  techPoints: string;
  difficulties: string;
  equipmentList: EquipmentItem[];
  safetyCategory: SafetyCategory;
  safetyPassed: Record<string, boolean>;
  photos: string[];
  results: string;
  rewardCoins: number;
}

// 器材项接口：定义项目所需的单件器材
export interface EquipmentItem {
  name: string;
  qty: number;
  category: string;
}

// 安全类别枚举：定义实验安全的分类体系
export type SafetyCategory = 'electric' | 'thermal' | 'optical' | 'mechanical' | 'radiation' | 'chemical' | 'combined';

// 安全须知接口：定义某类安全的学习材料
export interface SafetyNotice {
  category: SafetyCategory;
  title: string;
  content: string;
  keyPoints: string[];
}

// 安全考核接口：定义某类安全的在线测试
export interface SafetyExam {
  category: SafetyCategory;
  questions: Question[];
  passScore: number;
}

// 招募竞标接口：定义学生对招募任务的投标
export interface RecruitmentBid {
  userId: string;
  skillDesc: string;
  hours: number;
}

// 招募接口：定义项目发布的技术专家招募任务
export interface Recruitment {
  id: string;
  projectId: string;
  title: string;
  description: string;
  skills: string[];
  reward: number;
  deadline: Date;
  status: 'open' | 'assigned' | 'done' | 'failed';
  bids: RecruitmentBid[];
  assigneeUserId?: string;
  result?: 'success' | 'partial' | 'fail';
  actualPay?: number;
}

// 能量币来源枚举：定义能量币变动的业务场景
export type CoinSource = 'challenge' | 'project' | 'recruit' | 'teacher_set' | 'penalty';

// 能量币流水接口：定义每一笔能量币变动记录
export interface CoinTransaction {
  id: string;
  groupId: string;
  userId?: string;
  source: CoinSource;
  refId: string;
  delta: number;
  balanceAfter: number;
  createdAt: Date;
  note: string;
}

// 班级统计接口：定义教师端全班维度的汇总数据
export interface ClassStats {
  totalStudents: number;
  totalGroups: number;
  projectsDone: number;
  projectsInProgress: number;
  projectsFailed: number;
  totalCoinsCirculating: number;
  avgProjectCompletion: number;
}

// 成果展示项接口：定义优秀项目在展示大厅的条目
export interface ShowcaseItem {
  id: string;
  title: string;
  projectId: string;
  images: string[];
  description: string;
  loves: number;
  createdAt: Date;
}
