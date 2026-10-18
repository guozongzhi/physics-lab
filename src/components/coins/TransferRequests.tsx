import { useEffect, useState } from 'react';
import { useCoinStore } from '@/store/coinStore';
import { useGroupStore } from '@/store/groupStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { apiEnabled } from '@/lib/apiClient';

const statusLabel = { pending: '待老师审核', approved: '已通过 · 转账完成', rejected: '已驳回' };

export default function TransferRequests({ teacher = false }: { teacher?: boolean }) {
  const { transfers, loadTransfers, reviewTransfer } = useCoinStore();
  const groups = useGroupStore((s) => s.groups);
  const users = useGroupStore((s) => s.users);
  const { groupId, classId, role, userId } = useAuthStore();
  const pushToast = useUIStore((s) => s.pushToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(apiEnabled);
  const canReview = teacher && (role === 'teacher' || role === 'admin');

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadTransfers().then(() => { if (active) setError(''); }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : '加载转账申请失败');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadTransfers, userId]);

  const refresh = async () => {
    setLoading(true);
    try {
      await loadTransfers();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载转账申请失败');
    } finally {
      setLoading(false);
    }
  };
  const review = async (id: string, decision: 'approve' | 'reject', note: string) => {
    setBusy(id);
    setError('');
    try {
      await reviewTransfer(id, decision, note);
      pushToast(decision === 'approve' ? '审核通过，转账已完成' : '已驳回，余额未变动', 'success');
      if (apiEnabled) {
        try { await loadTransfers(); }
        catch { setError('审核已完成，余额刷新失败，请刷新页面查看最新余额。'); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '审核失败，请重试');
      void loadTransfers().catch(() => {});
    } finally {
      setBusy(null);
    }
  };
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name || '已删除小组';
  const visible = transfers.filter((t) => {
    if (!canReview) return t.sourceGroupId === groupId || t.targetGroupId === groupId;
    return !classId || (groups.find((g) => g.id === t.sourceGroupId)?.classId === classId
      && groups.find((g) => g.id === t.targetGroupId)?.classId === classId);
  }).slice().sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <section className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink-900">{canReview ? '能量币转账审核' : '转账申请'}</h2>
          <p className="text-xs text-ink-500 mt-1">{canReview
            ? '审核通过后立即扣款到账；直接增减小组或个人能量币，请使用下方的能量币调整入口。'
            : '仅组长可发起转账，老师审核通过后才扣款到账；待审核和已驳回的申请不影响余额。'}</p>
        </div>
        <button className="btn-ghost text-sm" disabled={loading || busy !== null} onClick={refresh}>
          {loading ? '加载中…' : '刷新申请'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {!loading && !error && visible.length === 0 && <p className="text-sm text-ink-400">暂无转账申请</p>}
      {visible.map((t) => (
        <div key={t.id} className="rounded-xl border border-ink-100 p-4 space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">{groupName(t.sourceGroupId)} → {groupName(t.targetGroupId)} · {t.amount} 能量币</span>
            <span className={t.status === 'pending' ? 'text-energy-600' : 'text-ink-500'}>{statusLabel[t.status]}</span>
          </div>
          <p className="text-xs text-ink-500">{new Date(t.createdAt).toLocaleString('zh-CN')}
            {' · 发起人：'}{users.find((u) => u.id === t.requestedBy)?.name || t.requestedBy}</p>
          {t.note && <p className="text-sm text-ink-600 break-words">转账备注：{t.note}</p>}
          {t.reviewedAt && <p className="text-xs text-ink-500">审核时间：{new Date(t.reviewedAt).toLocaleString('zh-CN')}</p>}
          {t.reviewNote && <p className="text-sm text-ink-600 break-words">审核意见：{t.reviewNote}</p>}
          {canReview && t.status === 'pending' && (
            <form className="flex flex-wrap gap-2" onSubmit={(event) => {
              event.preventDefault();
              if (busy !== null) return;
              const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              if (button?.value !== 'approve' && button?.value !== 'reject') return;
              const note = String(new FormData(event.currentTarget).get('note') || '');
              void review(t.id, button.value, note);
            }}>
              <input type="text" name="note" className="input flex-1 min-w-40" aria-label="审核意见"
                placeholder="审核意见（可选）" maxLength={200} disabled={busy !== null} />
              <button type="submit" name="decision" value="approve" className="btn-primary text-sm" disabled={busy !== null}>
                {busy === t.id ? '处理中…' : '通过并转账'}
              </button>
              <button type="submit" name="decision" value="reject" className="btn-ghost text-sm" disabled={busy !== null}>驳回</button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
