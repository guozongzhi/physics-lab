import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, FolderKanban, UsersRound, BarChart3 } from 'lucide-react';
import { useGroupStore } from '@/store/groupStore';
import { useUIStore } from '@/store/uiStore';
import { useCoinStore } from '@/store/coinStore';
import { useProjectStore } from '@/store/projectStore';
import { useQuestionBankStore } from '@/store/questionBankStore';
import { bootstrapFromApi } from '@/lib/bootstrap';
import { classesApi } from '@/lib/apiService';
import type { SchoolClass } from '@/types';
import { TeachingKPISection } from '@/features/teaching/overview/TeachingKPISection';
import { DataInsightsBento } from '@/features/teaching/overview/DataInsightsBento';
import { ClassEnergyBars } from '@/features/teaching/overview/ClassEnergyBars';
import { AuditAndAlertBento } from '@/features/teaching/overview/AuditAndAlertBento';
import { RecentLedgerBento } from '@/features/teaching/overview/RecentLedgerBento';
import { PortalCard } from '@/design-system/components/PortalCard';

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
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TeacherOverview() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showAnalytics = searchParams.get('view') === 'analytics';
  const { groups, users } = useGroupStore();
  const projects = useProjectStore((s) => s.projects);
  const recruitments = useProjectStore((s) => s.recruitments);
  const coinTxs = useCoinStore((s) => s.coinTxs);
  const pushToast = useUIStore((s) => s.pushToast);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  useEffect(() => {
    classesApi.list().then(setClasses).catch(() => {});
  }, []);
  const classesById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);

  // 挂载时刷新最新数据
  useEffect(() => {
    bootstrapFromApi(true);
  }, []);

  // 班级筛选
  const [insightClass, setInsightClass] = useState('all');
  const groupIdToClass = useMemo(() => new Map(groups.map((g) => [g.id, g.classId || ''])), [groups]);

  // 1. KPI 数据计算
  const totalStudents = users.length;
  const totalGroups = groups.length;
  const activeProjects = projects.filter((p) => ['progress', 'review', 'planning'].includes(p.status)).length;
  const doneProjects = projects.filter((p) => p.status === 'done').length;
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

  // 待审核题目
  const reviewQuestions = useQuestionBankStore((s) => s.questions);
  const approveReviewQuestion = useQuestionBankStore((s) => s.approveQuestion);
  const pendingQs = useMemo(
    () =>
      reviewQuestions
        .filter((q) => q.reviewStatus === 'pending')
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [reviewQuestions]
  );

  const approveQuestion = (id: string) => {
    approveReviewQuestion(id);
    pushToast('题目已通过审核，纳入挑战题库', 'success');
  };

  // 2. 数据洞察：能量币近 30 天走势
  const coinTrend = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const tx of coinTxs) {
      if (!(insightClass === 'all' || groupIdToClass.get(tx.groupId) === insightClass)) continue;
      const d = new Date(tx.createdAt);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      byDay[k] = (byDay[k] || 0) + tx.delta;
    }
    const label = (m: number, dd: number) => `${m}/${dd}`;
    const days: { date: string; value: number }[] = [];
    const start = new Date();
    start.setDate(start.getDate() - 29);
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      days.push({ date: label(d.getMonth() + 1, d.getDate()), value: byDay[label(d.getMonth() + 1, d.getDate())] || 0 });
    }
    return days;
  }, [coinTxs, groupIdToClass, insightClass]);

  // 3. 数据洞察：招募状态分布
  const recruitStatus = useMemo(() => {
    const bins = { open: 0, assigned: 0, done: 0, failed: 0 };
    for (const r of recruitments) {
      const p = projects.find((p) => p.id === r.projectId);
      if (p && !(insightClass === 'all' || groupIdToClass.get(p.ownerGroupId) === insightClass)) continue;
      bins[r.status] = (bins[r.status] || 0) + 1;
    }
    return [
      { name: '招募中', value: bins.open, color: '#4F7CFF' },
      { name: '已分配', value: bins.assigned, color: '#F59E0B' },
      { name: '已完成', value: bins.done, color: '#22C55E' },
      { name: '已失败', value: bins.failed, color: '#F04438' },
    ].filter((b) => b.value > 0);
  }, [recruitments, projects, groupIdToClass, insightClass]);

  // 4. 数据洞察：班级规模
  const classScale = useMemo(() => {
    const map = new Map<string, { groups: number; students: number }>();
    for (const g of groups) {
      if (!(insightClass === 'all' || g.classId === insightClass)) continue;
      const c = map.get(g.classId || '') || { groups: 0, students: 0 };
      c.groups++;
      map.set(g.classId || '', c);
    }
    for (const u of users) {
      if (!(insightClass === 'all' || u.classId === insightClass)) continue;
      const c = map.get(u.classId || '') || { groups: 0, students: 0 };
      c.students++;
      map.set(u.classId || '', c);
    }
    return [...map.entries()].map(([cid, v]) => ({ name: classesById[cid] || cid, 小组: v.groups, 学生: v.students }));
  }, [groups, users, classesById, insightClass]);

  // 5. 分班小组能量对比
  const barData = useMemo(() => {
    return groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        coins: g.totalCoins,
        classId: g.classId,
        memberCount: users.filter((u) => u.groupId === g.id).length,
        students: users.filter((user) => user.groupId === g.id).map(({ id, name, avatar }) => ({ id, name, avatar })),
      }))
      .filter((g) => g.memberCount > 0);
  }, [groups, users]);

  const barByClass = useMemo(() => {
    const map: Record<string, { classId: string; className: string; groups: typeof barData }> = {};
    for (const g of barData) {
      const cid = g.classId || 'unknown';
      if (!map[cid]) map[cid] = { classId: cid, className: cid === 'unknown' ? '未分班小组' : classesById[cid] || cid, groups: [] };
      map[cid].groups.push(g);
    }
    return Object.values(map)
      .map((c) => ({ ...c, groups: [...c.groups].sort((a, b) => b.coins - a.coins) }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [barData, classesById]);

  // 6. 超期招募提醒
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

  // 7. 能量流水台账
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

  const ledgerCsvRows = useMemo(
    () =>
      [...coinTxs]
        .filter((tx) => insightClass === 'all' || groupIdToClass.get(tx.groupId) === insightClass)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((tx) => {
          const d = new Date(tx.createdAt);
          const p = (n: number) => String(n).padStart(2, '0');
          return {
            时间: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
            小组: groups.find((g) => g.id === tx.groupId)?.name ?? '已解散小组',
            来源: tx.source,
            能量变动: tx.delta,
            余额: tx.balanceAfter,
            备注: tx.note,
          };
        }),
    [coinTxs, groups, insightClass, groupIdToClass]
  );

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        <div className="mission-page-intro">
          <p className="text-xs font-semibold text-mission-600 tracking-wider">教学工作台</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink-800">指挥总览</h1>
          <p className="mt-1 text-sm text-ink-500">先处理待办，再进入班级、课题与数据工作区。</p>
          {!showAnalytics && (
            <div className="portal-hero-metrics">
              <div><strong>{totalStudents}</strong><span>研究员</span></div>
              <div><strong>{activeProjects}</strong><span>进行中项目</span></div>
              <div><strong>{pendingQs.length + frozenProjects.length}</strong><span>待处理事项</span></div>
            </div>
          )}
        </div>
        {showAnalytics ? (
          <div className="space-y-6">
            <button type="button" className="portal-back-link" onClick={() => setSearchParams({})}>
              返回教学首页 <ArrowRight size={15} className="rotate-180" />
            </button>
            <TeachingKPISection
              totalStudents={totalStudents}
              totalGroups={totalGroups}
              activeProjects={activeProjects}
              doneProjects={doneProjects}
              frozenProjects={frozenProjects.length}
              pendingQuestions={pendingQs.length}
              onNavigate={navigate}
            />
            <DataInsightsBento
              insightClass={insightClass}
              classes={classes}
              onClassChange={setInsightClass}
              coinTrend={coinTrend}
              recruitStatus={recruitStatus}
              classScale={classScale}
              onExportCSV={downloadCSV}
            />
            <ClassEnergyBars barByClass={barByClass} />
            <AuditAndAlertBento
              pendingQuestions={pendingQs}
              frozenProjects={frozenProjects}
              overdueRecruits={overdueRecruits}
              onApproveQuestion={approveQuestion}
              onNavigate={navigate}
            />
            <RecentLedgerBento
              transactions={recentTxs}
              allCsvRows={ledgerCsvRows}
              onExportCSV={downloadCSV}
            />
          </div>
        ) : (
          <div className="space-y-8">
            <section aria-labelledby="teacher-next-step" className="space-y-4">
              <div className="portal-section-heading">
                <div>
                  <p className="portal-kicker">TEACHING / 01</p>
                  <h2 id="teacher-next-step">今天先做什么</h2>
                  <p>按优先级进入工作区，详细数据留在完整总览中。</p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <PortalCard
                  to="/teacher/question-bank"
                  eyebrow="审核待办"
                  title="处理学生题目"
                  description="审核新提交的研究题目，维护挑战题库。"
                  icon={ClipboardCheck}
                  tone="orange"
                  detail={`${pendingQs.length} 项待审核`}
                  featured
                />
                <PortalCard
                  to="/teacher/projects"
                  eyebrow="课题治理"
                  title="跟进科研项目"
                  description="查看项目推进、冻结预警与结题情况。"
                  icon={FolderKanban}
                  tone="blue"
                  detail={`${activeProjects} 个进行中`}
                />
                <PortalCard
                  to="/teacher/groups"
                  eyebrow="班级协作"
                  title="管理研究小组"
                  description="调整编组，查看各组研究进度与能量。"
                  icon={UsersRound}
                  tone="violet"
                  detail={`${totalGroups} 个小组`}
                />
              </div>
            </section>
            <button type="button" className="portal-overview-link" onClick={() => setSearchParams({ view: 'analytics' })}>
              <span className="portal-overview-icon"><BarChart3 size={20} /></span>
              <span><strong>打开数据驾驶舱</strong><small>班级指标、能量走势、预警联动与完整流水</small></span>
              <ArrowRight size={19} className="ml-auto" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
