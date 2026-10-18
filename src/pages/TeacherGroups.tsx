import TransferRequests from '@/components/coins/TransferRequests';
import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback } from '@/lib/imageFallback';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Users, Zap, Crown, Pencil, Trash2, Plus, Minus, RefreshCw, AlertTriangle, X, Trophy, Sparkles, GripVertical, CheckCircle2, Coins, UserPlus, Settings, Shield, UserMinus, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { useGroupStore } from '@/store/groupStore';
import { useCoinStore } from '@/store/coinStore';
import { windowState, formatCloseTime } from '@/lib/activityWindow';
import { adminGroupsApi, classesApi, usersApi } from '@/lib/apiService';
import { bootstrapFromApi } from '@/lib/bootstrap';
import { syncToApi } from '@/lib/syncQueue';
import { cn } from '@/lib/utils';
import { AWARD_REASONS, DEDUCT_REASONS } from '@/lib/coinReasons';
import AvatarStack from '@/components/ui/AvatarStack';
import type { User, SchoolClass } from '@/types';

type DialogKind = 'reset' | 'new' | 'coins' | 'rename' | 'members' | 'disband' | 'move' | null;

/**
 * 调币理由选择器：预设按钮 + 可自由填写。
 *
 * 预设是主力（老师一天要发很多次币，手打会跳过），输入框只是兜底。
 * 理由会写进流水并对学生可见，所以文案要就事论事。
 */
