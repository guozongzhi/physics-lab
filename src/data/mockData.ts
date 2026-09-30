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

export type CoinSource = 'challenge' | 'project' | 'recruit' | 'teacher_set' | 'penalty' | 'transfer' | 'personal' | 'reset';

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
  userAnswers: Record<string, any>;
  score: number;
  passed: boolean;
  blindPoints: string[];
  /** 是否已交卷判分（区分「开始过测验」与「已完成检测」） */
  graded?: boolean;
  createdAt: Date;
}

export interface ChallengeSubmission {
  groupId: string;
  answers: Record<string, any>;
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
   */
  challengeWindowOpen?: boolean;
  /** 老师选的时长（空＝不限时）。界面回显用——closesAt 会随时间衰减，分钟数不会。 */
  challengeWindowMinutes?: number | null;
  challengeWindowClosesAt?: string | Date | null;
  recruitWindowOpen?: boolean;
  recruitWindowMinutes?: number | null;
  recruitWindowClosesAt?: string | Date | null;
}

export interface CurrentUser {
  userId: string | null;
  classId: string | null;
  groupId: string | null;
  role: UserRole | null;
  /** 学生是否还在用统一初始密码。随登录态持久化，刷新后提示不丢。离线模式不设。 */
  isDefaultPassword?: boolean;
}

export const LS_KEYS = {
  GROUPS: 'plab_groups',
  CURRENT_USER: 'plab_current_user',
  TOPICS: 'plab_topics',
  QUESTIONS: 'plab_questions',
  QUIZ_SESSIONS: 'plab_quiz_sessions',
  CHALLENGES: 'plab_challenges',
  PROJECTS: 'plab_projects',
  RECRUITMENTS: 'plab_recruitments',
  COIN_TXS: 'plab_coin_txs',
  SHOWCASE: 'plab_showcase',
  CLASS_META: 'plab_class_meta',
} as const;

const uid = () => Math.random().toString(36).slice(2, 10);

const GROUP_NAMES = [
  '牛顿先锋队',
  '麦克斯韦闪电队',
  '爱因斯坦脑洞组',
  '特斯拉电流团',
  '伽利略观测站',
  '薛定谔猫队',
];

const STUDENT_NAMES = [
  '张伟', '王芳', '李娜', '刘洋', '陈杰',
  '杨静', '赵磊', '黄敏', '周涛', '吴昊',
  '徐丽', '孙强', '马超', '朱琳', '郭鹏',
  '何雪', '高峰', '林燕', '罗宇', '郑鑫',
  '梁晨', '谢辉', '宋佳', '唐宁', '许航',
  '韩冰', '冯雷', '邓超', '曹颖', '彭博',
];

const AVATAR_COLORS = [
  'FF6B35', '0D47A1', '00BFA5', 'E53935', '7C4DFF',
  'FF9800', '4CAF50', '2196F3', '9C27B0', 'F44336',
];

