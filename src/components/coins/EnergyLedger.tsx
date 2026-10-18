import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import { apiEnabled } from '@/lib/apiClient';
import { coinsApi } from '@/lib/apiService';
import { useAuthStore } from '@/store/authStore';
import { useCoinStore } from '@/store/coinStore';
import { useGroupStore } from '@/store/groupStore';
import type { CoinSource } from '@/types';

const sourceLabels: Record<CoinSource, string> = {
  challenge: '挑战收支', project: '项目结算', recruit: '招募收支', teacher_set: '教师调整',
  penalty: '教师扣除', transfer: '组间转账', personal: '个人能量调整', reset: '累计获得清零', showcase: '作品奖励',
};
const PAGE_SIZE = 20;

export default function EnergyLedger() {
  const { groupId, classId, role } = useAuthStore();
  const { groups, users } = useGroupStore();
  const coinTxs = useCoinStore((s) => s.coinTxs);
  const [selectedGroup, setSelectedGroup] = useState(groupId || 'all');
  const [direction, setDirection] = useState('all');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const visibleGroups = groups.filter((g) => role !== 'student' || (classId && g.classId === classId));
  const visibleGroupIds = new Set(visibleGroups.map((g) => g.id));
  const records = coinTxs
    .filter((tx) => visibleGroupIds.has(tx.groupId) && (selectedGroup === 'all' || tx.groupId === selectedGroup)
      && (direction === 'all' || (direction === 'income' ? tx.delta > 0 : tx.delta < 0)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastPage = Math.max(0, Math.ceil(records.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const userNames = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const refresh = useCallback(async () => {
    if (!apiEnabled) return;
    setLoading(true);
    setError('');
    try {
      const coinTxs = await coinsApi.transactions();
      useCoinStore.setState({ coinTxs });
    } catch (err) {
      setError(err instanceof Error ? err.message : '流水刷新失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="glass-card p-5 md:p-6 rounded-[24px] space-y-5" aria-labelledby="energy-ledger-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="energy-ledger-title" className="flex items-center gap-2 text-lg font-bold text-ink-800"><Coins size={20} className="text-energy-500" />能量币详细流水</h2>
        <p className="text-xs text-ink-500 mt-2">查看每笔收支及变动后余额。转账申请通过教师审核后才计入流水，个人调整单独标注个人余额。</p>
      </div>
      {apiEnabled && <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-mission-100 bg-white/80 px-3 py-2 text-sm text-mission-700 disabled:opacity-50" disabled={loading} onClick={() => void refresh()}>
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{loading ? '刷新中…' : '刷新流水'}
      </button>}
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-ink-600 flex flex-col gap-1.5 min-w-0 max-w-full">查看小组
        <select aria-label="查看小组" className="input max-w-full" value={selectedGroup} onChange={(e) => { setSelectedGroup(e.target.value); setPage(0); }}>
          <option value="all">{role === 'student' ? '本班全部小组' : '全部可见小组'}</option>
          {visibleGroups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === groupId ? '（我的小组）' : ''}</option>)}
        </select>
      </label>
      <label className="text-xs text-ink-600 flex flex-col gap-1.5">收支类型
        <select aria-label="收支类型" className="input" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(0); }}>
          <option value="all">全部记录</option><option value="income">收入</option><option value="expense">支出</option>
        </select>
      </label>
      <span className="text-xs text-ink-500 py-2" role="status">共 {records.length} 条记录</span>
    </div>
    {error && <p role="alert" className="text-sm text-danger-600">{error}；当前显示已加载的记录，可点击刷新重试。</p>}
    {records.length === 0 ? <p className="text-sm text-ink-400 text-center py-10">{loading ? '正在加载流水…' : '暂无符合条件的流水记录'}</p> : <>
      <ol className="space-y-3" aria-label="能量币流水记录">
        {records.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((tx) => <li key={tx.id} className="rounded-2xl border border-mission-100 bg-white/70 p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-ink-800 break-words">{tx.note || sourceLabels[tx.source] || '能量币变动'}</p>
              <p className="text-xs text-ink-500 mt-1 break-words">{groupNames.get(tx.groupId)} · {sourceLabels[tx.source] || tx.source}</p>
              {tx.userId && <p className="text-xs text-ink-500 mt-1">关联成员：{userNames.get(tx.userId) || '成员记录'}</p>}
            </div>
            <strong className={`shrink-0 text-lg tabular-nums ${tx.delta > 0 ? 'text-growth-600' : tx.delta < 0 ? 'text-danger-600' : 'text-ink-500'}`}>
              {tx.delta > 0 ? '+' : ''}{tx.delta.toLocaleString('zh-CN')}
            </strong>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
            <time dateTime={new Date(tx.createdAt).toISOString()}>{new Date(tx.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
            <span>{tx.source === 'personal' || tx.source === 'reset' ? '个人余额' : '小组余额'}：<b className="text-ink-700 tabular-nums">{tx.balanceAfter.toLocaleString('zh-CN')}</b> ⚡</span>
          </div>
          <details className="text-xs text-ink-400 break-all"><summary className="cursor-pointer">流水编号</summary><p className="mt-1">{tx.id}</p></details>
        </li>)}
      </ol>
      {lastPage > 0 && <nav className="flex items-center justify-between gap-2 text-xs" aria-label="流水分页">
        <button type="button" className="btn-ghost-mission" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span className="text-ink-500">第 {currentPage + 1} / {lastPage + 1} 页</span>
        <button type="button" className="btn-ghost-mission" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </nav>}
    </>}
  </section>;
}
