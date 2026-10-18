import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EnergyLedger from '@/components/coins/EnergyLedger';
import { motion } from 'framer-motion';
import {
  Trophy,
  Star,
  TrendingUp,
  Flame,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import EnergyLadder from '@/components/leaderboard/EnergyLadder';
import type { EnergyStudent } from '@/components/leaderboard/RankAvatars';
import AvatarStack from '@/components/ui/AvatarStack';
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import { useCoinStore } from '@/store/coinStore';
import { classesApi } from '@/lib/apiService';
import type { SchoolClass } from '@/types';
import { cn, formatAxisTick } from '@/lib/utils';

type TabKey = 'total' | 'month' | 'week';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'total', label: '小组总榜' },
  { key: 'month', label: '月榜' },
  { key: 'week', label: '周榜' },
];

const GROUP_COLORS = [
  { main: '#4F7CFF', light: '#8FAEFF', grad: 'from-mission-400 to-mission-600' },
  { main: '#FF8A34', light: '#FFC695', grad: 'from-energy-400 to-energy-600' },
  { main: '#22C55E', light: '#6CE9A6', grad: 'from-growth-400 to-growth-600' },
  { main: '#8B5CF6', light: '#B692F6', grad: 'from-nova-400 to-nova-600' },
  { main: '#F59E0B', light: '#FACD64', grad: 'from-alert-400 to-alert-600' },
  { main: '#06B6D4', light: '#67E8F9', grad: 'from-cyan-400 to-cyan-600' },
];

