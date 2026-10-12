import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Search, Clock, Zap, Users, TrendingDown, TrendingUp, CheckCircle2, XCircle, Award, Send, Megaphone, SlidersHorizontal, Home, Globe } from 'lucide-react';
import AvatarStack from '@/components/ui/AvatarStack';
import RecruitDialog from '@/components/ui/RecruitDialog';
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useUIStore } from '@/store/uiStore';
import type { User, Recruitment } from '@/types';
import { cn } from '@/lib/utils';
import { windowState, windowClosedMessage } from '@/lib/activityWindow';

type SortKey = 'reward' | 'deadline';



interface BidState {
  status: 'bidding' | 'won' | 'done' | 'rejected';
  result?: 'success' | 'partial' | 'fail';
  pay?: number;
  progress: number;
}


function formatDeadline(ts: number) {
  const diff = ts - Date.now();
  const hours = Math.max(0, Math.floor(diff / 3600000));
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  if (days >= 1) return `${days}天${h}小时`;
  const mins = Math.max(0, Math.floor((diff % 3600000) / 60000));
  return `${h}小时${mins}分`;
}

function deadlineIsUrgent(ts: number) {
  return ts - Date.now() < 3 * 86400000;
}

function useTicker(target: number, duration = 800) {
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

export default function ResearchMarketplace() {
  const { groups, users } = useGroupStore();
  const { groupId: currentGroupId, userId, role } = useAuthStore();
  const { recruitments, projects, placeBid } = useProjectStore();
  const pushToast = useUIStore((s) => s.pushToast);
  const myGroupProject = useMemo(() => projects.find((p) => p.ownerGroupId === currentGroupId), [projects, currentGroupId]);
  const isLeader = role === 'teacher' || role === 'admin' || (currentGroupId ? users.find((u) => u.id === userId)?.role === 'leader' : false);
  const [recruitOpen, setRecruitOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('reward');

  // 我的发布 = 本组项目发布的招募
  const myPosted = useMemo(
    () =>
      recruitments
        .filter((r) => projects.find((p) => p.id === r.projectId)?.ownerGroupId === currentGroupId)
        .map((r) => ({ id: r.id, title: r.title, bids: r.bids?.length || 0, deadline: new Date(r.deadline instanceof Date ? r.deadline : r.deadline).getTime(), reward: r.reward, status: r.status })),
    [recruitments, projects, currentGroupId]
  );

  // 我的投标 = 我投过的招募
  const myBids = useMemo(
    () =>
      recruitments
        .filter((r) => r.bids?.some((b) => b.userId === userId))
        .map((r) => {
          const myBid = r.bids?.find((b) => b.userId === userId);
          const project = projects.find((p) => p.id === r.projectId);
          const status = r.status === 'done' ? 'done' : r.status === 'assigned' && r.assigneeUserId === userId ? ('won' as const) : ('bidding' as const);
          const progress = r.status === 'done' ? 100 : r.status === 'assigned' ? 60 : 10;
          return {
            recId: r.id,
            projectName: project?.title || '',
            role: myBid?.skillDesc || '投标',
            reward: r.reward,
            status,
            progress,
            result: r.result,
            pay: r.actualPay,
          };
        }),
    [recruitments, projects, userId]
  );

  // 项目 ID → 所属小组 ID 映射
  const projectGroupMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.ownerGroupId));
    return m;
  }, [projects]);

  // 项目 ID → 项目标题 映射
  const projectTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.title));
    return m;
  }, [projects]);

  // 将真实招募数据组装为展示用对象
  interface RecDisplay {
    rec: Recruitment;
    projectName: string;
    ownerGroupId: string;
  }
  const allRec: RecDisplay[] = useMemo(() => {
    return recruitments.map((rec) => {
      const ownerGroupId = projectGroupMap.get(rec.projectId) || '';
      const projectName = projectTitleMap.get(rec.projectId) || '未知项目';
      return { rec, projectName, ownerGroupId };
    });
  }, [recruitments, projectGroupMap, projectTitleMap]);

  const toggleSkill = (sid: string) => {
    setActiveSkills((prev) =>
      prev.includes(sid) ? prev.filter((s) => s !== sid) : [...prev, sid]
    );
  };

  // 收集所有出现过的技能标签
  const allSkillTags = useMemo(() => {
    const set = new Set<string>();
    allRec.forEach((r) => r.rec.skills.forEach((s) => set.add(s)));
    return Array.from(set);
  }, [allRec]);

  const applyFilterSort = (list: RecDisplay[]) => {
    let result = list.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.projectName.toLowerCase().includes(q) &&
          !r.rec.title.toLowerCase().includes(q) &&
          !r.rec.description.toLowerCase().includes(q)
        )
          return false;
      }
      if (activeSkills.length > 0 && !activeSkills.some((s) => r.rec.skills.includes(s)))
        return false;
      return true;
    });
    if (sort === 'reward') result = [...result].sort((a, b) => b.rec.reward - a.rec.reward);
    else result = [...result].sort((a, b) => +new Date(a.rec.deadline) - +new Date(b.rec.deadline));
    return result;
  };

  // 分类：本组任务 vs 其他组任务
  const { myGroupRecs, otherGroupRecs } = useMemo(() => {
    const mine: RecDisplay[] = [];
    const others: RecDisplay[] = [];
    allRec.forEach((r) => {
      if (currentGroupId && r.ownerGroupId === currentGroupId) mine.push(r);
      else others.push(r);
    });
    return {
      myGroupRecs: applyFilterSort(mine),
      otherGroupRecs: applyFilterSort(others),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRec, search, activeSkills, sort, currentGroupId]);

  const groupUsersById = (gid: string) => users.filter((u) => u.groupId === gid);
  const usersByIdMap = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  // 当前学生所属组名
  const myGroupName = useMemo(() => {
    if (!currentGroupId) return null;
    return groups.find((g) => g.id === currentGroupId)?.name || null;
  }, [groups, currentGroupId]);

  return (
    <>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="student-market-intro glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
        >
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-mission-400/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-20 w-80 h-80 rounded-full bg-nova-400/10 blur-3xl pointer-events-none" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            <div className="min-w-0 lg:col-span-5">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-mission-400 via-mission-500 to-nova-500 flex items-center justify-center shadow-glowMission">
                    <Briefcase size={28} className="text-white" />
                  </div>
                  <div className="absolute -inset-1 rounded-2xl bg-mission-400/20 blur-lg -z-10 animate-pulse" />
                </div>
                <div>
                  <span className="mission-label">RECRUITMENT · OPEN CALL</span>
                  <h1 className="mt-3 text-[26px] md:text-[30px] font-extrabold text-ink-900 leading-tight tracking-tight">
                    人才招募大厅
                  </h1>
                  <p className="mt-2 text-base font-semibold text-mission-700">找到你的任务 · 贡献你的才华</p>
                  <p className="mt-3 text-[14px] text-ink-500 leading-relaxed max-w-md">
                    跨组协作市场：用你的专业技能为其他小组解决难题，赢取能量币 ⚡ 奖励与全基地认可。
                  </p>
                </div>
              </div>
            </div>
            <div className="min-w-0 lg:col-span-7 space-y-4">
              <div className="glass-card !shadow-none p-2.5 rounded-2xl border-mission-100/80 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="hidden sm:block pl-3">
                  <Search size={18} className="text-ink-400" />
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索项目名、角色名…"
                  className="w-full min-w-0 flex-1 bg-transparent outline-none py-2 px-2 sm:px-0 text-[14px] text-ink-800 placeholder:text-ink-400"
                />
                <div className="hidden sm:block h-7 w-px bg-ink-200/60 mx-1" />
                <div className="flex items-center gap-2 px-2 sm:pr-1 w-full sm:w-auto border-t border-ink-100 sm:border-0 pt-2 sm:pt-0">
                  <SlidersHorizontal size={16} className="text-ink-400" />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="bg-transparent outline-none text-[13px] font-semibold text-ink-700 cursor-pointer pr-6"
                  >
                    <option value="reward">酬劳 高 → 低</option>
                    <option value="deadline">截止 近 → 远</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {allSkillTags.map((label) => {
                  const active = activeSkills.includes(label);
                  return (
                    <button
                      key={label}
                      onClick={() => toggleSkill(label)}
                      className={cn(
                        'tag-pill',
                        active
                          ? 'bg-gradient-to-r from-mission-500 to-mission-600 border-mission-500 border text-white active'
                          : 'bg-mission-50/70 border-mission-200/60 text-mission-700'
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-9 space-y-6">
            <div className="flex items-center justify-between">
              <div className="student-market-sort flex items-center gap-2 text-[12px] text-ink-500">
                <TrendingDown size={14} className="text-energy-500" />
                按{sort === 'reward' ? '酬劳' : '截止时间'}排序 · 共 {myGroupRecs.length + otherGroupRecs.length} 个可投
              </div>
            </div>

            {/* ===== 分类一：所属项目组任务 ===== */}
            <section>
              <div className="student-market-section-heading flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400 to-mission-600 flex items-center justify-center text-white shadow-lg shadow-mission-500/20">
                  <Home size={18} />
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-ink-800">
                    所属项目组任务
                    {myGroupName && <span className="text-mission-600 ml-2">· {myGroupName}</span>}
                  </h2>
                  <p className="text-[11px] text-ink-400">本组发布的需求，组内成员可直接认领</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="chip-mission">{myGroupRecs.length} 个</span>
                  {isLeader && myGroupProject && (
                    <button className="btn-energy !py-1.5 !px-3 text-[12px] flex items-center gap-1.5" onClick={() => setRecruitOpen(true)}>
                      <Megaphone size={13} />发布任务招募
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {myGroupRecs.map((r, idx) => (
                  <RecCard key={r.rec.id} r={r} idx={idx} groups={groups} usersByIdMap={usersByIdMap} groupUsersById={groupUsersById} pushToast={pushToast} userId={userId} placeBid={placeBid} />
                ))}
                {myGroupRecs.length === 0 && (
                  <div className="col-span-full glass-card p-10 text-center rounded-2xl">
                    <Home size={36} className="mx-auto text-ink-300 mb-3" />
                    <p className="text-ink-500 text-[14px]">本组暂无招募任务</p>
                  </div>
                )}
              </div>
            </section>

            {/* ===== 分类二：其他组任务 ===== */}
            <section>
              <div className="student-market-section-heading flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nova-400 to-nova-600 flex items-center justify-center text-white shadow-lg shadow-nova-500/20">
                  <Globe size={18} />
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-ink-800">其他组任务</h2>
                  <p className="text-[11px] text-ink-400">跨组协作，用你的技能赢取能量币 ⚡</p>
                </div>
                <span className="chip-nova ml-auto">{otherGroupRecs.length} 个</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {otherGroupRecs.map((r, idx) => (
                  <RecCard key={r.rec.id} r={r} idx={idx} groups={groups} usersByIdMap={usersByIdMap} groupUsersById={groupUsersById} pushToast={pushToast} userId={userId} placeBid={placeBid} />
                ))}
                {otherGroupRecs.length === 0 && (
                  <div className="col-span-full glass-card p-10 text-center rounded-2xl">
                    <Globe size={36} className="mx-auto text-ink-300 mb-3" />
                    <p className="text-ink-500 text-[14px]">暂无其他组任务</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="col-span-12 lg:col-span-3 space-y-5">
            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="glass-card p-5 rounded-2xl"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nova-400 to-nova-600 flex items-center justify-center text-white shadow-lg shadow-nova-500/20">
                  <Award size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink-800 text-[15px]">我的投标</h3>
                  <p className="text-[11px] text-ink-400">我的投标记录</p>
                </div>
              </div>
              <div className="space-y-3">
                {myBids.map((b) => {
                  const statusCfg: Record<BidState['status'], { label: string; chip: string; icon: LucideIcon }> = {
                    bidding: { label: '竞标中', chip: 'chip-mission', icon: TrendingUp },
                    won: { label: '已中标', chip: 'chip-growth', icon: CheckCircle2 },
                    done: { label: '已完成', chip: 'chip-nova', icon: Award },
                    rejected: { label: '未通过', chip: 'chip-danger', icon: XCircle },
                  };
                  const sc = statusCfg[b.status];
                  const Icon = sc.icon;
                  const resultLabel =
                    b.result === 'success'
                      ? { text: '成功 +全额', chip: 'chip-success', pay: b.pay }
                      : b.result === 'partial'
                        ? { text: '部分 50%', chip: 'chip-alert', pay: Math.floor((b.reward * 50) / 100) }
                        : b.result === 'fail'
                          ? { text: '失败 +0', chip: 'chip-danger', pay: 0 }
                          : null;
                  return (
                    <div
                      key={b.recId}
                      className="p-3.5 rounded-xl bg-gradient-to-br from-ink-50/80 to-white/50 border border-ink-100/80"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[13px] text-ink-800 truncate">{b.projectName}</div>
                          <div className="text-[11px] text-ink-400 mt-0.5">{b.role}</div>
                        </div>
                        <span className={cn(sc.chip, 'shrink-0 !py-0.5 !px-2 !text-[10px]')}>
                          <Icon size={10} />
                          {sc.label}
                        </span>
                      </div>
                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] text-ink-400 mb-1 font-medium">
                          <span>进度</span>
                          <span>{b.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              b.status === 'done'
                                ? 'bg-gradient-to-r from-growth-400 to-growth-500'
                                : b.status === 'won'
                                  ? 'bg-gradient-to-r from-mission-400 to-nova-500'
                                  : 'bg-gradient-to-r from-alert-400 to-energy-500'
                            )}
                            style={{ width: `${b.progress}%` }}
                          />
                        </div>
                      </div>
                      {resultLabel && (
                        <div className="flex items-center justify-between pt-2 border-t border-ink-100/80">
                          <span className={cn(resultLabel.chip, '!py-0.5 !px-2 !text-[10px]')}>
                            裁决：{resultLabel.text}
                          </span>
                          <span className="text-[12px] font-bold text-gradient-energy tabular-nums">
                            +{resultLabel.pay}⚡
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.2 }}
              className="glass-card p-5 rounded-2xl"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-energy-400 to-alert-500 flex items-center justify-center text-white shadow-lg shadow-energy-500/20">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink-800 text-[15px]">我的发布</h3>
                  <p className="text-[11px] text-ink-400">等待裁决中标者</p>
                </div>
              </div>
              <div className="space-y-3">
                {myPosted.map((p) => {
                  const urgent = deadlineIsUrgent(p.deadline);
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl bg-gradient-to-br from-energy-50/60 to-mission-50/40 border border-energy-100/50"
                    >
                      <div className="font-semibold text-[13px] text-ink-800 leading-snug mb-2">{p.title}</div>
                      <div className="flex items-center justify-between text-[11px] text-ink-500 mb-3">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Users size={11} /> {p.bids} 投标
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap size={11} className="text-energy-500" /> {p.reward}
                          </span>
                        </div>
                        <span className={urgent ? 'text-danger-600 font-semibold' : ''}>
                          {formatDeadline(p.deadline)}
                        </span>
                      </div>
                      <button className="btn-mission w-full !py-2 !px-3 text-[12px]" onClick={() => pushToast(`已进入裁决流程 · ${p.title} · 请查看投标列表并选择中标者 🏆`, 'info')}>
                        裁决中标者
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          </div>
        </div>
      </div>

      <RecruitDialog open={recruitOpen} onClose={() => setRecruitOpen(false)} projectId={myGroupProject?.id || ''} projectTitle={myGroupProject?.title || ''} />
    </>
  );
}

function RewardTicker({ reward }: { reward: number }) {
  const val = useTicker(reward);
  return (
    <span className="ticker ticker-anim text-[28px] font-extrabold text-gradient-energy leading-none">
      {val}
    </span>
  );
}

interface RecCardProps {
  r: { rec: Recruitment; projectName: string; ownerGroupId: string };
  idx: number;
  groups: { id: string; name: string }[];
  usersByIdMap: Map<string, User>;
  groupUsersById: (gid: string) => User[];
  pushToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  userId: string | null;
  placeBid: (recruitmentId: string, bid: { userId: string; skillDesc: string; hours: number }) => void;
}

function RecCard({ r, idx, groups, usersByIdMap, groupUsersById, pushToast, userId, placeBid }: RecCardProps) {
  const { rec, projectName, ownerGroupId } = r;
  const g = groups.find((x) => x.id === ownerGroupId);
  const members = groupUsersById(ownerGroupId);
  const bidders = (rec.bids || [])
    .map((b) => usersByIdMap.get(b.userId))
    .filter(Boolean) as User[];
  const deadlineTs = +new Date(rec.deadline);
  const urgent = deadlineIsUrgent(deadlineTs);
  // 招募窗口关闭时不能接新活（已中标的那条仍可在通讯页结算）
  const recruitOpen = useGroupStore((s) => windowState(s.classMeta).recruit);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.05 }}
      className="glass-card glass-card-hover p-5 rounded-2xl flex flex-col"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[15px] text-ink-800 leading-snug truncate">{rec.title}</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <AvatarStack users={members} max={3} size={24} />
            <span className="text-[12px] text-ink-500 truncate">{projectName} · {g?.name}</span>
          </div>
        </div>
        <span className={cn('shrink-0 chip', urgent ? 'chip-danger' : 'chip-growth')}>
          <Clock size={11} />
          {formatDeadline(deadlineTs)}
        </span>
      </div>

      {rec.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {rec.skills.map((s) => (
            <span key={s} className="chip-mission !py-0.5 !px-2 !text-[11px]">{s}</span>
          ))}
        </div>
      )}
      <p className="text-[13px] text-ink-600 leading-relaxed mb-4 line-clamp-3 flex-1">
        {rec.description}
      </p>

      <div className="pt-4 border-t border-ink-100/70 mt-auto">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <Zap size={18} className="text-energy-500 fill-energy-400/40" />
              <RewardTicker reward={rec.reward} />
              <span className="text-[11px] text-ink-400 font-semibold ml-1">⚡</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">能量币奖励</div>
          </div>
          <div className="flex items-center gap-2">
            <AvatarStack users={bidders} max={3} size={24} />
            <span className="text-[12px] text-ink-500 font-semibold">+{rec.bids?.length || 0}</span>
          </div>
        </div>
        <button
          className="btn-mission w-full !py-2.5 !px-3 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!recruitOpen}
          onClick={() => {
            const bidUserId = userId;
            if (!bidUserId) {
              pushToast('请先登录后再投标', 'warning');
              return;
            }
            if (!windowState(useGroupStore.getState().classMeta).recruit) {
              pushToast(windowClosedMessage('recruit'), 'warning');
              return;
            }
            placeBid(rec.id, { userId: bidUserId, skillDesc: '', hours: 1 });
            pushToast(`已提交投标申请 · ${rec.title} · 等待项目组审核 ⚡`, 'success');
          }}
        >
          <Send size={14} />
          {recruitOpen ? '立即投标' : '招募窗口已关闭'}
        </button>
      </div>
    </motion.article>
  );
}
