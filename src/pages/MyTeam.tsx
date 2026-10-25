import { useLocale } from '@/i18n/useLocale';
import { applyAvatarFallback } from '@/lib/imageFallback';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { UsersRound, Crown, Zap, Trophy, FolderKanban, UserPlus, Sparkles, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useProjectStore } from '@/store/projectStore';
import { useCoinStore } from '@/store/coinStore';
import { useUIStore } from '@/store/uiStore';
import { computeEarnedByUser } from '@/lib/earnedCoins';

/**
 * 我的小组 —— 学生查看本组成员、各自能量与贡献占比。
 *
 * 数据全部来自 groupStore / projectStore / coinStore（后端模式下由 bootstrapFromApi 注入）。
 * 注意：groups.contributionRatio 里存的是历史遗留的旧用户 id（如 u-01），与当前用户 id
 * （u_xxxx）对不上，所以贡献占比不取该字段，改为用个人能量实时计算，避免显示空的假指标。
 */
export default function MyTeam() {
  const { tx } = useLocale();
  const groupId = useAuthStore((s) => s.groupId);
  const userId = useAuthStore((s) => s.userId);
  const classId = useAuthStore((s) => s.classId);
  const setGroupId = useAuthStore((s) => s.setGroupId);
  const groups = useGroupStore((s) => s.groups);
  const users = useGroupStore((s) => s.users);
  const joinGroup = useGroupStore((s) => s.joinGroup);
  const projects = useProjectStore((s) => s.projects);
  const coinTxs = useCoinStore((s) => s.coinTxs);
  const pushToast = useUIStore((s) => s.pushToast);

  const [pendingGroupId, setPendingGroupId] = useState('');
  const [joining, setJoining] = useState(false);

  const joinableGroups = useMemo(
    () => (classId ? groups.filter((g) => g.classId === classId) : groups),
    [groups, classId]
  );

  const handleJoinGroup = async () => {
    if (!userId || !pendingGroupId) {
      pushToast('请先选择要加入的研究小组', 'warning');
      return;
    }
    setJoining(true);
    try {
      await joinGroup(userId, pendingGroupId);
      setGroupId(pendingGroupId);
      const target = groups.find((g) => g.id === pendingGroupId);
      pushToast(`已成功加入小组「${target?.name || ''}」`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '加入失败，请稍后重试', 'error');
    } finally {
      setJoining(false);
    }
  };

  const myGroup = useMemo(
    () => (groupId ? groups.find((g) => g.id === groupId) : undefined),
    [groups, groupId]
  );

  // 组长置顶，其余按个人能量降序
  const members = useMemo(() => {
    if (!myGroup) return [];
    return users
      .filter((u) => u.groupId === myGroup.id)
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'leader' ? -1 : 1;
        return (b.personalCoins || 0) - (a.personalCoins || 0);
      });
  }, [users, myGroup]);

  // 每人「累计获得」= 该成员名下、**最近一次清零之后**的正向流水增量之和。两个要点：
  //   1) 只取正增量——标签是"获得"，把扣减的负数也算进去会显示成 -12 这种误导值；
  //   2) 尊重 source='reset' 标记（教师端「清零累计获得」写入的）——只统计该标记之后的流水，
  //      于是清零后归 0，而历史流水一条不删。
  // 口径见 lib/earnedCoins.ts（与教师端「学生名单」共用同一函数，避免两处走偏）
  const earnedByUser = useMemo(() => computeEarnedByUser(coinTxs), [coinTxs]);

  // 贡献占比：以个人能量占全组个人能量之和计算；全组为 0 时不显示（不编造百分比）
  const personalTotal = useMemo(
    () => members.reduce((s, m) => s + Math.max(0, m.personalCoins || 0), 0),
    [members]
  );

  // 同班级内按小组总能量排名
  const rank = useMemo(() => {
    if (!myGroup) return null;
    const peers = groups
      .filter((g) => g.classId === myGroup.classId)
      .sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
    const idx = peers.findIndex((g) => g.id === myGroup.id);
    return idx >= 0 ? { position: idx + 1, total: peers.length } : null;
  }, [groups, myGroup]);

  const projectCount = useMemo(
    () => (myGroup ? projects.filter((p) => p.ownerGroupId === myGroup.id).length : 0),
    [projects, myGroup]
  );

  const avgCoins = members.length ? Math.round((myGroup?.totalCoins || 0) / members.length) : 0;
  const myMember = useMemo(() => members.find((m) => m.id === userId), [members, userId]);
  const myContribution =
    myMember && personalTotal > 0
      ? Math.round((Math.max(0, myMember.personalCoins || 0) / personalTotal) * 100)
      : undefined;

  // ---- 未加入小组：提供本班小组自助加入或指引 ----
  if (!myGroup) {
    return (
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card p-10 md:p-12 rounded-[28px] text-center"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-mission-50 flex items-center justify-center">
            <UserPlus size={24} className="text-mission-500" />
          </div>
          <h1 className="mt-4 text-[22px] font-extrabold text-ink-900">{tx("你还没有加入研究小组")}</h1>
          <p className="mt-2 text-[13.5px] text-ink-500 max-w-md mx-auto leading-relaxed">
            {tx("研究小组是完成项目、参与挑战和获得能量币的单位。 你可以直接选择本班小组加入，或联系老师协助分配。")}</p>
          {joinableGroups.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 max-w-md mx-auto">
              <select
                value={pendingGroupId}
                onChange={(e) => setPendingGroupId(e.target.value)}
                aria-label={tx("选择要加入的研究小组")}
                className="text-xs py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              >
                <option value="">{tx("选择要加入的研究小组…")}</option>
                {joinableGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pendingGroupId || joining}
                onClick={() => void handleJoinGroup()}
                className="px-4 py-2.5 rounded-xl bg-mission-600 hover:bg-mission-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                {joining ? tx("加入中…") : tx("立即加入小组")}
              </button>
            </div>
          )}
        </motion.section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============ 小组信息 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
      >
        <div className="absolute -top-10 right-10 w-64 h-64 rounded-full bg-mission-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-20 w-80 h-80 rounded-full bg-energy-400/10 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="mission-label">
              <UsersRound size={12} />
              {tx("MY TEAM · 我的小组")}</span>
            {myContribution != null && (
              <span className="chip-energy">
                <Sparkles size={11} />
                {tx("我的贡献")}{myContribution}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: myGroup.logo || '#4F7CFF' }}
            >
              <UsersRound size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-[30px] md:text-[34px] font-extrabold text-ink-900 leading-[1.1] tracking-tight">
                {myGroup.name}
              </h1>
              <p className="mt-1 text-[13.5px] text-ink-500">
                {members.length} {tx("名成员")}{rank && <> {tx("· 本班")}{rank.total} {tx("个小组中排第")}{rank.position} {tx("位")}</>}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mt-6">
            <Stat icon={UsersRound} label={tx("小组成员")} value={`${members.length}`} unit="人" tint="mission" />
            <Stat icon={Zap} label={tx("小组总能量")} value={`${myGroup.totalCoins || 0}`} unit="⚡" tint="energy" />
            <Stat icon={TrendingUp} label={tx("人均能量")} value={`${avgCoins}`} unit="⚡" tint="growth" />
            <Stat
              icon={Trophy}
              label={tx("本班排名")}
              value={rank ? `${rank.position}` : '—'}
              unit={rank ? `/ ${rank.total}` : ''}
              tint="nova"
            />
            <Stat icon={FolderKanban} label={tx("本组项目")} value={`${projectCount}`} unit="个" tint="mission" />
          </div>
        </div>
      </motion.section>

      {/* ============ 成员名单 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="glass-card p-6 rounded-[28px]"
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-[17px] font-extrabold text-ink-900">{tx("小组成员")}</h2>
          <span className="text-[12px] text-ink-400 font-medium">{tx("按身份与个人能量排序")}</span>
        </div>

        {members.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-ink-400">
            {tx("暂时读不到成员名单，请刷新页面重试。")}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {members.map((m, idx) => {
              const isMe = m.id === userId;
              const earned = earnedByUser[m.id] || 0;
              const share =
                personalTotal > 0
                  ? Math.round((Math.max(0, m.personalCoins || 0) / personalTotal) * 100)
                  : null;

              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.12 + idx * 0.04 }}
                  className={
                    'rounded-2xl border p-4 transition-colors ' +
                    (isMe ? 'bg-mission-50/70 border-mission-100' : 'bg-white/60 border-ink-100/70')
                  }
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={m.avatar} onError={applyAvatarFallback}
                      alt={m.name}
                      className="w-11 h-11 rounded-xl ring-2 ring-white shadow-sm bg-white object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14.5px] font-extrabold text-ink-900 truncate">{m.name}</span>
                        {m.role === 'leader' && (
                          <span className="chip-nova !py-0 !px-1.5 !text-[9px]">
                            <Crown size={9} />
                            {tx("组长")}</span>
                        )}
                        {isMe && <span className="chip-mission !py-0 !px-1.5 !text-[9px]">{tx("我")}</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-400 font-medium">
                        {m.role === 'leader' ? tx("组长") : tx("组员")}
                      </div>
                    </div>
                  </div>

                  {/* 两个能量指标 */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-xl bg-white/70 border border-ink-100/70 px-3 py-2">
                      <div className="text-[10.5px] text-ink-400 font-medium">{tx("个人能量")}</div>
                      <div className="text-[16px] font-extrabold text-energy-600 flex items-baseline gap-1">
                        {m.personalCoins || 0}
                        <Zap size={11} className="text-energy-500 self-center" />
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/70 border border-ink-100/70 px-3 py-2">
                      <div className="text-[10.5px] text-ink-400 font-medium">{tx("累计获得")}</div>
                      <div className="text-[16px] font-extrabold text-mission-600 flex items-baseline gap-1">
                        {earned}
                        <Zap size={11} className="text-mission-500 self-center" />
                      </div>
                    </div>
                  </div>

                  {/* 贡献占比：仅在个人能量有意义时显示 */}
                  {share != null && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                        <span className="text-ink-500">{tx("个人能量占本组")}</span>
                        <span className="text-ink-700 tabular-nums">{share}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-ink-100/80 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-mission-500 to-nova-500"
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.section>
    </div>
  );
}

const TINTS = {
  mission: 'bg-mission-50 text-mission-600',
  energy: 'bg-energy-50 text-energy-600',
  nova: 'bg-nova-50 text-nova-600',
  growth: 'bg-growth-50 text-growth-600',
} as const;

function Stat({
  icon: Icon,
  label,
  value,
  unit,
  tint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  tint: keyof typeof TINTS;
}) {
  const { tx } = useLocale();
  return (
    <div className="rounded-2xl bg-white/70 border border-ink-100/70 p-3.5">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${TINTS[tint]}`}>
        <Icon size={15} />
      </div>
      <div className="mt-2.5 flex items-baseline gap-1">
        <span className="text-[22px] font-extrabold text-ink-900 leading-none">{value}</span>
        {unit && <span className="text-[11.5px] font-bold text-ink-400">{unit}</span>}
      </div>
      <div className="mt-1 text-[11.5px] text-ink-500 font-medium">{tx(label)}</div>
    </div>
  );
}
