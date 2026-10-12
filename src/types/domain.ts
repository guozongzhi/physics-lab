export type UserRole = 'admin' | 'teacher' | 'student';
export type MemberRole = 'leader' | 'member';

export interface SchoolClass {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  classId: string | null;
  groupId: string | null;
  role: MemberRole;
  personalCoins: number;
}

export interface Group {
  id: string;
  name: string;
  logo: string;
  totalCoins: number;
  initialCoins: number;
  classId: string | null;
  contributionRatio: Record<string, number>;
}

export type CoinSource = 'challenge' | 'project' | 'recruit' | 'teacher_set' | 'penalty' | 'transfer' | 'personal' | 'reset' | 'showcase';

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

export interface PhysicsTopic {
  id: string;
  title: string;
  outline: { chapter: string; points: string[] }[];
  aiMaterial: string;
}

export type QuestionType = 'single' | 'multiple' | 'judge';

export interface Question {
  id: string;
  type: QuestionType;
  stem: string;
  options: string[];
  answer: number | number[] | boolean;
  knowledgePoint: string;
  difficulty: 1 | 2 | 3;
  topicId?: string;
  safetyCategory?: SafetyCategory;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 可供审核的题目（学生提交或教师上传），带审核状态、教师反馈与修改标记 */
export interface ReviewableQuestion extends Question {
  submittedBy: string | null;        // 提交者用户 id，null 表示教师上传
  submittedByName: string;           // 提交者名称
  submittedAt: string;               // ISO 时间
  reviewStatus: ReviewStatus;
  teacherFeedback?: string;          // 教师评价（学生可见）
  feedbackAt?: string;
  edited?: boolean;                  // 教师是否修改过原题
  editedBy?: string;
}


export interface QuizSession {
  id: string;
  /** 归属学生。在线时由后端写入；离线本地建的会话会打上当前用户，便于按人筛选 */
  userId?: string | null;
  topicId: string;
  questions: Question[];
  userAnswers: Record<string, number | number[] | boolean>;
  score: number;
  passed: boolean;
  blindPoints: string[];
  /** 是否已交卷判分（区分「开始过测验」与「已完成检测」） */
  graded?: boolean;
  createdAt: Date;
}

export interface ChallengeSubmission {
  groupId: string;
  answers: Record<string, number | number[] | boolean>;
  accuracy: number;
  earned: number;
  submittedAt: Date;
}

export interface Challenge {
  id: string;
  title: string;
  creatorGroupId: string;
  topicId: string;
  questionIds: string[];
  reward: number;
  deadline: Date;
  status: 'open' | 'closed';
  submissions: ChallengeSubmission[];
}

export type ProjectStatus = 'planning' | 'progress' | 'review' | 'done' | 'failed' | 'frozen';
export type SafetyCategory = 'electric' | 'thermal' | 'optical' | 'mechanical' | 'radiation' | 'chemical' | 'combined';

export interface EquipmentItem {
  name: string;
  qty: number;
  category: string;
}

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

export interface RecruitmentBid {
  userId: string;
  skillDesc: string;
  hours: number;
  bidAt: Date;
}

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
  /** 发布招募时从发包组预扣的押金。结算按它分账；改动前发布的存量招募为 0。 */
  escrowPaid?: number;
}

export interface ShowcaseItem {
  authorUserId?: string;
  demoKind?: "" | "optics" | "motor";
  id: string;
  projectId: string;
  title: string;
  coverImage: string;
  groupId: string;
  description: string;
  loves: number;
  lovedBy: string[];
  createdAt: Date;
  /** 教师审批状态：新上传为 pending，通过后才算正式展出 */
  status: 'pending' | 'approved' | 'rejected';
  /** 仅 status==='rejected' 时有值 */
  rejectReason: string;
  /** 审批通过时奖给该小组的能量币 */
  awardedCoins: number;
  /** 作品分类。展览馆顶部的筛选 tab 据此过滤；上传时由学生选择，从前端到后端都必须带上 */
  category: ShowcaseCategory;
}

/** 展览馆的作品分类（与后端 ShowcaseCategory 对齐） */
export type ShowcaseCategory = 'photo' | 'video' | 'paper' | 'model' | 'award';

export interface ClassMeta {
  initialCoinsPerGroup: number;
  /** 挑战奖励单价（简单/中等/困难）。奖励由题目难度累加得出，学生不能自填。 */
  coinEasy: number;
  coinMedium: number;
  coinHard: number;
  termName: string;
  /**
   * 教师可控的开放窗口。关闭后学生不能"新开局"（建挑战/发招募/投标/组间转账），
   * 但已开的挑战与招募照常作答、结算。
   * 字段可缺省——旧的 localStorage 里没有，此时按"开着"处理，见 lib/activityWindow.ts。
   * closesAt 为空表示不限时；到点后按惰性判定当作已关闭。
   * 在线时由 bootstrap / groupStore 过 `reviveDates` 转成 Date（后端给的是无时区 UTC 串）。
   */
  challengeWindowOpen?: boolean;
  /** 老师选的时长（空＝不限时）。界面回显用——closesAt 会随时间衰减，分钟数不会。 */
  challengeWindowMinutes?: number | null;
  challengeWindowClosesAt?: Date | null;
  recruitWindowOpen?: boolean;
  recruitWindowMinutes?: number | null;
  recruitWindowClosesAt?: Date | null;
}

export interface CurrentUser {
  userId: string | null;
  classId: string | null;
  groupId: string | null;
  role: UserRole | null;
  /** 学生是否还在用统一初始密码。随登录态持久化，刷新后提示不丢。离线模式不设。 */
  isDefaultPassword?: boolean;
}
