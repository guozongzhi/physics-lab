import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Rocket, Search, Filter, FolderKanban, Users, Zap, Clock, ShieldCheck, Wrench, Lightbulb, CheckCircle2, AlertTriangle, XCircle, Snowflake, ChevronRight, CalendarDays, Award, User, X, Check, ListTodo } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import type { ProjectStatus, Project } from '@/types';
import type { Group, User as StudentUser } from '@/types';
import { cn } from '@/lib/utils';

type MissionTab = 'overview' | 'tech' | 'milestones';

interface KanbanTask {
  id: string;
  name: string;
  assignee: string;
  status: 'todo' | 'doing' | 'done';
  reward: number;
  due: string;
  tag: '实验' | '理论' | '编程' | '文档' | '采购';
}

interface ProjectPlanet {
  id: string;
  title: string;
  topic: string;
  status: ProjectStatus;
  progress: number;
  rewardCoins: number;
  dueInDays: number;
  owners: { name: string; color: string }[];
  milestones: number;
  description: string;
  equipmentList: { name: string; qty: number; category: string }[];
  safetyPassed: boolean;
  groupName: string;
  difficulties: string[];
  solutions: { text: string; author: string }[];
  milestonesData: { name: string; progress: number; status: 'done' | 'progress' | 'pending' }[];
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; chip: string; planetGrad: string; halo: string }> = {
  planning: { label: '规划中', color: 'ink', chip: 'chip-ink', planetGrad: 'from-ink-300 via-ink-200 to-ink-100', halo: 'bg-ink-400/20' },
  progress: { label: '进行中', color: 'mission', chip: 'chip-mission', planetGrad: 'from-mission-400 via-mission-500 to-mission-600', halo: 'bg-mission-400/25' },
  review: { label: '评审中', color: 'alert', chip: 'chip-alert', planetGrad: 'from-alert-400 via-alert-500 to-energy-500', halo: 'bg-alert-400/25' },
  done: { label: '已完成', color: 'growth', chip: 'chip-growth', planetGrad: 'from-growth-400 via-growth-500 to-growth-600', halo: 'bg-growth-400/25' },
  failed: { label: '已失败', color: 'danger', chip: 'chip-danger', planetGrad: 'from-danger-400 via-danger-500 to-danger-600', halo: 'bg-danger-400/25' },
  frozen: { label: '已冻结', color: 'nova', chip: 'chip-nova', planetGrad: 'from-nova-400 via-nova-500 to-nova-600', halo: 'bg-nova-400/25' },
};

const STATUS_ICONS: Record<ProjectStatus, LucideIcon> = {
  planning: FolderKanban,
  progress: Rocket,
  review: Users,
  done: CheckCircle2,
  failed: XCircle,
  frozen: Snowflake,
};

const OWNER_COLORS = ['#4F7CFF', '#FF8A34', '#22C55E', '#8B5CF6', '#F59E0B', '#06B6D4'];