const TOPIC_OUTLINES: Record<string, { chapter: string; points: string[] }[]> = {
  力学: [
    { chapter: '运动的描述', points: ['质点', '参考系', '位移', '速度', '加速度'] },
    { chapter: '匀变速直线运动', points: ['速度公式', '位移公式', 'v-t图像', '自由落体'] },
    { chapter: '相互作用', points: ['重力', '弹力', '摩擦力', '力的合成与分解'] },
    { chapter: '牛顿运动定律', points: ['牛顿第一定律', '牛顿第二定律', '牛顿第三定律', '超重失重'] },
  ],
  电磁学: [
    { chapter: '静电场', points: ['库仑定律', '电场强度', '电势', '电容'] },
    { chapter: '恒定电流', points: ['欧姆定律', '串并联电路', '电功与电功率'] },
    { chapter: '磁场', points: ['磁感应强度', '安培力', '洛伦兹力'] },
    { chapter: '电磁感应', points: ['磁通量', '法拉第电磁感应定律', '楞次定律'] },
  ],
  光学: [
    { chapter: '几何光学', points: ['光的反射', '光的折射', '全反射', '透镜成像'] },
    { chapter: '波动光学', points: ['光的干涉', '光的衍射', '光的偏振'] },
  ],
  热学: [
    { chapter: '分子动理论', points: ['分子热运动', '分子力', '内能'] },
    { chapter: '气体定律', points: ['玻意耳定律', '查理定律', '盖-吕萨克定律', '理想气体状态方程'] },
  ],
  原子物理: [
    { chapter: '原子结构', points: ['电子的发现', 'α粒子散射实验', '玻尔模型'] },
    { chapter: '原子核', points: ['天然放射现象', '核反应方程', '质能方程'] },
  ],
  波动: [
    { chapter: '机械振动', points: ['简谐运动', '单摆', '受迫振动与共振'] },
    { chapter: '机械波', points: ['波的形成', '波长频率波速', '波的干涉衍射'] },
  ],
  相对论初步: [
    { chapter: '狭义相对论', points: ['伽利略相对性原理', '光速不变原理', '时间膨胀', '长度收缩'] },
  ],
  实验误差分析: [
    { chapter: '误差理论', points: ['系统误差', '偶然误差', '绝对误差与相对误差'] },
    { chapter: '数据处理', points: ['有效数字', '图像法', '逐差法'] },
  ],
};

const TOPIC_LIST = Object.keys(TOPIC_OUTLINES);

function buildUsersAndGroups(): { users: User[]; groups: Group[] } {
  const users: User[] = [];
  const groups: Group[] = [];
  let uIdx = 0;
  GROUP_NAMES.forEach((gname, gi) => {
    const gid = `g-${gi + 1}`;
    const initialCoins = 500;
    const memberIds: string[] = [];
    for (let mi = 0; mi < 5; mi++) {
      const uidStr = `u-${String(uIdx + 1).padStart(2, '0')}`;
      memberIds.push(uidStr);
      users.push({
        id: uidStr,
        name: STUDENT_NAMES[uIdx] || `学生${uIdx + 1}`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uidStr}&backgroundColor=${AVATAR_COLORS[(gi + mi) % AVATAR_COLORS.length]}`,
        classId: null,
        groupId: gid,
        role: mi === 0 ? 'leader' : 'member',
        personalCoins: 0,
      });
      uIdx++;
    }
    const ratio = Math.floor(100 / memberIds.length);
    const rem = 100 - ratio * memberIds.length;
    const contributionRatio: Record<string, number> = {};
    memberIds.forEach((mid, i) => {
      contributionRatio[mid] = ratio + (i < rem ? 1 : 0);
    });
    groups.push({
      id: gid,
      name: gname,
      logo: `#${AVATAR_COLORS[gi % AVATAR_COLORS.length]}`,
      totalCoins: initialCoins,
      initialCoins,
      classId: null,
      contributionRatio,
    });
  });
  return { users, groups };
}

function buildTopics(): PhysicsTopic[] {
  return TOPIC_LIST.map((title, i) => ({
    id: `topic-${i + 1}`,
    title,
    outline: TOPIC_OUTLINES[title] || [],
    aiMaterial: [
      `# ${title} - AI 自学路径`,
      '',
      `本主题涵盖高中物理中"${title}"的核心知识点。`,
      '',
      '## 学习建议',
      '1. 从基本概念出发，理解物理量的定义',
      '2. 掌握核心公式及其适用条件',
      '3. 结合生活实例加深理解',
      '4. 通过例题和习题巩固解题技巧',
      '',
      '## 章节要点',
      ...(TOPIC_OUTLINES[title] || []).flatMap((c) => [
        `### ${c.chapter}`,
        '- ' + c.points.join(' / '),
        '',
      ]),
    ].join('\n'),
  }));
}