function ReasonPicker({
  mode,
  value,
  onChange,
}: {
  mode: 'add' | 'sub';
  value: string;
  onChange: (v: string) => void;
}) {
  const presets = mode === 'add' ? AWARD_REASONS : DEDUCT_REASONS;
  return (
    <div className="mb-5">
      <label className="text-[12px] font-bold text-ink-600 mb-1.5 flex items-baseline gap-1.5 flex-wrap">
        <span>{mode === 'add' ? '发放' : '扣除'}理由</span>
        <span className="font-normal text-ink-400">学生能在流水里看到</span>
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className={cn(
              'px-2.5 py-1.5 rounded-xl text-[12px] font-semibold transition border',
              value === r
                ? mode === 'add'
                  ? 'bg-gradient-to-br from-growth-400 to-growth-600 text-white border-transparent'
                  : 'bg-gradient-to-br from-danger-400 to-danger-600 text-white border-transparent'
                : 'bg-white/70 border-ink-200 text-ink-600 hover:border-mission-300'
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="也可以自己写一个理由"
        className="input w-full !text-[12.5px]"
      />
    </div>
  );
}

const FLEET_THEMES = [
  { color: '#4F7CFF', grad: 'from-mission-400 via-mission-500 to-mission-600' },
  { color: '#22C55E', grad: 'from-growth-400 via-growth-500 to-growth-600' },
  { color: '#FF8A34', grad: 'from-energy-400 via-energy-500 to-energy-600' },
  { color: '#8B5CF6', grad: 'from-nova-400 via-nova-500 to-nova-600' },
  { color: '#F59E0B', grad: 'from-alert-400 via-alert-500 to-energy-500' },
  { color: '#06B6D4', grad: 'from-cyan-400 via-cyan-500 to-mission-500' },
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

/** 开放窗口的"自动关闭"选项。value 为空＝不限时。 */
const WINDOW_MINUTE_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '2 小时', value: 120 },
  { label: '不限', value: null },
];

export default function TeacherGroups() {
  const groups = useGroupStore((s) => s.groups);
  const users = useGroupStore((s) => s.users);
  const classMeta = useGroupStore((s) => s.classMeta);
  const addGroup = useGroupStore((s) => s.addGroup);
  const renameGroup = useGroupStore((s) => s.renameGroup);
  const deleteGroup = useGroupStore((s) => s.deleteGroup);
  const setLeader = useGroupStore((s) => s.setLeader);
  const assignUserGroup = useGroupStore((s) => s.assignUserGroup);
  const updateGroupCoins = useGroupStore((s) => s.updateGroupCoins);
  const adjustUserCoins = useGroupStore((s) => s.adjustUserCoins);
  const resetAllGroupCoins = useGroupStore((s) => s.resetAllGroupCoins);
  const updateChallengeRates = useGroupStore((s) => s.updateChallengeRates);
  const updateActivityWindow = useGroupStore((s) => s.updateActivityWindow);
  const addTx = useCoinStore((s) => s.addTx);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [globalCoins, setGlobalCoins] = useState(classMeta.initialCoinsPerGroup || 500);
  // 挑战奖励单价。老师改完点保存才落库，所以本地先存一份草稿。
  const [rateEasy, setRateEasy] = useState(classMeta.coinEasy);
  const [rateMedium, setRateMedium] = useState(classMeta.coinMedium);
  const [rateHard, setRateHard] = useState(classMeta.coinHard);

  // 开放窗口。控件直接读 classMeta、改动立刻落库，**不做草稿**：
  // 草稿会在后端回填前用 localStorage 的旧值初始化，一按保存就把旧状态写回去
  // （实测踩过）；直接读就不会，也顺带避免了"没动过的那行被一起改掉"。
  // 到点自动关闭是惰性判定，页面得跟着走，否则老师开着页面会一直看到"开放中"。
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const win = windowState(classMeta, nowTick);

  /** 立刻落库某一行的设置，另一行原样回传——否则顺手会改到它。 */
  const applyWindow = (
    changed: 'challenge' | 'recruit',
    open: boolean,
    minutes: number | null
  ) => {
    const keepChallenge = classMeta.challengeWindowOpen !== false;
    const keepRecruit = classMeta.recruitWindowOpen !== false;
    const payload = {
      challengeOpen: keepChallenge,
      challengeMinutes: keepChallenge ? classMeta.challengeWindowMinutes ?? null : null,
      recruitOpen: keepRecruit,
      recruitMinutes: keepRecruit ? classMeta.recruitWindowMinutes ?? null : null,
    };
    if (changed === 'challenge') {
      payload.challengeOpen = open;
      payload.challengeMinutes = open ? minutes : null;
    } else {
      payload.recruitOpen = open;
      payload.recruitMinutes = open ? minutes : null;
    }
    updateActivityWindow(payload);
  };
  const [resetConfirmStep, setResetConfirmStep] = useState(0);
  const [renameInput, setRenameInput] = useState('');
  const [moveTargetClass, setMoveTargetClass] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [coinAmount, setCoinAmount] = useState(100);
  const [coinMode, setCoinMode] = useState<'add' | 'sub'>('add');
  const [coinReason, setCoinReason] = useState('');
  const [memberCoinTarget, setMemberCoinTarget] = useState<User | null>(null);
  const [memberCoinAmount, setMemberCoinAmount] = useState(20);
  const [memberCoinMode, setMemberCoinMode] = useState<'add' | 'sub'>('add');
  const [memberCoinReason, setMemberCoinReason] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const flashToast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 2400);
  };

  // 删除待分配学生。后端 DELETE /api/students/{id} 已存在（仅教师可用），
  // 这里只是补一个入口——此后端同时会删掉该生的能量流水记录，故需二次确认。
  const [deleteStudent, setDeleteStudent] = useState<{ id: string; name: string } | null>(null);
  const [deletingStudent, setDeletingStudent] = useState(false);

  const handleDeleteStudent = async () => {
    if (!deleteStudent) return;
    setDeletingStudent(true);
    try {
      await classesApi.deleteStudent(deleteStudent.id);
      const fresh = await usersApi.list();
      useGroupStore.setState({ users: fresh });
      flashToast(`🗑 已删除学生「${deleteStudent.name}」`);
      setDeleteStudent(null);
    } catch (err) {
      flashToast(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingStudent(false);
    }
  };

  const usersByGroup = useMemo(() => {
    const map: Record<string, User[]> = {};
    for (const u of users) {
      if (!u.groupId) continue;
      (map[u.groupId] ||= []).push(u);
    }
    return map;
  }, [users]);

  const unassigned = useMemo(() => users.filter((u) => !u.groupId), [users]);

  // 待分配学生按班级分组呈现
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  useEffect(() => {
    classesApi
      .list()
      .then(setClasses)
      .catch(() => {});
  }, []);

  const unassignedByClass = useMemo(() => {
    const buckets: { classId: string; className: string; students: User[] }[] = [];
    const idx: Record<string, number> = {};
    for (const u of unassigned) {
      const key = u.classId || 'unknown';
      if (!(key in idx)) {
        idx[key] = buckets.length;
        buckets.push({
          classId: key,
          className: u.classId ? classes.find((c) => c.id === u.classId)?.name || u.classId : '未归属班级',
          students: [],
        });
      }
      buckets[idx[key]].students.push(u);
    }
    return buckets;
  }, [unassigned, classes]);

  const rankedGroups = useMemo(
    () => [...groups].sort((a, b) => b.totalCoins - a.totalCoins),
    [groups]
  );

  // 按班级分组展示小组（组内按能量币排序）
  const groupsByClass = useMemo(() => {
    const buckets: { classId: string; className: string; groups: typeof groups }[] = [];
    const idx: Record<string, number> = {};
    for (const g of groups) {
      const key = g.classId || 'unknown';
      if (!(key in idx)) {
        idx[key] = buckets.length;
        buckets.push({
          classId: key,
          className: g.classId ? classes.find((c) => c.id === g.classId)?.name || g.classId : '未归属班级',
          groups: [],
        });
      }
      buckets[idx[key]].groups.push(g);
    }
    // 组内按能量币降序
    buckets.forEach((b) => b.groups.sort((a, b2) => b2.totalCoins - a.totalCoins));
    return buckets;
  }, [groups, classes]);

  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;
  const activeMembers = activeGroupId ? usersByGroup[activeGroupId] || [] : [];

  const themeFor = (id: string) => {
    const idx = rankedGroups.findIndex((g) => g.id === id);
    return FLEET_THEMES[(idx < 0 ? 0 : idx) % FLEET_THEMES.length];
  };

  const totalMembers = users.filter((u) => u.groupId).length;
  const energyPool = groups.reduce((s, g) => s + g.totalCoins, 0);

  // ----- actions -----
  const applyCoinChange = () => {
    if (!activeGroup) return;
    const reason = coinReason.trim();
    if (!reason) {
      flashToast('请先选一个发放/扣除理由（学生能看到）');
      return;
    }
    const delta = coinMode === 'add' ? coinAmount : -coinAmount;
    updateGroupCoins(activeGroup.id, delta, reason);
    flashToast(`${coinMode === 'add' ? '+' : '-'}${coinAmount} ⚡ → ${activeGroup.name}`);
    setDialog(null);
    setActiveGroupId(null);
    setCoinReason('');
  };

  /** 保存挑战奖励单价。学生创建挑战时按题目难度用这三个单价累加出奖励。 */
  const saveRates = () => {
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.floor(Number(n)) || 0));
    const rates = {
      coinEasy: clamp(rateEasy),
      coinMedium: clamp(rateMedium),
      coinHard: clamp(rateHard),
    };
    if (rates.coinEasy + rates.coinMedium + rates.coinHard === 0) {
      flashToast('三档单价不能全为 0，否则学生建不出挑战');
      return;
    }
    updateChallengeRates(rates);
    setRateEasy(rates.coinEasy);
    setRateMedium(rates.coinMedium);
    setRateHard(rates.coinHard);
    flashToast('挑战奖励单价已保存');
  };

  /** 把到期时间显示成本地 HH:MM（后端给的是无时区 UTC 串，交给 lib 统一解析）。 */
  const fmtClose = formatCloseTime;

  const confirmResetAll = () => {
    resetAllGroupCoins(globalCoins);
    flashToast(`✔ 全部 ${groups.length} 个小组能量币已重置为 ⚡ ${globalCoins}`);
    setResetConfirmStep(0);
    setDialog(null);
  };

  const toggleNewMember = (uid: string) => {
    setNewGroupMembers((m) => (m.includes(uid) ? m.filter((x) => x !== uid) : [...m, uid]));
  };

  const submitNewGroup = () => {
    if (!newGroupName.trim()) return;
    const beforeIds = new Set(groups.map((g) => g.id));
    addGroup(newGroupName.trim(), globalCoins);
    // addGroup 会在后端返回后用全量列表对齐 store，这里稍后找到新组再分配成员。
    const chosen = [...newGroupMembers];
    const name = newGroupName.trim();
    flashToast(`🚀 新小组「${name}」已创建`);
    setDialog(null);
    setNewGroupName('');
    setNewGroupMembers([]);
    if (chosen.length) {
      // 轮询等待新组出现（后端异步返回后 store 会刷新）
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        const created = useGroupStore
          .getState()
          .groups.find((g) => !beforeIds.has(g.id) && g.name === name);
        if (created) {
          chosen.forEach((uid, i) => assignUserGroup(uid, created.id, i === 0 ? 'leader' : 'member'));
          clearInterval(timer);
        } else if (tries > 40) {
          clearInterval(timer);
        }
      }, 150);
    }
  };

  const doRename = () => {
    if (!activeGroup || !renameInput.trim()) return;
    renameGroup(activeGroup.id, renameInput.trim());
    flashToast(`✔ 小组已更名为「${renameInput.trim()}」`);
    setDialog(null);
    setRenameInput('');
    setActiveGroupId(null);
  };

  const doDisband = () => {
    if (!activeGroup) return;
    const name = activeGroup.name;
    deleteGroup(activeGroup.id);
    flashToast(`💥 ${name} 已解散`);
    setDialog(null);
    setActiveGroupId(null);
  };

  const makeLeader = (uid: string) => {
    if (!activeGroupId) return;
    setLeader(activeGroupId, uid);
    const u = users.find((x) => x.id === uid);
    flashToast(`👑 ${u?.name || ''} 已设为组长`);
  };

  const removeMember = (uid: string) => {
    assignUserGroup(uid, null);
    const u = users.find((x) => x.id === uid);
    flashToast(`↩ ${u?.name || ''} 已移出小组`);
  };

  const addMemberToActive = (uid: string) => {
    if (!activeGroupId) return;
    assignUserGroup(uid, activeGroupId, 'member');
    const u = users.find((x) => x.id === uid);
    flashToast(`➕ ${u?.name || ''} 已加入 ${activeGroup?.name || ''}`);
  };

  const openMembers = (groupId: string) => {
    setActiveGroupId(groupId);
    setDialog('members');
  };

  const doMoveClass = async () => {
    if (!activeGroup || !moveTargetClass) return;
    try {
      await adminGroupsApi.moveClass(activeGroup.id, moveTargetClass);
      const targetName = classes.find((c) => c.id === moveTargetClass)?.name || moveTargetClass;
      flashToast(`✔ ${activeGroup.name} 已换到 ${targetName}`);
      setDialog(null);
      setMoveTargetClass('');
      setActiveGroupId(null);
      await bootstrapFromApi(true);
    } catch (err) {
      flashToast(err instanceof Error ? err.message : '换班失败');
    }
  };

  return (
    <>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
        >
          <div className="absolute -top-20 -right-10 w-96 h-96 rounded-full bg-nova-400/12 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-10 w-96 h-96 rounded-full bg-mission-400/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-wrap items-center gap-5">
            <div className="relative shrink-0">
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-mission-400/20 via-nova-400/15 to-energy-400/20 blur-lg" />
              <div className="relative w-[84px] h-[84px] rounded-[26px] bg-gradient-to-br from-mission-500 via-nova-500 to-energy-500 flex items-center justify-center shadow-glowMission">
                <Rocket size={38} className="text-white relative z-10" strokeWidth={2.2} />
                <Sparkles size={18} className="absolute top-3 right-3 text-white/80" strokeWidth={2.4} />
              </div>
            </div>
            <div className="flex-1 min-w-[260px]">
              <span className="mission-label">
                <GripVertical size={12} />
                FLEET MANAGEMENT · 小组编组 · SEASON 2026
              </span>
              <h1 className="mt-3 text-[30px] md:text-[36px] font-extrabold text-ink-900 leading-[1.1] tracking-tight">
                Fleet Management
                <span className="block text-gradient-mission mt-1">物理创新班 · 小组编组指挥台</span>
              </h1>
              <p className="mt-3 text-[14px] md:text-[15px] text-ink-500 leading-relaxed max-w-2xl">
                当前 <b className="text-ink-700">{groups.length} 个</b> 小组 ·{' '}
                <b className="text-ink-700">{totalMembers} 名</b> 已分组研究员 ·{' '}
                <b className="text-alert-600">{unassigned.length} 名</b> 待分配
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
              <FleetStat label="总小组" val={groups.length} unit="个" grad="from-mission-400 to-nova-500" icon={Rocket} />
              <FleetStat label="已分组" val={totalMembers} unit="人" grad="from-energy-400 to-alert-500" icon={Users} />
              <FleetStat label="能量池" val={energyPool} unit="⚡" grad="from-growth-400 to-mission-500" icon={Coins} />
            </div>
          </div>
        </motion.section>

        <TransferRequests teacher />

        {/* 挑战奖励单价 —— 定价权归教师，学生不能自填 */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.04 }}
          className="glass-card p-5 md:p-6 rounded-[22px]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-energy-400 to-alert-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Coins size={17} />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-ink-800">挑战奖励单价</h2>
              <p className="text-[12px] text-ink-500">
                学生创建挑战时，奖励按所选 10 道题各自的难度自动累加出来，不能自己填
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {([
              { label: '简单题', value: rateEasy, set: setRateEasy },
              { label: '中等题', value: rateMedium, set: setRateMedium },
              { label: '困难题', value: rateHard, set: setRateHard },
            ] as const).map((f) => (
              <label key={f.label} className="space-y-1">
                <span className="text-[12px] font-bold text-ink-600">{f.label}单价</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={f.value}
                    onChange={(e) => f.set(Number(e.target.value))}
                    className="input !w-24"
                  />
                  <span className="text-[12px] text-ink-400 whitespace-nowrap">⚡/题</span>
                </div>
              </label>
            ))}
            <button className="btn-growth !py-2.5 !px-5" onClick={saveRates}>
              保存单价
            </button>
            <span className="text-[12px] text-ink-500 pb-1">
              一组 10 题 reward 落在{' '}
              <b className="text-energy-600 tabular-nums">{rateEasy * 10}</b> ~{' '}
              <b className="text-energy-600 tabular-nums">{rateHard * 10}</b> ⚡ 之间
            </span>
          </div>
        </motion.section>

        {/* 开放窗口 —— 防学生在无人监督时反复刷币 */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="glass-card p-5 md:p-6 rounded-[22px]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Shield size={17} />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-ink-800">开放窗口</h2>
              <p className="text-[12px] text-ink-500">
                关闭后学生不能新建挑战、发布招募、投标或发起组间转账。
                <b className="text-ink-600">已经开着的挑战与招募照常作答、结算</b>，不会把押金卡住。
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {([
              { kind: 'challenge' as const, label: '挑战窗口', hint: '学生创建新挑战', flag: classMeta.challengeWindowOpen !== false, minutes: classMeta.challengeWindowMinutes ?? null, closesAt: classMeta.challengeWindowClosesAt },
              { kind: 'recruit' as const, label: '招募窗口', hint: '学生发布招募、投标', flag: classMeta.recruitWindowOpen !== false, minutes: classMeta.recruitWindowMinutes ?? null, closesAt: classMeta.recruitWindowClosesAt },
            ]).map((w) => {
              const live = win[w.kind];
              const at = fmtClose(w.closesAt);
              // 开关是开的却已不生效，只可能是到点自己关的——跟老师手动关掉要分开说
              const expired = w.flag && !live;
              return (
                <div key={w.kind} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/60 border border-ink-100">
                  <button
                    type="button"
                    onClick={() => applyWindow(w.kind, !live, w.minutes)}
                    aria-label={`${w.label}${live ? '已开放' : '已关闭'}`}
                    className={cn(
                      'relative w-12 h-6 rounded-full transition-colors shrink-0',
                      live ? 'bg-growth-500' : 'bg-ink-300'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                        live ? 'left-6' : 'left-0.5'
                      )}
                    />
                  </button>
                  <div className="min-w-[128px]">
                    <div className="text-[13px] font-bold text-ink-800">{w.label}</div>
                    <div className="text-[11px] text-ink-400">{w.hint}</div>
                  </div>
                  <label className="flex items-center gap-1.5">
                    <span className="text-[12px] text-ink-500">自动关闭</span>
                    <select
                      className="input !w-28 !py-1.5 text-[12px]"
                      value={String(w.minutes)}
                      onChange={(e) =>
                        applyWindow(w.kind, true, e.target.value === 'null' ? null : Number(e.target.value))
                      }
                      disabled={!live}
                    >
                      {WINDOW_MINUTE_OPTIONS.map((o) => (
                        <option key={o.label} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span
                    className={cn(
                      'text-[12px] font-semibold ml-auto',
                      live ? 'text-growth-600' : 'text-danger-600'
                    )}
                  >
                    {live
                      ? at
                        ? `开放中 · ${at} 自动关闭`
                        : '开放中 · 不限时'
                      : expired
                        ? '已到期 · 打开开关即可重新计时'
                        : '当前：已关闭'}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[12px] text-ink-500">
            开关和时长改完立刻生效，不需要保存。组间转账不单设开关：任一窗口开着时组长即可提交转账申请，老师审核通过后生效。
          </p>
        </motion.section>

        {/* 未分组学生 */}
        {unassigned.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="glass-card p-5 md:p-6 rounded-[22px] border-2 border-alert-200/60"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-alert-400 to-energy-500 flex items-center justify-center text-white shadow-md">
                <UserPlus size={17} />
              </div>
              <div>
                <h3 className="font-extrabold text-[16px] text-ink-800">待分配学生（{unassigned.length}）</h3>
                <p className="text-[12px] text-ink-500">注册但尚未加入小组的研究员，可直接分配到目标小组</p>
              </div>
            </div>
            <div className="space-y-4">
              {unassignedByClass.map((bucket) => (
                <div key={bucket.classId}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="chip-mission !py-0.5 !px-2.5 !text-[10.5px]">{bucket.className}</span>
                    <span className="text-[11px] font-semibold text-ink-400">{bucket.students.length} 人待分配</span>
                    <div className="flex-1 h-px bg-ink-100" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {bucket.students.map((u) => (
                      <div key={u.id} className="flex items-center gap-2.5 bg-white/70 border border-ink-100 rounded-2xl px-3 py-2">
                        <img src={u.avatar} onError={applyAvatarFallback} alt={u.name} className="w-9 h-9 rounded-xl border border-white shadow-sm bg-white object-cover" />
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-ink-800 truncate max-w-[110px]">{u.name}</div>
                          <div className="text-[10.5px] text-ink-400">⚡ {u.personalCoins}</div>
                        </div>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              assignUserGroup(u.id, e.target.value, 'member');
                              flashToast(`➕ ${u.name} 已分配到 ${groups.find((g) => g.id === e.target.value)?.name || ''}`);
                            }
                          }}
                          className="bg-mission-50/70 border border-mission-200 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-mission-700 focus:outline-none focus:ring-2 focus:ring-mission-400/30 cursor-pointer"
                        >
                          <option value="">分配到…</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setDeleteStudent({ id: u.id, name: u.name })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition shrink-0"
                          title="删除该学生"
                          aria-label={`删除学生 ${u.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* 工具栏 */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="glass-card p-4 md:p-5 rounded-[22px] flex flex-wrap items-center gap-3 md:gap-4"
        >
          <div className="flex items-center gap-2.5 bg-gradient-to-br from-energy-50 via-white to-mission-50 border border-energy-200/60 rounded-[16px] px-4 py-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-energy-400 to-energy-600 flex items-center justify-center text-white shadow-md shadow-energy-500/20 shrink-0">
              <Coins size={17} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10.5px] text-ink-400 font-semibold tracking-wide uppercase">全局初始能量币</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={globalCoins}
                  onChange={(e) => setGlobalCoins(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 bg-white border border-ink-200/80 focus:border-mission-400 rounded-xl px-3 py-1.5 text-[14px] font-bold text-ink-800 focus:outline-none focus:ring-2 focus:ring-mission-400/30 transition tabular-nums"
                />
                <span className="text-energy-600 font-bold text-[14px]">⚡</span>
              </div>
            </div>
          </div>

          <div className="h-10 w-px bg-ink-200/70 hidden md:block" />

          <button
            onClick={() => {
              setResetConfirmStep(0);
              setDialog('reset');
            }}
            className="btn-danger inline-flex items-center gap-2"
          >
            <RefreshCw size={15} />
            批量重置所有小组能量
          </button>

          <div className="h-10 w-px bg-ink-200/70 hidden md:block" />

          <button
            onClick={() => {
              setNewGroupName('');
              setNewGroupMembers([]);
              setDialog('new');
            }}
            className="btn-mission ml-auto inline-flex items-center gap-2"
          >
            <Plus size={15} />
            新建小组
          </button>
        </motion.section>

        {groups.length === 0 ? (
          <div className="glass-card p-10 rounded-[24px] text-center text-ink-500">
            <Rocket size={40} className="mx-auto text-ink-300 mb-3" />
            还没有任何小组，点击右上角「新建小组」开始编组。
          </div>
        ) : (
          <div className="space-y-10">
            {groupsByClass.map((bucket) => (
              <section key={bucket.classId}>
                <div className="glass-card flex items-center gap-3 mb-4 px-4 py-3 rounded-2xl">
                  <div className="w-1 h-7 rounded-full bg-gradient-to-b from-mission-400 to-mission-600 shrink-0" />
                  <h2 className="text-[18px] md:text-[19px] font-extrabold text-ink-900 tracking-tight">
                    {bucket.className}
                    <span className="ml-2 text-[12.5px] font-semibold text-ink-500">
                      {bucket.groups.length} 个小组
                    </span>
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-ink-200/70 to-transparent" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {bucket.groups.map((g, idx) => {
                    const members = usersByGroup[g.id] || [];
                    const leader = members.find((u) => u.role === 'leader') || members[0];
                    const theme = FLEET_THEMES[idx % FLEET_THEMES.length];
                    const maxCoins = Math.max(1, ...bucket.groups.map((x) => x.totalCoins));
              return (
                <motion.article
                  key={g.id}
                  initial={{ opacity: 0, y: 22, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.12 + idx * 0.05, type: 'spring', stiffness: 90 }}
                  className="glass-card glass-card-hover rounded-[24px] p-0 overflow-hidden relative"
                >
                  <div className={cn('h-3 w-full bg-gradient-to-r shadow-sm', theme.grad)} />
                  <div className={cn('absolute top-0 left-0 right-0 h-28 opacity-25 pointer-events-none bg-gradient-to-b', theme.grad, 'to-transparent blur-xl')} />
                  <div className="p-5 md:p-6 relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="relative w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center text-white text-[22px] font-extrabold shadow-lg"
                          style={{
                            background: `linear-gradient(135deg, ${theme.color} 0%, ${theme.color}dd 50%, ${theme.color}99 100%)`,
                            boxShadow: `0 8px 20px ${theme.color}35, 0 0 0 2px rgba(255,255,255,0.7) inset`,
                          }}
                        >
                          {g.name.slice(0, 2)}
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-md">
                            <Trophy size={10} style={{ color: theme.color }} />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-extrabold text-[17px] text-ink-800 truncate">{g.name}</h3>
                            <span className="chip-mission !py-0.5 !px-2 !text-[10px] shrink-0">
                              <Shield size={10} />
                              #{idx + 1}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Crown size={12} style={{ color: '#F59E0B' }} />
                              <b className="text-ink-700">{leader?.name || '—'}</b>
                            </span>
                            <span className="text-ink-300">·</span>
                            <span>{members.length} 名成员</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      {members.length ? (
                        <AvatarStack users={members} size={32} max={6} />
                      ) : (
                        <span className="text-[12px] text-ink-400">暂无成员，点击「成员管理」添加</span>
                      )}
                    </div>

                    <div className="flex items-end justify-between mb-5">
                      <div>
                        <div className="text-[11px] text-ink-400 font-semibold tracking-wider uppercase mb-1 flex items-center gap-1">
                          <Zap size={12} className="text-energy-500" />
                          当前能量储备
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[40px] font-black leading-none tabular-nums">
                            <span
                              className="bg-clip-text text-transparent"
                              style={{ backgroundImage: `linear-gradient(135deg, ${theme.color} 0%, #FF8A34 100%)` }}
                            >
                              <NumTicker val={g.totalCoins} />
                            </span>
                          </span>
                          <span className="text-energy-600 text-lg font-bold">⚡</span>
                        </div>
                        <div className="mt-1 text-[11px] text-ink-400">
                          平均 {Math.round(g.totalCoins / Math.max(1, members.length))}/人
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-2 rounded-full bg-ink-100/80 overflow-hidden mb-5">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r', theme.grad)}
                        style={{ width: `${Math.min(100, (g.totalCoins / maxCoins) * 100)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setRenameInput(g.name);
                          setDialog('rename');
                        }}
                        className="btn-ghost !py-2 !px-3 text-[12px] !rounded-xl"
                      >
                        <Pencil size={13} />
                        改名
                      </button>
                      <button
                        onClick={() => openMembers(g.id)}
                        className="btn-ghost !py-2 !px-3 text-[12px] !rounded-xl w-full"
                      >
                        <Users size={13} />
                        成员管理
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setDialog('disband');
                        }}
                        className="btn-danger-outline !py-2 !px-3 text-[12px] !rounded-xl"
                      >
                        <Trash2 size={13} />
                        解散小组
                      </button>
                      <button
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setCoinAmount(100);
                          setCoinMode('add');
                          setCoinReason('');
                          setDialog('coins');
                        }}
                        className="btn-energy !py-2 !px-3 text-[12px] !rounded-xl !gap-1.5"
                      >
                        <Coins size={13} />
                        ±能量币
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setActiveGroupId(g.id);
                        setMoveTargetClass('');
                        setDialog('move');
                      }}
                      className="btn-ghost !py-2 !px-3 text-[12px] !rounded-xl w-full mt-2"
                    >
                      <ArrowRightLeft size={13} />
                      换班
                    </button>
                  </div>
                </motion.article>
                  );
                })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] glass-card px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3"
            style={{ border: '1px solid rgba(79,124,255,0.25)', boxShadow: '0 18px 40px rgba(15,23,42,0.15)' }}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-growth-400 to-growth-600 flex items-center justify-center text-white shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <div className="font-semibold text-[13.5px] text-ink-700 max-w-[380px]">{toastMsg}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dialog && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink-900/55 backdrop-blur-md"
              onClick={() => setDialog(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              className="relative z-10 glass-card w-full max-w-[560px] rounded-[24px] p-6 md:p-7 shadow-2xl max-h-[85vh] overflow-y-auto scroll-thin"
              style={{ boxShadow: '0 30px 70px rgba(15,23,42,0.25)' }}
            >
              {dialog === 'reset' && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-danger-400 to-alert-500 flex items-center justify-center text-white shadow-lg shadow-danger-500/25 animate-pulse">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-[19px] text-ink-900">⚠ 确认重置全部小组能量？</h3>
                      <p className="text-[12.5px] text-ink-500">操作将把 {groups.length} 个小组全部重置为 ⚡ {globalCoins}</p>
                    </div>
                    <button onClick={() => setDialog(null)} className="ml-auto w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                      <X size={17} />
                    </button>
                  </div>
                  <div className="space-y-3 my-5">
                    {[
                      `我知道这将覆盖所有 ${groups.length} 个小组当前能量值`,
                      `每个小组将恢复为 ⚡ ${globalCoins}`,
                      '此操作会写入 teacher_set 流水日志，可事后审计',
                    ].map((label, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (resetConfirmStep === i) setResetConfirmStep(i + 1);
                        }}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border transition-all',
                          resetConfirmStep > i
                            ? 'bg-growth-50 border-growth-300 border-2 text-growth-800'
                            : resetConfirmStep === i
                              ? 'bg-mission-50 border-mission-400 border-2 text-mission-800 hover:bg-mission-100/60 cursor-pointer'
                              : 'bg-ink-50/50 border-ink-200 text-ink-400 border cursor-not-allowed opacity-60'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-[12px]',
                              resetConfirmStep > i ? 'bg-growth-500' : resetConfirmStep === i ? 'bg-mission-500' : 'bg-ink-300'
                            )}
                          >
                            {resetConfirmStep > i ? <CheckCircle2 size={14} /> : i + 1}
                          </div>
                          <span className="font-semibold text-[13px]">{label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-ghost flex-1" onClick={() => setDialog(null)}>
                      取消
                    </button>
                    <button
                      disabled={resetConfirmStep < 3}
                      onClick={confirmResetAll}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition-all py-3 px-5',
                        resetConfirmStep >= 3
                          ? 'bg-gradient-to-br from-danger-500 to-danger-700 text-white shadow-xl shadow-danger-500/30 hover:scale-[1.02]'
                          : 'bg-ink-100 text-ink-400 cursor-not-allowed'
                      )}
                    >
                      <RefreshCw size={16} className={resetConfirmStep >= 3 ? 'animate-spin' : ''} style={{ animationDuration: '1.4s' }} />
                      {resetConfirmStep >= 3 ? `确认重置全部 ${groups.length} 个` : '请完成上面 3 步确认'}
                    </button>
                  </div>
                </>
              )}

              {dialog === 'new' && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 via-nova-500 to-energy-500 flex items-center justify-center text-white shadow-glowMission">
                        <Rocket size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[19px] text-ink-900">🚀 新建小组</h3>
                        <p className="text-[12.5px] text-ink-500">填写组名，可选：从待分配学生中挑选成员（第一位为组长）</p>
                      </div>
                    </div>
                    <button onClick={() => setDialog(null)} className="w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                      <X size={17} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] font-bold text-ink-600 mb-1.5 flex items-center gap-1.5">
                        <Settings size={12} className="text-mission-500" /> 小组名称
                      </label>
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="例如：开普勒宇航队"
                        className="w-full bg-white/80 border border-ink-200 focus:border-mission-400 rounded-xl px-4 py-2.5 text-[14px] text-ink-800 focus:outline-none focus:ring-3 focus:ring-mission-400/25 transition placeholder:text-ink-300"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[12px] font-bold text-ink-600 flex items-center gap-1.5">
                          <UserPlus size={12} className="text-growth-500" /> 从待分配学生中选择成员（可选）
                        </label>
                        <span className="chip-mission !py-0.5 !px-2 !text-[10px]">{newGroupMembers.length} 人</span>
                      </div>
                      {unassigned.length === 0 ? (
                        <p className="text-[12px] text-ink-400 py-2">当前没有待分配学生，可先创建空组，稍后在「成员管理」中添加。</p>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 max-h-[240px] overflow-y-auto scroll-thin p-1">
                          {unassigned.map((u) => {
                            const selected = newGroupMembers.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                onClick={() => toggleNewMember(u.id)}
                                className={cn(
                                  'relative p-2.5 rounded-2xl border-2 transition-all text-center',
                                  selected
                                    ? 'bg-mission-50 border-mission-400 shadow-md shadow-mission-500/15 scale-[1.02]'
                                    : 'bg-white/60 border-ink-100 hover:border-mission-200 hover:bg-mission-50/40'
                                )}
                              >
                                <img src={u.avatar} onError={applyAvatarFallback} alt={u.name} className="w-10 h-10 mx-auto rounded-xl border-2 border-white shadow-sm object-cover" />
                                <div className="mt-1.5 text-[10.5px] font-bold text-ink-700 truncate leading-tight">{u.name}</div>
                                {selected && (
                                  <div className="absolute top-1 right-1 rounded-full bg-gradient-to-br from-mission-500 to-nova-500 flex items-center justify-center text-white shadow-md" style={{ width: 18, height: 18 }}>
                                    <CheckCircle2 size={11} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button className="btn-ghost flex-1" onClick={() => setDialog(null)}>
                      取消
                    </button>
                    <button
                      disabled={!newGroupName.trim()}
                      onClick={submitNewGroup}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition-all py-3 px-5',
                        newGroupName.trim()
                          ? 'bg-gradient-to-br from-mission-500 via-nova-500 to-energy-500 text-white shadow-xl shadow-mission-500/30 hover:scale-[1.02]'
                          : 'bg-ink-100 text-ink-400 cursor-not-allowed'
                      )}
                    >
                      <Sparkles size={16} />
                      创建小组
                    </button>
                  </div>
                </>
              )}

              {dialog === 'coins' && activeGroup && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${themeFor(activeGroup.id).color}, #FF8A34)` }}>
                        <Coins size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[19px] text-ink-900">⚡ 能量币调整</h3>
                        <p className="text-[12.5px] text-ink-500">
                          操作对象：<b className="text-ink-700">{activeGroup.name}</b> · 当前 <b className="text-energy-600">⚡ {activeGroup.totalCoins.toLocaleString()}</b>
                        </p>
                      </div>
                      <button onClick={() => setDialog(null)} className="ml-auto w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                        <X size={17} />
                      </button>
                    </div>
                  </div>

                  <div className="mb-5 grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => { setCoinMode('add'); setCoinReason(''); }}
                      className={cn(
                        'p-3.5 rounded-2xl border-2 font-bold transition-all flex items-center justify-center gap-2',
                        coinMode === 'add'
                          ? 'bg-gradient-to-br from-growth-50 to-growth-100/70 border-growth-400 text-growth-700 shadow-md shadow-growth-500/10'
                          : 'bg-white/50 border-ink-200 text-ink-500 hover:border-growth-200'
                      )}
                    >
                      <Plus size={17} />
                      增加能量
                    </button>
                    <button
                      onClick={() => { setCoinMode('sub'); setCoinReason(''); }}
                      className={cn(
                        'p-3.5 rounded-2xl border-2 font-bold transition-all flex items-center justify-center gap-2',
                        coinMode === 'sub'
                          ? 'bg-gradient-to-br from-danger-50 to-alert-50/60 border-danger-400 text-danger-700 shadow-md shadow-danger-500/10'
                          : 'bg-white/50 border-ink-200 text-ink-500 hover:border-danger-200'
                      )}
                    >
                      <Minus size={17} />
                      扣除能量
                    </button>
                  </div>

                  <div className="mb-5">
                    <div className="text-[12px] font-bold text-ink-600 mb-1.5 flex items-center justify-between">
                      <span>{coinMode === 'add' ? '增加' : '扣除'}数量 (⚡)</span>
                      {/* 可直接输入具体数字。滑杆是 1~500 的连续区间，一个像素约 2.6 个币，
                          拖不出精确的 1、7、35，精确值只能靠这里 */}
                      <span className="flex items-center gap-1">
                        <span className={cn('font-extrabold', coinMode === 'add' ? 'text-growth-700' : 'text-danger-700')}>
                          {coinMode === 'add' ? '+' : '-'}
                        </span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={coinAmount}
                          aria-label={coinMode === 'add' ? '增加数量' : '扣除数量'}
                          onChange={(e) =>
                            setCoinAmount(Math.max(1, Math.floor(Number(e.target.value)) || 1))
                          }
                          className="input !w-24 !py-1 text-right font-extrabold tabular-nums"
                        />
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      // 输入框允许超过 500，滑杆上限跟着放开，免得被夹到 500 和输入值对不上
                      max={Math.max(500, coinAmount)}
                      step={1}
                      value={coinAmount}
                      onChange={(e) => setCoinAmount(Number(e.target.value))}
                      className="w-full accent-mission-500 mb-2"
                    />
                    <div className="grid grid-cols-5 gap-2">
                      {[50, 100, 200, 300, 500].map((v) => (
                        <button
                          key={v}
                          onClick={() => setCoinAmount(v)}
                          className={cn(
                            'py-1.5 rounded-xl text-[12px] font-bold transition-all',
                            coinAmount === v
                              ? coinMode === 'add'
                                ? 'bg-gradient-to-br from-growth-400 to-growth-600 text-white shadow-sm'
                                : 'bg-gradient-to-br from-danger-400 to-danger-600 text-white shadow-sm'
                              : 'bg-ink-100/70 text-ink-500 hover:bg-mission-50'
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ReasonPicker mode={coinMode} value={coinReason} onChange={setCoinReason} />

                  <div className="mb-5 p-4 rounded-2xl border-2 border-ink-100 bg-ink-50/40">
                    <div className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider mb-1">操作后预览</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[36px] font-black tabular-nums text-ink-800">
                        {coinMode === 'add' ? activeGroup.totalCoins + coinAmount : Math.max(0, activeGroup.totalCoins - coinAmount)}
                      </span>
                      <span className="text-energy-600 text-xl font-bold">⚡</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button className="btn-ghost flex-1" onClick={() => setDialog(null)}>
                      取消
                    </button>
                    <button onClick={applyCoinChange} className={coinMode === 'add' ? 'btn-growth flex-1' : 'btn-danger flex-1'}>
                      {coinMode === 'add' ? <Plus size={15} /> : <Minus size={15} />}
                      确认 {coinMode === 'add' ? `+${coinAmount}` : `-${coinAmount}`} ⚡
                    </button>
                  </div>
                </>
              )}

              {dialog === 'rename' && activeGroup && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shadow-md">
                        <Pencil size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[19px] text-ink-900">✏ 重命名小组</h3>
                        <p className="text-[12.5px] text-ink-500">原名称：<b className="text-ink-700">{activeGroup.name}</b></p>
                      </div>
                      <button onClick={() => setDialog(null)} className="ml-auto w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="mb-5">
                    <input
                      autoFocus
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && doRename()}
                      className="w-full bg-white/80 border border-ink-200 focus:border-mission-400 rounded-xl px-4 py-3 text-[15px] font-semibold text-ink-800 focus:outline-none focus:ring-3 focus:ring-mission-400/25"
                      placeholder="输入新的小组名称…"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-ghost flex-1" onClick={() => setDialog(null)}>取消</button>
                    <button
                      disabled={!renameInput.trim()}
                      onClick={doRename}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition-all py-3 px-5',
                        renameInput.trim() ? 'btn-mission' : 'bg-ink-100 text-ink-400 cursor-not-allowed'
                      )}
                    >
                      <CheckCircle2 size={15} />
                      保存新名称
                    </button>
                  </div>
                </>
              )}

              {dialog === 'move' && activeGroup && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shadow-md">
                        <ArrowRightLeft size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[19px] text-ink-900">↔ 小组换班</h3>
                        <p className="text-[12.5px] text-ink-500">
                          把 <b className="text-ink-700">{activeGroup.name}</b> 移到其他班级
                        </p>
                      </div>
                      <button onClick={() => setDialog(null)} className="ml-auto w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="mb-5">
                    {classes.filter((c) => c.id !== activeGroup.classId).length === 0 ? (
                      <p className="text-[13px] text-ink-500">暂无其他班级可移动。</p>
                    ) : (
                      <select
                        value={moveTargetClass}
                        onChange={(e) => setMoveTargetClass(e.target.value)}
                        className="w-full bg-white/80 border border-ink-200 focus:border-mission-400 rounded-xl px-4 py-3 text-[15px] font-semibold text-ink-800 focus:outline-none focus:ring-3 focus:ring-mission-400/25"
                      >
                        <option value="">选择目标班级…</option>
                        {classes
                          .filter((c) => c.id !== activeGroup.classId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                    )}
                    <p className="mt-2 text-[12px] text-ink-400">
                      组内学生的班级归属会同步更新。
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-ghost flex-1" onClick={() => setDialog(null)}>取消</button>
                    <button
                      disabled={!moveTargetClass}
                      onClick={doMoveClass}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-2 font-bold rounded-2xl transition-all py-3 px-5',
                        moveTargetClass ? 'btn-mission' : 'bg-ink-100 text-ink-400 cursor-not-allowed'
                      )}
                    >
                      <CheckCircle2 size={15} />
                      确认换班
                    </button>
                  </div>
                </>
              )}

              {dialog === 'members' && activeGroup && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shadow-md">
                        <Users size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[19px] text-ink-900">成员管理 · {activeGroup.name}</h3>
                        <p className="text-[12.5px] text-ink-500">设组长、移出成员，或从待分配学生中加入</p>
                      </div>
                    </div>
                    <button onClick={() => setDialog(null)} className="w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                      <X size={17} />
                    </button>
                  </div>

                  <div className="mb-5">
                    <div className="text-[12px] font-bold text-ink-600 mb-2 flex items-center gap-1.5">
                      <Crown size={12} className="text-alert-500" /> 当前成员（{activeMembers.length}）
                    </div>
                    {activeMembers.length === 0 ? (
                      <p className="text-[12px] text-ink-400 py-2">该小组还没有成员。</p>
                    ) : (
                      <div className="space-y-2">
                        {activeMembers.map((u) => (
                          <div key={u.id} className="flex items-center gap-3 bg-white/70 border border-ink-100 rounded-2xl px-3 py-2">
                            <img src={u.avatar} onError={applyAvatarFallback} alt={u.name} className="w-9 h-9 rounded-xl border border-white shadow-sm object-cover" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-bold text-ink-800 truncate">{u.name}</span>
                                {u.role === 'leader' && <span className="chip-nova !py-0 !px-1.5 !text-[9px]">组长</span>}
                              </div>
                              <div className="text-[10.5px] text-ink-400">⚡ {u.personalCoins}</div>
                            </div>
                            <button
                              onClick={() => { setMemberCoinTarget(u); setMemberCoinMode('add'); setMemberCoinReason(''); }}
                              className="btn-ghost !py-1.5 !px-2.5 !text-[11px] !rounded-lg"
                              title="调整个人能量币"
                            >
                              <Coins size={12} /> 调币
                            </button>
                            {u.role !== 'leader' && (
                              <button
                                onClick={() => makeLeader(u.id)}
                                className="btn-ghost !py-1.5 !px-2.5 !text-[11px] !rounded-lg"
                                title="设为组长"
                              >
                                <Crown size={12} /> 设组长
                              </button>
                            )}
                            <button
                              onClick={() => removeMember(u.id)}
                              className="btn-danger-outline !py-1.5 !px-2.5 !text-[11px] !rounded-lg"
                              title="移出小组"
                            >
                              <UserMinus size={12} /> 移出
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[12px] font-bold text-ink-600 mb-2 flex items-center gap-1.5">
                      <UserPlus size={12} className="text-growth-500" /> 从待分配学生加入（{unassigned.length}）
                    </div>
                    {unassigned.length === 0 ? (
                      <p className="text-[12px] text-ink-400 py-2">没有待分配学生。</p>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 max-h-[200px] overflow-y-auto scroll-thin p-1">
                        {unassigned.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => addMemberToActive(u.id)}
                            className="relative p-2.5 rounded-2xl border-2 border-ink-100 bg-white/60 hover:border-growth-300 hover:bg-growth-50/40 transition-all text-center"
                          >
                            <img src={u.avatar} onError={applyAvatarFallback} alt={u.name} className="w-10 h-10 mx-auto rounded-xl border-2 border-white shadow-sm object-cover" />
                            <div className="mt-1.5 text-[10.5px] font-bold text-ink-700 truncate leading-tight">{u.name}</div>
                            <div className="absolute top-1 right-1 rounded-full bg-growth-500 flex items-center justify-center text-white shadow-md" style={{ width: 18, height: 18 }}>
                              <Plus size={11} />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button className="btn-mission flex-1" onClick={() => setDialog(null)}>
                      <CheckCircle2 size={15} />
                      完成
                    </button>
                  </div>
                </>
              )}

              {dialog === 'disband' && activeGroup && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-danger-500 to-danger-700 flex items-center justify-center text-white shadow-lg shadow-danger-500/25">
                        <Trash2 size={20} />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[19px] text-ink-900">💥 解散小组？</h3>
                        <p className="text-[12.5px] text-ink-500">
                          小组 <b className="text-danger-700">{activeGroup.name}</b> 及 {activeMembers.length} 名成员
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setDialog(null)} className="w-9 h-9 rounded-xl hover:bg-ink-100 flex items-center justify-center text-ink-400">
                      <X size={17} />
                    </button>
                  </div>
                  <div className="my-5 p-4 rounded-2xl bg-danger-50/60 border-2 border-danger-200/70">
                    <div className="flex gap-2 text-[13px] text-danger-800 font-semibold items-start">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5 text-danger-600" />
                      <div>
                        解散不可逆：
                        <ul className="mt-1.5 ml-5 list-disc text-[12px] text-danger-700 font-medium space-y-0.5">
                          <li>该小组的所有成员将一并从系统中删除</li>
                          <li>当前 ⚡ {activeGroup.totalCoins.toLocaleString()} 能量币记录将随小组删除</li>
                        </ul>
                        <p className="mt-2 text-[11.5px] text-danger-600">
                          如只想保留学生，请先在「成员管理」中把成员移出，再解散空组。
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-ghost flex-1" onClick={() => setDialog(null)}>
                      取消
                    </button>
                    <button onClick={doDisband} className="btn-danger flex-1">
                      <Trash2 size={15} />
                      确认解散 {activeGroup.name}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 删除待分配学生（不可恢复，二次确认） */}
      {deleteStudent && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setDeleteStudent(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-danger-400 to-alert-500 flex items-center justify-center text-white"><AlertTriangle size={20} /></div>
              <div>
                <h3 className="font-extrabold text-[17px] text-ink-900">删除学生</h3>
                <p className="text-[12px] text-ink-500">{deleteStudent.name}</p>
              </div>
              <button onClick={() => setDeleteStudent(null)} className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400"><X size={16} /></button>
            </div>
            <p className="text-[12.5px] text-ink-600 leading-relaxed mb-5">
              将删除该学生账号，<b className="text-danger-600">并连带删除其能量币流水记录</b>，删除后不可恢复。
              若只是想让他换组，请改用「分配到…」。
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteStudent(null)}>取消</button>
              <button
                className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-danger-400 to-danger-600 disabled:opacity-60"
                onClick={handleDeleteStudent}
                disabled={deletingStudent}
              >
                {deletingStudent ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 调整个人能量币 */}
      {memberCoinTarget && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setMemberCoinTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white"><Coins size={20} /></div>
              <div>
                <h3 className="font-extrabold text-[17px] text-ink-900">⚡ 调整个人能量币</h3>
                <p className="text-[12px] text-ink-500">
                  {memberCoinTarget.name} · 当前 <b className="text-energy-600">⚡ {memberCoinTarget.personalCoins}</b>
                </p>
              </div>
              <button onClick={() => setMemberCoinTarget(null)} className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <button onClick={() => { setMemberCoinMode('add'); setMemberCoinReason(''); }} className={cn('p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-1.5', memberCoinMode === 'add' ? 'bg-growth-50 border-growth-400 text-growth-700' : 'bg-white/50 border-ink-200 text-ink-500')}><Plus size={15} />增加</button>
              <button onClick={() => { setMemberCoinMode('sub'); setMemberCoinReason(''); }} className={cn('p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-1.5', memberCoinMode === 'sub' ? 'bg-danger-50 border-danger-400 text-danger-700' : 'bg-white/50 border-ink-200 text-ink-500')}><Minus size={15} />扣除</button>
            </div>
            <label className="text-[12px] font-bold text-ink-600 mb-1.5 flex items-center justify-between">
              <span>{memberCoinMode === 'add' ? '增加' : '扣除'}数量 (⚡)</span>
              <span className={cn('font-extrabold tabular-nums', memberCoinMode === 'add' ? 'text-growth-700' : 'text-danger-700')}>{memberCoinMode === 'add' ? '+' : '-'}{memberCoinAmount}</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              className="input w-full mb-5"
              value={memberCoinAmount}
              aria-label={memberCoinMode === 'add' ? '增加数量' : '扣除数量'}
              // 必须取整：输入 3.5 而 delta 是整数字段，原样发出去会被后端 422 拒掉
              onChange={(e) => setMemberCoinAmount(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
            />

            <ReasonPicker mode={memberCoinMode} value={memberCoinReason} onChange={setMemberCoinReason} />

            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setMemberCoinTarget(null)}>取消</button>
              <button
                className={cn('flex-1 py-2.5 rounded-xl font-semibold text-white', memberCoinMode === 'add' ? 'bg-gradient-to-br from-growth-400 to-growth-600' : 'bg-gradient-to-br from-danger-400 to-danger-600')}
                onClick={() => {
                  const reason = memberCoinReason.trim();
                  if (!reason) {
                    flashToast('请先选一个发放/扣除理由（学生能看到）');
                    return;
                  }
                  const delta = memberCoinMode === 'add' ? memberCoinAmount : -memberCoinAmount;
                  adjustUserCoins(memberCoinTarget.id, delta, reason);
                  flashToast(`${memberCoinMode === 'add' ? '+' : '-'}${memberCoinAmount} ⚡ → ${memberCoinTarget.name}（个人）`);
                  setMemberCoinTarget(null);
                  setMemberCoinReason('');
                }}
              >
                确认{memberCoinMode === 'add' ? '增加' : '扣除'}
              </button>
            </div>

            {/* 清零累计获得：写入一条 source='reset' 的标记流水，不删历史、不动个人能量 */}
            <div className="mt-4 pt-4 border-t border-ink-100">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-ink-700">清零累计获得</div>
                  <div className="text-[11px] text-ink-400 leading-relaxed mt-0.5">
                    只把「累计获得」归零，历史流水与个人能量都不受影响
                  </div>
                </div>
                <button
                  className="shrink-0 px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-ink-600 bg-ink-100 hover:bg-ink-200/70 transition-colors flex items-center gap-1.5"
                  onClick={() => {
                    const target = memberCoinTarget;
                    if (!target.groupId) {
                      flashToast('该学生尚未加入小组，无法清零');
                      return;
                    }
                    addTx(
                      target.groupId,
                      { source: 'reset', refId: `reset-${Date.now()}`, delta: 0, note: `清零「${target.name}」累计获得` },
                      target.id
                    );
                    syncToApi(() => usersApi.resetEarned(target.id), 'users.resetEarned');
                    flashToast(`已清零 ${target.name} 的累计获得`);
                    setMemberCoinTarget(null);
                  }}
                >
                  <RotateCcw size={13} />
                  清零
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FleetStat({ label, val, unit, grad, icon: Icon }: { label: string; val: number; unit: string; grad: string; icon: LucideIcon }) {
  const v = useTicker(val, 1000);
  return (
    <div className="glass-card !shadow-none !border-mission-100/50 px-4 py-3 rounded-2xl min-w-0 sm:min-w-[130px]">
      <div className="flex items-center gap-2.5">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br', grad)}>
          <Icon size={16} />
        </div>
        <div>
          <div className="text-[10px] text-ink-400 font-semibold uppercase tracking-wider leading-none">{label}</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-[22px] font-black text-ink-800 tabular-nums leading-none">{v}</span>
            <span className="text-[11px] text-ink-500 font-bold">{unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumTicker({ val }: { val: number }) {
  const v = useTicker(val, 1200);
  return <span className="tabular-nums">{v.toLocaleString()}</span>;
}