export default function ResearchLeague() {
  const { groups, users, classMeta } = useGroupStore();
  const { coinTxs } = useCoinStore();
  const { classId: myClassId, role, groupId } = useAuthStore();
  const [tab, setTab] = useState<TabKey>('total');
  const [searchParams, setSearchParams] = useSearchParams();
  const showLedger = searchParams.get('view') === 'ledger';
  const DAY = 86400000;

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  useEffect(() => {
    classesApi.list().then(setClasses).catch(() => {});
  }, []);
  const classesById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);

  const isStaff = role === 'teacher' || role === 'admin';
  // 学生仅见本班排名；教师/管理员见全部

  // 近 7/30 天各组能量币增量
  const periodSum = useMemo(() => {
    const mk = (startMs: number) => {
      const m: Record<string, number> = {};
      for (const tx of coinTxs) {
        const t = tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt);
        if (t.getTime() >= startMs) m[tx.groupId] = (m[tx.groupId] || 0) + tx.delta;
      }
      return m;
    };
    return { week: mk(Date.now() - 7 * DAY), month: mk(Date.now() - 30 * DAY) };
  }, [coinTxs]);

  // 有成员且在本班可见范围内的小组
  const memberedGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) if (u.groupId) counts[u.groupId] = (counts[u.groupId] || 0) + 1;
    return groups
      .map((g) => ({ ...g, memberCount: counts[g.id] || 0 }))
      .filter((g) => g.memberCount > 0 && (isStaff || g.classId === myClassId));
  }, [groups, users, myClassId, isStaff]);

  // 小组榜单：总榜=totalCoins；月/周=period增量；按班级分组降序
  const rankingByClass = useMemo(() => {
    const coinOf = (g: { id: string; totalCoins: number }) =>
      tab === 'week' ? periodSum.week[g.id] || 0 :
      tab === 'month' ? periodSum.month[g.id] || 0 : g.totalCoins;
    const map: Record<string, { classId: string; className: string; rows: { groupId: string; name: string; coins: number; memberCount: number; students: EnergyStudent[] }[] }> = {};
    for (const g of memberedGroups) {
      const cid = g.classId || 'unknown';
      if (!map[cid]) map[cid] = { classId: cid, className: cid === 'unknown' ? '未分班小组' : classesById[cid] || cid, rows: [] };
      map[cid].rows.push({ groupId: g.id, name: g.name, coins: coinOf(g), memberCount: g.memberCount, students: users.filter((user) => user.groupId === g.id).map(({ id, name, avatar }) => ({ id, name, avatar })) });
    }
    return Object.values(map)
      .map((c) => ({ ...c, rows: [...c.rows].sort((a, b) => b.coins - a.coins) }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [memberedGroups, classesById, tab, periodSum, users]);

  // 近 30 天各小组「真实余额」走势。
  // 流水只记录增减，不能从 0 累加——那算出的是净增减，会出现负值，也和排行榜余额对不上。
  // 改为以各组当前真实余额为锚点向过去反推：balance(d) = 当前余额 − (d 之后全部流水之和)。
  // 教师端「批量重置能量币」是直接改余额、不写流水的，重置之前的日子会反推出负数；
  // 余额不可能为负，所以负数段说明那段历史已被重置抹掉，这条线就从最后一个负数之后起画。
  const trend = useMemo(() => {
    const groupNames = memberedGroups.map((g) => g.name);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const windowStart = todayStart - 29 * DAY;

    const txByGroup: Record<string, Array<{ t: number; delta: number }>> = {};
    for (const tx of coinTxs) {
      const t = (tx.createdAt instanceof Date ? tx.createdAt : new Date(tx.createdAt)).getTime();
      (txByGroup[tx.groupId] ||= []).push({ t, delta: tx.delta });
    }

    const series: Record<string, Array<number | null>> = {};
    for (const g of memberedGroups) {
      const mine = txByGroup[g.id] || [];
      const curve: number[] = [];
      for (let i = 0; i < 30; i++) {
        const dayEnd = windowStart + (i + 1) * DAY - 1;
        const after = mine.reduce((s, x) => (x.t > dayEnd ? s + x.delta : s), 0);
        curve.push(g.totalCoins - after);
      }
      let cut = 0;
      for (let i = curve.length - 1; i >= 0; i--) {
        if (curve[i] < 0) {
          cut = i + 1;
          break;
        }
      }
      series[g.name] = curve.map((v, i) => (i < cut ? null : v));
    }

    const days: Record<string, string | number | null>[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(windowStart + i * DAY);
      const row: Record<string, string | number | null> = { date: `${d.getMonth() + 1}/${d.getDate()}` };
      for (const n of groupNames) row[n] = series[n][i];
      days.push(row);
    }
    return { days, groupNames };
  }, [coinTxs, memberedGroups]);

  // 流水实际覆盖的时间范围（用真实记录替代原先写死的「赛季剩余 N 天」）
  const ledgerSpan = useMemo(() => {
    if (!coinTxs.length) return null;
    const ts = coinTxs.map((t) =>
      (t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)).getTime()
    );
    const md = (n: number) => {
      const d = new Date(n);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    return `${md(Math.min(...ts))} – ${md(Math.max(...ts))}`;
  }, [coinTxs]);

  // 本周 MVP：本周能量累计前 3 小组
  const mvp = useMemo(() => {
    return [...memberedGroups]
      .map((g) => ({ groupId: g.id, name: g.name, coins: periodSum.week[g.id] || 0, memberCount: g.memberCount }))
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 3);
  }, [memberedGroups, periodSum]);

  return (
    <>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
        >
          <div className="absolute -top-10 right-10 w-64 h-64 rounded-full bg-alert-400/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-20 w-80 h-80 rounded-full bg-nova-400/10 blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="mission-label">
                <Star size={12} />
                LEADERBOARD · {classMeta.termName}
              </span>
              {ledgerSpan && (
                <span className="chip-energy">
                  <Flame size={11} />
                  流水 {ledgerSpan}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h1 className="text-[32px] md:text-[36px] font-extrabold text-ink-900 leading-[1.1] tracking-tight">
                  {showLedger ? '能量币账本' : '小组能量天梯'}
                  <span className="block text-gradient-mission mt-1 text-[18px] md:text-[22px]">科研联赛 · 每一份努力都算数</span>
                </h1>
                <p className="mt-2 text-[14px] text-ink-500 max-w-lg">
                  按小组能量排名争夺冠亚季军，查看各组成员头像，也可查阅每笔能量币收支。
                </p>
              </div>
              <div className="glass-card !shadow-none p-1.5 rounded-2xl border-mission-100/70 flex flex-wrap gap-1">
                <button type="button" aria-pressed={showLedger} onClick={() => setSearchParams(showLedger ? {} : { view: 'ledger' })}
                  className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-white/80 text-mission-700">
                  {showLedger ? '返回小组排名' : '详细流水'}
                </button>
                {!showLedger && TABS.map((t) => (
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
          </div>
        </motion.section>

        {showLedger ? <EnergyLedger /> : <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="min-w-0 xl:col-span-8 space-y-6">
            <div className="space-y-5">
              {rankingByClass.length === 0 ? (
                <div className="glass-card p-10 text-center text-ink-400 text-[13px]">暂无排名数据</div>
              ) : (
                rankingByClass.map((cls) => (
                  <motion.section
                    key={cls.classId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="glass-card p-5 md:p-6 rounded-[24px]"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="flex items-center gap-2 text-[16px] font-bold text-ink-800">
                        <Trophy size={18} className="text-alert-500" />
                        {cls.className}
                      </h3>
                      <span className="text-[11px] text-ink-400">
                        {cls.rows.length} 个小组 · {tab === 'week' ? '本周' : tab === 'month' ? '本月' : '累计'}
                      </span>
                    </div>
                    <EnergyLadder
                      key={tab}
                      rows={cls.rows.map((row) => ({ ...row, id: row.groupId }))}
                      highlightId={groupId}
                      metric={tab === 'week' ? '近 7 天净增' : tab === 'month' ? '近 30 天净增' : '小组累计能量'}
                    />
                  </motion.section>
                ))
              )}
            </div>
          </div>

          <div className="min-w-0 xl:col-span-4 space-y-6">
            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="glass-card p-5 rounded-[24px]"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink-800">
                  <TrendingUp size={18} className="text-mission-500" />
                  能量成长轨迹
                </h3>
                <span className="text-[10px] font-mono text-ink-400">近 30 天余额</span>
              </div>
              <div className="h-[260px] -mx-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend.days} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      {trend.groupNames.map((n, i) => {
                        const c = GROUP_COLORS[i % GROUP_COLORS.length];
                        return (
                          <linearGradient key={n} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={c.main} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={c.main} stopOpacity={0} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={false}
                      interval={6}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                      tickLine={false}
                      axisLine={false}
                      width={42}
                      tickFormatter={formatAxisTick}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: '1px solid rgba(255,255,255,0.9)',
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 12px 40px rgba(15,23,42,0.12)',
                        fontSize: 12,
                      }}
                      labelStyle={{ fontWeight: 700, color: '#1E293B', marginBottom: 6 }}
                      formatter={(value: number | string, name: string) => [`${Number(value).toLocaleString()} ⚡`, name]}
                    />
                    {trend.groupNames.map((n, i) => {
                      const c = GROUP_COLORS[i % GROUP_COLORS.length];
                      return (
                        <Area
                          key={n}
                          type="monotone"
                          dataKey={n}
                          stroke={c.main}
                          strokeWidth={2.2}
                          fill={`url(#grad-${i})`}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                        />
                      );
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                {trend.groupNames.map((n, i) => {
                  const c = GROUP_COLORS[i % GROUP_COLORS.length];
                  return (
                    <div key={n} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: c.main }}
                      />
                      <span className="text-[11px] text-ink-600 font-medium">{n.slice(0, 4)}</span>
                    </div>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="glass-card p-5 rounded-[24px] relative overflow-hidden"
            >
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-mission-400/20 blur-xl pointer-events-none" />
              <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-nova-400/20 blur-xl pointer-events-none" />
              <div
                className="absolute inset-0 rounded-[24px] pointer-events-none"
                style={{
                  boxShadow:
                    '0 0 0 1px rgba(79,124,255,0.2) inset, 0 0 40px rgba(79,124,255,0.1), 0 0 40px rgba(139,92,246,0.08)',
                }}
              />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink-800">
                    <Flame size={18} className="text-energy-500" />
                    本周活跃小组
                  </h3>
                  <span className="chip-growth !py-0.5 !px-2 text-[10px]">本周 MVP</span>
                </div>
                <div className="space-y-3">
                  {mvp.length === 0 ? (
                    <div className="text-center py-6 text-ink-400 text-[12px]">本周暂无能量入账</div>
                  ) : mvp.map((m, i) => {
                    const members = users.filter((u) => u.groupId === m.groupId).slice(0, 5);
                    const c = GROUP_COLORS[i % GROUP_COLORS.length];
                    return (
                      <motion.div
                        key={m.groupId}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.3 + i * 0.06 }}
                        className="p-3.5 rounded-2xl bg-gradient-to-br from-white/80 to-mission-50/40 border border-mission-100/60 relative overflow-hidden"
                      >
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1.5"
                          style={{
                            background: `linear-gradient(180deg, ${c.main}, ${c.light})`,
                          }}
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0 shadow-md"
                              style={{
                                background: `linear-gradient(135deg, ${c.main}, ${c.light})`,
                              }}
                            >
                              {String.fromCharCode(65 + i)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-[13px] text-ink-800 truncate">
                                {m.name}
                              </div>
                              <div className="text-[11px] text-ink-500 mt-0.5">本周 +{m.coins}⚡ · {m.memberCount} 人</div>
                            </div>
                          </div>
                          <span className="chip-energy !py-0.5 !px-2 text-[10px] shrink-0">
                            #{i + 1}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <AvatarStack users={members} max={4} size={24} />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.section>
          </div>
        </div>}
      </div>
    </>
  );
}