function buildQuestions(topics: PhysicsTopic[]): Question[] {
  const questions: Question[] = [];
  let qIdx = 1;
  const types: QuestionType[] = ['single', 'judge', 'multiple'];
  topics.forEach((t) => {
    const topicId = t.id;
    const kps = t.outline.flatMap((c) => c.points);
    kps.forEach((kp, i) => {
      const type = types[i % 3];
      let stem = '';
      let options: string[] = [];
      let answer: number | number[] | boolean = 0;
      const difficulty = ((i % 3) + 1) as 1 | 2 | 3;
      if (type === 'single') {
        const stemsOpts = [
          {
            stem: `关于${kp}的下列说法中，正确的是：`,
            opts: ['该概念仅适用于宏观低速场景', '在高中物理范围内有严格的数学表达', '与参考系选择无关', '属于标量运算不考虑方向'],
            ans: 1,
          },
          {
            stem: `在${kp}相关实验中，下列操作或说法正确的是：`,
            opts: ['必须选用精度最高的仪器', '实验前无需校准', '多次测量取平均可减小系统误差', '数据记录保留任意位数越多越好'],
            ans: 2,
          },
          {
            stem: `下列哪个公式或规律与${kp}直接相关？`,
            opts: ['F=ma', 'PV=nRT', 'E=mc²', 'F=kx'],
            ans: 0,
          },
        ];
        const tpl = stemsOpts[i % 3];
        stem = tpl.stem;
        options = tpl.opts;
        answer = tpl.ans;
      } else if (type === 'multiple') {
        stem = `关于${kp}，下列说法正确的是（多选）：`;
        options = [
          '该知识点是高中物理核心考点',
          '可通过实验验证其正确性',
          '在任何条件下都严格成立',
          '与其他知识点存在密切联系',
        ];
        answer = [0, 1, 3];
      } else {
        stem = `${kp}是高中物理必须掌握的重要知识点。（判断对错）`;
        options = ['正确', '错误'];
        answer = true;
      }
      questions.push({
        id: `q-${String(qIdx).padStart(3, '0')}`,
        type,
        stem,
        options,
        answer,
        knowledgePoint: kp,
        difficulty,
        topicId,
      });
      qIdx++;
    });
  });
  return questions;
}

function buildChallenges(groups: Group[], topics: PhysicsTopic[]): Challenge[] {
  return [
    {
      id: 'ch-01',
      title: '力学基础挑战赛',
      creatorGroupId: groups[0].id,
      topicId: topics[0].id,
      questionIds: [],
      reward: 100,
      deadline: new Date(Date.now() + 3 * 86400000),
      status: 'open',
      submissions: [],
    },
    {
      id: 'ch-02',
      title: '电磁学高阶对决',
      creatorGroupId: groups[1].id,
      topicId: topics[1].id,
      questionIds: [],
      reward: 150,
      deadline: new Date(Date.now() + 5 * 86400000),
      status: 'open',
      submissions: [],
    },
    {
      id: 'ch-03',
      title: '光学概念速答',
      creatorGroupId: groups[2].id,
      topicId: topics[2].id,
      questionIds: [],
      reward: 80,
      deadline: new Date(Date.now() + 2 * 86400000),
      status: 'open',
      submissions: [],
    },
  ];
}