/** 把真实项目映射成展示星球的形状；里程碑按真实进度派生。 */
function buildPlanets(projects: Project[], groups: Group[], users: StudentUser[], userId: string | null, role: string | null): ProjectPlanet[] {
  return projects.map((p) => {
    const g = groups.find((x) => x.id === p.ownerGroupId);
    const members = users.filter((u) => u.groupId === p.ownerGroupId);
    const due = p.dueDate instanceof Date ? p.dueDate : new Date(p.dueDate);
    const now = Date.now();
    const dueInDays = Math.max(0, Math.ceil((due.getTime() - now) / 86400000));
    const prog = Math.max(0, Math.min(100, p.progress));
    const ms = (n: string, doneAt: number, st: 'done' | 'progress' | 'pending') =>
      ({ name: n, progress: prog >= doneAt ? 100 : Math.min(100, Math.round(prog)), status: prog >= doneAt ? 'done' : prog > 0 ? st : 'pending' });
    const milestonesData = [
      ms('方案设计', 20, 'progress'),
      ms('材料采购', 40, 'progress'),
      ms('搭建调试', 60, 'progress'),
      ms('数据采集', 80, 'progress'),
      ms('成果验收', 100, 'progress'),
    ];
    return {
      id: p.id,
      title: p.title,
      topic: p.topic,
      status: p.status,
      progress: prog,
      rewardCoins: p.rewardCoins,
      dueInDays,
      owners: members.slice(0, 5).map((m, i) => ({ name: m.name.charAt(0), color: OWNER_COLORS[i % 6] })),
      milestones: 5,
      description: p.results || p.title,
      equipmentList: p.equipmentList || [],
      safetyPassed: role === 'student'
        ? Boolean(userId && p.safetyPassed?.[userId])
        : Object.values(p.safetyPassed || {}).some(Boolean),
      groupName: g?.name || '未分组',
      difficulties: (p.difficulties || '')
        .split('\n')
        .map((d) => d.replace(/^#\s*|\*\*|^-\s*/g, '').trim())
        .filter(Boolean),
      solutions: [],
      milestonesData,
    };
  });
}

const STATUSES: ProjectStatus[] = ['planning', 'progress', 'review', 'done', 'failed', 'frozen'];

export default function ProjectCenter() {
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const navigate = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();
  const [selectedId, setSelectedId] = useState(projectId || 'p1');
  useEffect(() => {
    if (projectId) setSelectedId(projectId);
  }, [projectId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('全部小组');
  const [statusFilters, setStatusFilters] = useState<ProjectStatus[]>([]);
  const [sortBy, setSortBy] = useState<'due' | 'reward'>('due');
  const [missionTab, setMissionTab] = useState<MissionTab>('overview');
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set(['t-0-1', 't-0-2', 't-1-1']));
  const pushToast = useUIStore((s) => s.pushToast);
  const { projects, recruitments } = useProjectStore();
  const { groups, users } = useGroupStore();
  const planets = useMemo(() => buildPlanets(projects, groups, users, userId, role), [projects, groups, users, userId, role]);
  const projectRecruits = useMemo(() => recruitments.filter((r) => r.projectId === selectedId), [recruitments, selectedId]);

  const filteredPlanets = planets
    .filter((p) => {
      if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (groupFilter !== '全部小组' && p.groupName !== groupFilter) return false;
      if (statusFilters.length > 0 && !statusFilters.includes(p.status)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'due') return a.dueInDays - b.dueInDays;
      return b.rewardCoins - a.rewardCoins;
    });

  const selectedPlanet = planets.find((p) => p.id === selectedId) || planets[0];

  const selectProject = (id: string) => {
    setSelectedId(id);
    navigate(`/projects/${id}`);
  };

  const toggleStatus = (s: ProjectStatus) => {
    setStatusFilters((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleTaskDone = (taskId: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
        pushToast?.('任务已标记完成 +20⚡', 'success');
      }
      return next;
    });
  };

  const stats = {
    planning: planets.filter((p) => p.status === 'planning').length,
    progress: planets.filter((p) => p.status === 'progress').length,
    review: planets.filter((p) => p.status === 'review').length,
    done: planets.filter((p) => p.status === 'done').length,
    frozen: planets.filter((p) => p.status === 'frozen').length,
  };
  const groupOptions = ['全部小组', ...groups.map((g) => g.name)];

  const kanbanData = selectedPlanet.milestonesData.map((m, i): {
    milestone: ProjectPlanet['milestonesData'][number];
    tasks: KanbanTask[];
  } => {
    const taskPool: KanbanTask[] = [
      { id: `t-${i}-1`, name: `${m.name} · 需求梳理 & 技术方案评审`, assignee: '张伟', status: 'done', reward: 30, due: '07-12', tag: '文档' },
      { id: `t-${i}-2`, name: `${m.name} · 器材清点 / 采购申请`, assignee: '李娜', status: 'done', reward: 20, due: '07-13', tag: '采购' },
      { id: `t-${i}-3`, name: `${m.name} · 实验原型搭建 & 调试`, assignee: '王芳', status: m.status === 'done' ? 'done' : m.status === 'progress' ? 'doing' : 'todo', reward: 60, due: '07-16', tag: '实验' },
      { id: `t-${i}-4`, name: `${m.name} · 数据采集 & 误差分析`, assignee: '刘洋', status: m.status === 'done' ? 'done' : 'todo', reward: 50, due: '07-18', tag: '理论' },
      { id: `t-${i}-5`, name: `${m.name} · Arduino 控制逻辑实现`, assignee: '陈杰', status: m.status === 'progress' ? 'doing' : 'todo', reward: 40, due: '07-20', tag: '编程' },
    ];
    return { milestone: m, tasks: taskPool.slice(0, 4 + (i % 2)) };
  });

  const totalTasks = kanbanData.reduce((n, k) => n + k.tasks.length, 0);
  const doneTasks = kanbanData.reduce((n, k) => n + k.tasks.filter(t => completedTasks.has(t.id)).length, 0);

  return (
    <div className="w-full space-y-6">
      <section className="student-project-hero glass-card glass-card-hover p-7 rounded-[20px] relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-gradient-to-br from-mission-300/25 via-nova-300/15 to-growth-300/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-20 w-72 h-72 rounded-full bg-gradient-to-br from-energy-300/15 via-mission-300/10 to-transparent blur-3xl pointer-events-none" />

        <div className="student-project-hero-grid relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="student-project-hero-copy lg:col-span-7">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-mission-400/30 blur-lg animate-pulse" />
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-mission-500 via-mission-400 to-nova-500 flex items-center justify-center shadow-glowMission relative">
                  <Rocket size={28} className="text-white" />
                </div>
              </div>
              <div>
                <div className="mission-label mb-1.5">
                  <FolderKanban size={12} />
                  MISSION CONTROL CENTER
                </div>
                <h1 className="text-3xl font-black tracking-tight">
                  <span className="student-project-title text-ink-800">项目指挥中心</span>
                  <span className="student-project-subtitle text-gradient-mission">Project Center</span>
                </h1>
              </div>
            </div>
            <p className="text-ink-600 font-medium leading-relaxed max-w-2xl">{planets.length} 个项目正在推进。查看里程碑、技术风险与奖励进度，选择项目进入任务中心。</p>
            <div className="flex flex-wrap gap-2.5 mt-5">
              <span className="chip-mission !py-1.5 !px-3">
                <Rocket size={12} /> 进行中 {stats.progress}
              </span>
              <span className="chip-alert !py-1.5 !px-3">
                <Users size={12} /> 评审中 {stats.review}
              </span>
              <span className="chip-growth !py-1.5 !px-3">
                <CheckCircle2 size={12} /> 完成 {stats.done}
              </span>
              <span className="chip-nova !py-1.5 !px-3">
                <Snowflake size={12} /> 冻结 {stats.frozen}
              </span>
            </div>
          </div>

          <div className="student-project-stats lg:col-span-5 hidden lg:flex justify-end gap-3">
            {['planning', 'progress', 'review', 'done', 'frozen'].map((s, i) => {
              const stat = s as keyof typeof stats;
              const cfg = STATUS_CONFIG[s as ProjectStatus];
              return (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card !p-4 rounded-2xl text-center min-w-[88px]"
                >
                  <div className={cn('text-3xl font-black tabular-nums', `text-${cfg.color}-600`)}>
                    {stats[stat]}
                  </div>
                  <div className="text-[11px] font-bold text-ink-500 mt-1">{cfg.label}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="glass-card p-5 rounded-2xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索项目名、关键词..."
              className="input-field !pl-11 !py-2.5 !rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="text-mission-500 shrink-0" />
            <span className="text-xs font-bold text-ink-500 uppercase tracking-wide shrink-0">小组</span>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="glass-card !py-2 !px-3 rounded-xl text-sm font-bold text-ink-600 border-0 outline-none cursor-pointer min-w-[140px]"
            >
              {groupOptions.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* flex-wrap：窄屏时状态按钮换行，否则会被压成"规/划/中"竖排 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-ink-500 uppercase tracking-wide shrink-0">状态</span>
            {STATUSES.map((s) => {
              const cfg = STATUS_CONFIG[s];
              const active = statusFilters.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all',
                    active ? cfg.chip : 'glass-card text-ink-500 hover:text-ink-700'
                  )}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs font-bold text-ink-500 uppercase tracking-wide">排序</span>
            <button
              onClick={() => setSortBy('due')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1',
                sortBy === 'due' ? 'chip-mission' : 'glass-card text-ink-500'
              )}
            >
              <Clock size={11} /> 截止近
            </button>
            <button
              onClick={() => setSortBy('reward')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1',
                sortBy === 'reward' ? 'chip-energy' : 'glass-card text-ink-500'
              )}
            >
              <Zap size={11} /> 奖励高
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="project-mission-board lg:col-span-8 glass-card rounded-[20px]">
          <header className="project-board-heading">
            <div><span className="mission-label">RESEARCH MISSIONS</span><h2>探索你的研究任务</h2><p>选择课题，查看器材、技术要点与下一步行动。</p></div>
            <span className="project-board-count">{filteredPlanets.length} 个项目</span>
          </header>
          <div className="project-mission-grid">
            {filteredPlanets.map((planet, idx) => {
              const cfg = STATUS_CONFIG[planet.status];
              const StatusIcon = STATUS_ICONS[planet.status];
              const isSelected = selectedId === planet.id;
              return (
                <button key={planet.id} type="button" aria-pressed={isSelected}
                  className={cn('project-mission-card', isSelected && 'is-selected')}
                  onClick={() => selectProject(planet.id)}>
                  <div className="project-mission-art" aria-hidden="true">
                    <svg viewBox="0 0 320 130" fill="none">
                      <path className="mission-signal" d={planet.topic.includes('光') ? 'M0 100 L125 65 L155 20 L190 105 L125 65 L320 35 M125 65 L320 70 M125 65 L320 105' : planet.topic.includes('电') ? 'M0 65 H65 V25 H120 V105 H175 V25 H230 V65 H320' : 'M0 65 Q40 0 80 65 T160 65 T240 65 T320 65'} />
                      <path d="M0 115H320M0 15H320M30 0V130M290 0V130" stroke="currentColor" opacity=".12" />
                      <circle className="mission-particle" cx="65" cy="65" r="5" fill="currentColor" />
                    </svg>
                    <span className="project-art-index">MISSION / {String(idx + 1).padStart(2, '0')}</span>
                    <span className="project-art-icon"><StatusIcon size={24} /></span>
                    <span className="project-art-topic">{planet.topic}</span>
                  </div>
                  <div className="project-mission-body">
                    <div className="project-mission-meta"><span className={cfg.chip}>{cfg.label}</span><span><Zap size={13} /> +{planet.rewardCoins}</span></div>
                    <h3>{planet.title}</h3>
                    <p className="project-mission-description">{planet.description || '从提出问题到实验验证，开启你的物理研究。'}</p>
                    <div className="project-mission-progress"><span>研究进度</span><strong>{planet.progress}%</strong></div>
                    <div className="project-mission-track"><span style={{ width: `${planet.progress}%` }} /></div>
                    <div className="project-mission-footer"><span><Users size={14} />{planet.groupName}</span><ChevronRight size={18} /></div>
                    <div className="project-mission-facts"><span><Wrench size={12} /> 器材 {planet.equipmentList.length} 项</span><span><ShieldCheck size={12} />{planet.safetyPassed ? '安全已通过' : '待安全认证'}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
          {filteredPlanets.length === 0 && <div className="project-board-empty"><Search size={30} /><h3>没有匹配的项目</h3><p>试试其他关键词，或调整小组与状态筛选。</p></div>}
        </section>

        <aside id="mission-focus-panel" className="lg:col-span-4 space-y-4 scroll-mt-24">
          <div className="glass-card p-2 rounded-2xl">
            <div className="flex items-center gap-1 p-1">
              {([
                { id: 'overview', label: '概览', icon: FolderKanban },
                { id: 'tech', label: '技术要点', icon: Lightbulb },
                { id: 'milestones', label: '里程碑', icon: CalendarDays },
              ] as const).map((tab) => {
                const Icon = tab.icon;
                const isActive = missionTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMissionTab(tab.id)}
                    className={cn(
                      'flex-1 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all',
                      isActive
                        ? 'bg-gradient-to-br from-mission-500 to-nova-500 text-white shadow-glowMission'
                        : 'text-ink-500 hover:text-mission-600'
                    )}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <motion.div
            key={`${selectedPlanet.id}-${missionTab}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 rounded-2xl relative overflow-hidden"
          >
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-gradient-to-br from-mission-300/20 to-nova-300/15 blur-2xl" />
            <div className="relative">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn(STATUS_CONFIG[selectedPlanet.status].chip, '!py-0.5 !text-[10px]')}>
                      {STATUS_CONFIG[selectedPlanet.status].label}
                    </span>
                    <span className="chip-mission !py-0.5 !text-[10px]">{selectedPlanet.groupName}</span>
                  </div>
                  <h3 className="text-xl font-black text-ink-800 leading-snug">{selectedPlanet.title}</h3>
                </div>
                <div className={cn(
                  'w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg',
                  STATUS_CONFIG[selectedPlanet.status].planetGrad
                )}>
                  {(() => {
                    const Icon = STATUS_ICONS[selectedPlanet.status];
                    return <Icon size={22} />;
                  })()}
                </div>
              </div>

              {missionTab === 'overview' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-mission-50/60 to-nova-50/40 border border-mission-100/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Wrench size={14} className="text-mission-500" />
                        <span className="text-sm font-black text-ink-800">器材清单</span>
                      </div>
                      <span className="text-xs font-bold text-ink-500">{selectedPlanet.equipmentList.length} 项</span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedPlanet.equipmentList.length > 0 ? (
                        selectedPlanet.equipmentList.map((eq, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/70">
                            <span className="text-xs font-medium text-ink-700">{eq.name}</span>
                            <span className="text-xs font-bold text-mission-600 tabular-nums">×{eq.qty}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-ink-400 text-center py-2">暂未录入器材</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl glass-card">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck size={16} className={selectedPlanet.safetyPassed ? 'text-growth-500' : 'text-danger-500'} />
                        <span className="text-xs font-bold text-ink-500 uppercase">安全状态</span>
                      </div>
                      <div className={cn(
                        'text-lg font-black',
                        selectedPlanet.safetyPassed ? 'text-growth-600' : 'text-danger-600'
                      )}>
                        {selectedPlanet.safetyPassed ? '已认证' : '待通过'}
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl glass-card">
                      <div className="flex items-center gap-2 mb-2">
                        <Award size={16} className="text-energy-500" />
                        <span className="text-xs font-bold text-ink-500 uppercase">能量奖励</span>
                      </div>
                      <div className="text-lg font-black text-energy-600 tabular-nums">
                        +{selectedPlanet.rewardCoins}⚡
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-br from-nova-50/60 to-mission-50/40 border border-nova-100/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Users size={14} className="text-nova-500" />
                      <span className="text-sm font-black text-ink-800">参与小组</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {selectedPlanet.owners.map((o, i) => (
                            <div
                              key={i}
                              className="w-8 h-8 rounded-xl ring-2 ring-white flex items-center justify-center text-[11px] font-black text-white shadow-soft"
                              style={{ background: o.color }}
                              title={o.name}
                            >
                              {o.name}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs font-bold text-ink-600">{selectedPlanet.owners.length} 名成员</span>
                      </div>
                      <span className="text-xs text-nova-600 font-bold">{selectedPlanet.groupName}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-br from-energy-50/60 to-alert-50/40 border border-energy-100/50">
                    <div className="flex items-center gap-2 mb-3">
                      <ListTodo size={14} className="text-energy-500" />
                      <span className="text-sm font-black text-ink-800">招募任务</span>
                      <span className="chip-energy !py-0.5 !text-[10px] ml-auto">{projectRecruits.length} 条</span>
                    </div>
                    <div className="space-y-2">
                      {projectRecruits.length === 0 ? (
                        <div className="text-xs text-ink-400 text-center py-2">暂无招募，组长发布后学生可投标</div>
                      ) : projectRecruits.map((r) => (
                        <div key={r.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/70">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-ink-700 truncate">{r.title}</div>
                            <div className="text-[10px] text-ink-400">
                              {r.status === 'open' ? '招募中' : r.status === 'assigned' ? '已分配' : '已结束'} · {r.bids?.length || 0} 人投
                            </div>
                          </div>
                          <span className="chip-energy !py-0.5 !px-2 text-[10px] shrink-0">+{r.reward}⚡</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {missionTab === 'tech' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-danger-50/50 to-alert-50/40 border border-danger-100/50">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={14} className="text-danger-500" />
                      <span className="text-sm font-black text-ink-800">技术难点</span>
                      <span className="chip-danger !py-0.5 !text-[10px] ml-auto">
                        {selectedPlanet.difficulties.length} 项
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {selectedPlanet.difficulties.map((d, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/80">
                          <span className="w-5 h-5 rounded-lg bg-danger-100 text-danger-600 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-xs font-medium text-ink-700 leading-relaxed">{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-br from-growth-50/50 to-mission-50/40 border border-growth-100/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb size={14} className="text-growth-500" />
                      <span className="text-sm font-black text-ink-800">解决方案</span>
                      <span className="chip-growth !py-0.5 !text-[10px] ml-auto">
                        {selectedPlanet.solutions.length} 项
                      </span>
                    </div>
                    {selectedPlanet.solutions.length > 0 ? (
                      <div className="space-y-2">
                        {selectedPlanet.solutions.map((s, i) => (
                          <div key={i} className="p-3 rounded-xl bg-white/85 border border-growth-100">
                            <p className="text-xs font-semibold text-ink-700 leading-relaxed mb-2">
                              <span className="chip-growth !py-0.5 !text-[9px] mr-1.5">方案 {i + 1}</span>
                              {s.text}
                            </p>
                            <div className="flex items-center justify-end">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-nova-400 to-nova-500 flex items-center justify-center text-[9px] font-black text-white">
                                  <User size={9} />
                                </div>
                                <span className="text-[10px] font-bold text-nova-700">{s.author}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-ink-400">
                        <Lightbulb size={24} className="mx-auto mb-1.5 opacity-50" />
                        <p className="text-xs">暂无解决方案，等待贡献</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {missionTab === 'milestones' && (
                <div className="space-y-3">
                  {selectedPlanet.milestonesData.map((m, i) => {
                    const isLast = i === selectedPlanet.milestonesData.length - 1;
                    return (
                      <div key={i} className="relative pl-12">
                        {!isLast && (
                          <div className="absolute left-[22px] top-10 bottom-[-12px] w-0.5 bg-ink-100" />
                        )}
                        <div className="absolute left-0 top-0">
                          <div className={cn(
                            'w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg',
                            m.status === 'done'
                              ? 'bg-gradient-to-br from-growth-400 to-growth-600'
                              : m.status === 'progress'
                                ? 'bg-gradient-to-br from-mission-400 to-nova-500'
                                : 'bg-gradient-to-br from-ink-200 to-ink-300 text-ink-500'
                          )}>
                            {m.status === 'done' ? <CheckCircle2 size={18} /> :
                             m.status === 'progress' ? <Rocket size={18} /> :
                             <span className="font-black text-sm">{i + 1}</span>}
                          </div>
                        </div>

                        <div className="glass-card !p-4 !rounded-xl mb-1">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-black text-ink-800">
                              阶段 {i + 1} · {m.name}
                            </h4>
                            <span className={cn(
                              'text-xs font-bold tabular-nums',
                              m.status === 'done' ? 'text-growth-600' :
                              m.status === 'progress' ? 'text-mission-600' : 'text-ink-400'
                            )}>
                              {m.progress}%
                            </span>
                          </div>
                          <div className="relative h-2.5 w-full rounded-full bg-ink-100 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${m.progress}%` }}
                              transition={{ duration: 0.8, delay: i * 0.08 }}
                              className={cn(
                                'h-full rounded-full relative overflow-hidden',
                                m.status === 'done'
                                  ? 'bg-gradient-to-r from-growth-400 to-growth-500'
                                  : m.status === 'progress'
                                    ? 'bg-gradient-to-r from-mission-400 via-mission-500 to-nova-500'
                                    : 'bg-ink-200'
                              )}
                            >
                              {m.status === 'progress' && (
                                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                              )}
                            </motion.div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    className="btn-mission w-full mt-2"
                    onClick={() => {
                      setKanbanOpen(true);
                      pushToast?.(`已展开《${selectedPlanet.title}》完整任务看板`, 'info');
                    }}
                  >
                    <ListTodo size={16} /> 查看完整任务看板
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </aside>
      </div>

      <AnimatePresence>
        {kanbanOpen && (
          <motion.div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-ink-900/60 via-mission-900/40 to-nova-900/50 backdrop-blur-md"
              onClick={() => setKanbanOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative z-10 w-full max-w-[1280px] max-h-[88vh] overflow-hidden rounded-[28px] glass-card shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]"
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            >
              <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-mission-500/25 via-nova-500/15 to-transparent blur-3xl pointer-events-none" />
              <div className="absolute -bottom-32 -left-24 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-energy-400/15 via-alert-400/10 to-transparent blur-3xl pointer-events-none" />

              <div className="relative border-b border-mission-100/60 px-7 md:px-9 py-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="mission-label mb-0">
                      <ListTodo size={12} /> FULL TASK KANBAN
                    </span>
                    <span className={cn(STATUS_CONFIG[selectedPlanet.status].chip, '!py-0.5 !text-[10px]')}>
                      {STATUS_CONFIG[selectedPlanet.status].label}
                    </span>
                    <span className="chip-energy !py-0.5 !text-[10px]">
                      🏆 总奖励 +{selectedPlanet.rewardCoins}⚡
                    </span>
                  </div>
                  <h2 className="text-[26px] md:text-[30px] font-black tracking-tight text-ink-900 leading-tight mb-1.5">
                    {selectedPlanet.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-500 font-semibold">
                    <span className="flex items-center gap-1.5"><User size={13} className="text-mission-500" /> {selectedPlanet.groupName}</span>
                    <span className="flex items-center gap-1.5"><Users size={13} className="text-nova-500" /> {selectedPlanet.owners.length} 位成员</span>
                    <span className="flex items-center gap-1.5"><Clock size={13} className="text-alert-500" /> {selectedPlanet.dueInDays > 0 ? `剩 ${selectedPlanet.dueInDays} 天` : '已到截止日'}</span>
                    <span className="chip-mission !py-0.5 !text-[10px]">
                      完成度 {doneTasks}/{totalTasks} ({Math.round(doneTasks / Math.max(1, totalTasks) * 100)}%)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden md:block text-right">
                    <div className="text-[10px] text-ink-400 font-bold tracking-wider mb-1">TICKER</div>
                    <div className="h-2.5 w-44 rounded-full bg-ink-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(doneTasks / Math.max(1, totalTasks) * 100)}%` }}
                        transition={{ duration: 1.0, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-mission-400 via-mission-500 to-nova-500 relative overflow-hidden"
                      >
                        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                      </motion.div>
                    </div>
                  </div>
                  <button
                    onClick={() => setKanbanOpen(false)}
                    className="w-11 h-11 rounded-2xl glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-danger-600"
                  >
                    <X size={20} strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div className="relative overflow-y-auto max-h-[calc(88vh-150px)] px-7 md:px-9 py-6 space-y-7">
                {kanbanData.map((k, mi) => (
                  <div key={mi}>
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black shadow-lg bg-gradient-to-br',
                          k.tasks.every(t => completedTasks.has(t.id))
                            ? 'from-growth-400 to-growth-600'
                            : k.tasks.some(t => completedTasks.has(t.id))
                            ? 'from-mission-400 via-mission-500 to-nova-500'
                            : 'from-ink-300 to-ink-400'
                        )}>
                          {k.tasks.every(t => completedTasks.has(t.id)) ? <Check size={20} strokeWidth={2.8} /> : String(mi + 1)}
                        </div>
                        <div>
                          <h3 className="font-black text-ink-800 text-[16px] leading-tight">
                            阶段 {mi + 1} · {k.milestone.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-500 font-semibold">
                            <span className={cn(
                              k.tasks.every(t => completedTasks.has(t.id)) ? 'text-growth-600' :
                              k.tasks.some(t => completedTasks.has(t.id)) ? 'text-mission-600' : 'text-ink-400'
                            )}>
                              {k.tasks.every(t => completedTasks.has(t.id)) ? '✅ 已完成' : k.tasks.some(t => completedTasks.has(t.id)) ? '🛰️ 进行中' : '⏳ 待启动'}
                            </span>
                            <span>· 任务 {k.tasks.filter(t => completedTasks.has(t.id)).length}/{k.tasks.length}</span>
                            <span className="chip-mission !py-0.5 !text-[10px]">{Math.round(k.tasks.filter(t => completedTasks.has(t.id)).length / k.tasks.length * 100)}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-44 h-2.5 rounded-full bg-ink-100 overflow-hidden shrink-0 hidden sm:block">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round(k.tasks.filter(t => completedTasks.has(t.id)).length / k.tasks.length * 100)}%` }}
                          transition={{ duration: 0.9, delay: mi * 0.12 }}
                          className={cn(
                            'h-full rounded-full relative overflow-hidden',
                            k.tasks.every(t => completedTasks.has(t.id))
                              ? 'bg-gradient-to-r from-growth-400 to-growth-500'
                              : k.tasks.some(t => completedTasks.has(t.id))
                              ? 'bg-gradient-to-r from-mission-400 via-mission-500 to-nova-500'
                              : 'bg-ink-200'
                          )}
                        >
                          {k.tasks.some(t => completedTasks.has(t.id)) && !k.tasks.every(t => completedTasks.has(t.id)) && (
                            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                          )}
                        </motion.div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-[52px]">
                      {k.tasks.map((t) => {
                        const done = completedTasks.has(t.id);
                        const doing = !done && t.status === 'doing';
                        const statusConfig = {
                          done: { chip: 'chip-growth', label: '已完成', bar: 'from-growth-400 to-growth-500' },
                          doing: { chip: 'chip-mission', label: '进行中', bar: 'from-mission-400 via-mission-500 to-nova-500' },
                          todo: { chip: 'chip-ink', label: '待开始', bar: 'from-ink-200 to-ink-300' },
                        }[done ? 'done' : doing ? 'doing' : 'todo'];
                        const tagColors: Record<KanbanTask['tag'], string> = {
                          '实验': 'chip-alert',
                          '理论': 'chip-mission',
                          '编程': 'chip-nova',
                          '文档': 'chip-growth',
                          '采购': 'chip-energy',
                        };
                        return (
                          <motion.div
                            key={t.id}
                            layout
                            whileHover={{ scale: 1.012, y: -2 }}
                            className={cn(
                              'glass-card !rounded-2xl p-4 border transition-all cursor-pointer',
                              done
                                ? 'border-growth-200/70 bg-gradient-to-br from-growth-50/50 via-white/70 to-white/50'
                                : doing
                                ? 'border-mission-200/70'
                                : 'border-ink-100/70'
                            )}
                            onClick={() => toggleTaskDone(t.id)}
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div className={cn(
                                  'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border transition-all',
                                  done
                                    ? 'bg-gradient-to-br from-growth-400 to-growth-500 text-white border-growth-500 shadow-md shadow-growth-500/30'
                                    : doing
                                    ? 'bg-mission-50 border-mission-300 text-mission-500'
                                    : 'bg-white border-ink-200 text-ink-300'
                                )}>
                                  {done ? <Check size={14} strokeWidth={3} /> : doing ? <Clock size={13} /> : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                    <span className={cn(tagColors[t.tag], '!py-0 !px-2 !text-[10px]')}>{t.tag}</span>
                                    <span className={cn(statusConfig.chip, '!py-0 !px-2 !text-[10px]')}>{statusConfig.label}</span>
                                  </div>
                                  <h4 className={cn(
                                    'text-[13px] font-black leading-snug',
                                    done ? 'text-ink-400 line-through decoration-growth-400/70' : 'text-ink-800'
                                  )}>
                                    {t.name}
                                  </h4>
                                </div>
                              </div>
                              <span className="chip-energy !py-0.5 !px-2 !text-[10px] shrink-0 mt-0.5">
                                ⚡{t.reward}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-ink-500 font-semibold pl-[34px]">
                              <div className="flex items-center gap-1.5">
                                <User size={12} className="text-mission-500" /> {t.assignee}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CalendarDays size={12} className="text-nova-500" /> 截止 {t.due}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div className="glass-card !rounded-2xl p-4 bg-gradient-to-br from-mission-50/60 to-nova-50/50 border border-mission-100/50">
                    <div className="text-[10px] font-bold tracking-wider text-mission-600 mb-1">TODO</div>
                    <div className="text-3xl font-black text-gradient-mission tabular-nums mb-0.5">
                      {kanbanData.reduce((n, k) => n + k.tasks.filter(t => t.status === 'todo' && !completedTasks.has(t.id)).length, 0)}
                    </div>
                    <div className="text-[11px] text-ink-500 font-semibold">任务待启动</div>
                  </div>
                  <div className="glass-card !rounded-2xl p-4 bg-gradient-to-br from-alert-50/70 to-energy-50/50 border border-alert-100/60">
                    <div className="text-[10px] font-bold tracking-wider text-alert-600 mb-1">IN PROGRESS</div>
                    <div className="text-3xl font-black text-gradient-energy tabular-nums mb-0.5">
                      {kanbanData.reduce((n, k) => n + k.tasks.filter(t => t.status === 'doing' && !completedTasks.has(t.id)).length, 0)}
                    </div>
                    <div className="text-[11px] text-ink-500 font-semibold">实验/调试中</div>
                  </div>
                  <div className="glass-card !rounded-2xl p-4 bg-gradient-to-br from-growth-50/70 to-mission-50/50 border border-growth-100/60">
                    <div className="text-[10px] font-bold tracking-wider text-growth-600 mb-1">DONE</div>
                    <div className="text-3xl font-black text-[#22C55E] tabular-nums mb-0.5">
                      {doneTasks}
                    </div>
                    <div className="text-[11px] text-ink-500 font-semibold">已完成任务 · 总进度 {Math.round(doneTasks / Math.max(1, totalTasks) * 100)}%</div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 pb-2">
                  <p className="text-[12px] text-ink-500 font-semibold flex items-center gap-2">
                    <Lightbulb size={14} className="text-nova-500" />
                    小贴士：点击任何任务卡片即可切换完成状态，并触发能量币结算。
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setKanbanOpen(false)}
                      className="btn-ghost-mission !px-4 !rounded-xl text-[13px]"
                    >
                      返回基地
                    </button>
                    <button
                      className="btn-mission !rounded-xl text-[13px]"
                      onClick={() => {
                        setKanbanOpen(false);
                        pushToast?.(`《${selectedPlanet.title}》任务看板已同步更新 · 继续保持 🚀`, 'success');
                      }}
                    >
                      <CheckCircle2 size={15} /> 保存并关闭
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
