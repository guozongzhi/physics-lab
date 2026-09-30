import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useGroupStore } from '../store/groupStore';
import { useTheoryStore } from '../store/theoryStore';
import { useProjectStore } from '../store/projectStore';
import { useCoinStore } from '../store/coinStore';
import ChangePasswordModal from '../components/ui/ChangePasswordModal';
import {
  Rocket,
  Brain,
  FlaskConical,
  ShieldCheck,
  Swords,
  Zap,
  Sparkles,
  Users,
  Target,
  Award,
  TrendingUp,
  CalendarDays,
  Clock,
  CheckCircle2,
  Lock,
  CircleDot,
  ArrowRight,
  Trophy,
  Crown,
  Star,
  Clock3,
  Coins,
  Plus,
  Pencil,
  Trash2,
  Megaphone,
  Eye,
  AlertTriangle,
  BookOpen,
  UserPlus,
  X,
} from 'lucide-react';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import { classesApi, safetyApi, groupsApi, coinsApi, SafetyRecord } from '@/lib/apiService';
import { apiEnabled, getToken } from '@/lib/apiClient';
import { reviveDates } from '@/lib/reviveDates';
import { cn } from '@/lib/utils';
import type { User, Project, ProjectStatus } from '@/data/mockData';

function useCountUp(target: number, duration = 1800, start = 0) {
  const [value, setValue] = useState(start);
  useEffect(() => {
    let raf = 0;
    const startTime = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const t = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 200);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, start]);
  return value;
}

