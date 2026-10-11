import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Target, Trophy, Swords, Rocket, Plus, X, Clock, Zap, ChevronDown, Calendar, Sparkles, Users, BookOpenText, AlertCircle, UserCircle2, ArrowRight } from 'lucide-react';
import { useTheoryStore } from '@/store/theoryStore';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useQuestionBankStore } from '@/store/questionBankStore';
import { useUIStore } from '@/store/uiStore';
import type { Challenge } from '@/types';
import { cn } from '@/lib/utils';
import { challengeRewardFor } from '@/lib/challengePricing';
import { windowState, windowClosedMessage } from '@/lib/activityWindow';

const CoinBadge = ({ amount, size = 'md', showSymbol = true, className = '' }: { amount: number; size?: 'sm' | 'md' | 'lg'; showSymbol?: boolean; className?: string }) => {
  const sizeMap = { sm: 'h-5 text-xs px-1.5 gap-0.5', md: 'h-7 text-sm px-2 gap-1', lg: 'h-10 text-base px-3 gap-1.5' };
  const iconSize = size === 'sm' ? 12 : size === 'md' ? 16 : 20;
  const positive = amount >= 0;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold bg-gradient-to-br from-energy-500/15 via-energy-400/10 to-energy-300/15 ring-1 ring-energy-300/40 text-energy-700 ${sizeMap[size]} ${positive ? '' : 'from-risk-500/15 via-risk-400/10 to-risk-300/15 ring-risk-300/40 text-risk-700'} ${className}`}>
      <Coins size={iconSize} className={positive ? 'text-energy-500' : 'text-risk-500'} />
      {showSymbol && amount > 0 && '+'}
      <span>{amount}</span>
    </span>
  );
};

const Chip = ({ children, variant = 'physics', className = '' }: { children: React.ReactNode; variant?: 'physics' | 'energy' | 'lab' | 'risk' | 'ink'; className?: string }) => {
  const vmap = {
    physics: 'bg-physics-50 text-physics-700 ring-1 ring-physics-100',
    energy: 'bg-energy-50 text-energy-700 ring-1 ring-energy-100',
    lab: 'bg-lab-50 text-lab-700 ring-1 ring-lab-100',
    risk: 'bg-risk-50 text-risk-700 ring-1 ring-risk-100',
    ink: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${vmap[variant]} ${className}`}>{children}</span>;
};

type TabKey = 'open' | 'created' | 'joined' | 'mine';

const TABS: { key: TabKey; label: string; icon: LucideIcon; badge?: boolean }[] = [
  { key: 'open', label: '可接受挑战', icon: Swords, badge: true },
  { key: 'created', label: '我发起的挑战', icon: Rocket },
  { key: 'joined', label: '我参与的挑战', icon: Trophy },
  { key: 'mine', label: '我的出题', icon: UserCircle2 },
];

function useCountdown(target: Date) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { diff, days, hours, minutes, seconds, expired: diff === 0 };
}

const CountdownChip = ({ deadline }: { deadline: Date }) => {
  const { days, hours, minutes, seconds, expired } = useCountdown(deadline);
  if (expired) return <Chip variant="risk"><Clock size={12} /> 已截止</Chip>;
  if (days > 0) return <Chip variant="lab"><Clock size={12} /> 剩 {days} 天 {hours} 时</Chip>;
  return (
    <Chip variant="energy">
      <Clock size={12} />
      剩 {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </Chip>
  );
};

function QuestionCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-start gap-2 p-3 rounded-xl2 hover:bg-physics-50 cursor-pointer ring-1 ring-transparent hover:ring-physics-100 transition-all">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-physics-500 cursor-pointer"
      />
      <span className="text-sm text-ink-700 leading-6">{label}</span>
    </label>
  );
}

