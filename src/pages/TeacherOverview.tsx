import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar,
  Users,
  FolderKanban,
  CheckCircle2,
  Loader2,
  XCircle,
  RotateCcw,
  Snowflake,
  Zap,
  BarChart3,
  Download,
  PieChart,
  AlertTriangle,
  ShieldAlert,
  Bell,
  ArrowRightLeft,
  ChevronRight,
  FileCheck,
  TimerReset,
  Send,
  LineChart,
  Activity,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import MissionShell from '@/components/layout/MissionShell';
import { useGroupStore } from '@/store/groupStore';import { useUIStore } from '@/store/uiStore';
import { useCoinStore } from '@/store/coinStore';
import { useProjectStore } from '@/store/projectStore';
import { useQuestionBankStore } from '@/store/questionBankStore';
import { bootstrapFromApi } from '@/lib/bootstrap';
import { classesApi } from '@/lib/apiService';
import { CoinSource, ProjectStatus, ReviewableQuestion, SchoolClass } from '@/data/mockData';
import { cn, formatAxisTick } from '@/lib/utils';

type TabKey = 'overview' | 'coins' | 'safety' | 'analytics';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '全班概览' },
  { key: 'coins', label: '能量流通' },
  { key: 'safety', label: '安全态势' },
  { key: 'analytics', label: '学习分析' },
];

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

// 项目状态分布：状态 → 中文名 / 饼图颜色
const PROJECT_STATUS_META: { key: ProjectStatus; label: string; color: string }[] = [
  { key: 'done', label: '已完成', color: '#22C55E' },
  { key: 'progress', label: '进行中', color: '#4F7CFF' },
  { key: 'review', label: '评审中', color: '#8B5CF6' },
  { key: 'planning', label: '规划中', color: '#06B6D4' },
  { key: 'frozen', label: '冻结', color: '#F59E0B' },
  { key: 'failed', label: '失败', color: '#F04438' },
];

/** 流水时间：今天显示 HH:MM，昨天显示"昨天 HH:MM"，更早显示 MM-DD HH:MM（跨年带年份）。 */
function formatTxTime(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === now.toDateString()) return hm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return date.getFullYear() === now.getFullYear() ? `${md} ${hm}` : `${date.getFullYear()}-${md}`;
}