function ProgressRing({ size = 70, stroke = 10, progress = 82, colorFrom = '#4F7CFF', colorTo = '#8B5CF6' }: {
  size?: number; stroke?: number; progress?: number; colorFrom?: string; colorTo?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (progress / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id={`pr-${colorFrom}-${colorTo}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={colorFrom} />
          <stop offset="100%" stopColor={colorTo} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#E2E8F0" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={`url(#pr-${colorFrom}-${colorTo})`}
        strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={off}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
      />
    </svg>
  );
}

interface TaskCardProps {
  icon: any;
  title: string;
  progress: number;
  reward: number;
  status: '进行中' | '已解锁' | '待认证' | '开放';
  tint: 'mission' | 'energy' | 'nova' | 'growth';
  onClick?: () => void;
}

const TINT_BG: Record<string, string> = {
  mission: 'from-mission-400/20 via-mission-500/15 to-nova-400/20 text-mission-600',
  energy: 'from-energy-400/20 via-alert-400/15 to-energy-500/20 text-energy-600',
  nova: 'from-nova-400/20 via-nova-500/15 to-nova-600/20 text-nova-600',
  growth: 'from-growth-400/20 via-growth-500/15 to-growth-600/20 text-growth-600',
};
const TINT_PROGRESS: Record<string, string> = {
  mission: 'from-mission-400 to-nova-500',
  energy: 'from-energy-400 to-alert-500',
  nova: 'from-nova-400 to-nova-600',
  growth: 'from-growth-400 to-growth-600',
};
const STATUS_CHIP: Record<string, string> = {
  '进行中': 'chip-mission',
  '已解锁': 'chip-growth',
  '待认证': 'chip-alert',
  '开放': 'chip-nova',
};

function TaskCard({ icon: Icon, title, progress, reward, status, tint, onClick }: TaskCardProps) {
  return (
    <button type="button" onClick={onClick} className={`glass-card glass-card-hover p-3.5 w-[152px] shrink-0 text-left !appearance-none border-0 outline-none focus:ring-2 focus:ring-mission-400/40 ${onClick ? 'cursor-pointer' : ''}`}>
      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${TINT_BG[tint]} flex items-center justify-center mb-3 shadow-sm`}>
        <Icon size={20} strokeWidth={2.3} />
      </div>
      <div className="text-[13px] font-bold text-ink-800 leading-tight mb-2">{title}</div>
      <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden mb-2">
        <div className={`h-full bg-gradient-to-r ${TINT_PROGRESS[tint]} rounded-full`} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] font-bold text-gradient-energy">
          <Zap size={11} />+{reward}
        </div>
        <span className={`${STATUS_CHIP[status]} !py-0.5 !px-1.5 !text-[10px]`}>{status}</span>
      </div>
    </button>
  );
}

const LEARNING_PATH_CONFIG = [
  { id: 'ai_learn', name: 'AI学习', badge: false },
  { id: 'knowledge_organize', name: '知识整理', badge: false },
  { id: 'ai_test', name: 'AI检测', badge: false },
  { id: 'intensive_training', name: '强化训练', badge: false },
  { id: 'pass_80', name: '80%通过', badge: true },
  { id: 'create_quiz', name: '创作题库', badge: false },
  { id: 'challenge_other', name: '挑战其他小组', badge: false },
  { id: 'earn_energy', name: '获得能量', badge: false },
  { id: 'project_dev', name: '项目研发', badge: false },
  { id: 'experiment', name: '实验', badge: false },
  { id: 'showcase', name: '成果展示', badge: false },
];


export default function Dashboard() {
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const { userId, role, groupId, classId } = useAuthStore();
  const authName = useAuthStore((s) => s.name);
  const isDefaultPassword = useAuthStore((s) => s.isDefaultPassword);

  // 「还在用初始密码」提示：按用户记住「知道了」，不反复打扰。
  // 改过密码后 isDefaultPassword 变 false，提示自然消失。
  const pwdHintKey = `plab_pwd_hint_dismissed_${userId ?? 'anon'}`;
  const [pwdHintDismissed, setPwdHintDismissed] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  useEffect(() => {
    if (!userId) return;
    try {
      setPwdHintDismissed(localStorage.getItem(pwdHintKey) === '1');
    } catch {
      /* localStorage 不可用时忽略 */
    }
  }, [userId, pwdHintKey]);
  const dismissPwdHint = () => {
    setPwdHintDismissed(true);
    try {
      localStorage.setItem(pwdHintKey, '1');
    } catch {
      /* ignore */
    }
  };
  const showPwdHint = role === 'student' && Boolean(isDefaultPassword) && !pwdHintDismissed;
  const setGroupId = useAuthStore((s) => s.setGroupId);
  const getUserById = useGroupStore((s) => s.getUserById);
  const groups = useGroupStore((s) => s.groups);
  const users = useGroupStore((s) => s.users);
  const joinGroup = useGroupStore((s) => s.joinGroup);

  // 同班同学弹窗
  const [showClassmates, setShowClassmates] = useState(false);
  const [classmates, setClassmates] = useState<User[]>([]);
  const [loadingClassmates, setLoadingClassmates] = useState(false);

  const openClassmates = async () => {
    if (!classId) return;
    setShowClassmates(true);
    setLoadingClassmates(true);
    try {
      const list = await classesApi.listStudents(classId);
      setClassmates(list);
    } catch {
      pushToast('加载同学名单失败', 'error');
    } finally {
      setLoadingClassmates(false);
    }
  };

  // 学生只能看到并加入本班的小组（无 classId 的旧数据回退为全部可见）
  const joinableGroups = useMemo(
    () => (classId ? groups.filter((g) => g.classId === classId) : groups),
    [groups, classId]
  );
  const { quizSessions, challenges } = useTheoryStore();
  const { projects, showcaseItems, recruitments, createProject, updateProject, deleteProject, createRecruitment } = useProjectStore();
  const { coinTxs } = useCoinStore();

  // 学生自助加入小组的本地状态
  const [pendingGroupId, setPendingGroupId] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const needsGroup = role === 'student' && !groupId;

  const handleJoinGroup = async () => {
    if (!userId || !pendingGroupId) {
      setJoinError('请选择要加入的小组');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      await joinGroup(userId, pendingGroupId);
      setGroupId(pendingGroupId);
      const g = groups.find((x) => x.id === pendingGroupId);
      pushToast(`🚀 已加入小组「${g?.name || ''}」，开始你的研究之旅！`, 'success');
    } catch (err: any) {
      setJoinError(err?.message || '加入失败，请稍后重试或联系老师');
    } finally {
      setJoining(false);
    }
  };

  const currentUser = useMemo(() => {
    if (!userId) return null;
    const fromRoster = getUserById(userId);
    if (fromRoster) return fromRoster;
    // 教师/管理员通常不在学生名单里，回退到登录态里的名字。
    // 原先这里写死了一个真人姓名「杨静老师」，换个老师就显示错人。
    const fallback = role === 'teacher' ? '老师' : role === 'admin' ? '管理员' : '研究员';
    return { name: authName || fallback };
  }, [userId, role, getUserById, authName]);

  // 当前学生所属项目组（用于欢迎语展示）
  const getGroupById = useGroupStore((s) => s.getGroupById);
  const myGroup = useMemo(() => {
    if (!groupId) return null;
    return getGroupById(groupId) || null;
  }, [groupId, getGroupById]);

  // Project Galaxy：真实项目（学生仅见本组；教师/管理员见全部）
  const isStaff = role === 'teacher' || role === 'admin';
  const visibleProjects = useMemo(() => {
    if (isStaff) return projects;
    if (groupId) return projects.filter((p) => p.ownerGroupId === groupId);
    return projects;
  }, [projects, isStaff, groupId]);
  const groupNameOf = (gid: string) => groups.find((g) => g.id === gid)?.name || '未分组';
  const memberCountOf = (gid: string) => users.filter((u) => u.groupId === gid).length;

  const PROJECT_COLOR: Record<ProjectStatus, { color: string; hex: [string, string] }> = {
    planning: { color: 'ink', hex: ['#94A3B8', '#CBD5E1'] },
    progress: { color: 'mission', hex: ['#4F7CFF', '#8FAEFF'] },
    review: { color: 'alert', hex: ['#F59E0B', '#FBBF24'] },
    done: { color: 'growth', hex: ['#22C55E', '#6CE9A6'] },
    failed: { color: 'danger', hex: ['#F04438', '#F87171'] },
    frozen: { color: 'nova', hex: ['#8B5CF6', '#B692F6'] },
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [pForm, setPForm] = useState({
    title: '', topic: '', status: 'planning' as ProjectStatus, progress: 0,
    dueDate: '', rewardCoins: 200, techPoints: '', difficulties: '', ownerGroupId: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const openCreate = () => {
    setEditing(null);
    setPForm({
      title: '', topic: '', status: 'planning', progress: 0,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      rewardCoins: 200, techPoints: '', difficulties: '',
      ownerGroupId: isStaff ? '' : (groupId || ''),
    });
    setFormOpen(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    const d = p.dueDate instanceof Date ? p.dueDate : new Date(p.dueDate);
    setPForm({
      title: p.title, topic: p.topic, status: p.status, progress: p.progress,
      dueDate: isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10),
      rewardCoins: p.rewardCoins, techPoints: p.techPoints || '', difficulties: p.difficulties || '',
      ownerGroupId: p.ownerGroupId,
    });
    setFormOpen(true);
  };

  const submitProject = async () => {
    if (!pForm.title.trim()) { pushToast('请填写项目名称', 'warning'); return; }
    if (!pForm.topic.trim()) { pushToast('请填写课题', 'warning'); return; }
    if (isStaff && !editing && !pForm.ownerGroupId) { pushToast('请选择所属小组', 'warning'); return; }
    setSaving(true);
    try {
      const patch = {
        title: pForm.title.trim(),
        topic: pForm.topic.trim(),
        status: pForm.status,
        progress: Math.max(0, Math.min(100, Number(pForm.progress) || 0)),
        dueDate: pForm.dueDate ? new Date(pForm.dueDate) : undefined,
        rewardCoins: Number(pForm.rewardCoins) || 0,
        techPoints: pForm.techPoints,
        difficulties: pForm.difficulties,
      };
      if (editing) {
        updateProject(editing.id, patch);
        pushToast('项目已更新', 'success');
      } else {
        createProject({ ...patch, ownerGroupId: isStaff ? pForm.ownerGroupId : (groupId || '') });
        pushToast('项目已创建', 'success');
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e: any) {
      pushToast(e?.message || '保存失败', 'error');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      deleteProject(deleteTarget.id);
      pushToast(`已删除项目「${deleteTarget.title}」`, 'success');
    } catch (e: any) {
      pushToast(e?.message || '删除失败', 'error');
    } finally { setDeleteTarget(null); }
  };

  const [recOpen, setRecOpen] = useState(false);
  const [recProject, setRecProject] = useState<Project | null>(null);
  const [recForm, setRecForm] = useState({ title: '', description: '', skills: '', reward: 50, daysLeft: 7 });
  const [recSaving, setRecSaving] = useState(false);
  const canPublish = (gid: string) =>
    isStaff || (groupId === gid && users.find((u) => u.id === userId)?.role === 'leader');

  // 招募酬劳即押金，发布时就从项目归属组扣下，所以先算出余额用来拦人
  const recBalance = recProject
    ? groups.find((g) => g.id === recProject.ownerGroupId)?.totalCoins ?? 0
    : 0;
  const recInsufficient = Number(recForm.reward) > recBalance;

  const openRecruit = (p: Project) => {
    setRecProject(p);
    setRecForm({ title: '', description: '', skills: '', reward: 50, daysLeft: 7 });
    setRecOpen(true);
  };

  const submitRecruit = async () => {
    if (!recProject) return;
    if (!recForm.title.trim()) { pushToast('请填写招募标题', 'warning'); return; }
    if (!recForm.description.trim()) { pushToast('请填写任务描述', 'warning'); return; }
    if (!recForm.skills.trim()) { pushToast('请填写技能要求', 'warning'); return; }
    if (Number(recForm.reward) <= 0) { pushToast('酬劳需大于 0 能量币', 'warning'); return; }
    if (recInsufficient) {
      pushToast(`本组只有 ${recBalance} ⚡，付不起 ${recForm.reward} ⚡ 的酬劳`, 'warning');
      return;
    }
    setRecSaving(true);
    try {
      createRecruitment({
        projectId: recProject.id,
        title: recForm.title.trim(),
        description: recForm.description.trim(),
        skills: recForm.skills.split(/[,，\s]+/).filter(Boolean),
        reward: Number(recForm.reward) || 0,
        deadline: new Date(Date.now() + (Number(recForm.daysLeft) || 7) * 86400000),
      });
      pushToast('招募已发布，学生可在招募市场投标', 'success');
      setRecOpen(false);
    } catch (e: any) {
      pushToast(e?.message || '发布失败', 'error');
    } finally { setRecSaving(false); }
  };

  const learningPathProgress = useMemo(() => {
    // --- 前 5 步：按「当前学生自己」的测验记录判定 ---
    // 在线时 quizSessions 由后端按 user_id 返回（bootstrap 拉取），离线时是本机记录。
    // 三个不同的信号，避免做一次测验就让 01/02/03 三盏一起亮：
    const hasStartedQuiz = quizSessions.length > 0;
    const hasAnsweredQuiz = quizSessions.some((s) => Object.keys(s.userAnswers || {}).length > 0);
    const hasGradedQuiz = quizSessions.some((s) => s.graded);
    const hasBlindPoints = quizSessions.some((s) => s.blindPoints.length > 0);
    const hasPassedQuiz = quizSessions.some((s) => s.passed);

    // --- 后 6 步：按「本组」口径统计 ---
    const hasCreatedChallenge = challenges.some((c) => c.creatorGroupId === groupId);
    const hasSubmittedChallenge = challenges.some((c) =>
      c.submissions?.some((s) => s.groupId === groupId)
    );
    const hasCoinTransaction = coinTxs.some((tx) => tx.groupId === groupId);
    const myGroupProjects = projects.filter((p) => p.ownerGroupId === groupId);
    const hasProject = myGroupProjects.length > 0;
    const hasProjectInProgress = myGroupProjects.some((p) => p.progress > 50);
    const hasShowcase = showcaseItems.some((s) => s.groupId === groupId);

    const doneMap: Record<string, boolean> = {
      ai_learn: hasStartedQuiz,
      knowledge_organize: hasAnsweredQuiz,
      ai_test: hasGradedQuiz,
      intensive_training: hasBlindPoints,
      pass_80: hasPassedQuiz,
      create_quiz: hasCreatedChallenge,
      challenge_other: hasSubmittedChallenge,
      earn_energy: hasCoinTransaction,
      project_dev: hasProject,
      experiment: hasProjectInProgress,
      showcase: hasShowcase,
    };

    // active 一律「按顺序推导」：第一个未完成的步骤就是当前步骤。
    // 原先每个步骤各写一句 active 表达式，正是 STEP 01 判定写歪的来源。
    const firstIncomplete = LEARNING_PATH_CONFIG.find((s) => !doneMap[s.id])?.id;
    const progressMap: Record<string, { done: boolean; active: boolean }> = {};
    LEARNING_PATH_CONFIG.forEach((s) => {
      progressMap[s.id] = { done: doneMap[s.id], active: s.id === firstIncomplete };
    });

    return progressMap;
  }, [quizSessions, challenges, coinTxs, projects, showcaseItems, groupId]);

  const completedSteps = useMemo(() => {
    return LEARNING_PATH_CONFIG.filter((step) => learningPathProgress[step.id]?.done).length;
  }, [learningPathProgress]);

  // --- 真实数据派生（替换 mock）---
  const DAY = 86400000;
  const myCoins = Math.max(0, myGroup?.totalCoins || 0);
  const levelOf = (coins: number) => Math.max(1, Math.min(12, Math.floor(Math.log10(Math.max(1, coins)) * 2)));
  const sumDelta = (since: number) =>
    coinTxs
      .filter((tx) => tx.groupId === groupId && (tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt)).getTime() >= since)
      .reduce((s, tx) => s + tx.delta, 0);
  const coinTodayVal = sumDelta(Date.now() - DAY);
  const coinWeekVal = sumDelta(Date.now() - 7 * DAY);
  const levelThreshold = (lv: number) => Math.pow(10, lv / 2) | 0;
  const upgradeNeedVal = Math.max(0, levelThreshold(levelOf(myCoins) + 1) - myCoins);
  // 当前等级的区间进度。原先这条进度条写死 width:'62%'、刻度也写死 62%，
  // 跟上面真算出来的「距升级 X⚡」自相矛盾。
  const lvNow = levelOf(myCoins);
  const lvFloor = levelThreshold(lvNow);
  const lvCeil = levelThreshold(lvNow + 1);
  const levelProgress = Math.max(
    0,
    Math.min(100, Math.round(((myCoins - lvFloor) / Math.max(1, lvCeil - lvFloor)) * 100))
  );
  // 这就是学习路径的完成度（= 下面那行「已完成 X/11」）。原先叫 todayProgress 并标成
  // 「今日任务进度」，与「今日」无关，也跟旁边那 4 条写死的清单对不上。
  const pathProgress = Math.round((completedSteps / Math.max(1, LEARNING_PATH_CONFIG.length)) * 100);

  /** 环下面那条「接下来做什么」：按顺序取未完成的步骤，全部来自真实状态。 */
  const upcomingSteps = useMemo(
    () =>
      LEARNING_PATH_CONFIG
        .map((s, i) => ({ id: s.id, step: i + 1, name: s.name, ...learningPathProgress[s.id] }))
        .filter((s) => !s.done)
        .slice(0, 4),
    [learningPathProgress]
  );

  const teamRanking = useMemo(
    () =>
      [...groups]
        .sort((a, b) => b.totalCoins - a.totalCoins)
        .slice(0, 6)
        .map((g, i) => ({
          // 列表已按能量降序，名次就是下标 +1。原先写死 0，界面上 4–6 名全显示「#0」。
          rank: i + 1,
          name: g.name,
          level: `LV${levelOf(g.totalCoins)}`,
          coins: g.totalCoins,
          projects: projects.filter((p) => p.ownerGroupId === g.id).length,
        })),
    [groups, projects]
  );
  const maxTeamCoin = Math.max(1, ...teamRanking.map((t) => t.coins));

  const classGroups = classId ? groups.filter((g) => g.classId === classId) : groups;
  const classStudents = classId ? users.filter((u) => u.classId === classId) : users;
  const classGroupIds = new Set(classGroups.map((g) => g.id));
  const classProjects = projects.filter((p) => classGroupIds.has(p.ownerGroupId));
  const classStats = [
    { label: '总人数', value: classStudents.length, suffix: '人', tint: 'mission' },
    { label: '总小组', value: classGroups.length, suffix: '组', tint: 'nova' },
    { label: '完成项目', value: classProjects.filter((p) => p.status === 'done').length, suffix: '个', tint: 'growth' },
    { label: '进行中', value: classProjects.filter((p) => ['progress', 'review', 'planning'].includes(p.status)).length, suffix: '个', tint: 'mission' },
    { label: '失败项目', value: classProjects.filter((p) => p.status === 'failed').length, suffix: '个', tint: 'danger' },
    { label: 'AI学习完成率', value: classStudents.length ? Math.round((classStudents.filter((u) => u.personalCoins > 0).length / classStudents.length) * 100) : 0, suffix: '%', tint: 'energy' },
    { label: '安全通过率', value: classProjects.length ? Math.round((classProjects.filter((p) => Object.keys(p.safetyPassed || {}).length > 0).length / classProjects.length) * 100) : 0, suffix: '%', tint: 'growth' },
    { label: '能量流通', value: classGroups.reduce((s, g) => s + g.totalCoins, 0), suffix: '⚡', tint: 'alert' },
  ];

  const labNews = useMemo(
    () =>
      [...coinTxs]
        .sort((a, b) =>
          (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)).getTime() -
          (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)).getTime()
        )
        .slice(-5)
        .reverse()
        .map((tx) => {
          const t = tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt);
          return {
            time: `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`,
            group: groups.find((g) => g.id === tx.groupId)?.name || '未知小组',
            event: tx.note || '能量币变动',
            coin: tx.delta,
            variant: tx.delta >= 0 ? 'growth' : 'danger',
          };
        }),
    [coinTxs, groups]
  );

  const recruitList = useMemo(
    () =>
      recruitments
        .filter((r) => r.status === 'open')
        .slice(0, 3)
        .map((r) => ({
          title: r.title,
          project: projects.find((p) => p.id === r.projectId)?.title || '',
          role: r.skills?.[0] || '不限',
          reward: r.reward,
          daysLeft: Math.max(0, Math.ceil((new Date(r.deadline instanceof Date ? r.deadline : r.deadline).getTime() - Date.now()) / 86400000)),
        })),
    [recruitments, projects]
  );

  const achievements = useMemo(
    () =>
      showcaseItems.slice(0, 6).map((s) => ({
        title: s.title || '成果展示',
        // 组员数取该作品真实所属小组的人数。原先界面上是写死的 `{4 + (i % 3)}人`。
        members: users.filter((u) => u.groupId === s.groupId).length,
      })),
    [showcaseItems, users]
  );

  const coinTotal = useCountUp(myCoins);
  const coinToday = useCountUp(coinTodayVal);
  const coinWeek = useCountUp(coinWeekVal);
  const upgradeNeed = useCountUp(upgradeNeedVal);
  const newsCoin1 = useCountUp(labNews[0]?.coin || 0);
  const newsCoin2 = useCountUp(labNews[1]?.coin || 0);
  const newsCoin3 = useCountUp(labNews[2]?.coin || 0);
  const newsCoin4 = useCountUp(labNews[3]?.coin || 0);
  const newsCoin5 = useCountUp(labNews[4]?.coin || 0);
  const recruit0 = useCountUp(recruitList[0]?.reward || 0);
  const recruit1 = useCountUp(recruitList[1]?.reward || 0);
  const recruit2 = useCountUp(recruitList[2]?.reward || 0);
  const teamCoin0 = useCountUp(teamRanking[0]?.coins || 0);
  const teamCoin1 = useCountUp(teamRanking[1]?.coins || 0);
  const teamCoin2 = useCountUp(teamRanking[2]?.coins || 0);
  const teamCoin3 = useCountUp(teamRanking[3]?.coins || 0);
  const teamCoin4 = useCountUp(teamRanking[4]?.coins || 0);
  const teamCoin5 = useCountUp(teamRanking[5]?.coins || 0);
  const statValues = classStats.map((s) => useCountUp(s.value, 1400 + classStats.indexOf(s) * 120));

  // 安全记录 + TaskCard 真实进度
  const [safetyRecords, setSafetyRecords] = useState<SafetyRecord[]>([]);
  useEffect(() => { safetyApi.myRecords().then(setSafetyRecords).catch(() => {}); }, []);

  // 轻量轮询：每 30 秒从后端拉最新小组能量与能量流水，让教师的调整无需手动刷新即可显示
  useEffect(() => {
    if (!apiEnabled || !getToken()) return;
    let alive = true;
    const tick = async () => {
      try {
        const [freshGroups, freshTxs] = await Promise.all([groupsApi.list(), coinsApi.transactions()]);
        if (!alive) return;
        useGroupStore.setState({ groups: freshGroups });
        const coinTxs = reviveDates(freshTxs as any[], ['createdAt']).sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        useCoinStore.setState({ coinTxs });
      } catch {
        /* 忽略单次轮询失败（离线/网络抖动），下次再试 */
      }
    };
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const passedCats = new Set(safetyRecords.filter((r) => r.passed).map((r) => r.category)).size;
  const pendingCats = Math.max(0, 6 - passedCats);
  const frozenProjects = projects.filter((p) => p.status === 'frozen').length;
  const myProjects = myGroup ? projects.filter((p) => p.ownerGroupId === myGroup.id) : [];
  const avgProjectProgress = myProjects.length ? Math.round(myProjects.reduce((s, p) => s + p.progress, 0) / myProjects.length) : 0;
  const safetyProgress = Math.round((passedCats / 6) * 100);
  const wonChallengesCount = challenges.filter((c) => c.creatorGroupId === groupId && c.submissions?.some((s) => s.earned > 0)).length;
  const challengeProgress = Math.min(100, wonChallengesCount * 20);
  const projectReward = myProjects[0]?.rewardCoins || 0;

  return (
    <div className="w-full space-y-6">
      {/* ============ 待分配小组提示（仅未分组学生可见） ============ */}
      {needsGroup && (
        <section className="rounded-[28px] p-6 relative overflow-hidden bg-gradient-to-br from-alert-50/90 via-white/95 to-energy-50/70 border-2 border-alert-200/70">
          <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-gradient-to-br from-alert-400/15 via-energy-400/10 to-transparent blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-alert-400 to-energy-500 flex items-center justify-center text-white shadow-lg shrink-0">
                <UserPlus size={26} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <span className="mission-label">Pending Assignment · 待分配</span>
                <h2 className="mt-2 text-[22px] md:text-[24px] font-extrabold text-ink-900 leading-tight">
                  你还没有加入任何小组
                </h2>
                <p className="mt-1.5 text-[13.5px] text-ink-500 font-medium leading-relaxed">
                  选择一个小组自助加入即可开始，也可以等待老师为你分配。加入后即可参与挑战、项目与能量币结算。
                </p>
                {joinError && (
                  <p className="mt-2 text-[12.5px] font-semibold text-danger-600 flex items-center gap-1">
                    <AlertTriangle size={13} />{joinError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {joinableGroups.length === 0 ? (
                <span className="text-[13px] text-ink-500 font-medium bg-white/70 border border-ink-100 rounded-xl px-4 py-2.5">
                  本班暂无可加入的小组，请等待老师创建
                </span>
              ) : (
                <>
                  <select
                    value={pendingGroupId}
                    onChange={(e) => { setPendingGroupId(e.target.value); setJoinError(''); }}
                    className="bg-white border border-ink-200 focus:border-mission-400 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-ink-800 focus:outline-none focus:ring-2 focus:ring-mission-400/30 cursor-pointer min-w-[180px]"
                  >
                    <option value="">选择小组…</option>
                    {joinableGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleJoinGroup}
                    disabled={joining || !pendingGroupId}
                    className="btn-energy inline-flex items-center gap-2 !py-2.5 disabled:opacity-60"
                  >
                    <Rocket size={16} />
                    {joining ? '加入中…' : '加入小组'}
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ============ 初始密码提示（仅还在用初始密码的学生可见） ============ */}
      {showPwdHint && (
        <section className="rounded-[28px] p-5 relative overflow-hidden bg-gradient-to-br from-alert-50/90 via-white/95 to-energy-50/70 border-2 border-alert-200/70">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-gradient-to-br from-alert-400/15 to-transparent blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-alert-400 to-energy-500 flex items-center justify-center text-white shadow-lg shrink-0">
              <Lock size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-extrabold text-ink-900">你还在使用初始密码</div>
              <p className="text-[12.5px] text-ink-600 font-medium mt-0.5 leading-relaxed">
                初始密码是全班统一的，同学只要知道你的姓名就可能登进来。建议现在换成只有你自己知道的密码。
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button className="btn-mission !py-2 !px-4 !text-[13px]" onClick={() => setChangePwdOpen(true)}>
                修改密码
              </button>
              <button className="btn-ghost !py-2 !px-3 !text-[13px]" onClick={dismissPwdHint}>
                知道了
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ============ ROW 1: HERO ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5" style={{ minHeight: 240 }}>
        {/* Welcome Hero - 左8列 */}
        <div className="col-span-12 lg:col-span-8 rounded-[28px] p-6 relative overflow-hidden bg-gradient-to-br from-mission-50/80 via-white/90 to-nova-50/60 border border-mission-100/50">
          <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-gradient-to-br from-mission-400/15 via-nova-400/10 to-transparent blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 -bottom-16 w-64 h-64 rounded-full bg-gradient-to-tr from-energy-400/10 via-alert-400/10 to-transparent blur-3xl pointer-events-none" />

          <div className="relative flex items-start justify-between mb-4">
            <div>
              <span className="mission-label">Welcome Back, Researcher</span>
              <h1 className="mt-4 text-[40px] leading-[1.15] font-extrabold tracking-tight text-ink-900">
                {currentUser?.name || '研究员'}，欢迎回到
                <span className="text-gradient-mission"> 物理实验室指挥中心</span>
                {role === 'student' && myGroup && (
                  <>
                    <span className="block mt-1 text-[22px] md:text-[24px] font-bold text-ink-600">
                      所属项目组 · <span className="text-gradient-energy">{myGroup.name}</span>
                    </span>
                  </>
                )}
              </h1>
              <p className="mt-3 text-[15px] text-ink-500 font-medium">
                学习路径进度 <span className="text-mission-600 font-bold">{pathProgress}%</span>，
                距离晋升 <span className="chip-nova !py-0.5 !px-2 mx-0.5">LV{levelOf(myCoins)}</span> 还需
                <span className="text-gradient-energy font-bold ml-1"> {upgradeNeed}⚡</span>
              </p>
            </div>
          </div>

          <div className="relative flex gap-4 mt-6 overflow-x-auto scroll-thin pb-1">
            <div className="rounded-[20px] bg-gradient-to-br from-mission-50/80 via-white/95 to-nova-50/50 border border-mission-100/60 p-4">
              <TaskCard onClick={() => { navigate('/theory/topics'); pushToast('进入 AI 自学中心 · 今天也加油 🚀', 'info'); }} icon={Brain} title="AI理论学习" progress={learningPathProgress.ai_test.done ? 100 : learningPathProgress.ai_learn.done ? 50 : 0} reward={0} status={learningPathProgress.pass_80.done ? '已解锁' : '进行中'} tint="mission" />
            </div>
            <div className="rounded-[20px] bg-gradient-to-br from-energy-50/80 via-white/95 to-alert-50/50 border border-energy-100/60 p-4">
              <TaskCard onClick={() => { navigate('/projects'); pushToast('进入项目管理中心 · 任务已就绪', 'info'); }} icon={FlaskConical} title="项目研发" progress={avgProjectProgress} reward={projectReward} status="进行中" tint="energy" />
            </div>
            <div className="rounded-[20px] bg-gradient-to-br from-growth-50/80 via-white/95 to-emerald-50/50 border border-growth-100/60 p-4">
              <TaskCard onClick={() => { navigate('/safety-lab'); pushToast('进入安全实验中心 · 请完成待认证项目', 'info'); }} icon={ShieldCheck} title="安全认证" progress={safetyProgress} reward={0} status={passedCats >= 6 ? '已解锁' : '待认证'} tint="growth" />
            </div>
            <div className="rounded-[20px] bg-gradient-to-br from-nova-50/80 via-white/95 to-mission-50/50 border border-nova-100/60 p-4">
              <TaskCard onClick={() => { navigate('/theory/challenge'); pushToast('进入挑战大厅 · 准备好迎接知识挑战了吗？', 'info'); }} icon={Swords} title="挑战大厅" progress={challengeProgress} reward={0} status={wonChallengesCount > 0 ? '已解锁' : '开放'} tint="nova" />
            </div>
          </div>
        </div>

        {/* Today Mission Progress - 右4列 */}
        <div className="col-span-12 lg:col-span-4 rounded-[28px] p-6 bg-gradient-to-br from-energy-50/80 via-white/90 to-alert-50/60 border border-energy-100/50">
          <div className="flex items-center justify-between mb-1">
            <span className="chip-ink !px-2.5 !py-1">Current Rank</span>
            <span className="chip-nova !py-1 !px-2.5">LV{levelOf(myCoins)}</span>
          </div>
          <h3 className="mt-2 text-[18px] font-extrabold text-ink-800">学习路径进度</h3>

          <div className="flex items-center justify-center my-5">
            <div className="relative">
              <ProgressRing size={160} stroke={10} progress={pathProgress} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[44px] font-black text-gradient-mission leading-none tabular-nums">{pathProgress}%</div>
                <div className="text-[11px] text-ink-500 font-semibold mt-1.5 tracking-wide">LEARNING PATH</div>
              </div>
            </div>
          </div>

          {/* 接下来要做的步骤——全部来自真实状态。
              原先这里是 4 条写死的假任务（含编造的「检测：15题 正确率 93%」），
              每个学生看到的一模一样，还标着 3/4 已完成、跟上面的环自相矛盾。 */}
          {upcomingSteps.length === 0 ? (
            <div className="text-center text-[12.5px] text-growth-700 font-semibold py-4">
              11 步学习闭环已全部完成 🎉
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider">接下来</div>
              {upcomingSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 group">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    step.active
                      ? 'bg-gradient-to-br from-mission-400 to-nova-500 text-white ring-2 ring-mission-200/50 animate-pulse'
                      : 'bg-ink-100 text-ink-400'
                  }`}>
                    {step.active ? <CircleDot size={12} /> : <Lock size={11} />}
                  </div>
                  <div className={`text-[12.5px] font-medium leading-tight ${step.active ? 'text-ink-900 font-semibold' : 'text-ink-400'}`}>
                    STEP {String(step.step).padStart(2, '0')} · {step.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ ROW 2: LEARNING PATH ============ */}
      <section className="rounded-[28px] p-6 bg-gradient-to-br from-growth-50/80 via-white/90 to-mission-50/60 border border-growth-100/50">
        {/* flex-wrap：窄屏时右侧统计整块换到下一行。否则 justify-between 下右侧会被压成
            一个字一行（"已完成 3/11" 竖排），且 shrink-0 防止它被挤压 */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="mission-label shrink-0">Physics Learning Path</span>
            <h2 className="text-[17px] sm:text-[20px] font-extrabold text-ink-800">全周期学习路径 · 实时追踪</h2>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-500 font-medium shrink-0">
            <span className="w-2 h-2 rounded-full bg-growth-500" />已完成 {completedSteps}/{LEARNING_PATH_CONFIG.length}
            <span className="w-px h-3 bg-ink-200 mx-1" />
            <span className="w-2 h-2 rounded-full bg-mission-500 animate-pulse" />进行中
          </div>
        </div>

        <div className="relative flex items-center justify-between gap-1 px-2 py-2 overflow-x-auto scroll-thin">
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
            <defs>
              <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22C55E" />
                <stop offset="45%" stopColor="#4F7CFF" />
                <stop offset="55%" stopColor="#94A3B8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <line x1="4%" y1="50%" x2="96%" y2="50%" stroke="url(#flowGrad)" strokeWidth="2" strokeDasharray="8 8" className="animate-flowDash" />
          </svg>

          {LEARNING_PATH_CONFIG.map((node, i) => {
            const progress = learningPathProgress[node.id];
            const isDone = progress?.done || false;
            const isActive = progress?.active || false;
            return (
              <div key={node.id} className="flex flex-col items-center gap-2 shrink-0 relative z-10" style={{ minWidth: 88 }}>
                <div className={`node-badge ${isDone ? 'done' : isActive ? 'active' : 'pending'} ${node.badge ? 'ring-4 ring-growth-200/60' : ''}`}>
                  {isDone ? <CheckCircle2 size={20} strokeWidth={2.6} /> : isActive ? <Sparkles size={18} /> : <span className="text-[14px] font-black opacity-60">{i + 1}</span>}
                </div>
                <div className={`text-[11.5px] font-bold leading-tight text-center ${isDone ? 'text-growth-700' : isActive ? 'text-mission-700' : 'text-ink-400'}`}>
                  <div className="font-mono text-[9px] opacity-70 mb-0.5">STEP {String(i + 1).padStart(2, '0')}</div>
                  {node.name}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ ROW 3: Energy + Galaxy + News - Collapsible ============ */}
      <CollapsibleSection
        title="能量与项目概览"
        subtitle="Energy Center & Project Galaxy"
        icon={
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-energy-400/20 to-alert-400/20 flex items-center justify-center">
            <Zap size={18} className="text-energy-600" />
          </div>
        }
        defaultOpen={true}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 左 3 Energy Center */}
          <div className="col-span-12 lg:col-span-3 rounded-[24px] bg-gradient-to-br from-energy-50/70 via-white/85 to-alert-50/50 border border-energy-100/50 p-5">
            <div className="relative flex items-center justify-center mb-4" style={{ height: 140 }}>
              <div className="absolute w-40 h-40 rounded-full bg-gradient-to-br from-energy-300/25 via-alert-300/20 to-transparent blur-2xl animate-floatSlow" />
              <div className="orbit-ring w-[150px] h-[150px] animate-spin" style={{ animationDuration: '18s', borderStyle: 'dashed', borderColor: 'rgba(255,138,52,0.4)' }} />
              <div className="orbit-ring w-[110px] h-[110px] animate-spin" style={{ animationDuration: '12s', animationDirection: 'reverse', borderColor: 'rgba(245,158,11,0.5)' }} />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-energy-300 via-energy-500 to-alert-500 shadow-glowEnergy flex items-center justify-center animate-pulseRing">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-white/70 via-energy-100/50 to-transparent" />
                <Zap size={28} className="absolute text-white fill-white/40" strokeWidth={2.5} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-gradient-to-br from-energy-50/70 to-alert-50/50 border border-energy-100/60 p-3.5">
                <div className="text-[11px] font-bold text-ink-500 tracking-wider uppercase">Current Energy</div>
                <div className="flex items-end justify-between mt-1">
                  <div className="text-[32px] font-black text-gradient-energy tabular-nums leading-none">{coinTotal}</div>
                  <Zap size={18} className="text-energy-500 mb-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-growth-50/60 border border-growth-100/60">
                  <div className="text-[10px] font-bold text-ink-500 uppercase">今日</div>
                  <div className="text-[18px] font-black text-growth-600 tabular-nums mt-0.5">{coinToday >= 0 ? `+${coinToday}` : coinToday}</div>
                </div>
                <div className="p-3 rounded-xl bg-nova-50/60 border border-nova-100/60">
                  <div className="text-[10px] font-bold text-ink-500 uppercase">本周</div>
                  <div className="text-[18px] font-black text-nova-600 tabular-nums mt-0.5">{coinWeek >= 0 ? `+${coinWeek}` : coinWeek}</div>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-mission-50/70 to-nova-50/60 border border-mission-100/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="chip-mission !py-0.5 !px-2 !text-[10px]">LV{levelOf(myCoins)} Researcher</span>
                  <span className="text-[11px] font-bold text-ink-500">距升级 {upgradeNeed}⚡</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-mission-400 via-mission-500 to-nova-500" style={{ width: `${levelProgress}%` }} />
                </div>
                <div className="flex justify-between mt-1 text-[10px] font-mono text-ink-400">
                  <span>{lvFloor}</span><span className="font-bold text-mission-600">{levelProgress}%</span><span>{lvCeil}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 中 5 Project Galaxy */}
          <div className="col-span-12 lg:col-span-5 rounded-[24px] bg-gradient-to-br from-mission-50/70 via-white/85 to-nova-50/50 border border-mission-100/50 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="mission-label">Project Galaxy</span>
                <h3 className="text-[18px] font-extrabold text-ink-800">项目任务 · {visibleProjects.length} 个项目</h3>
              </div>
              <button className="btn-ghost !py-1.5 !px-3 text-[12px]" onClick={openCreate}>
                <Plus size={14} />创建项目
              </button>
            </div>

            {/* 手机上单列：写死两列会让每张卡只剩约 110px 可用宽，卡内文字被压成一列一个字 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleProjects.length === 0 ? (
                <div className="col-span-1 sm:col-span-2 py-14 text-center text-[12px] text-ink-400">
                  暂无项目，点击右上角「创建项目」新建
                </div>
              ) : visibleProjects.map((p, idx) => {
                const color = PROJECT_COLOR[p.status];
                const owner = groupNameOf(p.ownerGroupId);
                const members = memberCountOf(p.ownerGroupId);
                const start = p.startDate instanceof Date ? p.startDate : new Date(p.startDate);
                const due = p.dueDate instanceof Date ? p.dueDate : new Date(p.dueDate);
                const now = Date.now();
                const daysLeft = Math.max(0, Math.ceil((due.getTime() - now) / 86400000));
                const daysUsed = Math.max(0, Math.floor((now - start.getTime()) / 86400000));
                return (
                <div key={p.id} onClick={() => { navigate('/projects'); pushToast(`进入《${p.title}》指挥中心 · ${owner}`, 'info'); }} role="button" tabIndex={0} className="planet-card group relative rounded-2xl overflow-hidden cursor-pointer outline-none focus:ring-2 focus:ring-mission-400/50" style={{ minHeight: 200 }}>
                  <div className="absolute inset-0 bg-gradient-to-br p-[1px] rounded-2xl" style={{ background: `linear-gradient(135deg, ${color.hex[0]}40, ${color.hex[1]}20 60%, transparent)` }}>
                    <div className="w-full h-full rounded-2xl bg-gradient-to-br from-white/90 via-white/75 to-ink-50/70 backdrop-blur-xl p-4 flex flex-col">
                      <div className="flex items-center justify-between">
                        <span className={`chip-${color.color} !py-0.5 !px-2 !text-[10px]`}>
                          <Target size={10} className="mr-0.5" />PROJ-{String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="flex items-center gap-1">
                          <div className="flex -space-x-1.5">
                            {Array.from({ length: Math.min(3, members) }).map((_, j) => (
                              <div key={j} className="w-5 h-5 rounded-full ring-2 ring-white shadow-sm" style={{ background: `linear-gradient(135deg, ${color.hex[0]}, ${color.hex[1]})` }} />
                            ))}
                            {members > 3 && (
                              <div className="w-5 h-5 rounded-full ring-2 ring-white bg-ink-100 text-[9px] font-bold text-ink-600 flex items-center justify-center">+{members - 3}</div>
                            )}
                          </div>
                          <button
                            title="编辑"
                            className="w-6 h-6 rounded-lg bg-white/80 border border-ink-100 flex items-center justify-center text-ink-500 hover:text-mission-600 transition"
                            onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            title="删除"
                            className="w-6 h-6 rounded-lg bg-white/80 border border-ink-100 flex items-center justify-center text-ink-500 hover:text-danger-600 transition"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                          >
                            <Trash2 size={12} />
                          </button>
                          {canPublish(p.ownerGroupId) && (
                            // 原先是个 24×24 的小喇叭图标，混在编辑/删除里，组长基本发现不了。
                            // 招募是「找人来帮忙」的主动动作，值得一个带文字的按钮。
                            <button
                              title="发布招募公告"
                              className="h-6 px-2 rounded-lg bg-gradient-to-br from-energy-400 to-alert-500 text-white text-[11px] font-bold flex items-center gap-1 hover:opacity-90 transition"
                              onClick={(e) => { e.stopPropagation(); openRecruit(p); }}
                            >
                              <Megaphone size={12} />
                              发布招募
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="relative flex-1 flex items-center justify-center my-2">
                        <div className="planet-halo rounded-full" style={{ background: `radial-gradient(circle, ${color.hex[0]}50, transparent 70%)` }} />
                        <div className="relative">
                          <div className="planet-ring" />
                          <div className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center relative" style={{ background: `radial-gradient(circle at 30% 30%, ${color.hex[1]}, ${color.hex[0]})` }}>
                            <span className="text-[11px] font-black text-white drop-shadow text-center leading-tight px-1">{p.title}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-auto">
                        <div className="flex items-end justify-between mb-1.5">
                          <div>
                            <div className="text-[13px] font-extrabold text-ink-800">{owner}</div>
                            <div className="text-[10px] text-ink-500 font-mono flex items-center gap-1 mt-0.5">
                              <Clock3 size={9} />剩 {daysLeft} 天 · 已用 {daysUsed} 天
                            </div>
                          </div>
                          <div className="relative">
                            <ProgressRing size={48} stroke={6} progress={p.progress} colorFrom={color.hex[0]} colorTo={color.hex[1]} />
                            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black tabular-nums text-ink-800">{p.progress}%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* 右 4 Stack: Lab News + Safety */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            {/* Lab News Timeline */}
            <div className="rounded-[24px] bg-gradient-to-br from-teal-50/70 via-white/85 to-cyan-50/50 border border-teal-100/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400/20 to-nova-400/20 flex items-center justify-center">
                    <CalendarDays size={18} className="text-mission-600" />
                  </div>
                  <h3 className="text-[16px] font-extrabold text-ink-800">Lab News · 时间轴</h3>
                </div>
                <span className="chip-ink !py-0.5 !px-2 !text-[10px]">实时</span>
              </div>

              <div className="space-y-3 pr-1">
                {labNews.map((n, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className="text-[10px] font-mono font-black text-ink-500 bg-ink-100 rounded-md px-1.5 py-0.5">{n.time}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`chip-${n.variant} !py-0.5 !px-1.5 !text-[10px]`}>{n.group}</span>
                        {i === 0 && <span className="chip-growth !py-0.5 !px-1.5 !text-[9px]"><TrendingUp size={8} className="mr-0.5" />HOT</span>}
                      </div>
                      <div className="text-[12.5px] text-ink-700 font-medium leading-snug">{n.event}</div>
                    </div>
                    {n.coin > 0 && (
                      <div className="shrink-0 flex items-center gap-0.5 text-gradient-energy font-black tabular-nums text-[13px]">
                        <Zap size={12} />
                        +{[newsCoin1, newsCoin2, newsCoin3, newsCoin4, newsCoin5][i]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Safety Center */}
            <div className="rounded-[24px] bg-gradient-to-br from-growth-50/70 via-white/85 to-teal-50/50 border border-growth-100/50 p-5 relative overflow-hidden">
              <div className="absolute right-[-60px] top-[-60px] w-44 h-44 rounded-full bg-gradient-to-br from-growth-400/20 via-mission-400/15 to-transparent blur-3xl pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="shrink-0 relative">
                  <svg width="72" height="80" viewBox="0 0 72 80">
                    <defs>
                      <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#22C55E" />
                        <stop offset="60%" stopColor="#4F7CFF" />
                        <stop offset="100%" stopColor="#8B5CF6" />
                      </linearGradient>
                    </defs>
                    <path d="M36 2 L68 18 L68 50 Q68 70 36 78 Q4 70 4 50 L4 18 Z"
                      fill="url(#shieldGrad)" opacity="0.15" />
                    <path d="M36 2 L68 18 L68 50 Q68 70 36 78 Q4 70 4 50 L4 18 Z"
                      fill="none" stroke="url(#shieldGrad)" strokeWidth="2.5" strokeLinejoin="round" />
                    <text x="36" y="48" textAnchor="middle" fontSize="24" fontWeight="900" fill="url(#shieldGrad)">
                      <ShieldCheck size={26} x={23} y={27} />
                    </text>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="mission-label">Safety Center</span>
                  <h3 className="mt-2 text-[17px] font-extrabold text-ink-800 leading-tight">安全认证仪表盘</h3>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="text-center p-2 rounded-xl bg-alert-50/70 border border-alert-100/60">
                      <div className="text-[20px] font-black text-alert-600 tabular-nums leading-none">{pendingCats}</div>
                      <div className="text-[9.5px] font-bold text-ink-500 uppercase mt-1">待认证</div>
                    </div>
                    <div className="text-center p-2 rounded-xl bg-growth-50/70 border border-growth-100/60">
                      <div className="text-[20px] font-black text-growth-600 tabular-nums leading-none">{passedCats}</div>
                      <div className="text-[9.5px] font-bold text-ink-500 uppercase mt-1">已完成</div>
                    </div>
                    <div className="text-center p-2 rounded-xl bg-danger-50/70 border border-danger-100/60">
                      <div className="text-[20px] font-black text-danger-600 tabular-nums leading-none">{frozenProjects}</div>
                      <div className="text-[9.5px] font-bold text-ink-500 uppercase mt-1">冻结</div>
                    </div>
                  </div>

                  <button className="btn-mission w-full mt-4 !py-2.5 !text-[13px]" onClick={() => { navigate('/safety-lab'); pushToast('进入安全实验室 · 请通过认证后继续 🛡️', 'info'); }}>
                    <ShieldCheck size={15} />进入安全考核
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ============ ROW 4: Marketplace + Top Teams - Collapsible ============ */}
      <CollapsibleSection
        title="招募与排行"
        subtitle="Recruitment & Leaderboard"
        icon={
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400/20 to-nova-400/20 flex items-center justify-center">
            <Trophy size={18} className="text-mission-600" />
          </div>
        }
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 左7 Research Marketplace */}
          <div className="col-span-12 lg:col-span-7 rounded-[24px] bg-gradient-to-br from-cyan-50/70 via-white/85 to-blue-50/50 border border-cyan-100/50 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="mission-label">RECRUITMENT DESK</span>
                <h3 className="text-[20px] font-extrabold text-ink-800">招募大厅 · 专家悬赏</h3>
              </div>
              <button className="btn-ghost text-[12px] !py-1.5 !px-3" onClick={() => { navigate('/recruit/market'); pushToast(`招募市场已展开 · 共 ${recruitments.filter((r) => r.status === 'open').length} 条新任务待接取 🧑‍🚀`, 'info'); }}>
                查看全部<ArrowRight size={13} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {recruitList.map((r, i) => (
                <div key={r.title} className="rounded-2xl bg-gradient-to-br from-white/95 to-ink-50/80 p-4 border border-ink-100/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-30 blur-2xl pointer-events-none"
                    style={{ background: i === 0 ? '#4F7CFF' : i === 1 ? '#22C55E' : '#FF8A34' }} />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className={`${i === 0 ? 'chip-mission' : i === 1 ? 'chip-growth' : 'chip-energy'} !py-0.5 !px-2 !text-[10px]`}>
                        {r.role}
                      </span>
                      <span className="chip-alert !py-0.5 !px-2 !text-[10px] flex items-center gap-1">
                        <Clock size={10} />{r.daysLeft}天
                      </span>
                    </div>
                    <h4 className="mt-3 text-[15px] font-extrabold text-ink-800 leading-tight">{r.title}</h4>
                    <p className="text-[11.5px] text-ink-500 mt-1 font-medium">项目：<span className="text-ink-700">{r.project}</span></p>

                    <div className="mt-4 pt-3 border-t border-ink-100/80">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-[9.5px] font-bold text-ink-400 uppercase tracking-wider">Reward</div>
                          <div className="flex items-center gap-1 text-gradient-energy font-black text-[22px] tabular-nums leading-none mt-0.5">
                            <Zap size={16} />
                            {[recruit0, recruit1, recruit2][i]}
                          </div>
                        </div>
                        <button className={`${i === 0 ? 'btn-mission' : i === 1 ? 'bg-gradient-to-br from-growth-400 to-growth-600 text-white rounded-xl px-3 py-2 text-[11.5px] font-bold shadow-lg shadow-growth-500/20 hover:brightness-110 transition' : 'btn-energy'} !py-2 !px-3 !text-[11.5px]`}
                          onClick={() => pushToast(`已申请《${r.title}》· 等待 ${r.project} 项目组确认 · 24h 内通知 ✉️`, 'success')}
                        >
                          立即加入
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右5 Top Research Teams */}
          <div className="col-span-12 lg:col-span-5 rounded-[24px] bg-gradient-to-br from-amber-50/70 via-white/85 to-yellow-50/50 border border-amber-100/50 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="mission-label">Top Research Teams</span>
                <h3 className="text-[18px] font-extrabold text-ink-800">TOP 3 战队排行榜</h3>
              </div>
              <Trophy size={20} className="text-alert-500" />
            </div>

            {/* Podium */}
            <div className="flex items-end justify-center gap-3 mb-6 px-2">
              {/* 2nd - Silver */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-12 h-12 rounded-2xl podium-silver flex items-center justify-center mb-2 relative">
                  <Crown size={18} className="text-slate-600" />
                  <Star size={8} className="absolute -top-1.5 -right-1 text-slate-500 fill-slate-400" />
                </div>
                <div className="text-[12px] font-bold text-ink-800 text-center leading-tight truncate w-full px-1">{teamRanking[1].name}</div>
                <div className="text-[10px] text-ink-500 mt-0.5 font-mono">{teamRanking[1].level} · {teamRanking[1].projects}项目</div>
                <div className="mt-2 flex items-center gap-0.5 text-gradient-energy font-black text-[16px] tabular-nums">
                  <Zap size={12} />{teamCoin1}
                </div>
                <div className="podium-silver w-full mt-2 rounded-t-xl flex items-end justify-center" style={{ height: 80 }}>
                  <div className="text-[20px] font-black text-slate-700 pb-2">2</div>
                </div>
              </div>

              {/* 1st - Gold */}
              <div className="flex flex-col items-center flex-1 -mt-6">
                <div className="w-14 h-14 rounded-2xl podium-gold flex items-center justify-center mb-2 relative shadow-xl">
                  <Crown size={22} className="text-amber-700" />
                  <Star size={10} className="absolute -top-2 -right-2 text-alert-500 fill-alert-400 animate-pulse" />
                  <Star size={7} className="absolute -top-1 -left-2 text-alert-400 fill-alert-300" />
                </div>
                <div className="text-[13px] font-black text-ink-900 text-center leading-tight truncate w-full px-1">{teamRanking[0].name}</div>
                <div className="text-[10.5px] text-ink-500 mt-0.5 font-mono font-bold">{teamRanking[0].level} · {teamRanking[0].projects}项目</div>
                <div className="mt-2 flex items-center gap-0.5 text-gradient-energy font-black text-[20px] tabular-nums">
                  <Zap size={15} />{teamCoin0}
                </div>
                <div className="podium-gold w-full mt-2 rounded-t-xl flex items-end justify-center" style={{ height: 112 }}>
                  <div className="text-[28px] font-black text-amber-800 pb-2">1</div>
                </div>
              </div>

              {/* 3rd - Bronze */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-12 h-12 rounded-2xl podium-bronze flex items-center justify-center mb-2 relative">
                  <Crown size={18} className="text-orange-700" />
                </div>
                <div className="text-[12px] font-bold text-ink-800 text-center leading-tight truncate w-full px-1">{teamRanking[2].name}</div>
                <div className="text-[10px] text-ink-500 mt-0.5 font-mono">{teamRanking[2].level} · {teamRanking[2].projects}项目</div>
                <div className="mt-2 flex items-center gap-0.5 text-gradient-energy font-black text-[16px] tabular-nums">
                  <Zap size={12} />{teamCoin2}
                </div>
                <div className="podium-bronze w-full mt-2 rounded-t-xl flex items-end justify-center" style={{ height: 64 }}>
                  <div className="text-[20px] font-black text-orange-800 pb-2">3</div>
                </div>
              </div>
            </div>

            {/* 4-6 list */}
            <div className="space-y-2.5">
              {teamRanking.slice(3).map((t, i) => {
                const coins = [teamCoin3, teamCoin4, teamCoin5][i];
                return (
                  <div key={t.rank} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-mission-50/40 transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-ink-100 flex items-center justify-center text-[12px] font-black text-ink-600 shrink-0">
                      #{t.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-ink-800 truncate">{t.name}</span>
                        <span className="chip-ink !py-0 !px-1.5 !text-[9.5px]">{t.level}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-mission-400 via-mission-500 to-nova-500"
                          style={{ width: `${(coins / maxTeamCoin) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 text-gradient-energy font-black tabular-nums shrink-0 text-[14px]">
                      <Zap size={12} />{coins}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ============ ROW 5: Achievement + Stats - Collapsible ============ */}
      <CollapsibleSection
        title="成果展示与数据统计"
        subtitle="Achievement Hall & Statistics"
        icon={
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-growth-400/20 to-mission-400/20 flex items-center justify-center">
            <Award size={18} className="text-growth-600" />
          </div>
        }
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 左7 Achievement Hall */}
          <div className="col-span-12 lg:col-span-7 rounded-[24px] bg-gradient-to-br from-growth-50/70 via-white/85 to-emerald-50/50 border border-growth-100/50 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="mission-label">Achievement Hall</span>
                <h3 className="text-[19px] font-extrabold text-ink-800">成果展示 · 精选瀑布</h3>
              </div>
              <button className="btn-ghost text-[12px] !py-1.5 !px-3" onClick={() => { navigate('/showcase'); pushToast(`进入成果展览馆 · ${showcaseItems.length} 份作品 🏆`, 'info'); }}>
                <Eye size={13} className="mr-1" />查看大厅
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {achievements.map((a, i) => (
                <div
                  key={i}
                  className={`group relative rounded-2xl overflow-hidden shadow-sm ${i === 0 || i === 4 ? 'row-span-2' : ''}`}
                  style={{ height: i === 0 || i === 4 ? 220 : 106 }}
                >
                  <img
                    src={`https://picsum.photos/seed/${i}/400/${i === 0 || i === 4 ? 600 : 300}`}
                    alt={a.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-900/85 via-ink-900/20 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 p-3.5 flex flex-col justify-end">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`chip-${['mission', 'growth', 'energy', 'nova', 'mission', 'growth'][i % 6]} !py-0.5 !px-1.5 !text-[9.5px] !text-white bg-opacity-80`}>
                        <Award size={8} />A{String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="chip-ink !py-0.5 !px-1.5 !text-[9.5px]">
                        <Users size={8} className="mr-0.5" />{a.members}人
                      </span>
                    </div>
                    <div className="text-[12.5px] font-bold text-white drop-shadow leading-tight">
                      {a.title}
                    </div>
                  </div>
                  <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                    <div className="w-7 h-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg">
                      <ArrowRight size={13} className="text-mission-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 右5 Class Statistics */}
          <div className="col-span-12 lg:col-span-5 rounded-[24px] bg-gradient-to-br from-nova-50/70 via-white/85 to-mission-50/50 border border-nova-100/50 p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="mission-label">Class Statistics</span>
                <h3 className="text-[19px] font-extrabold text-ink-800">班级运行数据</h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {classStats.map((s, i) => (
                <div
                  key={s.label}
                  onClick={s.label === '总人数' ? openClassmates : undefined}
                  className={cn(
                    'rounded-2xl p-4 border border-ink-100/50 group hover:shadow-glowMission transition-all',
                    s.label === '总人数' && 'cursor-pointer hover:border-mission-300/60'
                  )}
                  style={{
                    background: i % 2 === 0
                      ? `linear-gradient(135deg, rgba(var(--${s.tint === 'danger' ? 'alert' : s.tint}-rgb, 79,124,255), 0.04), rgba(255,255,255,0.9))`
                      : 'rgba(255,255,255,0.8)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${
                      s.tint === 'mission' ? 'from-mission-400/20 to-mission-500/10 text-mission-600'
                      : s.tint === 'energy' ? 'from-energy-400/20 to-alert-400/10 text-energy-600'
                      : s.tint === 'growth' ? 'from-growth-400/20 to-growth-500/10 text-growth-600'
                      : s.tint === 'nova' ? 'from-nova-400/20 to-nova-500/10 text-nova-600'
                      : s.tint === 'alert' ? 'from-alert-400/20 to-alert-500/10 text-alert-600'
                      : 'from-danger-400/20 to-danger-500/10 text-danger-600'
                    } flex items-center justify-center`}>
                      {s.tint === 'mission' && <Users size={14} />}
                      {s.tint === 'energy' && <Brain size={14} />}
                      {s.tint === 'growth' && <CheckCircle2 size={14} />}
                      {s.tint === 'nova' && <FlaskConical size={14} />}
                      {s.tint === 'alert' && <Coins size={14} />}
                      {s.tint === 'danger' && <AlertTriangle size={14} />}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[26px] font-black tabular-nums leading-none ${
                      s.tint === 'mission' ? 'text-mission-600'
                      : s.tint === 'energy' ? 'text-gradient-energy'
                      : s.tint === 'growth' ? 'text-growth-600'
                      : s.tint === 'nova' ? 'text-nova-600'
                      : s.tint === 'alert' ? 'text-alert-600'
                      : 'text-danger-600'
                    }`}>
                      {statValues[i]}
                    </span>
                    <span className="text-[12px] font-bold text-ink-500">{s.suffix}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] font-semibold text-ink-600">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* 同班同学弹窗 */}
      {showClassmates && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm"
          onClick={() => setShowClassmates(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2">
                <Users size={18} className="text-mission-500" /> 同班同学
              </h3>
              <button
                onClick={() => setShowClassmates(false)}
                className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors"
              >
                <X size={20} className="text-ink-500" />
              </button>
            </div>
            {loadingClassmates ? (
              <div className="flex items-center justify-center py-8 text-ink-400 text-sm">
                加载中…
              </div>
            ) : classmates.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-ink-400 text-sm">
                暂无同学数据
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 -mx-2 px-2">
                <div className="grid grid-cols-2 gap-2">
                  {classmates.map((s, idx) => {
                    const groupName = groups.find((g) => g.id === s.groupId)?.name || '未分组';
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2.5 rounded-xl border border-ink-100/60 px-3 py-2 hover:bg-mission-50/40 transition-colors"
                      >
                        <img
                          src={s.avatar}
                          alt={s.name}
                          className="w-8 h-8 rounded-lg object-cover bg-mission-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-ink-700 truncate">
                            {idx + 1}. {s.name}
                          </div>
                          <div className="text-[10px] text-ink-400 truncate">{groupName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-ink-100 text-center text-[11px] text-ink-400">
              共 {classmates.length} 名同学
            </div>
          </div>
        </div>
      )}

      {/* 新建/编辑项目 */}
      {formOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2">
                <Target size={18} className="text-mission-500" /> {editing ? '编辑项目' : '新建项目'}
              </h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">项目名称</label>
                <input className="input" value={pForm.title} onChange={(e) => setPForm({ ...pForm, title: e.target.value })} placeholder="例如：磁悬浮列车模型" />
              </div>
              <div>
                <label className="label">课题</label>
                <input className="input" value={pForm.topic} onChange={(e) => setPForm({ ...pForm, topic: e.target.value })} placeholder="例如：电磁学" />
              </div>
              {isStaff && !editing && (
                <div>
                  <label className="label">所属小组</label>
                  <select className="input" value={pForm.ownerGroupId} onChange={(e) => setPForm({ ...pForm, ownerGroupId: e.target.value })}>
                    <option value="">选择小组…</option>
                    {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">状态</label>
                  <select className="input" value={pForm.status} onChange={(e) => setPForm({ ...pForm, status: e.target.value as ProjectStatus })}>
                    {(['planning', 'progress', 'review', 'done', 'failed', 'frozen'] as ProjectStatus[]).map((s) => (
                      <option key={s} value={s}>{{ planning: '规划中', progress: '进行中', review: '评审中', done: '已完成', failed: '已失败', frozen: '已冻结' }[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">进度 %</label>
                  <input type="number" min={0} max={100} className="input" value={pForm.progress} onChange={(e) => setPForm({ ...pForm, progress: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">截止日期</label>
                  <input type="date" className="input" value={pForm.dueDate} onChange={(e) => setPForm({ ...pForm, dueDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">奖励币 ⚡</label>
                  <input type="number" min={0} className="input" value={pForm.rewardCoins} onChange={(e) => setPForm({ ...pForm, rewardCoins: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div>
                <label className="label">技术要点（可选）</label>
                <textarea className="input min-h-[70px] resize-y" value={pForm.techPoints} onChange={(e) => setPForm({ ...pForm, techPoints: e.target.value })} placeholder="# 支持 Markdown" />
              </div>
              <div>
                <label className="label">技术难点（可选）</label>
                <textarea className="input min-h-[70px] resize-y" value={pForm.difficulties} onChange={(e) => setPForm({ ...pForm, difficulties: e.target.value })} placeholder="# 支持 Markdown" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button className="btn-ghost flex-1" onClick={() => setFormOpen(false)}>取消</button>
              <button className="btn-mission flex-1" onClick={submitProject} disabled={saving}>
                {saving ? '保存中…' : editing ? '保存修改' : '创建项目'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-danger-500" /> 删除项目
            </h3>
            <p className="text-[13px] text-ink-500 mb-5">确定删除「{deleteTarget.title}」？关联的招募公告也会一并删除，此操作不可撤销。</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-danger-400 to-danger-600" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 发布招募 */}
      {recOpen && recProject && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setRecOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2">
                <Megaphone size={18} className="text-energy-500" />
                发布招募 · {recProject.title}
              </h3>
              <button onClick={() => setRecOpen(false)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">招募标题</label>
                <input className="input" value={recForm.title} onChange={(e) => setRecForm({ ...recForm, title: e.target.value })} placeholder="例如：数据分析助手" />
              </div>
              <div>
                <label className="label">任务描述</label>
                <textarea className="input min-h-[80px] resize-y" value={recForm.description} onChange={(e) => setRecForm({ ...recForm, description: e.target.value })} placeholder="需要完成的工作与交付物..." />
              </div>
              <div>
                <label className="label">技能要求（用逗号或空格分隔）</label>
                <input className="input" value={recForm.skills} onChange={(e) => setRecForm({ ...recForm, skills: e.target.value })} placeholder="Python, 数据分析, Excel" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">酬劳（能量币）</label>
                  <input type="number" min={1} className="input" value={recForm.reward} onChange={(e) => setRecForm({ ...recForm, reward: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="label">截止天数</label>
                  <input type="number" min={1} className="input" value={recForm.daysLeft} onChange={(e) => setRecForm({ ...recForm, daysLeft: Math.max(1, Number(e.target.value) || 1) })} />
                </div>
              </div>
              <p className={`text-[12px] ${recInsufficient ? 'text-danger-600' : 'text-ink-500'}`}>
                本组余额 {recBalance} ⚡。酬劳作为押金在发布时立即扣除，
                {recInsufficient
                  ? `当前差额 ${Number(recForm.reward) - recBalance} ⚡，请先调低酬劳或让老师发放能量币。`
                  : `发布后余额 ${recBalance - Number(recForm.reward)} ⚡；任务失败或未完成的部分会退回本组。`}
              </p>
            </div>
            <div className="flex gap-2 mt-6">
              <button className="btn-ghost flex-1" onClick={() => setRecOpen(false)}>取消</button>
              <button className="btn-energy flex-1" onClick={submitRecruit} disabled={recSaving || recInsufficient}>
                {recSaving ? '发布中…' : '发布招募'}
              </button>
            </div>
          </div>
        </div>
      )}

      {changePwdOpen && <ChangePasswordModal onClose={() => setChangePwdOpen(false)} />}
    </div>
  );
}