export default function TheoryChallenge() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('open');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { topics, questions, challenges, createChallenge, getTopicQuestions } = useTheoryStore();
  const { groupId, userId, role, name } = useAuthStore();
  const { groups, getGroupById, classMeta } = useGroupStore();
  const qbQuestions = useQuestionBankStore((s) => s.questions);
  const submitQuestion = useQuestionBankStore((s) => s.submitQuestion);
  const pushToast = useUIStore((s) => s.pushToast);

  // 我的出题：提交表单状态
  const [qForm, setQForm] = useState<{ type: 'single' | 'multiple' | 'judge'; stem: string; options: string[]; answer: number | number[] | boolean; kp: string }>({
    type: 'single', stem: '', options: ['', '', '', ''], answer: 0, kp: '',
  });
  const [qFormErr, setQFormErr] = useState('');

  const mySubmitted = useMemo(
    () => (userId ? qbQuestions.filter((q) => q.submittedBy === userId) : []),
    [qbQuestions, userId]
  );

  const resetQForm = () => setQForm({ type: 'single', stem: '', options: ['', '', '', ''], answer: 0, kp: '' });

  const handleSubmitQuestion = async () => {
    if (!userId) { pushToast('请先登录', 'error'); return; }
    const stem = qForm.stem.trim();
    if (!stem) return setQFormErr('请填写题干');
    const trimmed = qForm.options.map((o) => o.trim());
    const kept = trimmed.filter(Boolean);
    if (kept.length < 2) return setQFormErr('至少 2 个有效选项');
    let answer: number | number[] | boolean = qForm.answer;
    if (qForm.type === 'single') {
      const idx = trimmed.indexOf(kept[typeof answer === 'number' ? answer : 0] as string);
      answer = idx < 0 ? 0 : idx;
    } else if (qForm.type === 'multiple') {
      const arr = Array.isArray(answer) ? answer : [];
      answer = arr.map((i) => trimmed.indexOf(kept[i])).filter((n) => n >= 0);
    }
    try {
    await submitQuestion({ type: qForm.type, stem, options: kept, answer, knowledgePoint: qForm.kp.trim(), difficulty: 1 }, userId, name || '学生');
    pushToast('题目已提交，等待教师审核', 'success');
    resetQForm();
    setQFormErr('');
    } catch (err) { setQFormErr(err instanceof Error ? err.message : '提交失败，请重试'); }
  };

  const myGid = groupId || (role === 'teacher' ? groups[0]?.id : undefined);

  const openChallenges = useMemo(
    () => challenges.filter((c) => c.status === 'open' && c.creatorGroupId !== myGid),
    [challenges, myGid]
  );
  const createdChallenges = useMemo(
    () => challenges.filter((c) => c.creatorGroupId === myGid),
    [challenges, myGid]
  );
  const joinedChallenges = useMemo(() => {
    if (!myGid) return [] as Challenge[];
    return challenges.filter((c) =>
      c.submissions.some((s) => s.groupId === myGid)
    );
  }, [challenges, myGid]);

  const [formTitle, setFormTitle] = useState('');
  const [formTopicId, setFormTopicId] = useState<string>('');
  const [formDeadline, setFormDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  });
  const [formQuestionIds, setFormQuestionIds] = useState<string[]>([]);
  const [formErr, setFormErr] = useState('');

  useEffect(() => {
    if (dialogOpen && !formTitle) {
      const rnd = Math.floor(Math.random() * 900) + 100;
      setFormTitle(`第 ${rnd} 号挑战 · ${topics[0]?.title || '物理'}对决`);
    }
  }, [dialogOpen, formTitle, topics]);

  useEffect(() => {
    setFormQuestionIds([]);
  }, [formTopicId]);

  const candidateQuestions = useMemo(() => {
    if (!formTopicId) return [];
    return getTopicQuestions(formTopicId).slice(0, 30);
  }, [formTopicId, getTopicQuestions]);

  // 奖励按所选题目的难度算，学生不能自己填（单价由老师在教师端设置）。
  // 这里只用于预览；在线时后端会独立算一遍作为权威值。
  // 注意从完整题库取（candidateQuestions 只截了 30 条用于展示）。
  const computedReward = useMemo(
    () => challengeRewardFor(questions.filter((q) => formQuestionIds.includes(q.id)), classMeta),
    [questions, formQuestionIds, classMeta]
  );

  const toggleQ = (qid: string) => {
    setFormQuestionIds((prev) => {
      if (prev.includes(qid)) return prev.filter((x) => x !== qid);
      if (prev.length >= 10) return prev;
      return [...prev, qid];
    });
  };

  const submitCreate = () => {
    if (!myGid) { setFormErr('请先登录后发起挑战'); return; }
    if (!windowState(classMeta).challenge) { setFormErr(windowClosedMessage('challenge')); return; }
    if (!formTitle.trim()) { setFormErr('请填写挑战标题'); return; }
    if (!formTopicId) { setFormErr('请选择关联主题'); return; }
    if (formQuestionIds.length !== 10) { setFormErr(`请精确选择 10 道题，当前 ${formQuestionIds.length} 道`); return; }
    if (computedReward <= 0) { setFormErr('按当前单价算出的奖励为 0，请联系老师设置挑战奖励单价'); return; }
    const deadline = new Date(formDeadline);
    if (isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) { setFormErr('截止日期必须在未来'); return; }
    const group = getGroupById(myGid);
    if (!group || group.totalCoins < computedReward) {
      setFormErr(`小组能量币不足，当前 ${group?.totalCoins || 0}，本次奖励需 ${computedReward}`);
      return;
    }
    try {
      createChallenge({
        title: formTitle.trim(),
        creatorGroupId: myGid,
        topicId: formTopicId,
        questionIds: formQuestionIds,
        deadline,
      });
      setDialogOpen(false);
      setFormTitle(''); setFormTopicId(''); setFormQuestionIds([]); setFormErr('');
    } catch (e: unknown) {
      setFormErr((e instanceof Error ? e.message : undefined) || '创建失败');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <div className="glass-card p-5 md:p-7 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Chip variant="energy"><Sparkles size={12} /> 组间 PK · 凭实力赢能量币</Chip>
              <Chip variant="physics">{challenges.length} 场挑战进行中</Chip>
            </div>
            <h1 className="page-title flex items-center gap-2">
              <Swords size={28} className="text-energy-500" />
              挑战大厅
            </h1>
            <p className="text-ink-500 text-sm mt-1.5 max-w-xl">
              发起方预扣能量币悬赏，挑战方答题获得准确率比例奖励，
              <strong className="text-physics-700">准确率 ≥95% 额外获得 20% 卓越加成</strong>。
            </p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="btn-energy !py-2.5 text-sm"
          >
            <Plus size={16} />
            创建新挑战
          </button>
        </div>

        <div className="student-inline-tabs flex gap-2 p-1.5 bg-ink-100/80 rounded-xl2 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                tab === t.key
                  ? 'bg-white text-physics-700 shadow-md'
                  : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              <t.icon size={16} />
              {t.label}
              {t.badge && tab === t.key && (
                <span className="ml-1 text-[10px] bg-energy-500 text-white px-1.5 py-0.5 rounded-full">
                  {openChallenges.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'open' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {openChallenges.length === 0 && (
              <div className="col-span-full card-base p-16 text-center">
                <Target size={40} className="mx-auto text-ink-300 mb-3" />
                <p className="text-ink-500">当前没有可接受的挑战，换个时间再来看看，或者自己发起一场吧 🎯</p>
              </div>
            )}
            {openChallenges.map((c) => {
              const creator = getGroupById(c.creatorGroupId);
              const topic = topics.find((t) => t.id === c.topicId);
              const qCount = c.questionIds.length || 10;
              return (
                <div key={c.id} className="card-base card-hover p-0 overflow-hidden flex flex-col">
                  <div className="bg-gradient-to-br from-physics-50 via-white to-energy-50/60 p-5 border-b border-physics-50">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <Chip variant="physics"><Users size={12} /> {creator?.name || '未知组'} 发起</Chip>
                      <CoinBadge amount={c.reward} size="lg" showSymbol={false} />
                    </div>
                    <h3 className="font-serif font-bold text-xl text-physics-900 leading-tight mb-3">
                      {c.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip variant="ink"><BookOpenText size={12} /> {topic?.title || '综合'}</Chip>
                      <Chip variant="lab">
                        <Target size={12} />
                        {qCount} 道题目
                      </Chip>
                    </div>
                  </div>
                  <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3 flex-1">
                    <CountdownChip deadline={c.deadline} />
                    <div className="text-xs text-ink-500 flex items-center gap-1">
                      <UserCircle2 size={12} />
                      {c.submissions.length} 支队伍已参战
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      onClick={() => navigate(`/theory/challenge/${c.id}/accept`)}
                      className="btn-primary inline-flex items-center justify-center gap-2 min-h-11 w-full !py-3 text-base"
                    >
                      <Swords size={18} className="shrink-0" aria-hidden="true" />
                      <span>接受挑战</span>
                      <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'created' && (
          <div className="space-y-4">
            {createdChallenges.length === 0 && (
              <div className="card-base p-16 text-center">
                <Rocket size={40} className="mx-auto text-ink-300 mb-3" />
                <p className="text-ink-500 mb-3">你还没有发起过挑战，做第一个吃螃蟹的人吧！</p>
                <button onClick={() => setDialogOpen(true)} className="btn-outline">
                  <Plus size={16} /> 创建我的第一场挑战
                </button>
              </div>
            )}
            {createdChallenges.map((c) => {
              const topic = topics.find((t) => t.id === c.topicId);
              const submissions = c.submissions;
              const totalEarned = submissions.reduce((s, x) => s + x.earned, 0);
              return (
                <div key={c.id} className="card-base card-hover p-5">
                  <div className="flex flex-wrap items-start gap-5">
                    <div className="flex-1 min-w-[260px]">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Chip variant={c.status === 'open' ? 'lab' : 'ink'}>
                          {c.status === 'open' ? '挑战中' : '已结束'}
                        </Chip>
                        <Chip variant="physics"><BookOpenText size={12} /> {topic?.title}</Chip>
                        <Chip variant="ink">{c.questionIds.length || 10} 题</Chip>
                      </div>
                      <h3 className="font-serif font-bold text-xl text-physics-900">{c.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-center">
                        <p className="text-[11px] text-ink-400 mb-1">悬赏</p>
                        <CoinBadge amount={c.reward} size="lg" showSymbol={false} />
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-ink-400 mb-1">已发放</p>
                        <CoinBadge amount={-totalEarned} showSymbol={false} />
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-ink-400 mb-1">参战队伍</p>
                        <p className="font-serif font-bold text-xl text-physics-700">{submissions.length}</p>
                      </div>
                      <CountdownChip deadline={c.deadline} />
                    </div>
                  </div>
                  {submissions.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-ink-100 space-y-2.5">
                      <p className="text-xs font-semibold text-ink-600 uppercase tracking-wider">参战队伍成绩</p>
                      <div className="grid md:grid-cols-2 gap-2.5">
                        {submissions.map((s, i) => {
                          const g = getGroupById(s.groupId);
                          const pct = Math.round(s.accuracy * 100);
                          return (
                            <div key={i} className="rounded-xl2 bg-ink-50/60 p-3.5 ring-1 ring-ink-200">
                              <div className="flex items-center justify-between mb-2">
                                <Chip variant="physics"><Users size={11} /> {g?.name || `队${i + 1}`}</Chip>
                                <CoinBadge amount={s.earned} showSymbol={false} size="sm" />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2.5 rounded-full bg-ink-200 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct >= 90 ? 'bg-grad-lab' : pct >= 60 ? 'bg-grad-energy' : 'bg-grad-risk'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className={`text-sm font-bold tabular-nums min-w-[44px] text-right ${
                                  pct >= 90 ? 'text-lab-700' : pct >= 60 ? 'text-energy-700' : 'text-risk-700'
                                }`}>
                                  {pct}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'joined' && (
          <div className="space-y-4">
            {joinedChallenges.length === 0 && (
              <div className="card-base p-16 text-center">
                <Trophy size={40} className="mx-auto text-ink-300 mb-3" />
                <p className="text-ink-500">还没有参与任何挑战，去可接受挑战里挑选一场试试吧 🏆</p>
              </div>
            )}
            {joinedChallenges.map((c) => {
              const topic = topics.find((t) => t.id === c.topicId);
              const my = c.submissions.find((s) => s.groupId === myGid);
              if (!my) return null;
              const pct = Math.round(my.accuracy * 100);
              return (
                <div key={c.id} className="card-base card-hover p-6">
                  <div className="flex flex-wrap items-start gap-4 mb-4">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Chip variant="physics"><BookOpenText size={12} /> {topic?.title}</Chip>
                        <Chip variant="ink">{c.questionIds.length || 10} 题</Chip>
                      </div>
                      <h3 className="font-serif font-bold text-xl text-physics-900">{c.title}</h3>
                      <p className="text-xs text-ink-500 mt-1 flex items-center gap-1">
                        <Users size={12} /> 发起：{getGroupById(c.creatorGroupId)?.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-5 flex-wrap">
                      <div className="text-center">
                        <p className="text-[11px] text-ink-400 mb-1">准确率</p>
                        <p className={`font-serif font-bold text-2xl ${
                          pct >= 90 ? 'text-lab-700' : pct >= 60 ? 'text-energy-700' : 'text-risk-700'
                        }`}>
                          {pct}<span className="text-sm ml-0.5">%</span>
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-ink-400 mb-1">获得能量币</p>
                        <CoinBadge amount={my.earned} size="lg" showSymbol />
                      </div>
                      {pct >= 95 && (
                        <Chip variant="lab" className="!px-3 !py-1.5 animate-pulseGlow">
                          <Sparkles size={12} /> 卓越加成
                        </Chip>
                      )}
                    </div>
                  </div>
                  <div className="relative h-5 rounded-full bg-ink-100 overflow-hidden ring-1 ring-ink-200">
                    <div
                      className={`h-full rounded-full relative ${
                        pct >= 90 ? 'bg-grad-lab' : pct >= 60 ? 'bg-grad-energy' : 'bg-grad-risk'
                      }`}
                      style={{ width: `${pct}%` }}
                    >
                      <div className="absolute inset-0 bg-white/25 animate-pulse" />
                    </div>
                    {[60, 80, 95].map((v) => (
                      <div
                        key={v}
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(13,71,161,0.2)]"
                        style={{ left: `${v}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] text-ink-400 font-medium">
                    <span>0%</span>
                    <span className="text-risk-500">60% 合格线</span>
                    <span className="text-physics-500">80% 良好</span>
                    <span className="text-lab-500">95% 卓越</span>
                    <span>100%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'mine' && (
          <div className="space-y-5">
            {/* 提交新题表单 */}
            <div className="card-base p-6">
              <h3 className="font-serif font-bold text-lg text-physics-900 mb-4 flex items-center gap-2">
                <Plus size={18} /> 提交一道新题
              </h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(['single', 'multiple', 'judge'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setQForm({ ...qForm, type: t, options: t === 'judge' ? ['正确', '错误'] : qForm.options, answer: t === 'judge' ? true : (t === 'multiple' ? [] : 0) })}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition', qForm.type === t ? 'bg-mission-500 text-white border-transparent' : 'bg-white text-ink-600 border-ink-200 hover:border-mission-300')}
                    >
                      {t === 'single' ? '单选题' : t === 'multiple' ? '多选题' : '判断题'}
                    </button>
                  ))}
                </div>
                <textarea value={qForm.stem} onChange={(e) => setQForm({ ...qForm, stem: e.target.value })} className="w-full border border-ink-200 rounded-xl px-3 py-2 text-sm focus:border-mission-400 focus:ring-2 focus:ring-mission-100 outline-none resize-y min-h-[60px]" placeholder="输入题干……" />
                {qForm.type !== 'judge' && qForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (qForm.type === 'single') setQForm({ ...qForm, answer: i });
                        else {
                          const arr = Array.isArray(qForm.answer) ? [...qForm.answer] : [];
                          setQForm({ ...qForm, answer: arr.includes(i) ? arr.filter((n) => n !== i) : [...arr, i] });
                        }
                      }}
                      className={cn('w-6 h-6 rounded-full shrink-0 border-2 flex items-center justify-center text-white text-[10px]', (qForm.type === 'single' ? qForm.answer === i : Array.isArray(qForm.answer) && qForm.answer.includes(i)) ? 'bg-growth-500 border-growth-500' : 'border-ink-200 text-transparent')}
                    >
                      ✓
                    </button>
                    <span className="text-xs text-ink-400 w-5">{String.fromCharCode(65 + i)}.</span>
                    <input value={opt} onChange={(e) => { const o = [...qForm.options]; o[i] = e.target.value; setQForm({ ...qForm, options: o }); }} className="flex-1 border border-ink-200 rounded-lg px-2 py-1.5 text-sm focus:border-mission-400 outline-none" placeholder={`选项 ${String.fromCharCode(65 + i)}`} />
                  </div>
                ))}
                {qForm.type === 'judge' && (
                  <div className="flex gap-2">
                    {[true, false].map((v) => (
                      <button key={String(v)} onClick={() => setQForm({ ...qForm, answer: v })} className={cn('flex-1 py-2 rounded-lg border text-sm font-semibold', qForm.answer === v ? 'bg-growth-50 border-growth-300 text-growth-700' : 'bg-white border-ink-200 text-ink-500')}>
                        {v ? '✓ 正确' : '✗ 错误'}
                      </button>
                    ))}
                  </div>
                )}
                <input value={qForm.kp} onChange={(e) => setQForm({ ...qForm, kp: e.target.value })} className="w-full border border-ink-200 rounded-xl px-3 py-2 text-sm focus:border-mission-400 outline-none" placeholder="知识点（可选）" />
                {qFormErr && <p className="text-xs text-danger-600">{qFormErr}</p>}
                <button onClick={handleSubmitQuestion} className="btn-mission w-full">
                  <Plus size={15} /> 提交题目（等待教师审核）
                </button>
              </div>
            </div>

            {/* 我提交的题目 + 教师反馈 */}
            <div>
              <h3 className="font-serif font-bold text-lg text-physics-900 mb-3">我提交的题目（{mySubmitted.length}）</h3>
              {mySubmitted.length === 0 ? (
                <div className="card-base p-12 text-center text-ink-400">还没有提交过题目</div>
              ) : (
                <div className="space-y-3">
                  {mySubmitted.map((q) => {
                    const sm = {
                      pending: { label: '待审核', cls: 'bg-alert-100 text-alert-700' },
                      approved: { label: '已通过', cls: 'bg-growth-100 text-growth-700' },
                      rejected: { label: '已驳回', cls: 'bg-danger-100 text-danger-700' },
                    }[q.reviewStatus];
                    return (
                      <div key={q.id} className="card-base p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', sm.cls)}>{sm.label}</span>
                          <span className="text-[11px] text-ink-400">{q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '判断'}</span>
                          {q.edited && <span className="text-[11px] text-mission-600">· 教师已修改</span>}
                          <span className="text-[11px] text-ink-300 ml-auto">{new Date(q.submittedAt).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <p className="text-sm font-semibold text-physics-900 mb-2">{q.stem}</p>
                        <div className="space-y-1 mb-2">
                          {q.options.map((opt, i) => {
                            const correct = Array.isArray(q.answer) ? q.answer.includes(i) : q.answer === i;
                            return (
                              <div key={i} className={cn('px-2 py-1 rounded text-xs', correct ? 'bg-growth-50 text-ink-700 font-semibold' : 'text-ink-500')}>
                                {String.fromCharCode(65 + i)}. {opt}
                              </div>
                            );
                          })}
                        </div>
                        {q.teacherFeedback ? (
                          <div className="p-2.5 rounded-lg bg-mission-50 border border-mission-100 text-xs text-ink-600">
                            <b className="text-mission-700">教师评价：</b>{q.teacherFeedback}
                          </div>
                        ) : (
                          <p className="text-[11px] text-ink-300">暂无教师评价</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-cardLifted ring-1 ring-physics-100 w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-ink-100 flex-wrap gap-3">
              <div>
                <h2 className="font-serif text-xl font-bold text-physics-900 flex items-center gap-2">
                  <Rocket size={22} className="text-energy-500" />
                  创建新挑战
                </h2>
                <p className="text-xs text-ink-500 mt-1">选择题目、设定奖励，预扣能量币后发起挑战</p>
              </div>
              <button
                onClick={() => { setDialogOpen(false); setFormErr(''); }}
                className="h-9 w-9 rounded-xl2 hover:bg-ink-100 text-ink-500 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto scroll-thin">
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="label">挑战标题</label>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="input"
                    placeholder="例如：力学基础大对决"
                  />
                </div>
                <div>
                  <label className="label">关联主题</label>
                  <div className="relative">
                    <select
                      value={formTopicId}
                      onChange={(e) => setFormTopicId(e.target.value)}
                      className="input appearance-none pr-10 cursor-pointer"
                    >
                      <option value="">-- 选择主题 --</option>
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}（{getTopicQuestions(t.id).length} 题可选）
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Coins size={13} /> 奖励能量币（将从本组预扣）
                  </label>
                  {/* 奖励按所选题目的难度自动算，学生不能自己填——原先可任意填（默认 100），
                      一局赚的比老师手发一笔还多。单价由老师在教师端「分组管理」页设置。 */}
                  <div className="flex items-center gap-3 rounded-xl bg-mission-50/70 border border-mission-100 px-3.5 py-2.5">
                    <span className="text-[22px] font-black text-gradient-energy tabular-nums">⚡ {computedReward}</span>
                    <span className="text-xs text-ink-500 leading-snug">
                      按已选 10 题的难度自动计算
                      <br />
                      简单 {classMeta.coinEasy} / 中等 {classMeta.coinMedium} / 困难 {classMeta.coinHard} 币每条
                    </span>
                    <div className="ml-auto text-xs text-ink-500 whitespace-nowrap">
                      本组余额 <span className="font-semibold text-mission-700">{getGroupById(myGid || '')?.totalCoins || 0}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Calendar size={13} /> 截止日期
                  </label>
                  <input
                    type="datetime-local"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                  <label className="label !mb-0">选择 10 道题目 <span className="text-ink-400 font-normal text-xs ml-1">（精确 10 道）</span></label>
                  <Chip variant={formQuestionIds.length === 10 ? 'lab' : formQuestionIds.length > 10 ? 'risk' : 'energy'}>
                    <Target size={12} /> 已选 {formQuestionIds.length} / 10
                  </Chip>
                </div>
                {!formTopicId ? (
                  <div className="rounded-xl2 border-2 border-dashed border-ink-200 p-10 text-center text-ink-400">
                    <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
                    请先选择主题
                  </div>
                ) : (
                  <div className="rounded-xl2 border border-ink-200 max-h-[320px] overflow-y-auto scroll-thin divide-y divide-ink-100">
                    {candidateQuestions.length === 0 && (
                      <p className="p-6 text-center text-ink-400 text-sm">该主题暂无题目</p>
                    )}
                    {candidateQuestions.map((q, i) => (
                      <QuestionCheckbox
                        key={q.id}
                        checked={formQuestionIds.includes(q.id)}
                        onChange={() => toggleQ(q.id)}
                        label={
                          <>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold mr-2 px-1.5 py-0.5 rounded bg-physics-50 text-physics-700">
                              Q{i + 1}
                            </span>
                            <span className={`text-[10px] mr-2 px-1.5 py-0.5 rounded ${
                              q.difficulty === 1 ? 'bg-lab-50 text-lab-700'
                                : q.difficulty === 2 ? 'bg-energy-50 text-energy-700'
                                : 'bg-risk-50 text-risk-700'
                            }`}>
                              L{q.difficulty}
                            </span>
                            <span className={`text-[10px] mr-2 px-1.5 py-0.5 rounded bg-ink-100 text-ink-600`}>
                              {q.type === 'single' ? '单选' : q.type === 'multiple' ? '多选' : '判断'}
                            </span>
                            {q.stem}
                          </>
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {formErr && (
                <div className="rounded-xl2 bg-risk-50 text-risk-700 px-4 py-3 text-sm ring-1 ring-risk-200 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {formErr}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-ink-100 flex items-center justify-end gap-2.5 flex-wrap">
              <button
                onClick={() => { setDialogOpen(false); setFormErr(''); }}
                className="btn-outline !py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={submitCreate}
                className="btn-primary !py-2 text-sm"
              >
                <Zap size={15} />
                确认创建并预扣 {computedReward} 能量币
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
