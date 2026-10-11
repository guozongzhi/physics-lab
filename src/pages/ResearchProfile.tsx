import { apiEnabled } from '@/lib/apiClient';
import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback } from '@/lib/imageFallback';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Zap, Target, Swords, Users, Crown, Star, Sparkles, Lock, BookOpen, FlaskConical, Puzzle, Code, ShieldCheck, Handshake, Trophy, Rocket, CheckCircle2, Calendar, Award, Flag } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar as ReRadar, ResponsiveContainer, Tooltip } from 'recharts';
import Checkbox from '@/components/ui/Checkbox';
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useTheoryStore } from '@/store/theoryStore';
import { useQuestionBankStore } from '@/store/questionBankStore';
import ChangePasswordModal from '@/components/ui/ChangePasswordModal';
import { safetyApi, SafetyRecord } from '@/lib/apiService';
import { useCoinStore } from '@/store/coinStore';
import { computeEarnedByUser } from '@/lib/earnedCoins';
import { cn } from '@/lib/utils';

function useTicker(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf: number;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * ease));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const BADGES = [
  { id: 'b1', name: '安全先锋', grad: 'from-mission-400 to-mission-600', icon: ShieldCheck },
  { id: 'b2', name: '出题大师', grad: 'from-energy-400 to-energy-600', icon: Puzzle },
  { id: 'b3', name: '实验能手', grad: 'from-growth-400 to-growth-600', icon: FlaskConical },
  { id: 'b4', name: '代码达人', grad: 'from-nova-400 to-nova-600', icon: Code },
  { id: 'b5', name: '理论王者', grad: 'from-alert-400 to-alert-600', icon: BookOpen },
  { id: 'b6', name: '协作之星', grad: 'from-mission-400 to-nova-500', icon: Handshake },
  { id: 'b7', name: '挑战之王', grad: 'from-danger-400 to-energy-500', icon: Swords },
  { id: 'b8', name: '招募达人', grad: 'from-cyan-400 to-cyan-600', icon: Users },
  { id: 'b9', name: '项目交付', grad: 'from-growth-400 to-mission-500', icon: Trophy },
  { id: 'b10', name: '全勤学者', grad: 'from-energy-400 to-nova-500', icon: Rocket },
];

interface TimelineEvent {
  id: string;
  date: string;
  timestamp: number;
  type: 'challenge' | 'project' | 'exam' | 'recruit';
  title: string;
  desc: string;
  coins: number;
}


const SEMESTER_GOALS = [
  { id: 'g1', text: '完成 ≥ 3 个项目式学习课题', checked: false },
  { id: 'g2', text: '至少赢下 2 场对外知识挑战', checked: false },
  { id: 'g3', text: '通过全部 6 类安全考核（含辐射）', checked: false },
  { id: 'g4', text: '在招募市场完成 ≥ 5 次跨组协助', checked: false },
  { id: 'g5', text: '个人能量币赛季累计突破 3000⚡', checked: false },
];

