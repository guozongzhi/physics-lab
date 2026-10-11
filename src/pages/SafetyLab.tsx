import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { safetyApi, safetyAssignmentApi, SafetyRecord, SafetyAssignment } from '@/lib/apiService';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Zap,
  ThermometerSun,
  Eye,
  Wrench,
  RadioTower,
  FlaskConical,
  CheckCircle2,
  PlayCircle,
  RotateCcw,
  AlertTriangle,
  BookOpen,
  X,
  Sparkles,
} from 'lucide-react';
import type { SafetyCategory } from '@/types';
import ReactMarkdown from 'react-markdown';
import { safetyNotices } from '@/data/safetyContent';
import { useSafetyStore } from '@/store/safetyStore';
import { cn } from '@/lib/utils';

interface SafetyDomain {
  category: SafetyCategory;
  name: string;
  icon: LucideIcon;
  color: string;
  grad: string;
  passedQuestions: number;
  totalQuestions: number;
  passRate: number;
  status: 'passed' | 'pending' | 'review';
}

interface SafetyTip {
  id: string;
  category: SafetyCategory;
  title: string;
  summary: string;
}

const SAFETY_DOMAINS: SafetyDomain[] = [
  { category: 'electric', name: '电气安全', icon: Zap, color: 'mission', grad: 'from-mission-400 via-mission-500 to-mission-600', passedQuestions: 18, totalQuestions: 20, passRate: 90, status: 'passed' },
  { category: 'thermal', name: '热学安全', icon: ThermometerSun, color: 'energy', grad: 'from-energy-400 via-alert-500 to-alert-600', passedQuestions: 17, totalQuestions: 20, passRate: 85, status: 'passed' },
  { category: 'optical', name: '光学安全', icon: Eye, color: 'nova', grad: 'from-nova-400 via-nova-500 to-nova-600', passedQuestions: 19, totalQuestions: 20, passRate: 95, status: 'passed' },
  { category: 'mechanical', name: '机械安全', icon: Wrench, color: 'growth', grad: 'from-growth-400 via-growth-500 to-growth-600', passedQuestions: 16, totalQuestions: 20, passRate: 80, status: 'passed' },
  { category: 'radiation', name: '辐射安全', icon: RadioTower, color: 'alert', grad: 'from-alert-400 via-alert-500 to-energy-500', passedQuestions: 8, totalQuestions: 20, passRate: 40, status: 'pending' },
  { category: 'chemical', name: '化学安全', icon: FlaskConical, color: 'mission', grad: 'from-mission-400 via-nova-400 to-nova-500', passedQuestions: 10, totalQuestions: 20, passRate: 50, status: 'pending' },
];

const SAFETY_TIPS: SafetyTip[] = [
  { id: 't1', category: 'electric', title: '通电前必须高喊提醒', summary: '通电前先确认线路正确，互查后高喊"通电了"，提醒周围人员注意安全...' },
  { id: 't2', category: 'thermal', title: '酒精灯用灯帽盖灭', summary: '熄灭酒精灯时严禁用嘴吹，必须用灯帽盖灭后再重盖一次，防止负压粘连...' },
  { id: 't3', category: 'optical', title: '激光光路低于人眼', summary: '调整激光光路高度，确保光束不与坐姿人眼齐平，佩戴专用防护镜...' },
  { id: 't4', category: 'mechanical', title: '旋转机械不戴手套', summary: '操作车床、钻床等旋转设备严禁戴手套，长发盘入工作帽内...' },
  { id: 't5', category: 'radiation', title: '放射源使用长柄工具', summary: '取放射源必须使用长柄镊子或钳子，距离防护 + 时间防护双管齐下...' },
  { id: 't6', category: 'chemical', title: '稀释浓硫酸：酸入水', summary: '将浓硫酸沿杯壁缓慢倒入水中，边倒边搅拌，严禁将水倒入酸中...' },
];

function TickerNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className="tabular-nums inline-block animate-countUp">
      {display}
    </span>
  );
}