function buildProjects(groups: Group[]): Project[] {
  const now = new Date();
  const statuses: ProjectStatus[] = ['planning', 'progress', 'review', 'done', 'failed', 'frozen'];
  const defs = [
    { title: '自制简易电动机', topic: '电磁学', equip: 'electric' },
    { title: '弹簧振子周期测量', topic: '力学', equip: 'mechanical' },
    { title: '太阳能电池效率实验', topic: '光学', equip: 'optical' },
    { title: '气体定律验证', topic: '热学', equip: 'thermal' },
    { title: '云室观察放射性径迹', topic: '原子物理', equip: 'radiation' },
    { title: '驻波共振演示装置', topic: '波动', equip: 'mechanical' },
    { title: '光纤通信模拟实验', topic: '光学', equip: 'optical' },
    { title: '霍尔效应测量磁场', topic: '电磁学', equip: 'electric' },
    { title: '单摆测重力加速度', topic: '力学', equip: 'mechanical' },
    { title: '黑体辐射曲线拟合', topic: '热学', equip: 'thermal' },
  ];
  return defs.map((d, i) => {
    const gi = i % groups.length;
    const status = statuses[i % statuses.length];
    return {
      id: `proj-${String(i + 1).padStart(2, '0')}`,
      title: d.title,
      topic: d.topic,
      ownerGroupId: groups[gi].id,
      startDate: new Date(now.getTime() - (10 - i) * 86400000),
      dueDate: new Date(now.getTime() + (20 + i) * 86400000),
      progress: status === 'done' ? 100 : status === 'failed' ? 55 : 10 + i * 10,
      status,
      techPoints: `# ${d.title} 技术要点\n\n## 原理\n基于${d.topic}核心原理设计的实验方案。\n\n## 器材\n${d.equip}类仪器、标准量具等。`,
      difficulties: `# ${d.title} 技术难点\n\n1. 精度控制\n2. 数据处理\n3. 误差分析`,
      equipmentList: [
        { name: '主仪器', qty: 1, category: d.equip },
        { name: '辅助器材', qty: 5, category: 'mechanical' },
      ],
      safetyCategory: (d.equip as SafetyCategory),
      safetyPassed: {},
      photos: [],
      results: status === 'done' ? `# ${d.title} 实验结果\n\n实验成功，数据吻合度良好。` : '',
      rewardCoins: 200 + i * 20,
    };
  });
}

function buildRecruitments(projects: Project[], users: User[]): Recruitment[] {
  const statuses: Recruitment['status'][] = ['open', 'open', 'assigned', 'done', 'failed'];
  return projects.slice(0, 5).map((p, i) => {
    const bids: RecruitmentBid[] = [];
    const pool = users.filter((u) => u.groupId !== p.ownerGroupId);
    for (let j = 0; j < Math.min(3, pool.length); j++) {
      bids.push({
        userId: pool[(i + j) % pool.length].id,
        skillDesc: ['数据分析', '仪器操作', '文档撰写'][j % 3],
        hours: 5 + j * 2,
        bidAt: new Date(Date.now() - (j + 1) * 86400000),
      });
    }
    const st = statuses[i % statuses.length] as Recruitment['status'];
    const assignee = st !== 'open' ? bids[0]?.userId : undefined;
    let resultVal: Recruitment['result'];
    if (st === 'done') resultVal = 'success';
    else if (st === 'failed') resultVal = 'fail';
    else resultVal = undefined;
    const rewardVal = 60 + i * 15;
    let actualPayVal: number | undefined;
    if (resultVal === 'success') actualPayVal = rewardVal;
    else if ((resultVal as string) === 'partial') actualPayVal = Math.floor(rewardVal / 2);
    else if (resultVal === 'fail') actualPayVal = 0;
    const rec: Recruitment = {
      id: `rec-${String(i + 1).padStart(2, '0')}`,
      projectId: p.id,
      title: `${p.title} - 招募技术助手`,
      description: `本项目需要具有${['数据分析', '硬件搭建', '软件模拟'][i % 3]}能力的同学协助。`,
      skills: ['数据分析', '团队协作'],
      reward: rewardVal,
      deadline: new Date(Date.now() + (7 - i) * 86400000),
      status: st,
      bids,
      assigneeUserId: assignee,
      result: resultVal,
      actualPay: actualPayVal,
    };
    return rec;
  });
}

