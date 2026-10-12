import type { LucideIcon } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useTheoryStore } from '@/store/theoryStore';
import { useProjectStore } from '@/store/projectStore';
import { useCoinStore } from '@/store/coinStore';
import { useUIStore } from '@/store/uiStore';
import RecruitDialog from '@/components/ui/RecruitDialog';
import { Swords, Users, Coins, Send, Trophy, Clock, AlertCircle, X, Plus, Eye, Award } from 'lucide-react';

import type { Challenge, Recruitment, Project, CoinTransaction } from '@/types';
import { challengeRewardFor } from '@/lib/challengePricing';
import { windowState, windowClosedMessage } from '@/lib/activityWindow';

type TabKey = 'challenges' | 'recruitments' | 'transfers';

const TABS: { key: TabKey; label: string; icon: LucideIcon; color: string }[] = [
  { key: 'challenges', label: '组间挑战', icon: Swords, color: 'text-energy-500' },
  { key: 'recruitments', label: '人才招募', icon: Users, color: 'text-physics-500' },
  { key: 'transfers', label: '能量转账', icon: Coins, color: 'text-lab-500' },
];

function CoinBadge({ amount, size = 'md' }: { amount: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-5 text-xs px-1.5 gap-0.5', md: 'h-7 text-sm px-2 gap-1', lg: 'h-10 text-base px-3 gap-1.5' };
  const iconSize = size === 'sm' ? 12 : size === 'md' ? 16 : 20;
  const positive = amount >= 0;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold bg-gradient-to-br ${
      positive 
        ? 'from-energy-500/15 via-energy-400/10 to-energy-300/15 ring-1 ring-energy-300/40 text-energy-700' 
        : 'from-danger-500/15 via-danger-400/10 to-danger-300/15 ring-danger-300/40 text-danger-700'
    } ${sizeMap[size]}`}>
      <Coins size={iconSize} className={positive ? 'text-energy-500' : 'text-danger-500'} />
      {showSymbol && amount > 0 && '+'}
      <span>{amount}</span>
    </span>
  );
}

const showSymbol = true;

function ChallengeCard({ challenge, onAccept, onView }: { challenge: Challenge; onAccept?: () => void; onView?: () => void }) {
  const { getGroupById } = useGroupStore();
  const creatorGroup = getGroupById(challenge.creatorGroupId);
  
  const isExpired = new Date(challenge.deadline) < new Date();
  
  return (
    <div className="rounded-[20px] bg-gradient-to-br from-white/95 via-white to-ink-50/50 border border-ink-100/60 p-5 hover:shadow-lg hover:border-cyan-200/60 transition-all duration-300">
      <div className="student-communication-card-heading flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`chip ${isExpired ? 'chip-risk' : 'chip-lab'}`}>
              {isExpired ? '已过期' : '进行中'}
            </span>
            <span className="chip chip-physics">
              <Users size={12} />
              {creatorGroup?.name || '未知组'}
            </span>
          </div>
          <h3 className="font-serif font-bold text-lg text-physics-900 mb-2">
            {challenge.title}
          </h3>
          <p className="text-sm text-ink-500 mb-3">
            {challenge.questionIds?.length || 10} 道题目 · {challenge.submissions?.length || 0} 支队伍已参战
          </p>
        </div>
        <div className="student-communication-reward">
          <p className="text-xs text-ink-500">悬赏</p>
          <CoinBadge amount={challenge.reward} size="lg" />
        </div>
      </div>
      <div className="student-communication-card-footer flex items-center justify-between pt-3 border-t border-ink-100">
        <span className="text-xs text-ink-400 flex items-center gap-1">
          <Clock size={12} />
          截止: {new Date(challenge.deadline).toLocaleDateString('zh-CN')}
        </span>
        <div className="flex gap-2">
          <button onClick={onView} className="btn-ghost text-sm">
            <Eye size={14} />
            查看详情
          </button>
          {!isExpired && onAccept && (
            <button onClick={onAccept} className="btn-primary text-sm">
              <Swords size={14} />
              接受挑战
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecruitmentCard({ recruitment, project, onBid, onResolve }: { recruitment: Recruitment; project?: Project; onBid?: () => void; onResolve?: () => void }) {
  const { getGroupById } = useGroupStore();
  const ownerGroup = getGroupById(project?.ownerGroupId);
  
  const isExpired = new Date(recruitment.deadline) < new Date();
  const isOpen = recruitment.status === 'open';
  
  return (
    <div className="rounded-[20px] bg-gradient-to-br from-white/95 via-white to-ink-50/50 border border-ink-100/60 p-5 hover:shadow-lg hover:border-purple-200/60 transition-all duration-300">
      <div className="student-communication-card-heading flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`chip ${
              recruitment.status === 'done' ? 'chip-ink' :
              recruitment.status === 'assigned' ? 'chip-physics' :
              isExpired ? 'chip-risk' : 'chip-lab'
            }`}>
              {recruitment.status === 'done' ? '已完成' :
               recruitment.status === 'assigned' ? '已分配' :
               isExpired ? '已过期' : '招募中'}
            </span>
            <span className="chip chip-physics">
              <Users size={12} />
              {ownerGroup?.name || '未知组'}
            </span>
          </div>
          <h3 className="font-serif font-bold text-lg text-physics-900 mb-2">
            {recruitment.title}
          </h3>
          <p className="text-sm text-ink-500 mb-2 line-clamp-2">
            {recruitment.description}
          </p>
          <div className="flex flex-wrap gap-1">
            {recruitment.skills?.map((s: string) => (
              <span key={s} className="chip chip-ink text-xs">{s}</span>
            ))}
          </div>
        </div>
        <div className="student-communication-reward">
          <p className="text-xs text-ink-500">奖励</p>
          <CoinBadge amount={recruitment.reward} size="lg" />
        </div>
      </div>
      <div className="student-communication-card-footer flex items-center justify-between pt-3 border-t border-ink-100">
        <span className="text-xs text-ink-400 flex items-center gap-1">
          <Clock size={12} />
          截止: {new Date(recruitment.deadline).toLocaleDateString('zh-CN')}
          {recruitment.bids?.length > 0 && (
            <span className="ml-2">| {recruitment.bids.length} 人投标</span>
          )}
        </span>
        <div className="flex gap-2">
          {isOpen && !isExpired && onBid && (
            <button onClick={onBid} className="btn-primary text-sm">
              <Send size={14} />
              立即投标
            </button>
          )}
          {recruitment.status === 'assigned' && onResolve && (
            <button onClick={onResolve} className="btn-energy text-sm">
              <Award size={14} />
              裁决结果
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TransferHistoryItem({ tx }: { tx: CoinTransaction }) {
  const { getGroupById, getUserById } = useGroupStore();
  const group = getGroupById(tx.groupId);
  const user = tx.userId ? getUserById(tx.userId) : null;
  
  const sourceLabels: Record<string, string> = {
    challenge: '挑战奖励',
    recruit: '招募报酬',
    project: '项目结算',
    transfer: '组间转账',
    teacher_set: '教师发放',
    penalty: '教师扣罚',
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-white/95 to-ink-50/50 border border-ink-100/40 hover:bg-white hover:border-nova-100/60 transition-all duration-200">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        tx.delta >= 0 ? 'bg-lab-100' : 'bg-danger-100'
      }`}>
        {tx.source === 'challenge' && <Swords size={18} className="text-energy-500" />}
        {tx.source === 'recruit' && <Users size={18} className="text-physics-500" />}
        {tx.source === 'project' && <Trophy size={18} className="text-lab-500" />}
        {tx.source === 'transfer' && <Coins size={18} className="text-energy-500" />}
        {tx.source === 'teacher_set' && <Award size={18} className="text-alert-500" />}
        {tx.source === 'penalty' && <AlertCircle size={18} className="text-danger-500" />}
      </div>
      <div className="flex-1">
        <p className="font-medium text-ink-800 text-sm">{tx.note || sourceLabels[tx.source]}</p>
        <p className="text-xs text-ink-500">
          {group?.name} · {user?.name || '系统'} · {new Date(tx.createdAt).toLocaleString('zh-CN')}
        </p>
      </div>
      <div className={`font-bold ${tx.delta >= 0 ? 'text-lab-600' : 'text-danger-600'}`}>
        {tx.delta >= 0 ? '+' : ''}{tx.delta}
      </div>
    </div>
  );
}