export default function SafetyLab() {
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const [activeTip, setActiveTip] = useState<SafetyTip | null>(null);
  // 点「复习材料」时打开对应领域的完整安全须知
  const [reviewCategory, setReviewCategory] = useState<SafetyCategory | null>(null);
  // 真实安全题库（在线时来自后端），用于显示各领域实际题数
  const safetyQuestions = useSafetyStore((s) => s.questions);

  const [records, setRecords] = useState<SafetyRecord[]>([]);
  useEffect(() => {
    safetyApi.myRecords().then(setRecords).catch(() => {});
  }, []);

  // 教师指派的安全考核（真实数据；在线时由后端按本人班级/小组过滤）
  const [assignments, setAssignments] = useState<SafetyAssignment[]>([]);
  useEffect(() => {
    safetyAssignmentApi.list().then(setAssignments).catch(() => {});
  }, []);
  // 待完成 = 未通过且未截止
  const pendingAssignments = useMemo(
    () =>
      assignments.filter(
        (a) =>
          !records.some((r) => r.assignmentId === a.id && r.passed) &&
          !(a.deadline && new Date(a.deadline).getTime() < Date.now())
      ),
    [assignments, records]
  );
  const recordsByCat = useMemo(() => {
    const m: Record<string, SafetyRecord> = {};
    for (const r of records) {
      if (!m[r.category] || new Date(r.createdAt) > new Date(m[r.category].createdAt)) m[r.category] = r;
    }
    return m;
  }, [records]);
  const domains = SAFETY_DOMAINS.map((d) => {
    const rec = recordsByCat[d.category];
    // 题数取真实题库（在线时来自后端，教师增减题目这里立即反映）。
    // 原先写死 totalQuestions: 20，与实际题量（每类 5 道）完全不符。
    const total = safetyQuestions.filter((q) => q.safetyCategory === d.category).length;
    return {
      ...d,
      totalQuestions: total || d.totalQuestions,
      passedQuestions: rec?.passed ? (total || d.totalQuestions) : 0,
      passRate: rec ? rec.score : 0,
      status: (rec ? (rec.passed ? 'passed' : 'review') : 'pending') as SafetyDomain['status'],
    };
  });

  const passedCount = domains.filter((d) => d.status === 'passed').length;
  const pendingCount = domains.filter((d) => d.status === 'pending' || d.status === 'review').length;
  const frozenCount = 1;

  return (
    <div className="w-full space-y-6">
      <AnimatePresence>
        {activeTip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-900/40 backdrop-blur-sm"
            onClick={() => setActiveTip(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card !p-0 rounded-[24px] w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className={cn(
                'p-6 bg-gradient-to-r relative overflow-hidden',
                {
                  electric: 'from-mission-500/15 via-mission-500/10 to-transparent',
                  thermal: 'from-energy-500/15 via-alert-500/10 to-transparent',
                  optical: 'from-nova-500/15 via-nova-500/10 to-transparent',
                  mechanical: 'from-growth-500/15 via-growth-500/10 to-transparent',
                  radiation: 'from-alert-500/15 via-alert-500/10 to-transparent',
                  chemical: 'from-nova-500/15 via-mission-500/10 to-transparent',
                  combined: 'from-mission-500/15 to-transparent',
                }[activeTip.category]
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg',
                      {
                        electric: 'bg-gradient-to-br from-mission-400 to-mission-600',
                        thermal: 'bg-gradient-to-br from-energy-400 to-alert-600',
                        optical: 'bg-gradient-to-br from-nova-400 to-nova-600',
                        mechanical: 'bg-gradient-to-br from-growth-400 to-growth-600',
                        radiation: 'bg-gradient-to-br from-alert-400 to-energy-600',
                        chemical: 'bg-gradient-to-br from-nova-400 to-mission-600',
                        combined: 'bg-gradient-to-br from-mission-400 to-nova-600',
                      }[activeTip.category]
                    )}>
                      {(() => {
                        const d = SAFETY_DOMAINS.find((x) => x.category === activeTip.category);
                        if (!d) return <BookOpen size={24} className="text-white" />;
                        const Icon = d.icon;
                        return <Icon size={24} className="text-white" />;
                      })()}
                    </div>
                    <div>
                      <div className="mission-label mb-2">
                        <Sparkles size={11} /> 安全知识库 · 深度贴士
                      </div>
                      <h2 className="text-2xl font-black text-ink-800 leading-tight">{activeTip.title}</h2>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTip(null)}
                    className="w-10 h-10 rounded-xl glass-card !p-0 flex items-center justify-center text-ink-500 hover:text-ink-700 hover:bg-white/80 transition"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto scroll-thin">
                <div className="prose prose-sm max-w-none text-ink-700 leading-relaxed">
                  <p className="text-base mb-4">{activeTip.summary}</p>
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-growth-50/60 via-mission-50/40 to-nova-50/40 border border-mission-100/50">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck size={18} className="text-growth-600" />
                      <h4 className="font-black text-ink-800 text-base m-0">关键操作要点</h4>
                    </div>
                    {/* 用该领域真实撰写的要点，替换原先"关于「X」的第 N 条…"的生成套话 */}
                    <ul className="space-y-2 m-0 p-0 list-none">
                      {(safetyNotices[activeTip.category]?.keyPoints || []).map((kp, i) => (
                        <li key={i} className="flex items-start gap-2.5 p-0">
                          <span className="w-5 h-5 rounded-md bg-mission-100 text-mission-600 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-ink-700 leading-relaxed">{kp}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => { setActiveTip(null); setReviewCategory(activeTip.category); }}
                      className="mt-4 text-[13px] font-bold text-mission-600 hover:text-mission-700 inline-flex items-center gap-1"
                    >
                      <BookOpen size={13} />阅读完整《{safetyNotices[activeTip.category]?.title || '安全须知'}》
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-ink-100/80 flex items-center justify-end gap-3 bg-gradient-to-t from-ink-50/80 to-transparent">
                <button onClick={() => setActiveTip(null)} className="btn-ghost text-sm">
                  关闭
                </button>
                <button
                  onClick={() => {
                    pushToast(`已标记「${activeTip.title}」为掌握`, 'success');
                    setActiveTip(null);
                  }}
                  className="btn-growth !py-2.5 !px-5 !text-sm"
                >
                  <CheckCircle2 size={14} /> 我已掌握本要点
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 复习材料：直接展示该领域完整的安全须知（真实内容，来自 data/safetyContent.ts）。
            原实现只弹一句"已发送至学习中心"的提示，学生实际什么都收不到。 */}
        {reviewCategory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-ink-900/40 backdrop-blur-sm"
            onClick={() => setReviewCategory(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25 }}
              className="glass-card w-full max-w-2xl max-h-[88vh] rounded-[26px] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-ink-100/80 flex items-center gap-3 shrink-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-mission-600 tracking-wider uppercase">
                    复习材料 · 安全须知
                  </div>
                  <h3 className="font-black text-[18px] text-ink-900 truncate">
                    {safetyNotices[reviewCategory]?.title || '安全须知'}
                  </h3>
                </div>
                <button
                  onClick={() => setReviewCategory(null)}
                  className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400 shrink-0"
                  aria-label="关闭复习材料"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto scroll-thin">
                <div className="prose-safety max-w-none">
                  <ReactMarkdown>{safetyNotices[reviewCategory]?.content || ''}</ReactMarkdown>
                </div>
                <div className="mt-6 p-4 rounded-2xl bg-growth-50 ring-1 ring-growth-200">
                  <h4 className="font-bold text-growth-800 text-sm mb-2.5 flex items-center gap-2">
                    <ShieldCheck size={15} />
                    安全操作要点（记住这些关键规范）
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(safetyNotices[reviewCategory]?.keyPoints || []).map((kp, i) => (
                      <span key={i} className="chip-growth !text-[12px] !px-3 !py-1.5">
                        <span className="font-bold mr-1 opacity-70">{i + 1}.</span>
                        {kp}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-ink-100/80 flex items-center justify-end gap-3 shrink-0">
                <button onClick={() => setReviewCategory(null)} className="btn-ghost text-sm">
                  关闭
                </button>
                <button
                  onClick={() => {
                    pushToast('已标记完成复习', 'success');
                    setReviewCategory(null);
                  }}
                  className="btn-growth !py-2.5 !px-5 !text-sm"
                >
                  <CheckCircle2 size={14} /> 已完成复习
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="student-safety-intro glass-card p-8 rounded-[28px] relative overflow-hidden">
        <div className="absolute -right-32 -top-32 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-growth-300/25 via-mission-300/15 to-nova-300/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-24 w-80 h-80 rounded-full bg-gradient-to-br from-mission-300/20 via-nova-300/10 to-transparent blur-3xl pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="student-safety-brand lg:col-span-5 flex items-center gap-6">
            <div className="relative shrink-0">
              <div className="absolute -inset-3 rounded-[32px] bg-growth-400/25 blur-2xl animate-pulse" />
              <div className="shield-card relative w-28 h-32 bg-gradient-to-br from-growth-300 via-growth-500 to-growth-700 shadow-glowMission flex items-center justify-center">
                <div className="shield-card absolute inset-1 bg-gradient-to-br from-white/20 to-transparent" />
                <ShieldCheck size={52} className="text-white drop-shadow-lg relative" strokeWidth={2.4} />
              </div>
            </div>
            <div>
              <div className="mission-label mb-3">
                <ShieldCheck size={12} />
                SAFETY FIRST · ZERO INCIDENT
              </div>
              <h1 className="student-safety-title font-black tracking-tight mb-2.5 leading-tight">
                <span className="block text-ink-800">安全实验舱</span>
                <span className="block text-mission-600 text-base font-semibold mt-1">Safety Lab</span>
              </h1>
              <p className="text-lg text-ink-600 font-medium leading-relaxed">
                安全是一切研究的基石。通过严格考核，守护每一次探索。
              </p>
            </div>
          </div>

          <div className="student-safety-stats lg:col-span-7 grid grid-cols-3 gap-4">
            {[
              { label: '已通过认证', value: passedCount, total: SAFETY_DOMAINS.length, icon: CheckCircle2, color: 'growth', grad: 'from-growth-400 via-growth-500 to-growth-600' },
              { label: '待参加考核', value: pendingCount, total: SAFETY_DOMAINS.length, icon: PlayCircle, color: 'energy', grad: 'from-energy-400 via-alert-500 to-energy-600' },
              { label: '已冻结项目', value: frozenCount, total: 10, icon: AlertTriangle, color: 'nova', grad: 'from-nova-400 via-nova-500 to-nova-600' },
            ].map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className="student-safety-stat glass-card !p-5 !rounded-2xl text-center relative overflow-hidden group"
                >
                  <div className={cn('absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-30 bg-gradient-to-br', stat.grad)} />
                  <div className="relative">
                    <div className={cn(
                      'w-12 h-12 rounded-2xl mx-auto mb-3 bg-gradient-to-br flex items-center justify-center shadow-lg',
                      stat.grad
                    )}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <div className="student-safety-stat-value flex items-baseline justify-center gap-1 mb-1">
                      <TickerNumber value={stat.value} />
                      <span className={cn('text-2xl font-black text-ink-300', '')}>/ {stat.total}</span>
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider text-ink-500">
                      {stat.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 space-y-4">
          <div className="mission-label">
            <ShieldCheck size={12} />
            六大安全领域 · 分类考核
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {domains.map((domain, idx) => {
              const Icon = domain.icon;
              return (
                <motion.div
                  key={domain.category}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className="glass-card glass-card-hover p-5 rounded-2xl relative overflow-hidden group"
                >
                  <div className={cn('absolute -right-8 -top-8 w-32 h-32 rounded-full blur-2xl opacity-20 bg-gradient-to-br', domain.grad)} />
                  <div
                    className="absolute top-0 left-0 right-0 h-1.5"
                    style={{
                      background: `repeating-linear-gradient(90deg, var(--tw-gradient-stops))`,
                    }}
                  >
                    <div className={cn('w-full h-full bg-gradient-to-r opacity-90', domain.grad)}
                      style={{
                        backgroundImage:
                          domain.color === 'mission'
                            ? 'linear-gradient(90deg, #4F7CFF 0%, #8B5CF6 50%, #4F7CFF 100%)'
                            : domain.color === 'energy'
                              ? 'linear-gradient(90deg, #3471de 0%, #4889ef 50%, #2453bc 100%)'
                              : domain.color === 'growth'
                                ? 'linear-gradient(90deg, #22C55E 0%, #6CE9A6 50%, #22C55E 100%)'
                                : domain.color === 'nova'
                                  ? 'linear-gradient(90deg, #8B5CF6 0%, #4F7CFF 50%, #8B5CF6 100%)'
                                  : domain.color === 'alert'
                                    ? 'linear-gradient(90deg, #4889ef 0%, #3471de 50%, #2453bc 100%)'
                                    : 'linear-gradient(90deg, #4F7CFF 0%, #22C55E 50%, #4F7CFF 100%)',
                        backgroundSize: '32px 100%',
                      }}
                    />
                  </div>

                  <div className="relative pt-3">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0',
                          domain.grad
                        )}>
                          <Icon size={22} className="text-white" />
                        </div>
                        <div>
                          <h3 className="font-black text-lg text-ink-800 mb-0.5">{domain.name}</h3>
                          <p className="text-xs text-ink-500 font-medium">
                            {domain.category === 'electric' && '实验室用电与仪器操作'}
                            {domain.category === 'thermal' && '高温操作与热源管理'}
                            {domain.category === 'optical' && '激光/强光源与光学元件'}
                            {domain.category === 'mechanical' && '加工设备与重物装配'}
                            {domain.category === 'radiation' && '放射源与电离/电磁辐射'}
                            {domain.category === 'chemical' && '试剂使用与废液处理'}
                          </p>
                        </div>
                      </div>
                      {domain.status === 'passed' && (
                        <div className="chip-growth !py-1 !text-[11px]">
                          <CheckCircle2 size={11} /> 已通过
                        </div>
                      )}
                      {domain.status === 'pending' && (
                        <div className="chip-alert !py-1 !text-[11px]">
                          <AlertTriangle size={11} /> 待考核
                        </div>
                      )}
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-ink-600">
                          已通过 <span className={cn(`text-${domain.color}-600`)}>{domain.passedQuestions}</span>/{domain.totalQuestions} 题
                        </span>
                        <span className={cn('text-xs font-black tabular-nums', `text-${domain.color}-600`)}>
                          通过率 {domain.passRate}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-ink-100 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${domain.passRate}%` }}
                          transition={{ duration: 0.9, delay: idx * 0.08 }}
                          className={cn('h-full rounded-full bg-gradient-to-r', domain.grad)}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {domain.status === 'passed' && (
                        <>
                          <div className="chip-growth !text-[11px] !py-1.5 flex-1 justify-center">
                            <CheckCircle2 size={11} /> 认证有效
                          </div>
                          <button className="btn-mission !py-2 !px-3.5 !text-[11px] !rounded-xl" onClick={() => { pushToast(`开始《${domain.name}》重学巩固 · 共 ${domain.totalQuestions} 题`, 'info'); navigate(`/safety-exam/${domain.category}`); }}>
                            <RotateCcw size={12} /> 重学巩固
                          </button>
                        </>
                      )}
                      {domain.status === 'pending' && (
                        <>
                          <button className="btn-energy flex-1 !py-2.5 !text-xs !rounded-xl" onClick={() => { pushToast(`进入《${domain.name}》安全考核`, 'info'); navigate(`/safety-exam/${domain.category}`); }}>
                            <PlayCircle size={13} /> 参加考核
                          </button>
                          <button className="btn-ghost !text-xs !rounded-xl !px-3.5 border border-mission-200 text-mission-600" onClick={() => setReviewCategory(domain.category)}>
                            复习材料
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        <aside className="lg:col-span-4 space-y-4">
          <div className="glass-card p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-gradient-to-br from-energy-300/30 via-alert-300/20 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-energy-400 to-alert-500 flex items-center justify-center shadow-glowEnergy">
                  <AlertTriangle size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-ink-800">今日安全考核</h3>
                  <p className="text-[11px] text-ink-500 font-medium">
                    {pendingAssignments.length > 0 ? `共 ${pendingAssignments.length} 项待通过` : '暂无待完成的指派'}
                  </p>
                </div>
              </div>

              {assignments.length === 0 ? (
                <div className="student-safety-empty p-4 rounded-2xl bg-white/60 border border-ink-100 text-left text-[13px] text-ink-500 leading-relaxed">
                  老师还没有布置安全考核。
                  <br />
                  可以先去下方各领域「参加考核」自主练习。
                </div>
              ) : (
              <div className="space-y-3">
                {assignments.map((exam, idx) => {
                  const domain = SAFETY_DOMAINS.find((d) => d.category === exam.category);
                  const DomainIcon = domain?.icon || ShieldCheck;
                  const done = records.some((r) => r.assignmentId === exam.id && r.passed);
                  const expired = !!exam.deadline && new Date(exam.deadline).getTime() < Date.now();
                  const locked = done || expired;
                  return (
                    <motion.div
                      key={exam.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={cn(
                        'p-4 rounded-2xl bg-gradient-to-br from-white/90 to-ink-50/80 border transition-colors',
                        locked ? 'border-ink-100/80 opacity-80' : 'border-alert-100/80 hover:border-energy-300'
                      )}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className={cn(
                          'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-md',
                          domain?.grad || 'from-mission-400 to-nova-500'
                        )}>
                          <DomainIcon size={18} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className={cn(`chip-${domain?.color || 'mission'} !py-0.5 !text-[10px]`)}>
                              {domain?.name || exam.category}
                            </span>
                            {done && <span className="chip-growth !py-0.5 !text-[10px]">
                              <CheckCircle2 size={9} />已通过
                            </span>}
                            {!done && expired && <span className="chip-ink !py-0.5 !text-[10px]">已截止</span>}
                          </div>
                          <h4 className="font-black text-sm text-ink-800 leading-tight truncate">
                            {exam.title}
                          </h4>
                          {exam.deadline && !expired && (
                            <div className="text-[10.5px] text-ink-400 mt-0.5">
                              截止 {new Date(exam.deadline).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3.5">
                        <div className="p-2 rounded-lg bg-ink-50/80 text-center">
                          <div className="text-sm font-black text-ink-800 tabular-nums">{exam.questionCount}</div>
                          <div className="text-[9px] font-bold text-ink-500 uppercase tracking-wider">题目</div>
                        </div>
                        <div className="p-2 rounded-lg bg-ink-50/80 text-center">
                          <div className="text-sm font-black text-ink-800 tabular-nums">{exam.timeLimit}<span className="text-xs">m</span></div>
                          <div className="text-[9px] font-bold text-ink-500 uppercase tracking-wider">限时</div>
                        </div>
                        <div className="p-2 rounded-lg bg-ink-50/80 text-center">
                          <div className="text-sm font-black text-growth-600 tabular-nums">{exam.passScore}</div>
                          <div className="text-[9px] font-bold text-ink-500 uppercase tracking-wider">及格</div>
                        </div>
                      </div>

                      <button
                        className={cn(
                          'w-full !py-3 !text-sm !rounded-xl relative group',
                          locked ? 'btn-ghost cursor-not-allowed' : 'btn-energy'
                        )}
                        disabled={locked}
                        onClick={() => navigate(`/safety-exam/${exam.category}?assignment=${exam.id}`)}
                      >
                        {!locked && <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition" />}
                        <Zap size={15} className={cn('relative', !locked && 'fill-white/30')} />
                        <span className="relative">
                          {done ? '已通过 · 可重考' : expired ? '已截止' : 'START EXAM · 开始考核'}
                        </span>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
              )}
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute -left-8 -bottom-8 w-36 h-36 rounded-full bg-gradient-to-br from-mission-300/20 via-nova-300/15 to-transparent blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400 via-nova-400 to-nova-500 flex items-center justify-center shadow-glowMission">
                  <BookOpen size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-ink-800">安全知识库</h3>
                  <p className="text-[11px] text-ink-500 font-medium">点击查看详细要点</p>
                </div>
              </div>

              <div className="space-y-2">
                {SAFETY_TIPS.map((tip, idx) => {
                  const domain = SAFETY_DOMAINS.find((d) => d.category === tip.category);
                  return (
                    <motion.button
                      key={tip.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.06 }}
                      onClick={() => setActiveTip(tip)}
                      className="student-safety-tip w-full p-3.5 rounded-xl bg-gradient-to-br from-white/80 to-ink-50/50 hover:from-mission-50/60 hover:to-nova-50/40 border border-ink-100/80 hover:border-mission-200 transition-all text-left group"
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn(
                          'chip-' + (domain?.color || 'mission'),
                          '!py-0.5 !text-[9px] shrink-0 mt-0.5'
                        )}>
                          {domain?.name.slice(0, 2)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="mission-label !text-[9px] !py-0.5 !px-2 mb-1 inline-flex">
                            TIP-{String(idx + 1).padStart(2, '0')}
                          </div>
                          <h4 className="font-bold text-sm text-ink-800 leading-snug mb-1 group-hover:text-mission-700 transition-colors">
                            {tip.title}
                          </h4>
                          <p className="text-[11px] text-ink-500 leading-relaxed line-clamp-2">
                            {tip.summary}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
