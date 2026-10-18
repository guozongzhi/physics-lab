import { useLearningProgressStore } from '@/store/learningProgressStore';
import { useQuestionBankStore } from '@/store/questionBankStore';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useGroupStore } from '../store/groupStore';
import { useTheoryStore } from '../store/theoryStore';
import { useProjectStore } from '../store/projectStore';
import { useCoinStore } from '../store/coinStore';
import ChangePasswordModal from '../components/ui/ChangePasswordModal';
import { safetyApi, groupsApi, coinsApi, SafetyRecord } from '@/lib/apiService';
import { apiEnabled, getToken } from '@/lib/apiClient';
import type { Project, ProjectStatus } from '@/types';
import { X, UserPlus, AlertTriangle, Megaphone, ArrowRight, BookOpen, FlaskConical, Zap } from 'lucide-react';
import { CommanderHeader } from '@/features/dashboard/components/CommanderHeader';
import { MissionActionCards } from '@/features/dashboard/components/MissionActionCards';
import { ActiveProjectBento } from '@/features/dashboard/components/ActiveProjectBento';
import { LearningPathBento, type PathStep } from '@/features/dashboard/components/LearningPathBento';
import { LeaderboardBento, type TeamRankItem, type LabNewsItem } from '@/features/dashboard/components/LeaderboardBento';
import { ClassStatsBento, type ClassStatItem } from '@/features/dashboard/components/ClassStatsBento';
import { Button } from '@/design-system/components/Button';
import { BentoCard } from '@/design-system/components/BentoCard';
import { PortalCard } from '@/design-system/components/PortalCard';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const showOverview = searchParams.get('view') === 'overview';
  const pushToast = useUIStore((s) => s.pushToast);
  const { userId, role, groupId, classId } = useAuthStore();
  const isDefaultPassword = useAuthStore((s) => s.isDefaultPassword);

  // 初始密码提示
  const pwdHintKey = `plab_pwd_hint_dismissed_${userId ?? 'anon'}`;
  const [pwdHintDismissed, setPwdHintDismissed] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  useEffect(() => {
    if (!userId) return;
    try {
      setPwdHintDismissed(localStorage.getItem(pwdHintKey) === '1');
    } catch { /* 浏览器禁用本地存储时继续显示页面 */ }
  }, [userId, pwdHintKey]);

  const dismissPwdHint = () => {
    setPwdHintDismissed(true);
    try {
      localStorage.setItem(pwdHintKey, '1');
    } catch { /* 浏览器禁用本地存储时继续显示页面 */ }
  };
  const showPwdHint = role === 'student' && Boolean(isDefaultPassword) && !pwdHintDismissed;

  const setGroupId = useAuthStore((s) => s.setGroupId);
  const getUserById = useGroupStore((s) => s.getUserById);
  const groups = useGroupStore((s) => s.groups);
  const users = useGroupStore((s) => s.users);
  const joinGroup = useGroupStore((s) => s.joinGroup);

  // 同班同学弹窗。名册直接取 store 里的本班学生——
  // /api/classes/{id}/students 是教师接口，学生自己调用会被 403 拒绝。
  const [showClassmates, setShowClassmates] = useState(false);
  const classmates = useMemo(
    () => (classId ? users.filter((u) => u.classId === classId) : []),
    [users, classId]
  );

  const openClassmates = () => {
    if (!classId) return;
    setShowClassmates(true);
  };

  const joinableGroups = useMemo(
    () => (classId ? groups.filter((g) => g.classId === classId) : groups),
    [groups, classId]
  );
  const { quizSessions, challenges } = useTheoryStore();
  const { projects, showcaseItems, createProject, updateProject, deleteProject, createRecruitment } = useProjectStore();
  const { coinTxs } = useCoinStore();

  // 自助加入小组本地状态
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
    } catch (err: unknown) {
      setJoinError((err instanceof Error ? err.message : undefined) || '加入失败，请稍后重试或联系老师');
    } finally {
      setJoining(false);
    }
  };

  const currentUser = userId ? getUserById(userId) || null : null;
  const myGroup = groupId ? groups.find((g) => g.id === groupId) || null : null;

  // 项目表单相关状态
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [pForm, setPForm] = useState<{
    title: string;
    topic: string;
    ownerGroupId: string;
    status: ProjectStatus;
    progress: number;
    dueDate: string;
    rewardCoins: number;
    techPoints: string;
    difficulties: string;
  }>({
    title: '',
    topic: '',
    ownerGroupId: groupId || '',
    status: 'planning',
    progress: 0,
    dueDate: '',
    rewardCoins: 50,
    techPoints: '',
    difficulties: '',
  });

  const openCreateProject = () => {
    setEditing(null);
    setPForm({
      title: '',
      topic: '',
      ownerGroupId: groupId || (groups[0]?.id ?? ''),
      status: 'planning',
      progress: 0,
      dueDate: '',
      rewardCoins: 50,
      techPoints: '',
      difficulties: '',
    });
    setFormOpen(true);
  };

  const submitProject = async () => {
    if (!pForm.title.trim()) {
      pushToast('请填写项目名称', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateProject(editing.id, {
          title: pForm.title.trim(),
          topic: pForm.topic.trim(),
          ownerGroupId: pForm.ownerGroupId || editing.ownerGroupId,
          status: pForm.status,
          dueDate: pForm.dueDate ? new Date(pForm.dueDate) : editing.dueDate,
          rewardCoins: Number(pForm.rewardCoins) || 0,
          techPoints: pForm.techPoints,
          difficulties: pForm.difficulties,
          progress: Math.min(100, Math.max(0, pForm.progress)),
        });
        pushToast('项目已更新', 'success');
      } else {
        await createProject({
          title: pForm.title.trim(),
          topic: pForm.topic.trim(),
          ownerGroupId: pForm.ownerGroupId || groupId || 'g1',
          status: pForm.status,
          dueDate: pForm.dueDate ? new Date(pForm.dueDate) : new Date(Date.now() + 14 * 86400000),
          rewardCoins: Number(pForm.rewardCoins) || 50,
          techPoints: pForm.techPoints,
          difficulties: pForm.difficulties,
          equipmentList: [],
          startDate: new Date(),
          progress: Math.min(100, Math.max(0, pForm.progress)),
        });
        pushToast('新项目立项成功！', 'success');
      }
      setFormOpen(false);
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id);
      pushToast(`项目「${deleteTarget.title}」已删除`, 'success');
      setDeleteTarget(null);
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '删除失败', 'error');
    }
  };

  // 招募相关状态
  const [recOpen, setRecOpen] = useState(false);
  const [recProject] = useState<Project | null>(null);
  const [recSaving, setRecSaving] = useState(false);
  const [recForm, setRecForm] = useState({ title: '', description: '', skills: '', reward: 30, daysLeft: 7 });

  const submitRecruit = async () => {
    if (!recProject || !recForm.title.trim()) {
      pushToast('请填写招募标题', 'error');
      return;
    }
    setRecSaving(true);
    try {
      const skillsArr = recForm.skills.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
      await createRecruitment({
        projectId: recProject.id,
        title: recForm.title.trim(),
        description: recForm.description.trim(),
        skills: skillsArr.length ? skillsArr : ['物理建模'],
        reward: Number(recForm.reward) || 30,
        deadline: new Date(Date.now() + (Number(recForm.daysLeft) || 7) * 86400000),
      });
      pushToast('招募公告已发布！', 'success');
      setRecOpen(false);
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '发布招募失败', 'error');
    } finally {
      setRecSaving(false);
    }
  };

  // 学习路径与衍生状态计算
  const [safetyRecords, setSafetyRecords] = useState<SafetyRecord[]>([]);
  useEffect(() => {
    safetyApi.myRecords().then(setSafetyRecords).catch(() => {});
  }, []);

  const questions = useQuestionBankStore((state) => state.questions);
  const learningVisits = useLearningProgressStore((state) => state.visits);
  const pathSteps: PathStep[] = useMemo(() => {
    const myQuizzes = quizSessions.filter((session) => (session.userId === userId || (apiEnabled && !session.userId)) && session.graded);
    const ownProjects = groupId ? projects.filter((project) => project.ownerGroupId === groupId) : [];
    const completed: Record<string, boolean> = {
      ai_learn: !!userId && !!learningVisits[userId]?.ai_learn,
      knowledge_organize: !!userId && !!learningVisits[userId]?.knowledge_organize,
      ai_test: myQuizzes.length > 0,
      intensive_training: myQuizzes.length >= 2,
      pass_80: myQuizzes.some((session) => session.passed),
      create_quiz: questions.some((question) => question.submittedBy === userId),
      challenge_other: !!groupId && challenges.some((challenge) => challenge.creatorGroupId === groupId || challenge.submissions?.some((submission) => submission.groupId === groupId)),
      earn_energy: coinTxs.some((tx) => tx.userId === userId && tx.delta > 0),
      project_dev: ownProjects.length > 0,
      experiment: ownProjects.some((project) => project.status === 'done'),
      showcase: showcaseItems.some((item) => ownProjects.some((project) => project.id === item.projectId) && item.status === 'approved'),
    };
    return LEARNING_PATH_CONFIG.map((cfg) => ({ ...cfg, done: completed[cfg.id], statusLabel: completed[cfg.id] ? (['ai_learn', 'knowledge_organize'].includes(cfg.id) ? '已查看' : '已达标') : '待完成' }));
  }, [userId, groupId, learningVisits, quizSessions, questions, challenges, coinTxs, projects, showcaseItems]);
  const completedSteps = pathSteps.filter((step) => step.done).length;

  const myCoins = Math.max(0, myGroup?.totalCoins || 0);
  const levelOf = (coins: number) => Math.max(1, Math.min(12, Math.floor(Math.log10(Math.max(1, coins)) * 2)));
  const level = levelOf(myCoins);
  const levelThreshold = (lv: number) => Math.pow(10, lv / 2) | 0;
  const upgradeNeedVal = Math.max(0, levelThreshold(level + 1) - myCoins);
  const lvFloor = levelThreshold(level);
  const lvCeil = levelThreshold(level + 1);
  const levelProgress = Math.max(0, Math.min(100, Math.round(((myCoins - lvFloor) / Math.max(1, lvCeil - lvFloor)) * 100)));
  const pathProgress = Math.round((completedSteps / LEARNING_PATH_CONFIG.length) * 100);

  const myProjects = useMemo(() => {
    return projects.filter((p) => (groupId ? p.ownerGroupId === groupId : false));
  }, [projects, groupId]);

  const teamRanking: TeamRankItem[] = useMemo(() => {
    return groups
      .filter((g) => (role !== 'student' || g.classId === classId) && users.some((u) => u.groupId === g.id))
      .sort((a, b) => b.totalCoins - a.totalCoins)
      .map((g, i) => ({
        id: g.id,
        rank: i + 1,
        name: g.name,
        level: `LV${levelOf(g.totalCoins)}`,
        coins: g.totalCoins,
        students: users.filter((user) => user.groupId === g.id).map(({ id, name, avatar }) => ({ id, name, avatar })),
        projects: projects.filter((p) => p.ownerGroupId === g.id).length,
      }));
  }, [groups, projects, role, classId, users]);

  const labNews: LabNewsItem[] = useMemo(() => {
    return [...coinTxs]
      .sort((a, b) => (new Date(a.createdAt)).getTime() - (new Date(b.createdAt)).getTime())
      .slice(-5)
      .reverse()
      .map((tx) => {
        const t = new Date(tx.createdAt);
        return {
          time: `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`,
          group: groups.find((g) => g.id === tx.groupId)?.name || '未知小组',
          event: tx.note || '能量币变动',
          coin: tx.delta,
          variant: tx.delta >= 0 ? 'growth' : 'danger',
        };
      });
  }, [coinTxs, groups]);

  const classGroups = classId ? groups.filter((g) => g.classId === classId) : groups;
  const classStudents = classId ? users.filter((u) => u.classId === classId) : users;
  const classProjects = projects.filter((p) => new Set(classGroups.map((g) => g.id)).has(p.ownerGroupId));
  const classStats: ClassStatItem[] = [
    { label: '班级科研人数', value: classStudents.length, suffix: '人' },
    { label: '编制课题组', value: classGroups.length, suffix: '组' },
    { label: '已攻坚结题', value: classProjects.filter((p) => p.status === 'done').length, suffix: '个' },
    { label: '安全规程合格率', value: classProjects.length ? `${Math.round((classProjects.filter((p) => Object.keys(p.safetyPassed || {}).length > 0).length / classProjects.length) * 100)}` : '100', suffix: '%' },
  ];

  // 30秒轻量轮询
  useEffect(() => {
    if (!apiEnabled || !getToken()) return;
    const tick = async () => {
      try {
        await Promise.all([groupsApi.list(), coinsApi.transactions()]);
      } catch { /* 轮询失败时等待下次重试 */ }
    };
    const timer = setInterval(tick, 30000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 待加入小组提示 */}
      {needsGroup && (
        <BentoCard variant="energy" padding="md" className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-energy-900 dark:text-energy-200">
            <UserPlus size={16} className="text-energy-600 shrink-0" />
            <span>您尚未加入任何研究小组，请先选择小组以解锁协同研发权限：</span>
            <select
              value={pendingGroupId}
              onChange={(e) => setPendingGroupId(e.target.value)}
              className="text-xs py-1 px-2.5 rounded-lg border border-energy-300 dark:border-energy-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              <option value="">选择要加入的研究小组…</option>
              {joinableGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          {joinError && <span role="alert" className="text-xs text-danger-600">{joinError}</span>}
          <Button size="sm" variant="energy" isLoading={joining} onClick={handleJoinGroup}>
            确认加入
          </Button>
        </BentoCard>
      )}

      {/* 1. 指挥官概览 */}
      <CommanderHeader
        user={currentUser}
        rankings={teamRanking}
        onOpenLeaderboard={() => navigate('/coins')}
        group={myGroup}
        level={level}
        myCoins={myCoins}
        upgradeNeed={upgradeNeedVal}
        levelProgress={levelProgress}
        pathProgress={pathProgress}
        completedSteps={completedSteps}
        totalSteps={LEARNING_PATH_CONFIG.length}
        showPwdHint={showPwdHint}
        onOpenClassmates={openClassmates}
        onOpenChangePwd={() => setChangePwdOpen(true)}
        onDismissPwdHint={dismissPwdHint}
      />

      {showOverview ? (
        <div className="space-y-6">
          <button type="button" className="portal-back-link" onClick={() => setSearchParams({})}>
            返回聚焦首页 <ArrowRight size={15} className="rotate-180" />
          </button>
          <MissionActionCards
            onNavigate={navigate}
            theoryProgress={pathProgress}
            projectCount={myProjects.length}
            safetyPassed={safetyRecords.some((r) => r.passed)}
            challengeCount={challenges.length}
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8 flex flex-col gap-6">
              <ActiveProjectBento
                projects={myProjects}
                hasGroup={Boolean(groupId)}
                onNavigate={navigate}
                onCreateProject={openCreateProject}
              />
              <LearningPathBento
                steps={pathSteps}
                completedCount={completedSteps}
                onNavigate={navigate}
              />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-6">
              <LeaderboardBento
                rankings={teamRanking}
                news={labNews}
                myGroupId={groupId}
                onNavigate={navigate}
              />
            </div>
          </div>
          <ClassStatsBento stats={classStats} />
        </div>
      ) : (
        <div className="dashboard-focused space-y-8">
          <section aria-labelledby="dashboard-next-step" className="space-y-4">
            <div className="portal-section-heading">
              <div>
                <p className="portal-kicker">MISSION / 01</p>
                <h2 id="dashboard-next-step">从这里继续</h2>
                <p>先完成眼前的研究任务，其余内容随时从卡片进入。</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PortalCard
                to="/projects"
                eyebrow="正在进行 · 科研项目"
                title={myProjects[0]?.title || (groupId ? '开启第一个科研项目' : '加入小组，开启科研项目')}
                description={myProjects[0]?.topic ? `课题方向：${myProjects[0].topic}` : '进入项目中心，查看课题、组队与实验进度。'}
                icon={FlaskConical}
                tone="blue"
                detail={myProjects[0] ? `项目进度 ${myProjects[0].progress}%` : '进入项目中心'}
                featured
                visualSrc={myProjects[0]?.title.includes('电动机') ? '/images/electric-motor-hero.webp' : undefined}
              />
              <PortalCard
                to="/theory/topics"
                eyebrow="学习路径 · 下一步"
                title={pathSteps.find((step) => !step.done)?.name || '继续探索知识星系'}
                description="在知识星系中完成下一个阶段，积累物理研究能力。"
                icon={BookOpen}
                tone="violet"
                detail={`已完成 ${completedSteps}/${LEARNING_PATH_CONFIG.length} 阶段`}
              />
            </div>
          </section>

          <section aria-labelledby="dashboard-explore" className="space-y-4">
            <div className="portal-section-heading">
              <div>
                <p className="portal-kicker">EXPLORE / 02</p>
                <h2 id="dashboard-explore">探索任务</h2>
                <p>按目标选择入口，每张卡片通向对应的完整工作区。</p>
              </div>
            </div>
            <MissionActionCards
              onNavigate={navigate}
              theoryProgress={pathProgress}
              projectCount={myProjects.length}
              safetyPassed={safetyRecords.some((r) => r.passed)}
              challengeCount={challenges.length}
            />
          </section>

          <button type="button" className="portal-overview-link" onClick={() => setSearchParams({ view: 'overview' })}>
            <span className="portal-overview-icon"><Zap size={20} /></span>
            <span><strong>查看完整总览</strong><small>学习路径、研究小组榜单、实验室动态与班级统计</small></span>
            <ArrowRight size={19} className="ml-auto" />
          </button>
        </div>
      )}

      {/* 同班同学弹窗 */}
      {showClassmates && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setShowClassmates(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                同班同学研究员名册 ({classmates.length} 人)
              </h3>
              <button type="button" onClick={() => setShowClassmates(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            {classmates.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">本班暂无其他研究员档案</div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {classmates.map((c) => (
                  <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</span>
                    <span className="text-[10px] text-slate-400">{groups.find((g) => g.id === c.groupId)?.name || '未分机组'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 立项/编辑项目弹窗 */}
      {formOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {editing ? '编辑科研课题' : '发起新课题研发立项'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">项目名称</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value={pForm.title} onChange={(e) => setPForm({ ...pForm, title: e.target.value })} placeholder="例如：法拉第电磁感应演示系统" />
              </div>
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">课题方向</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value={pForm.topic} onChange={(e) => setPForm({ ...pForm, topic: e.target.value })} placeholder="例如：电磁学 / 经典力学" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">初始进度 %</label>
                  <input type="number" min={0} max={100} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value={pForm.progress} onChange={(e) => setPForm({ ...pForm, progress: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">激励能量币 ⚡</label>
                  <input type="number" min={0} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value={pForm.rewardCoins} onChange={(e) => setPForm({ ...pForm, rewardCoins: Number(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setFormOpen(false)}>取消</Button>
              <Button variant="primary" className="flex-1" isLoading={saving} onClick={submitProject}>
                {editing ? '保存修改' : '确认立项'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-danger-500" /> 删除项目
            </h3>
            <p className="text-xs text-slate-500 mb-5">确定删除「{deleteTarget.title}」？此操作不可逆。</p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="danger" className="flex-1" onClick={confirmDelete}>确认删除</Button>
            </div>
          </div>
        </div>
      )}

      {/* 发布招募 */}
      {recOpen && recProject && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setRecOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Megaphone size={18} className="text-energy-500" /> 发布科研招募
              </h3>
              <button type="button" onClick={() => setRecOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">招募标题</label>
                <input className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value={recForm.title} onChange={(e) => setRecForm({ ...recForm, title: e.target.value })} placeholder="例如：需要一名能处理仿真数据的研究员" />
              </div>
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">酬劳（能量币）</label>
                <input type="number" min={1} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" value={recForm.reward} onChange={(e) => setRecForm({ ...recForm, reward: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setRecOpen(false)}>取消</Button>
              <Button variant="energy" className="flex-1" isLoading={recSaving} onClick={submitRecruit}>确认发布</Button>
            </div>
          </div>
        </div>
      )}

      {changePwdOpen && <ChangePasswordModal onClose={() => setChangePwdOpen(false)} />}
    </div>
  );
}