export default function GroupCommunicator() {
  const navigate = useNavigate();
  const { userId, groupId, role } = useAuthStore();
  const { groups, getGroupById, getGroupUsers, classMeta } = useGroupStore();
  const { challenges, createChallenge, getTopicQuestions, topics, questions: allQuestions } = useTheoryStore();
  const { recruitments, projects, placeBid, resolveRecruitment } = useProjectStore();
  const { coinTxs, transferCoins } = useCoinStore();
  const myCoinTxs = coinTxs.filter((tx) => tx.groupId === groupId);
  const pushToast = useUIStore((s) => s.pushToast);
  
  const [tab, setTab] = useState<TabKey>('challenges');
  const [activeDialog, setActiveDialog] = useState<'createChallenge' | 'createTransfer' | 'bid' | 'resolve' | null>(null);
  
  const myGroup = getGroupById(groupId || '');
  const myCoins = myGroup?.totalCoins || 0;
  const myGroupProject = projects.find((p) => p.ownerGroupId === groupId);
  const isLeader = role === 'teacher' || role === 'admin' || (groupId ? getGroupUsers(groupId).find((u) => u.id === userId)?.role === 'leader' : false);
  const [recruitOpen, setRecruitOpen] = useState(false);
  
  const openChallenges = useMemo(
    () => challenges.filter(c => c.status === 'open' && c.creatorGroupId !== groupId),
    [challenges, groupId]
  );
  
  const myCreatedChallenges = useMemo(
    () => challenges.filter(c => c.creatorGroupId === groupId),
    [challenges, groupId]
  );
  
  const myJoinedChallenges = useMemo(() => {
    if (!groupId) return [];
    return challenges.filter(c => c.submissions?.some(s => s.groupId === groupId));
  }, [challenges, groupId]);
  
  const openRecruitments = useMemo(
    () => recruitments.filter(r => r.status === 'open'),
    [recruitments]
  );
  
  const myRecruitments = useMemo(() => {
    const myProjects = projects.filter(p => p.ownerGroupId === groupId);
    const myProjectIds = new Set(myProjects.map(p => p.id));
    return recruitments.filter(r => myProjectIds.has(r.projectId));
  }, [recruitments, projects, groupId]);
  
  const [challengeForm, setChallengeForm] = useState({
    title: '',
    topicId: '',
    questionIds: [] as string[],
  });
  
  const [transferForm, setTransferForm] = useState({
    targetGroupId: '',
    amount: 0,
    note: '',
  });
  
  const [bidForm, setBidForm] = useState({
    recruitmentId: '',
    message: '',
  });
  
  const [resolveForm, setResolveForm] = useState({
    recruitmentId: '',
    result: 'success' as 'success' | 'partial' | 'fail',
  });
  
  const candidateQuestions = useMemo(() => {
    if (!challengeForm.topicId) return [];
    return getTopicQuestions(challengeForm.topicId).slice(0, 30);
  }, [challengeForm.topicId, getTopicQuestions]);

  // 奖励按所选题目难度自动算，学生不能自填（单价由教师在教师端设置）。
  const challengeReward = useMemo(
    () => challengeRewardFor(allQuestions.filter((q) => challengeForm.questionIds.includes(q.id)), classMeta),
    [allQuestions, challengeForm.questionIds, classMeta]
  );
  
  // 教师可控的开放窗口。关闭时只挡"新开局"，已开的照常作答与结算。
  const win = windowState(classMeta);

  const handleCreateChallenge = () => {
    if (!groupId) return;
    if (!win.challenge) return pushToast(windowClosedMessage('challenge'), 'warning');
    if (!challengeForm.title.trim()) return pushToast('请填写挑战标题', 'warning');
    if (!challengeForm.topicId) return pushToast('请选择主题', 'warning');
    if (challengeForm.questionIds.length !== 10) return pushToast('请选择10道题目', 'warning');
    if (challengeReward <= 0) return pushToast('按当前单价算出的奖励为 0，请联系老师设置挑战奖励单价', 'warning');
    if (myCoins < challengeReward) return pushToast('能量币不足', 'warning');

    createChallenge({
      title: challengeForm.title.trim(),
      creatorGroupId: groupId,
      topicId: challengeForm.topicId,
      questionIds: challengeForm.questionIds,
      deadline: new Date(Date.now() + 7 * 86400000),
    });

    pushToast('挑战已发起！', 'success');
    setActiveDialog(null);
    setChallengeForm({ title: '', topicId: '', questionIds: [] });
  };
  
  const handleAcceptChallenge = (challengeId: string) => {
    navigate(`/theory/challenge/${challengeId}/accept`);
  };
  
  const handleTransfer = () => {
    if (!groupId) return;
    if (!win.transfer) return pushToast(windowClosedMessage('transfer'), 'warning');
    if (!transferForm.targetGroupId) return pushToast('请选择目标小组', 'warning');
    if (transferForm.targetGroupId === groupId) return pushToast('不能转账给自己', 'warning');
    if (transferForm.amount <= 0) return pushToast('转账金额必须大于0', 'warning');
    if (myCoins < transferForm.amount) return pushToast('能量币不足', 'warning');

    transferCoins(
      groupId,
      transferForm.targetGroupId,
      transferForm.amount,
      transferForm.note,
      userId
    );

    pushToast('转账成功！', 'success');
    setActiveDialog(null);
    setTransferForm({ targetGroupId: '', amount: 0, note: '' });
  };
  
  const handlePlaceBid = () => {
    if (!groupId || !userId) return;
    if (!bidForm.recruitmentId) return;
    if (!win.recruit) return pushToast(windowClosedMessage('recruit'), 'warning');
    
    placeBid(bidForm.recruitmentId, {
      userId,
      skillDesc: bidForm.message || '申请参与',
      hours: 0,
    });
    
    pushToast('投标成功！等待对方裁决', 'success');
    setActiveDialog(null);
    setBidForm({ recruitmentId: '', message: '' });
  };
  
  const handleResolve = () => {
    if (!resolveForm.recruitmentId) return;
    
    resolveRecruitment(resolveForm.recruitmentId, resolveForm.result);
    pushToast('裁决已完成', 'success');
    setActiveDialog(null);
    setResolveForm({ recruitmentId: '', result: 'success' });
  };
  
  const otherGroups = useMemo(
    () => groups.filter(g => g.id !== groupId),
    [groups, groupId]
  );
  
  return (
    <div className="min-h-screen">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <div className="glass-card p-5 md:p-7 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Users size={28} className="text-mission-500" />
              小组沟通中心
            </h1>
            <p className="text-ink-500 text-sm mt-1.5 max-w-xl">
              与其他小组进行挑战对决、人才招募、能量币转账等互动
            </p>
          </div>
          <div className="student-communication-identity flex items-center gap-4">
            <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <Coins size={18} className="text-energy-500" />
              <span className="font-bold text-ink-800">{myCoins}</span>
              <span className="text-xs text-ink-500">能量币余额</span>
            </div>
            <span className="chip chip-physics">
              <Users size={12} />
              {myGroup?.name || '未分组'}
            </span>
          </div>
        </div>
        
        <div className="student-inline-tabs flex gap-2 p-1.5 bg-ink-100/80 rounded-xl w-fit">
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
              <t.icon size={16} className={tab === t.key ? t.color : ''} />
              {t.label}
            </button>
          ))}
        </div>
        
        {tab === 'challenges' && (
          <div className="space-y-6">
            <div className="rounded-[24px] bg-gradient-to-br from-cyan-50/70 via-white/90 to-blue-50/50 border border-cyan-100/50 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-lg font-semibold text-physics-800 flex items-center gap-2">
                  <Swords size={20} className="text-cyan-500" />
                  可接受挑战
                </h2>
                <button
                  onClick={() => setActiveDialog('createChallenge')}
                  className="btn-energy text-sm"
                >
                  <Plus size={16} />
                  发起挑战
                </button>
              </div>
              
              {openChallenges.length === 0 ? (
                <div className="p-8 text-center">
                  <Swords size={40} className="mx-auto text-ink-300 mb-3" />
                  <p className="text-ink-500">暂无可接受的挑战，发起一场对决吧！</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {openChallenges.map((c) => (
                    <ChallengeCard
                      key={c.id}
                      challenge={c}
                      onAccept={() => handleAcceptChallenge(c.id)}
                      onView={() => navigate(`/theory/challenge/${c.id}/accept`)}
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div className="rounded-[24px] bg-gradient-to-br from-mission-50/70 via-white/90 to-nova-50/50 border border-mission-100/50 p-6">
              <h2 className="font-serif text-lg font-semibold text-physics-800 mb-5 flex items-center gap-2">
                <Trophy size={20} className="text-mission-500" />
                我发起的挑战
              </h2>
              {myCreatedChallenges.length === 0 ? (
                <div className="p-8 text-center">
                  <Trophy size={32} className="mx-auto text-ink-300 mb-2" />
                  <p className="text-ink-500 text-sm">你还没有发起挑战</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myCreatedChallenges.map((c) => (
                    <ChallengeCard
                      key={c.id}
                      challenge={c}
                      onView={() => navigate(`/theory/challenge/${c.id}/accept`)}
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div className="rounded-[24px] bg-gradient-to-br from-growth-50/70 via-white/90 to-emerald-50/50 border border-growth-100/50 p-6">
              <h2 className="font-serif text-lg font-semibold text-physics-800 mb-5 flex items-center gap-2">
                <Award size={20} className="text-growth-500" />
                我参与的挑战
              </h2>
              {myJoinedChallenges.length === 0 ? (
                <div className="p-8 text-center">
                  <Award size={32} className="mx-auto text-ink-300 mb-2" />
                  <p className="text-ink-500 text-sm">你还没有参与挑战</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myJoinedChallenges.map((c) => {
                    const mySubmission = c.submissions?.find(s => s.groupId === groupId);
                    return (
                      <div key={c.id} className="card-base card-hover p-5">
                        <div className="student-communication-card-heading flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="chip chip-lab">已完成</span>
                            </div>
                            <h3 className="font-serif font-bold text-lg text-physics-900 mb-2">
                              {c.title}
                            </h3>
                            <p className="text-sm text-ink-500">
                              准确率: {mySubmission ? Math.round(mySubmission.accuracy * 100) : 0}%
                            </p>
                          </div>
                          <div className="student-communication-reward">
                            <p className="text-xs text-ink-500">获得奖励</p>
                            <CoinBadge amount={mySubmission?.earned || 0} size="lg" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        
        {tab === 'recruitments' && (
          <div className="space-y-6">
            <div className="rounded-[24px] bg-gradient-to-br from-purple-50/70 via-white/90 to-pink-50/50 border border-purple-100/50 p-6">
              <h2 className="font-serif text-lg font-semibold text-physics-800 mb-5 flex items-center gap-2">
                <Users size={20} className="text-purple-500" />
                公开招募
              </h2>
              
              {openRecruitments.length === 0 ? (
                <div className="p-8 text-center">
                  <Users size={40} className="mx-auto text-ink-300 mb-3" />
                  <p className="text-ink-500">暂无公开招募信息</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {openRecruitments.map((r) => {
                    const project = projects.find(p => p.id === r.projectId);
                    return (
                      <RecruitmentCard
                        key={r.id}
                        recruitment={r}
                        project={project}
                        onBid={() => {
                          setBidForm({ recruitmentId: r.id, message: '' });
                          setActiveDialog('bid');
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="rounded-[24px] bg-gradient-to-br from-orange-50/70 via-white/90 to-amber-50/50 border border-orange-100/50 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-lg font-semibold text-physics-800 flex items-center gap-2">
                  <Megaphone size={20} className="text-orange-500" />
                  我发布的招募
                </h2>
                {isLeader && myGroupProject && (
                  <button className="btn-energy !py-1.5 !px-3 text-[12px] flex items-center gap-1.5" onClick={() => setRecruitOpen(true)}>
                    <Megaphone size={13} />发布招募公告
                  </button>
                )}
              </div>
              {myRecruitments.length === 0 ? (
                <div className="p-8 text-center">
                  <Megaphone size={32} className="mx-auto text-ink-300 mb-2" />
                  <p className="text-ink-500 text-sm">你还没有发布招募</p>
                  {/* 原先这里写「在项目详情页发布招募公告」——但项目中心页只有展示、没有发布入口，
                      是把人指到死路。发布按钮就在这张卡片右上角（仅组长可见）。 */}
                  <p className="text-xs text-ink-400">
                    {!myGroupProject
                      ? '本组还没有项目，先在项目中心创建项目才能发布招募'
                      : isLeader
                        ? '点右上角「发布招募公告」即可发布'
                        : '只有组长可以发布招募公告'}
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myRecruitments.map((r) => {
                    const project = projects.find(p => p.id === r.projectId);
                    return (
                      <RecruitmentCard
                        key={r.id}
                        recruitment={r}
                        project={project}
                        onResolve={() => {
                          setResolveForm({ recruitmentId: r.id, result: 'success' });
                          setActiveDialog('resolve');
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        
        {tab === 'transfers' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold text-physics-800">能量币转账</h2>
              <button
                onClick={() => setActiveDialog('createTransfer')}
                className="btn-primary text-sm"
              >
                <Send size={16} />
                发起转账
              </button>
            </div>

            <div className="rounded-[24px] bg-gradient-to-br from-nova-50/70 via-white/90 to-mission-50/50 border border-nova-100/50 p-6">
              <h3 className="font-serif font-semibold text-physics-800 mb-1 flex items-center gap-2">
                <Coins size={18} className="text-nova-500" />
                能量币流水
              </h3>
              <p className="text-xs text-ink-500 mb-4">本组全部收支记录（含组间转账、挑战、招募、项目结算）</p>
              {myCoinTxs.length === 0 ? (
                <div className="text-center py-8 text-ink-400">
                  <Coins size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">暂无交易记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...myCoinTxs]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 10)
                    .map((tx) => (
                      <TransferHistoryItem key={tx.id} tx={tx} />
                    ))}
                </div>
              )}
            </div>

            <div className="rounded-[24px] bg-gradient-to-br from-energy-50/70 via-white/90 to-alert-50/50 border border-energy-100/50 p-6">
              <h3 className="font-serif font-semibold text-physics-800 mb-4 flex items-center gap-2">
                <Send size={18} className="text-energy-500" />
                快速转账
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {otherGroups.map((g) => (
                  <div
                    key={g.id}
                    className="card-base card-hover p-4 text-left"
                  >
                    <button className="flex items-center gap-3 mb-2 w-full text-left" onClick={() => {
                      setTransferForm({ targetGroupId: g.id, amount: 50, note: '' });
                      setActiveDialog('createTransfer');
                    }}>
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-physics-100 to-physics-50 flex items-center justify-center">
                        <Users size={18} className="text-physics-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-ink-800 text-sm">{g.name}</p>
                        <p className="text-xs text-ink-500">{g.totalCoins} 能量币</p>
                      </div>
                    </button>
                    <div className="flex gap-1">
                      {[50, 100, 200].map((amount) => (
                        <button
                          key={amount}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTransferForm({ targetGroupId: g.id, amount, note: '' });
                            setActiveDialog('createTransfer');
                          }}
                          className="text-[10px] px-2 py-1 rounded-lg bg-ink-100 text-ink-600 hover:bg-mission-100 hover:text-mission-600"
                        >
                          {amount}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
      
      {activeDialog === 'createChallenge' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-cardLifted w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-ink-100">
              <h2 className="font-serif text-xl font-bold text-physics-900">发起新挑战</h2>
              <button onClick={() => setActiveDialog(null)} className="h-9 w-9 rounded-xl hover:bg-ink-100 text-ink-500">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="label">挑战标题</label>
                <input
                  value={challengeForm.title}
                  onChange={(e) => setChallengeForm({ ...challengeForm, title: e.target.value })}
                  className="input"
                  placeholder="例如：力学基础大对决"
                />
              </div>
              <div>
                <label className="label">关联主题</label>
                <select
                  value={challengeForm.topicId}
                  onChange={(e) => setChallengeForm({ ...challengeForm, topicId: e.target.value, questionIds: [] })}
                  className="input"
                >
                  <option value="">-- 选择主题 --</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">悬赏能量币（预扣）</label>
                {/* 奖励按所选题目难度自动算，学生不能自填（原先可任意填，默认 100） */}
                <div className="flex items-center gap-3 rounded-xl bg-mission-50/70 border border-mission-100 px-3.5 py-2.5">
                  <span className="text-[20px] font-black text-gradient-energy tabular-nums">⚡ {challengeReward}</span>
                  <span className="text-xs text-ink-500 leading-snug">
                    按已选题目难度自动计算
                    <br />
                    简单 {classMeta.coinEasy} / 中等 {classMeta.coinMedium} / 困难 {classMeta.coinHard} 币每条
                  </span>
                </div>
                <p className="text-xs text-ink-500 mt-1">当前余额: {myCoins} 能量币</p>
              </div>
              <div>
                <label className="label">选择10道题目</label>
                {!challengeForm.topicId ? (
                  <div className="rounded-xl border-2 border-dashed border-ink-200 p-8 text-center text-ink-400">
                    请先选择主题
                  </div>
                ) : (
                  <div className="rounded-xl border border-ink-200 max-h-[300px] overflow-y-auto space-y-2 p-2">
                    {candidateQuestions.map((q) => (
                      <label
                        key={q.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${
                          challengeForm.questionIds.includes(q.id)
                            ? 'bg-mission-50 ring-1 ring-mission-300'
                            : 'hover:bg-ink-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={challengeForm.questionIds.includes(q.id)}
                          onChange={() => {
                            const ids = challengeForm.questionIds.includes(q.id)
                              ? challengeForm.questionIds.filter(id => id !== q.id)
                              : challengeForm.questionIds.length < 10
                                ? [...challengeForm.questionIds, q.id]
                                : challengeForm.questionIds;
                            setChallengeForm({ ...challengeForm, questionIds: ids });
                          }}
                          className="w-4 h-4 rounded text-mission-500"
                        />
                        <span className="text-sm text-ink-700">{q.stem.slice(0, 60)}...</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-ink-500 mt-2">已选: {challengeForm.questionIds.length} / 10</p>
              </div>
            </div>
            <div className="p-5 border-t border-ink-100 flex justify-end gap-3">
              <button onClick={() => setActiveDialog(null)} className="btn-ghost">取消</button>
              <button onClick={handleCreateChallenge} className="btn-primary">发起挑战</button>
            </div>
          </div>
        </div>
      )}
      
      {activeDialog === 'createTransfer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-cardLifted w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-ink-100">
              <h2 className="font-serif text-xl font-bold text-physics-900">能量币转账</h2>
              <button onClick={() => setActiveDialog(null)} className="h-9 w-9 rounded-xl hover:bg-ink-100 text-ink-500">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="label">目标小组</label>
                <select
                  value={transferForm.targetGroupId}
                  onChange={(e) => setTransferForm({ ...transferForm, targetGroupId: e.target.value })}
                  className="input"
                >
                  <option value="">-- 选择小组 --</option>
                  {otherGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.totalCoins} 能量币)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">转账金额</label>
                <input
                  type="number"
                  min={1}
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="input"
                />
                <p className="text-xs text-ink-500 mt-1">当前余额: {myCoins} 能量币</p>
              </div>
              <div>
                <label className="label">备注（可选）</label>
                <input
                  value={transferForm.note}
                  onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                  className="input"
                  placeholder="例如：友谊赛奖励"
                />
              </div>
            </div>
            <div className="p-5 border-t border-ink-100 flex justify-end gap-3">
              <button onClick={() => setActiveDialog(null)} className="btn-ghost">取消</button>
              <button onClick={handleTransfer} className="btn-primary">确认转账</button>
            </div>
          </div>
        </div>
      )}
      
      {activeDialog === 'bid' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-cardLifted w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-ink-100">
              <h2 className="font-serif text-xl font-bold text-physics-900">投标申请</h2>
              <button onClick={() => setActiveDialog(null)} className="h-9 w-9 rounded-xl hover:bg-ink-100 text-ink-500">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="label">自我介绍（可选）</label>
                <textarea
                  value={bidForm.message}
                  onChange={(e) => setBidForm({ ...bidForm, message: e.target.value })}
                  className="input h-32 resize-none"
                  placeholder="介绍你的技能和经验，提高中标几率..."
                />
              </div>
              <p className="text-sm text-ink-500">
                中标后将获得对应奖励，未中标无任何损失
              </p>
            </div>
            <div className="p-5 border-t border-ink-100 flex justify-end gap-3">
              <button onClick={() => setActiveDialog(null)} className="btn-ghost">取消</button>
              <button onClick={handlePlaceBid} className="btn-primary">提交投标</button>
            </div>
          </div>
        </div>
      )}
      
      {activeDialog === 'resolve' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-cardLifted w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-ink-100">
              <h2 className="font-serif text-xl font-bold text-physics-900">裁决招募结果</h2>
              <button onClick={() => setActiveDialog(null)} className="h-9 w-9 rounded-xl hover:bg-ink-100 text-ink-500">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="label">任务完成情况</label>
                <div className="space-y-3">
                  {(['success', 'partial', 'fail'] as const).map((result) => (
                    <label
                      key={result}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${
                        resolveForm.result === result
                          ? 'bg-mission-50 ring-1 ring-mission-300'
                          : 'hover:bg-ink-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolveResult"
                        checked={resolveForm.result === result}
                        onChange={() => setResolveForm({ ...resolveForm, result })}
                        className="w-4 h-4 text-mission-500"
                      />
                      <div>
                        <p className="font-medium text-ink-800">
                          {result === 'success' ? '✅ 完全成功' : result === 'partial' ? '⚠️ 部分完成' : '❌ 失败'}
                        </p>
                        <p className="text-xs text-ink-500">
                          {result === 'success' ? '全额发放奖励' : result === 'partial' ? '发放50%奖励' : '不发放奖励'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-ink-100 flex justify-end gap-3">
              <button onClick={() => setActiveDialog(null)} className="btn-ghost">取消</button>
              <button onClick={handleResolve} className="btn-primary">确认裁决</button>
            </div>
          </div>
        </div>
      )}

      <RecruitDialog open={recruitOpen} onClose={() => setRecruitOpen(false)} projectId={myGroupProject?.id || ''} projectTitle={myGroupProject?.title || ''} />
    </div>
  );
}

function Megaphone({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 8-6 6 6 6"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M5.93 19.07a10 10 0 0 1 0-14.14"/>
    </svg>
  );
}