function buildCoinTxs(groups: Group[]): CoinTransaction[] {
  const txs: CoinTransaction[] = [];
  const balances: Record<string, number> = {};
  groups.forEach((g) => {
    balances[g.id] = 0;
  });
  groups.forEach((g) => {
    balances[g.id] += g.initialCoins;
    txs.push({
      id: `tx-init-${g.id}`,
      groupId: g.id,
      source: 'teacher_set',
      refId: 'init',
      delta: g.initialCoins,
      balanceAfter: balances[g.id],
      createdAt: new Date(Date.now() - 30 * 86400000),
      note: '教师分配初始能量币',
    });
  });
  const srcs: CoinSource[] = ['challenge', 'project', 'recruit'];
  for (let i = 0; i < 15; i++) {
    const g = groups[i % groups.length];
    const delta = (i % 2 === 0 ? 1 : -1) * (20 + (i % 4) * 10);
    balances[g.id] += delta;
    txs.push({
      id: `tx-${String(i + 1).padStart(3, '0')}`,
      groupId: g.id,
      source: srcs[i % srcs.length],
      refId: `ref-${i}`,
      delta,
      balanceAfter: balances[g.id],
      createdAt: new Date(Date.now() - (20 - i) * 3600000),
      note:
        srcs[i % srcs.length] === 'challenge'
          ? '挑战结算'
          : srcs[i % srcs.length] === 'project'
            ? '项目阶段奖励'
            : '招募任务结算',
    });
  }
  groups.forEach((g) => {
    g.totalCoins = balances[g.id];
  });
  return txs;
}

const SHOWCASE_IMAGES = [
  'https://images.unsplash.com/photo-1621361164796-86878265944d?w=600&q=80',
  'https://images.unsplash.com/photo-1592861956093-46574388857e?w=600&q=80',
  'https://images.unsplash.com/photo-1583465766507-a37458119065?w=600&q=80',
  'https://images.unsplash.com/photo-1598431786950-17348736a25a?w=600&q=80',
];

function buildShowcase(projects: Project[], groups: Group[]): ShowcaseItem[] {
  const doneList = projects.filter((p) => p.status === 'done');
  return doneList.slice(0, 4).map((p, i) => ({
    id: `sc-${String(i + 1).padStart(2, '0')}`,
    projectId: p.id,
    title: p.title,
    coverImage: SHOWCASE_IMAGES[i % SHOWCASE_IMAGES.length],
    groupId: p.ownerGroupId,
    description: `${groups.find((g) => g.id === p.ownerGroupId)?.name || ''}制作：${p.title}项目成果展示。`,
    loves: 8 + i * 3,
    lovedBy: [],
    createdAt: new Date(Date.now() - (i + 1) * 86400000),
    // 离线演示数据视为已通过审批；分类错开，好让顶部 tab 在离线模式下也能试出效果
    status: 'approved' as const,
    rejectReason: '',
    awardedCoins: 0,
    category: (['photo', 'video', 'paper', 'model'] as const)[i % 4],
  }));
}

export function initMockData(): void {
  if (localStorage.getItem(LS_KEYS.GROUPS)) return;
  const { users, groups: rawGroups } = buildUsersAndGroups();
  const topics = buildTopics();
  const questions = buildQuestions(topics);
  const challenges = buildChallenges(rawGroups, topics);
  const projects = buildProjects(rawGroups);
  const recruitments = buildRecruitments(projects, users);
  const coinTxs = buildCoinTxs(rawGroups);
  const showcase = buildShowcase(projects, rawGroups);
  const classMeta: ClassMeta = {
    initialCoinsPerGroup: 500,
    termName: '2025-2026学年第一学期',
    coinEasy: 1,
    coinMedium: 2,
    coinHard: 3,
  };
  saveLS(LS_KEYS.GROUPS, rawGroups);
  localStorage.setItem('plab_users_cache', JSON.stringify(users));
  saveLS(LS_KEYS.TOPICS, topics);
  saveLS(LS_KEYS.QUESTIONS, questions);
  saveLS(LS_KEYS.QUIZ_SESSIONS, []);
  saveLS(LS_KEYS.CHALLENGES, challenges);
  saveLS(LS_KEYS.PROJECTS, projects);
  saveLS(LS_KEYS.RECRUITMENTS, recruitments);
  saveLS(LS_KEYS.COIN_TXS, coinTxs);
  saveLS(LS_KEYS.SHOWCASE, showcase);
  saveLS(LS_KEYS.CLASS_META, classMeta);
  saveLS(LS_KEYS.CURRENT_USER, { userId: null, classId: null, groupId: null, role: null });
}

export function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