function formatCoinDelta(delta: number) {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta}`;
}

const SOURCE_CONFIG: Record<CoinSource, { label: string; chip: string; icon: any }> = {
  challenge: { label: '挑战', chip: 'chip-nova', icon: SwordsIcon },
  project: { label: '项目', chip: 'chip-growth', icon: FolderKanban },
  recruit: { label: '招募', chip: 'chip-energy', icon: Users },
  teacher_set: { label: '教师发放', chip: 'chip-mission', icon: ArrowRightLeft },
  personal: { label: '个人调整', chip: 'chip-ink', icon: ArrowRightLeft },
  penalty: { label: '扣罚', chip: 'chip-danger', icon: XCircle },
  transfer: { label: '组间转账', chip: 'chip-nova', icon: ArrowRightLeft },
  reset: { label: '累计清零', chip: 'chip-alert', icon: RotateCcw },
};

function SwordsIcon(props: any) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
    </svg>
  );
}

/**
 * 把行数组导成 CSV 并触发下载。
 *
 * 字段值按 RFC 4180 转义：含逗号 / 引号 / 换行的值必须用引号包起来、内部引号翻倍。
 * 否则「备注」这类自由文本（如老师填的调币理由）里只要有一个英文逗号，整行的列就会错位。
 * 开头加 BOM，Excel 打开中文才不乱码。
 */
function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.map(cell).join(','),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
  ].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TeacherOverview() {
  const navigate = useNavigate();
  const { groups, users } = useGroupStore();
  const projects = useProjectStore((s) => s.projects);
  const recruitments = useProjectStore((s) => s.recruitments);
  const coinTxs = useCoinStore((s) => s.coinTxs);
  const pushToast = useUIStore((s) => s.pushToast);
  const [tab, setTab] = useState<TabKey>('overview');
  const totalStudents = users.length;
  const totalGroups = groups.length;

  // 能量币对比：仅统计已成组（至少 1 名组员）的小组，按能量币降序
  const barData = useMemo(() => {
    return groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        coins: g.totalCoins,
        classId: g.classId,
        memberCount: users.filter((u) => u.groupId === g.id).length,
      }))
      .filter((g) => g.memberCount > 0);
  }, [groups, users]);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  useEffect(() => {
    classesApi.list().then(setClasses).catch(() => {});
  }, []);
  const classesById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);

  // 数据洞察：班级筛选
  const [insightClass, setInsightClass] = useState('all');
  const groupIdToClass = useMemo(() => new Map(groups.map((g) => [g.id, g.classId || ''])), [groups]);
  const insightClassFiltered = (classId: string | null | undefined) => insightClass === 'all' || classId === insightClass;
  const groupInScope = (gid: string) => insightClassFiltered(groupIdToClass.get(gid));

  // 数据洞察：能量币近 30 天趋势（按日累计，可按班过滤）
  const coinTrend = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const tx of coinTxs) {
      if (!groupInScope(tx.groupId)) continue;
      const d = tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      byDay[k] = (byDay[k] || 0) + tx.delta;
    }
    const label = (m: number, dd: number) => `${m}/${dd}`;
    const days: { date: string; value: number }[] = [];
    const start = new Date(); start.setDate(start.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      days.push({ date: label(d.getMonth() + 1, d.getDate()), value: byDay[label(d.getMonth() + 1, d.getDate())] || 0 });
    }
    return days;
  }, [coinTxs, groupIdToClass, insightClass]);

  // 数据洞察：招募状态分布（按班过滤）
  const recruitStatus = useMemo(() => {
    const bins = { open: 0, assigned: 0, done: 0, failed: 0 };
    for (const r of recruitments) {
      const p = projects.find((p) => p.id === r.projectId);
      if (p && !insightClassFiltered(p.ownerGroupId ? groupIdToClass.get(p.ownerGroupId) : null)) continue;
      bins[r.status] = (bins[r.status] || 0) + 1;
    }
    return [
      { name: '招募中', value: bins.open, color: '#4F7CFF' },
      { name: '已分配', value: bins.assigned, color: '#F59E0B' },
      { name: '已完成', value: bins.done, color: '#22C55E' },
      { name: '已失败', value: bins.failed, color: '#F04438' },
    ].filter((b) => b.value > 0);
  }, [recruitments, projects, groupIdToClass, insightClass]);

  // 数据洞察：班级规模（小组数 / 学生数，可按班过滤）
  const classScale = useMemo(() => {
    const map = new Map<string, { groups: number; students: number }>();
    for (const g of groups) { if (!insightClassFiltered(g.classId)) continue; const c = map.get(g.classId || '') || { groups: 0, students: 0 }; c.groups++; map.set(g.classId || '', c); }
    for (const u of users) { if (!insightClassFiltered(u.classId)) continue; const c = map.get(u.classId || '') || { groups: 0, students: 0 }; c.students++; map.set(u.classId || '', c); }
    return [...map.entries()].map(([cid, v]) => ({ name: classesById[cid] || cid, 小组: v.groups, 学生: v.students }));
  }, [groups, users, classesById, insightClass]);

  // 每个班级一个柱状图，组内按能量币降序，实现"不同班级分开放"
  const barByClass = useMemo(() => {
    const map: Record<string, { classId: string; className: string; groups: typeof barData }> = {};
    for (const g of barData) {
      const cid = g.classId || 'unknown';
      if (!map[cid]) map[cid] = { classId: cid, className: classesById[cid] || cid, groups: [] };
      map[cid].groups.push(g);
    }
    return Object.values(map)
      .map((c) => ({ ...c, groups: [...c.groups].sort((a, b) => b.coins - a.coins) }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [barData, classesById]);

  // 项目状态分布：按真实项目状态计数（仅展示数量 > 0 的状态）
  const pieData = useMemo(
    () =>
      PROJECT_STATUS_META.map((m) => ({
        name: m.label,
        color: m.color,
        value: projects.filter((p) => p.status === m.key).length,
      })).filter((e) => e.value > 0),
    [projects]
  );

  // 能量币流水：最新 20 条（store 内为时间正序，倒序取最近）
  const recentTxs = useMemo(
    () =>
      [...coinTxs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20)
        .map((tx) => ({
          ...tx,
          timeLabel: formatTxTime(tx.createdAt),
          groupName: groups.find((g) => g.id === tx.groupId)?.name ?? '已解散小组',
        })),
    [coinTxs, groups]
  );

  // 导出用的流水行：**当前班级范围内的全部流水**（不是屏幕上那 20 条）。
  // 老师导出是要拿去统计/对账/存档的，只有 20 条基本没用。
  // 时间刻意用绝对格式（YYYY-MM-DD HH:mm）而不是表格里那套相对文案——
  // 「19:48」「昨天 19:48」存下来过几天就看不懂了。
  const ledgerCsvRows = useMemo(
    () =>
      [...coinTxs]
        // 与页面顶部班级筛选一致（同 groupInScope，只是内联以便依赖数组诚实）
        .filter((tx) => insightClass === 'all' || groupIdToClass.get(tx.groupId) === insightClass)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((tx) => {
          const d = tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt);
          const p = (n: number) => String(n).padStart(2, '0');
          return {
            时间: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
            小组: groups.find((g) => g.id === tx.groupId)?.name ?? '已解散小组',
            // 复用界面上那张表的中文来源名，导出与所见一致
            来源: (SOURCE_CONFIG[tx.source] ?? SOURCE_CONFIG.teacher_set).label,
            能量变动: tx.delta,
            余额: tx.balanceAfter,
            备注: tx.note,
          };
        }),
    [coinTxs, groups, insightClass, groupIdToClass]
  );

  // 冻结项目预警：真实 frozen 状态项目
  const frozenProjects = useMemo(
    () =>
      projects
        .filter((p) => p.status === 'frozen')
        .map((p) => ({
          id: p.id,
          name: p.title,
          groupName: groups.find((g) => g.id === p.ownerGroupId)?.name ?? '未知小组',
        })),
    [projects, groups]
  );

  // 招募超时：仍开放且已过截止日期的招募
  const overdueRecruits = useMemo(() => {
    const now = Date.now();
    return recruitments
      .filter((r) => r.status === 'open' && new Date(r.deadline).getTime() < now)
      .map((r) => {
        const project = projects.find((p) => p.id === r.projectId);
        const groupName = groups.find((g) => g.id === project?.ownerGroupId)?.name ?? '未知小组';
        return {
          id: r.id,
          title: r.title,
          owner: groupName,
          overdueDays: Math.max(1, Math.floor((now - new Date(r.deadline).getTime()) / 86400000)),
          bids: r.bids.length,
        };
      })
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }, [recruitments, projects, groups]);

  // 待审核题库：读取题库审核 store 中学生提交且待审核的真实题目
  const reviewQuestions = useQuestionBankStore((s) => s.questions);
  const approveReviewQuestion = useQuestionBankStore((s) => s.approveQuestion);
  const pendingQs = useMemo(
    () =>
      reviewQuestions
        .filter((q) => q.reviewStatus === 'pending')
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [reviewQuestions]
  );
  const [detailQ, setDetailQ] = useState<ReviewableQuestion | null>(null);

  const approveQuestion = (id: string) => {
    approveReviewQuestion(id);
    setDetailQ((prev) => (prev && prev.id === id ? null : prev));
    pushToast('题目已通过审核，纳入挑战题库', 'success');
  };

  // 挂载时从后端拉取最新数据，确保总人数等统计实时更新
  useEffect(() => {
    bootstrapFromApi(true);
  }, []);

  return (
    <MissionShell>
      <div className="space-y-6">
        <section className="glass-card p-5 md:p-6 rounded-[24px]">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="flex items-center gap-2 text-[16px] font-bold text-ink-800">
              <BarChart3 size={18} className="text-mission-500" /> 数据洞察
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={insightClass}
                onChange={(e) => setInsightClass(e.target.value)}
                className="input-field !py-1.5 !px-3 !rounded-xl text-[12px] font-semibold cursor-pointer min-w-[140px]"
              >
                <option value="all">全部班级</option>
                {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <button className="btn-ghost !py-1.5 !px-3 text-[12px] flex items-center gap-1" onClick={() => downloadCSV('能量币近30天.csv', coinTrend)}>
                <Download size={13} /> CSV
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 lg:col-span-4 rounded-2xl bg-gradient-to-br from-mission-50/60 to-nova-50/40 border border-mission-100/50 p-4">
              <div className="text-[13px] font-bold text-ink-800 mb-2">能量币近 30 天</div>
              <div className="h-[180px] -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ReLineChart data={coinTrend} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} interval={5} />
                    <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={40} tickFormatter={formatAxisTick} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.96)' }} />
                    <Line type="monotone" dataKey="value" stroke="#4F7CFF" strokeWidth={2} dot={false} />
                  </ReLineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="col-span-12 md:col-span-6 lg:col-span-4 rounded-2xl bg-gradient-to-br from-energy-50/60 to-alert-50/40 border border-energy-100/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold text-ink-800">招募状态分布</div>
                <button className="text-[11px] text-mission-600 flex items-center gap-1 hover:text-mission-700" onClick={() => downloadCSV('招募状态.csv', recruitStatus)}><Download size={12} />CSV</button>
              </div>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie data={recruitStatus} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
                      {recruitStatus.map((e, i) => (<Cell key={i} fill={e.color} />))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.96)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 rounded-2xl bg-gradient-to-br from-growth-50/60 to-mission-50/40 border border-growth-100/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold text-ink-800">班级规模（小组/学生）</div>
                <button className="text-[11px] text-mission-600 flex items-center gap-1 hover:text-mission-700" onClick={() => downloadCSV('班级规模.csv', classScale)}><Download size={12} />CSV</button>
              </div>
              <div className="h-[180px] -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classScale} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: '1px solid rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.96)' }} />
                    <Bar dataKey="小组" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar dataKey="学生" fill="#22C55E" radius={[4, 4, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
        >
          <div className="absolute -top-16 right-0 w-96 h-96 rounded-full bg-mission-400/12 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 left-0 w-80 h-80 rounded-full bg-danger-400/8 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-[24px] flex items-center justify-center">
                  <div className="relative w-full h-full">
                    <div className="orbit-ring w-[110px] h-[110px] animate-spin" style={{ animationDuration: '24s' }} />
                    <div className="orbit-ring w-[86px] h-[86px] animate-spin" style={{ animationDuration: '16s', animationDirection: 'reverse' }} />
                    <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-mission-400 via-nova-500 to-mission-600 flex items-center justify-center shadow-glowMission">
                      <Radar size={28} className="text-white" />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <span className="mission-label">
                  <Bell size={12} />
                  COMMAND CENTER · 指挥总控台
                </span>
                <h1 className="mt-3 text-[30px] md:text-[34px] font-extrabold text-ink-900 leading-[1.1] tracking-tight">
                  Mission Control
                  <span className="block text-gradient-mission mt-1">闽西职业技术学院特色班 · 实时总览</span>
                </h1>
              </div>
            </div>
            <div className="glass-card !shadow-none p-1.5 rounded-2xl border-mission-100/70 flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-[13px] font-semibold transition-all',
                    tab === t.key
                      ? 'bg-gradient-to-br from-mission-500 to-nova-500 text-white shadow-glowMission'
                      : 'text-ink-600 hover:bg-mission-50/60 hover:text-mission-700'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-8 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
            >
              {[
                { label: '总人数', val: totalStudents, unit: '人', icon: Users, grad: 'from-mission-400 to-mission-600', to: '/teacher/roster' },
                { label: '总小组', val: totalGroups, unit: '组', icon: FolderKanban, grad: 'from-nova-400 to-nova-600', to: '/teacher/groups' },
                { label: '已完成', val: projects.filter((p) => p.status === 'done').length, unit: '项', icon: CheckCircle2, grad: 'from-growth-400 to-growth-600', to: '/projects' },
                { label: '进行中', val: projects.filter((p) => p.status === 'progress' || p.status === 'review' || p.status === 'planning').length, unit: '项', icon: Loader2, grad: 'from-energy-400 to-energy-600', to: '/projects' },
                { label: '失败', val: projects.filter((p) => p.status === 'failed').length, unit: '项', icon: XCircle, grad: 'from-danger-400 to-danger-600', to: '/projects' },
                { label: '冻结', val: projects.filter((p) => p.status === 'frozen').length, unit: '项', icon: Snowflake, grad: 'from-alert-400 to-alert-600', to: '/projects' },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.05, type: 'spring' }}
                    className="glass-card glass-card-hover p-4 rounded-[20px] relative overflow-hidden cursor-pointer ring-1 ring-mission-200/50 hover:ring-mission-400/40"
                    onClick={() => navigate(s.to)}
                  >
                    <div className={cn('absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-20 blur-xl bg-gradient-to-br', s.grad)} />
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br', s.grad)}>
                        <Icon size={18} />
                      </div>
                      <span className="text-[11px] text-ink-400 font-mono">{s.unit}</span>
                    </div>
                    <div className="ticker ticker-anim text-[30px] font-extrabold text-ink-800 leading-none tabular-nums relative z-10">
                      <NumTicker val={s.val} />
                    </div>
                    <div className="text-[12px] text-ink-500 mt-1.5 font-medium relative z-10">{s.label}</div>
                  </motion.div>
                );
              })}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4"
            >
              <div className="col-span-12 lg:col-span-8 glass-card p-5 rounded-[24px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-[16px] font-bold text-ink-800">
                    <BarChart3 size={18} className="text-mission-500" />
                    {barData.length} 个小组能量币 · 按班级对比
                  </h3>
                  <span className="chip-mission !py-0.5 !px-2 !text-[10px]">单位 ⚡</span>
                </div>
                <div className="space-y-5">
                  {barByClass.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-ink-400 py-10">
                      <BarChart3 size={30} className="opacity-40" />
                      <p className="text-[13px] font-bold">暂无已成组小组</p>
                      <p className="text-[11px]">学生加入小组后，将在此展示真实能量币对比</p>
                    </div>
                  ) : (
                    barByClass.map((cls) => (
                      <div key={cls.classId}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-bold text-ink-800 flex items-center gap-1.5">
                            <BarChart3 size={14} className="text-mission-500" />
                            {cls.className}
                          </span>
                          <span className="text-[11px] text-ink-400">{cls.groups.length} 个小组 · 按能量币排序</span>
                        </div>
                        <div className="h-[180px] -mx-3">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cls.groups} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`barGrad-${cls.classId}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#4F7CFF" />
                                  <stop offset="50%" stopColor="#6D91FF" />
                                  <stop offset="100%" stopColor="#FF8A34" />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} tickLine={false} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 6 ? `${v.slice(0, 6)}…` : v)} />
                              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} tickFormatter={formatAxisTick} />
                              <Tooltip
                                contentStyle={{
                                  borderRadius: 12,
                                  fontSize: 12,
                                  border: '1px solid rgba(255,255,255,0.9)',
                                  background: 'rgba(255,255,255,0.96)',
                                  backdropFilter: 'blur(12px)',
                                  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                                }}
                                formatter={(v: any, _name: any, item: any) => [
                                  `${Number(v).toLocaleString()} ⚡（${item?.payload?.memberCount ?? 0} 名组员）`,
                                  '能量币',
                                ]}
                              />
                              <Bar dataKey="coins" fill={`url(#barGrad-${cls.classId})`} radius={[8, 8, 0, 0]} barSize={Math.min(36, 80 / Math.max(1, cls.groups.length))} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="col-span-12 lg:col-span-4 glass-card p-5 rounded-[24px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-[16px] font-bold text-ink-800">
                    <PieChart size={18} className="text-nova-500" />
                    项目状态分布
                  </h3>
                  <span className="chip-nova !py-0.5 !px-2 !text-[10px]">共 {projects.length} 项</span>
                </div>
                <div className="h-[220px] -mx-2">
                  {pieData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-ink-400">
                      <PieChart size={30} className="opacity-40" />
                      <p className="text-[13px] font-bold">暂无项目</p>
                      <p className="text-[11px]">小组创建项目后将在此展示状态分布</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={46}
                          outerRadius={78}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {pieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          fontSize: 12,
                          border: '1px solid rgba(255,255,255,0.9)',
                          background: 'rgba(255,255,255,0.96)',
                          boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                        }}
                        formatter={(v: any, n: any) => [`${v} 项`, n]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(v) => <span className="text-ink-600 font-medium">{v}</span>}
                        iconType="circle"
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22 }}
              className="glass-card p-5 md:p-6 rounded-[24px]"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 text-[17px] font-bold text-ink-800">
                  <LineChart size={19} className="text-energy-500" />
                  最新 20 条 · 能量币流水
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-400 font-mono">最新 20 条</span>
                  <button
                    className="btn-ghost !py-1.5 !px-2 text-[11px]"
                    onClick={() => {
                      if (!ledgerCsvRows.length) {
                        pushToast('当前范围内没有流水可导出', 'warning');
                        return;
                      }
                      const d = new Date();
                      const p = (n: number) => String(n).padStart(2, '0');
                      downloadCSV(
                        `能量币流水_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`,
                        ledgerCsvRows
                      );
                      pushToast(`已导出 ${ledgerCsvRows.length} 条流水`, 'success');
                    }}
                  >
                    导出全部 CSV
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto scroll-thin">
                <table className="w-full text-[13px] min-w-[680px]">
                  <thead className="sticky top-0 z-10 bg-gradient-to-b from-white/95 to-white/80 backdrop-blur-sm">
                    <tr className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider">
                      <th className="text-left py-2.5 px-3 font-medium">时间</th>
                      <th className="text-left py-2.5 px-3 font-medium">小组</th>
                      <th className="text-left py-2.5 px-3 font-medium">来源</th>
                      <th className="text-right py-2.5 px-3 font-medium">±能量</th>
                      <th className="text-right py-2.5 px-3 font-medium">余额</th>
                      <th className="text-left py-2.5 px-3 font-medium">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTxs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-[13px] text-ink-400">
                          暂无能量币流水，项目结算 / 挑战 / 转账后将在此显示
                        </td>
                      </tr>
                    ) : (
                      recentTxs.map((tx, i) => {
                        const sc = SOURCE_CONFIG[tx.source] ?? SOURCE_CONFIG.teacher_set;
                        const SrcIcon = sc.icon;
                        const deltaCls = tx.delta >= 0 ? 'text-growth-700' : 'text-danger-700';
                        return (
                          <motion.tr
                            key={tx.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.24 + i * 0.025 }}
                            className="border-t border-ink-100/60 hover:bg-mission-50/30 transition"
                          >
                            <td className="py-2.5 px-3 font-mono text-[11.5px] text-ink-500 whitespace-nowrap">{tx.timeLabel}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-ink-700 whitespace-nowrap">{tx.groupName}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={cn(sc.chip, '!py-0.5 !px-2 !text-[10.5px] inline-flex items-center gap-1')}>
                                <SrcIcon size={10} />
                                {sc.label}
                              </span>
                            </td>
                            <td className={cn('py-2.5 px-3 text-right font-bold tabular-nums ticker', deltaCls)}>
                              {formatCoinDelta(tx.delta)} ⚡
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold tabular-nums text-ink-700">
                              {tx.balanceAfter.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-[12px] text-ink-500">{tx.note}</td>
                          </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.section>
          </div>

          <div className="col-span-12 xl:col-span-4 space-y-5">
            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="glass-card p-5 rounded-[24px] border border-danger-200/70 relative overflow-hidden"
              style={{ boxShadow: '0 0 0 1px rgba(240,68,56,0.15) inset, 0 0 40px rgba(240,68,56,0.06)' }}
            >
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-danger-400/20 blur-xl pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-4 relative z-10">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-danger-400 to-danger-600 flex items-center justify-center text-white shadow-lg shadow-danger-500/20 animate-pulse">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink-800 text-[15px] flex items-center gap-1.5">
                    冻结项目预警
                    <span className="chip-danger !py-0.5 !px-2 !text-[10px]">{frozenProjects.length} 项</span>
                  </h3>
                  <p className="text-[11px] text-ink-400">超过 3 天未解冻将自动扣除押金</p>
                </div>
              </div>
              <div className="space-y-3 relative z-10">
                {frozenProjects.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 size={26} className="mx-auto text-growth-500 mb-2" />
                    <p className="text-[13px] font-bold text-growth-700">暂无冻结项目</p>
                    <p className="text-[11px] text-ink-400 mt-0.5">所有项目运行正常</p>
                  </div>
                ) : (
                  frozenProjects.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
                    className="p-3.5 rounded-xl bg-gradient-to-br from-danger-50/80 via-white/60 to-alert-50/50 border border-danger-200/60 relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-danger-400 to-alert-500" />
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-[13px] text-ink-800 leading-snug pr-2">{p.name}</h4>
                      <span className="chip-danger !py-0.5 !px-2 !text-[10px] shrink-0 whitespace-nowrap">
                        <Users size={10} />
                        {p.groupName}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-ink-500 mb-3 flex items-start gap-1">
                      <ShieldAlert size={12} className="mt-0.5 shrink-0 text-danger-500" />
                      项目处于冻结状态，请提醒组长尽快处理解冻
                    </p>
                    <button
                      className="btn-mission w-full !py-2 !px-3 text-[12px]"
                      onClick={() => pushToast(`已向「${p.groupName}」组长发送解冻提醒`, 'success')}
                    >
                      <Send size={12} />
                      一键提醒对应组长
                    </button>
                  </motion.div>
                  ))
                )}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.18 }}
              className="glass-card p-5 rounded-[24px] relative overflow-hidden"
            >
              <div className="absolute -top-6 right-0 w-24 h-24 rounded-full bg-mission-400/15 blur-xl pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-4 relative z-10">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400 to-mission-600 flex items-center justify-center text-white shadow-lg shadow-mission-500/20">
                  <FileCheck size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-ink-800 text-[15px] flex items-center gap-1.5">
                    待审核题库
                    <span className="chip-mission !py-0.5 !px-2 !text-[10px]">{pendingQs.length} 条</span>
                  </h3>
                  <p className="text-[11px] text-ink-400">一键通过将立即纳入挑战题库</p>
                </div>
                <button
                  className="btn-ghost !py-1.5 !px-2.5 text-[11px] shrink-0"
                  onClick={() => navigate('/teacher/question-bank')}
                >
                  审核中心
                  <ChevronRight size={12} />
                </button>
              </div>
              <div className="space-y-3 relative z-10">
                {pendingQs.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-ink-400">
                    全部处理完毕，暂无待审核题目
                  </div>
                ) : (
                  pendingQs.map((q, i) => {
                  const diffColors = ['', 'chip-growth', 'chip-energy', 'chip-danger'];
                  const diffLabel = ['', '简单', '中等', '困难'];
                  return (
                    <motion.div
                      key={q.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.22 + i * 0.05 }}
                      className="p-3 rounded-xl bg-gradient-to-br from-mission-50/60 to-white/70 border border-mission-100/60"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-mission-700 chip-mission !py-0.5 !px-2 !text-[10px]">{q.knowledgePoint || '综合'}</span>
                          <span className={cn(diffColors[q.difficulty], '!py-0.5 !px-2 !text-[10px]')}>
                            {diffLabel[q.difficulty]}
                          </span>
                        </div>
                        <span className="text-[11px] text-ink-400">by {q.submittedByName}</span>
                      </div>
                      <p className="text-[12.5px] text-ink-700 leading-snug line-clamp-2 mb-2.5">
                        {q.stem}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveQuestion(q.id)}
                          className="btn-growth flex-1 !py-1.5 !px-3 text-[11.5px]"
                        >
                          <CheckCircle2 size={12} />
                          通过
                        </button>
                        <button
                          onClick={() => setDetailQ(q)}
                          className="btn-ghost !py-1.5 !px-3 text-[11.5px]"
                        >
                          详情
                        </button>
                      </div>
                    </motion.div>
                  );
                  })
                )}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.26 }}
              className="glass-card p-5 rounded-[24px] relative overflow-hidden"
            >
              <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-alert-400/15 blur-xl pointer-events-none" />
              <div className="flex items-center gap-2.5 mb-4 relative z-10">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-alert-400 to-energy-500 flex items-center justify-center text-white shadow-lg shadow-energy-500/20">
                  <TimerReset size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink-800 text-[15px] flex items-center gap-1.5">
                    招募异常超时
                    <span className="chip-alert !py-0.5 !px-2 !text-[10px]">{overdueRecruits.length} 条</span>
                  </h3>
                  <p className="text-[11px] text-ink-400">超过截止日期未裁决 → 请提醒及时结算</p>
                </div>
              </div>
              <div className="space-y-3 relative z-10">
                {overdueRecruits.length === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 size={26} className="mx-auto text-growth-500 mb-2" />
                    <p className="text-[13px] font-bold text-growth-700">暂无超时招募</p>
                    <p className="text-[11px] text-ink-400 mt-0.5">所有招募均在正常周期内</p>
                  </div>
                ) : (
                  overdueRecruits.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.05 }}
                    className="p-3 rounded-xl bg-gradient-to-br from-alert-50/70 via-white/60 to-energy-50/40 border border-alert-200/60"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <h4 className="font-bold text-[13px] text-ink-800 leading-snug">{r.title}</h4>
                      <span className="chip-alert !py-0.5 !px-2 !text-[10px] shrink-0 whitespace-nowrap">
                        <Activity size={10} />
                        逾期 {r.overdueDays} 天
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink-500 mb-2.5">
                      <span>发布方：{r.owner}</span>
                      <span className="flex items-center gap-1">
                        <Users size={10} />
                        {r.bids} 人已投
                      </span>
                    </div>
                    <button
                      className="btn-energy w-full !py-2 !px-3 text-[12px]"
                      onClick={() => pushToast(`已提醒「${r.owner}」尽快结算招募「${r.title}」`, 'success')}
                    >
                      <TimerReset size={12} />
                      自动结算提醒
                    </button>
                  </motion.div>
                  ))
                )}
              </div>
            </motion.section>
          </div>
        </div>
      </div>

      {/* 题目详情弹窗 */}
      <AnimatePresence>
        {detailQ && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDetailQ(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="glass-card w-full max-w-[640px] max-h-[85vh] overflow-y-auto rounded-[24px] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部信息 */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="chip-mission !py-0.5 !px-2 !text-[10px]">{detailQ.knowledgePoint || '综合'}</span>
                  <span
                    className={cn(
                      ['', 'chip-growth', 'chip-energy', 'chip-danger'][detailQ.difficulty],
                      '!py-0.5 !px-2 !text-[10px]'
                    )}
                  >
                    {['', '简单', '中等', '困难'][detailQ.difficulty]}
                  </span>
                  <span className="chip-nova !py-0.5 !px-2 !text-[10px]">
                    {detailQ.type === 'single' ? '单选题' : detailQ.type === 'multiple' ? '多选题' : '判断题'}
                  </span>
                  {detailQ.edited && <span className="chip-energy !py-0.5 !px-2 !text-[10px]">教师已修改</span>}
                  <span className="text-[11px] text-ink-400">by {detailQ.submittedByName}</span>
                </div>
                <button
                  onClick={() => setDetailQ(null)}
                  className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 题干 */}
              <h4 className="text-[15px] font-bold text-ink-900 leading-relaxed mb-3">{detailQ.stem}</h4>

              {/* 选项（正确项高亮） */}
              {detailQ.type !== 'judge' && (
                <div className="space-y-2 mb-4">
                  {detailQ.options.map((opt, i) => {
                    const isCorrect = Array.isArray(detailQ.answer)
                      ? detailQ.answer.includes(i)
                      : detailQ.answer === i;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px]',
                          isCorrect
                            ? 'bg-growth-50 border-growth-300 text-ink-800 font-semibold'
                            : 'bg-white/60 border-ink-100 text-ink-600'
                        )}
                      >
                        {isCorrect && <CheckCircle2 size={14} className="text-growth-500 shrink-0" />}
                        {opt}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 答案与解析 */}
              <div className="p-3.5 rounded-xl bg-mission-50/60 border border-mission-100 space-y-2 mb-5">
                <div className="text-[12.5px] font-bold text-mission-700 flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  正确答案：
                  {detailQ.type === 'judge'
                    ? detailQ.answer === true
                      ? '正确'
                      : '错误'
                    : Array.isArray(detailQ.answer)
                      ? detailQ.answer.map((i) => String.fromCharCode(65 + i)).join('、')
                      : String.fromCharCode(65 + (detailQ.answer as number))}
                </div>
                {detailQ.teacherFeedback ? (
                  <div className="text-[12.5px] text-ink-600 leading-relaxed">
                    <b className="text-ink-800">教师反馈：</b>
                    {detailQ.teacherFeedback}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-ink-400 leading-relaxed">
                    提交者未附解析，驳回/修改/完整评价请前往审核中心处理
                  </div>
                )}
                <div className="text-[11px] text-ink-400">
                  知识点：{detailQ.knowledgePoint || '未填写'} · 提交于 {formatTxTime(detailQ.submittedAt)}
                </div>
              </div>

              {/* 操作 */}
              <div className="flex gap-2">
                <button className="btn-ghost-mission flex-1" onClick={() => setDetailQ(null)}>
                  关闭
                </button>
                <button
                  className="btn-ghost flex-1 inline-flex items-center justify-center gap-1.5"
                  onClick={() => navigate('/teacher/question-bank')}
                >
                  <FileCheck size={14} />
                  审核中心
                </button>
                <button
                  className="btn-growth flex-1 inline-flex items-center justify-center gap-1.5"
                  onClick={() => approveQuestion(detailQ.id)}
                >
                  <CheckCircle2 size={14} />
                  通过审核
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MissionShell>
  );
}

function NumTicker({ val }: { val: number }) {
  const v = useTicker(val);
  return <span className="ticker tabular-nums">{v}</span>;
}