export default function ResearchProfile() {
  const { users, groups } = useGroupStore();
  const authUserId = useAuthStore((s) => s.userId);
  const me = useMemo(() => users.find((u) => u.id === authUserId) || { id: authUserId || '', name: '研究员', groupId: null, role: 'member', personalCoins: 0, avatar: '' }, [users, authUserId]);
  const myGroup = groups.find((g) => g.id === me.groupId);
  const { projects, recruitments } = useProjectStore();
  const { challenges, quizSessions: allQuizSessions } = useTheoryStore();
  const quizSessions = useMemo(() => allQuizSessions.filter((session) => (session.userId === authUserId || (apiEnabled && !session.userId)) && session.graded), [allQuizSessions, authUserId]);
  const doneProjects = projects.filter((p) => Boolean(me.groupId) && p.ownerGroupId === me.groupId && p.status === 'done').length;
  const createdChallenges = challenges.filter((c) => Boolean(me.groupId) && c.creatorGroupId === me.groupId).length;
  const recruitHelps = recruitments.filter((r) => r.assigneeUserId === me.id && r.status === 'done').length;
  const personalCoins = me.personalCoins || 0;
  const coinTxs = useCoinStore((state) => state.coinTxs);
  const earnedCoins = useMemo(() => computeEarnedByUser(coinTxs)[me.id] || 0, [coinTxs, me.id]);
  const level = Math.floor(earnedCoins / 500) + 1;
  const levelProgress = Math.round((earnedCoins % 500) / 5);

  const { questions: qbQuestions } = useQuestionBankStore();
  const submittedQ = qbQuestions.filter((q) => q.submittedBy === me.id).length;
  const [safetyRecords, setSafetyRecords] = useState<SafetyRecord[]>([]);
  useEffect(() => {
    safetyApi.myRecords().then(setSafetyRecords).catch(() => {});
  }, []);
  const safetyPassed = new Set(safetyRecords.filter((record) => record.passed).map((record) => record.category)).size;
  const quizAvg = quizSessions.length ? Math.round(quizSessions.reduce((s, q) => s + q.score, 0) / quizSessions.length) : 0;
  const quizHigh = quizSessions.some((q) => q.score >= 90);
  const wonChallenges = challenges.filter((c) => Boolean(me.groupId) && c.submissions?.some((submission) => submission.groupId === me.groupId && submission.earned > 0)).length;

  // 各项均由真实活动量算出，不设"基线分"：此前每项都加了 40~60 的固定底数，
  // 导致一个什么都没做的学生也会显示 60/40/40/45/50/45 的假能力值。
  const radar = useMemo(
    () => [
      { skill: '理论基础', A: Math.min(100, quizAvg) },
      { skill: '实验操作', A: Math.min(100, doneProjects * 25) },
      { skill: '出题能力', A: Math.min(100, submittedQ * 25) },
      { skill: '编程建模', A: Math.min(100, doneProjects * 20) },
      { skill: '安全规范', A: Math.min(100, safetyPassed * 20) },
      { skill: '团队协作', A: Math.min(100, recruitHelps * 25) },
    ],
    [quizAvg, doneProjects, submittedQ, safetyPassed, recruitHelps]
  );
  const radarAvg = Math.round(radar.reduce((s, r) => s + r.A, 0) / radar.length);
  const radarGrade =
    radarAvg >= 85 ? 'A+' : radarAvg >= 70 ? 'A' : radarAvg >= 55 ? 'B' : radarAvg >= 40 ? 'C' : radarAvg > 0 ? 'D' : '待积累';
  const badgeEarned = useMemo(() => {
    const m: Record<string, boolean> = {
      b1: safetyPassed > 0,
      b2: submittedQ >= 1,
      b3: doneProjects >= 1,
      b4: (radar[3]?.A || 0) >= 60,
      b5: quizHigh,
      b6: recruitHelps >= 1,
      b7: wonChallenges >= 1,
      b8: recruitHelps >= 1,
      b9: doneProjects >= 1,
      b10: quizSessions.length >= 3,
    };
    return m;
  }, [safetyPassed, submittedQ, doneProjects, radar, quizHigh, recruitHelps, wonChallenges, quizSessions]);
  const earnedBadgeCount = BADGES.filter((b) => badgeEarned[b.id]).length;
  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];
    const dstr = (v: Date | string) => { const d = v instanceof Date ? v : new Date(v); return `${d.getMonth() + 1}/${d.getDate()}`; };
    for (const p of projects) if (Boolean(me.groupId) && p.ownerGroupId === me.groupId) events.push({ id: `p-${p.id}`, date: dstr(p.startDate), timestamp: new Date(p.startDate).getTime(), type: 'project', title: p.title, desc: `小组项目 · 进度 ${p.progress}%`, coins: p.status === 'done' ? p.rewardCoins : 0 });
    for (const c of challenges) if (Boolean(me.groupId) && c.creatorGroupId === me.groupId) events.push({ id: `c-${c.id}`, date: dstr(c.deadline), timestamp: new Date(c.deadline).getTime(), type: 'challenge', title: c.title, desc: '发起知识挑战', coins: 0 });
    for (const qs of quizSessions) events.push({ id: `q-${qs.id}`, date: dstr(qs.createdAt), timestamp: new Date(qs.createdAt).getTime(), type: 'exam', title: '理论 / 安全测验', desc: `${qs.score} 分 · ${qs.passed ? '通过' : '未过'}`, coins: 0 });
    for (const r of recruitments) if (r.assigneeUserId === me.id) events.push({ id: `r-${r.id}`, date: dstr(r.deadline), timestamp: new Date(r.deadline).getTime(), type: 'recruit', title: r.title, desc: '跨组协助', coins: r.actualPay || 0 });
    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  }, [me, projects, challenges, quizSessions, recruitments]);
  // Personal checklists are stored per account on this device.
  const goalKey = `plab_semester_goals:${authUserId || 'anonymous'}`;
  const [savedGoals, setSavedGoals] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(goalKey) || '{}');
      setSavedGoals(Object.fromEntries(SEMESTER_GOALS.map((goal) => [goal.id, value?.[goal.id] === true])));
    } catch { setSavedGoals({}); }
  }, [goalKey]);
  const goals: Record<string, boolean> = {
    g1: doneProjects >= 3 || !!savedGoals.g1,
    g2: wonChallenges >= 2 || !!savedGoals.g2,
    g3: safetyPassed >= 6 || !!savedGoals.g3,
    g4: recruitHelps >= 5 || !!savedGoals.g4,
    g5: earnedCoins >= 3000 || !!savedGoals.g5,
  };
  const updateGoal = (id: string, checked: boolean) => {
    const next = { ...savedGoals, [id]: checked };
    setSavedGoals(next);
    try { localStorage.setItem(goalKey, JSON.stringify(next)); }
    catch { /* Keep the checklist usable when browser storage is unavailable. */ }
  };

  const doneCount = Object.values(goals).filter(Boolean).length;

  const [pwdOpen, setPwdOpen] = useState(false);

  const timelineCfg: Record<TimelineEvent['type'], { grad: string; chip: string; icon: LucideIcon }> = {
    challenge: { grad: 'from-nova-400 to-mission-500', chip: 'chip-nova', icon: Swords },
    project: { grad: 'from-growth-400 to-mission-500', chip: 'chip-growth', icon: Target },
    exam: { grad: 'from-mission-400 to-cyan-500', chip: 'chip-mission', icon: ShieldCheck },
    recruit: { grad: 'from-energy-400 to-alert-500', chip: 'chip-energy', icon: Users },
  };

  return (
    <>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
        >
          <div className="absolute -top-16 -right-10 w-80 h-80 rounded-full bg-mission-400/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 left-32 w-80 h-80 rounded-full bg-nova-400/10 blur-3xl pointer-events-none" />
          <div className="absolute top-10 right-48 w-56 h-56 rounded-full bg-energy-400/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-5">
            <div className="flex justify-end">
              <button
                onClick={() => setPwdOpen(true)}
                className="btn-ghost !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1.5"
              >
                <Lock size={13} className="text-mission-500" />
                修改密码
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="col-span-12 md:col-span-7 flex items-start gap-5">
                <div className="relative shrink-0">
                  <div className="absolute -inset-2 rounded-[36px] bg-gradient-to-br from-mission-400/30 via-nova-400/20 to-energy-400/20 blur-lg" />
                  <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-[32px] overflow-hidden ring-4 ring-white shadow-glowMission bg-gradient-to-br from-mission-100 to-nova-100">
                    {me.avatar ? (
                      <img src={me.avatar} onError={applyAvatarFallback} alt={me.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User size={44} className="text-mission-600" />
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 badge-ring">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-mission-400 via-nova-500 to-energy-400 flex items-center justify-center ring-4 ring-white shadow-lg">
                      <Sparkles size={16} className="text-white" />
                    </div>
                  </div>
                </div>
                <div className="pt-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="chip-nova !py-1 !px-3 !text-[11px]">
                      <Star size={10} fill="currentColor" />
                      LV.{level} 研究员
                    </span>
                    {me.role === 'leader' && (
                      <span className="chip-energy !py-1 !px-3 !text-[11px]">
                        <Crown size={10} />
                        组长
                      </span>
                    )}
                  </div>
                  <h1 className="text-[28px] md:text-[32px] font-extrabold text-ink-900 leading-[1.1] tracking-tight">
                    {me.name || '研究员'}
                    <span className="block text-[14px] md:text-[15px] font-semibold text-ink-500 mt-1 flex items-center gap-1.5">
                      <Flag size={14} className="text-mission-500" />
                      {myGroup?.name || '未分组'}
                      <span className="text-ink-300 mx-1">·</span>
                      <span className="italic text-gradient-mission font-serif">「大胆假设，小心求证」</span>
                    </span>
                  </h1>
                </div>
              </div>

              <div className="col-span-12 md:col-span-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: '总能量', val: personalCoins, unit: '⚡', grad: 'from-energy-400 to-alert-500', icon: Zap },
                  { label: '完成课题', val: doneProjects, unit: '项', grad: 'from-growth-400 to-growth-600', icon: Target },
                  { label: '发起挑战', val: createdChallenges, unit: '场', grad: 'from-nova-400 to-nova-600', icon: Swords },
                  { label: '招募帮助', val: recruitHelps, unit: '次', grad: 'from-mission-400 to-mission-600', icon: Users },
                ].map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.1 + i * 0.05 }}
                      className="glass-card !shadow-none p-3 rounded-2xl relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shadow-md', s.grad)}
                        >
                          <Icon size={14} />
                        </div>
                        <span className="text-[10px] text-ink-400 font-mono">{s.unit}</span>
                      </div>
                      <div className="ticker ticker-anim text-[24px] font-extrabold text-ink-800 leading-none tabular-nums">
                        <StatTicker val={s.val} />
                      </div>
                      <div className="text-[11px] text-ink-500 mt-1 font-medium">{s.label}</div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="chip-growth !py-0.5 !px-2 !text-[11px]">升级进度</span>
                    <span className="text-[12px] text-ink-500">距离 LV.{level + 1} 研究员</span>
                  </div>
                  <span className="text-[12px] font-bold text-gradient-mission tabular-nums">{levelProgress}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-ink-100 overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${levelProgress}%` }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                    className="h-full rounded-full bg-gradient-to-r from-mission-400 via-nova-500 to-energy-400 relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </motion.div>
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-ink-400 font-mono">
                  <span>{earnedCoins % 500} / 500 累计能量</span>
                  <span>还需 {500 - earnedCoins % 500} 能量</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Award size={15} className="text-alert-500" />
                  <span className="text-[13px] font-bold text-ink-800">徽章墙</span>
                  <span className="text-[11px] text-ink-400 font-mono">{earnedBadgeCount} / {BADGES.length}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {BADGES.map((b, i) => {
                    const Icon = b.icon;
                    const earned = badgeEarned[b.id];
                    return (
                      <motion.div
                        key={b.id}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.35, delay: 0.15 + i * 0.04, type: 'spring' }}
                        className="relative group cursor-pointer"
                        title={earned ? b.name : `${b.name} · 未获得`}
                      >
                        {earned && (
                          <div className="absolute -inset-1 rounded-full bg-gradient-to-br opacity-30 blur-md group-hover:opacity-60 transition-opacity"
                            style={{ backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))` }}
                          />
                        )}
                        <div className={cn(
                          'badge-ring relative w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg',
                          earned
                            ? cn('bg-gradient-to-br', b.grad)
                            : 'bg-ink-200 text-ink-400 !shadow-none'
                        )}>
                          <Icon size={20} strokeWidth={2.2} />
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 whitespace-nowrap text-[10px] font-semibold text-ink-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {b.name}{earned ? '' : ' · 未获得'}
                        </div>
                      </motion.div>
                    );
                  })}
                  {Array.from({ length: Math.max(0, 14 - BADGES.length) }).map((_, i) => (
                    <div
                      key={`lock-${i}`}
                      className="w-12 h-12 rounded-full bg-ink-100 border-2 border-dashed border-ink-200 flex items-center justify-center text-ink-300"
                    >
                      <Star size={16} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-6">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="glass-card p-5 md:p-6 rounded-[24px] h-full"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink-800">
                  <Calendar size={19} className="text-nova-500" />
                  学习与研究路径
                </h2>
                <span className="chip-nova !py-0.5 !px-2 !text-[10px]">最近 {timeline.length} 条活动</span>
              </div>
              <div className="relative pl-1">
                <div
                  className="absolute left-[18px] top-2 bottom-2 w-0.5 rounded-full"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(79,124,255,0.45) 0%, rgba(139,92,246,0.35) 35%, rgba(255,138,52,0.3) 70%, rgba(34,197,94,0.35) 100%)',
                  }}
                />
                <div className="space-y-4 max-h-[720px] overflow-y-auto pr-2 scroll-thin">
                  {timeline.length === 0 && <p className="text-sm text-ink-500 py-6 pl-10">暂无活动记录，开始学习或参与项目后会在这里显示。</p>}
                  {timeline.map((e, i) => {
                    const cfg = timelineCfg[e.type];
                    const Icon = cfg.icon;
                    return (
                      <motion.div
                        key={e.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.12 + i * 0.025 }}
                        className="relative pl-10 group"
                      >
                        <div
                          className={cn(
                            'absolute left-0 top-1.5 w-4 h-4 rounded-full ring-4 ring-white flex items-center justify-center shadow-md bg-gradient-to-br',
                            cfg.grad
                          )}
                        >
                          <Icon size={8} className="text-white" strokeWidth={3} />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn(cfg.chip, '!py-0.5 !px-2 !text-[10.5px]')}>{e.title}</span>
                          <span className="text-[11px] text-ink-400 font-mono">{e.date}</span>
                          <span className="text-[11px] font-bold text-gradient-energy tabular-nums ml-auto">
                            +{e.coins}⚡
                          </span>
                        </div>
                        <p className="text-[12.5px] text-ink-600 leading-relaxed">{e.desc}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.section>
          </div>

          <div className="col-span-12 lg:col-span-6 space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 }}
              className="glass-card p-5 md:p-6 rounded-[24px]"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink-800">
                  <Radar size={19} className="text-mission-500" />
                  Skill Radar · 能力六维图
                </h2>
                <span className="chip-mission !py-0.5 !px-2 !text-[10px]">综合 {radarGrade}</span>
              </div>
              <div className="h-[300px] -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="78%">
                    <defs>
                      <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F7CFF" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis
                      dataKey="skill"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fontSize: 9, fill: '#94A3B8' }}
                      axisLine={false}
                      tickCount={5}
                    />
                    <ReRadar
                      name="得分"
                      dataKey="A"
                      stroke="#4F7CFF"
                      strokeWidth={2.5}
                      fill="url(#radarFill)"
                      dot={{ r: 3.5, fill: '#8B5CF6', stroke: '#fff', strokeWidth: 2 }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        fontSize: 12,
                        border: '1px solid rgba(255,255,255,0.9)',
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
                      }}
                      formatter={(v: number | string) => [`${v} / 100`, '得分']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {radarAvg === 0 && (
                <p className="mt-2 text-center text-[12px] text-ink-400 leading-relaxed">
                  还没有可统计的表现。完成测验、安全考核、出题或项目研发后，各项能力会按实际数据增长。
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {radar.map((s, i) => {
                  const palette = ['#4F7CFF', '#FF8A34', '#22C55E', '#8B5CF6', '#F59E0B', '#06B6D4'];
                  const c = palette[i % 6];
                  return (
                    <div key={s.skill} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
                      <span className="text-[11.5px] text-ink-600 flex-1">{s.skill}</span>
                      <span className="text-[12px] font-bold tabular-nums" style={{ color: c }}>
                        {s.A}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22 }}
              className="glass-card p-5 md:p-6 rounded-[24px]"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink-800">
                  <Target size={19} className="text-growth-500" />
                  本学期目标
                </h2>
                <span className="chip-growth !py-0.5 !px-2 !text-[10px]">
                  <CheckCircle2 size={10} />
                  {doneCount} / {SEMESTER_GOALS.length}
                </span>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-[11px] text-ink-400 font-mono mb-1">
                  <span>完成度</span>
                  <span className="font-bold text-growth-600">
                    {Math.round((doneCount / SEMESTER_GOALS.length) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(doneCount / SEMESTER_GOALS.length) * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                    className="h-full rounded-full bg-gradient-to-r from-growth-400 to-mission-500"
                  />
                </div>
              </div>
              <p className="text-xs text-ink-500 mb-3">系统自动同步已达成目标；手动勾选保存在当前账号的本机清单中。</p>
              <div className="space-y-2.5">
                {SEMESTER_GOALS.map((g, i) => (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    className={cn(
                      'p-3 rounded-xl border transition-all',
                      goals[g.id]
                        ? 'bg-gradient-to-r from-growth-50/60 to-mission-50/40 border-growth-100'
                        : 'bg-ink-50/50 border-ink-100 hover:bg-ink-50'
                    )}
                  >
                    <Checkbox
                      checked={!!goals[g.id]}
                      onCheckedChange={(c) =>
                        updateGoal(g.id, c)
                      }
                      label={g.text}
                      id={`goal-${g.id}`}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </div>
        </div>
      </div>
      {pwdOpen && <ChangePasswordModal onClose={() => setPwdOpen(false)} />}
    </>
  );
}

function StatTicker({ val }: { val: number }) {
  const v = useTicker(val);
  return (
    <span className="ticker tabular-nums">
      {v.toLocaleString()}
    </span>
  );
}

function Radar({ size, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('inline-flex', className)}>
      <svg width={size || 20} height={size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 19h20L12 2z" />
        <circle cx="12" cy="14" r="2" />
      </svg>
    </div>
  );
}
