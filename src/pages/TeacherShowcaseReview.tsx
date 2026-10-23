import HtmlDemo from '@/components/showcase/HtmlDemo';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Check, X, Zap, AlertTriangle, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useGroupStore } from '@/store/groupStore';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import type { ShowcaseItem } from '@/types';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_META: Record<ShowcaseItem['status'], { label: string; chip: string }> = {
  pending: { label: '待审批', chip: 'chip-energy' },
  approved: { label: '已通过', chip: 'chip-growth' },
  rejected: { label: '已驳回', chip: 'chip-danger' },
};

/**
 * 成果审批 —— 学生在成果展览馆提交的作品在这里排队等教师处理。
 * 通过时可以奖励该小组能量币（走 reviewShowcaseItem → 后端 add_tx 真实记账）。
 */
export default function TeacherShowcaseReview() {
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const { showcaseItems, reviewShowcaseItem, updateShowcaseItem, deleteShowcaseItem } = useProjectStore();
  const getGroupById = useGroupStore((s) => s.getGroupById);
  const pushToast = useUIStore((s) => s.pushToast);

  const [filter, setFilter] = useState<Filter>('pending');
  const [approveTarget, setApproveTarget] = useState<ShowcaseItem | null>(null);
  const [coins, setCoins] = useState(50);
  const [rejectTarget, setRejectTarget] = useState<ShowcaseItem | null>(null);
  const [reason, setReason] = useState('');
  const [editTarget, setEditTarget] = useState<ShowcaseItem | null>(null);
  const [editForm, setEditForm] = useState({ title: '', coverImage: '', description: '' });
  const [deleteTarget, setDeleteTarget] = useState<ShowcaseItem | null>(null);

  const counts = useMemo(
    () => ({
      pending: showcaseItems.filter((s) => s.status === 'pending').length,
      approved: showcaseItems.filter((s) => s.status === 'approved').length,
      rejected: showcaseItems.filter((s) => s.status === 'rejected').length,
      all: showcaseItems.length,
    }),
    [showcaseItems]
  );

  const list = useMemo(
    () =>
      [...showcaseItems]
        .filter((s) => filter === 'all' || s.status === filter)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [showcaseItems, filter]
  );

  const groupNameOf = (gid: string) => getGroupById(gid)?.name || '未知小组';

  const doApprove = () => {
    if (!approveTarget) return;
    reviewShowcaseItem(approveTarget.id, 'approve', approveTarget.groupId ? Math.max(0, coins) : 0);
    pushToast(
      coins > 0
        ? `已通过「${approveTarget.title}」，奖励 ${coins}⚡`
        : `已通过「${approveTarget.title}」`,
      'success'
    );
    setApproveTarget(null);
  };

  const doReject = () => {
    if (!rejectTarget) return;
    if (!reason.trim()) {
      pushToast('请填写驳回理由', 'warning');
      return;
    }
    reviewShowcaseItem(rejectTarget.id, 'reject', undefined, reason.trim());
    pushToast(`已驳回「${rejectTarget.title}」`, 'warning');
    setRejectTarget(null);
    setReason('');
  };

  const openEdit = (item: ShowcaseItem) => {
    setEditTarget(item);
    setEditForm({
      title: item.title,
      coverImage: item.coverImage,
      description: item.description,
    });
  };

  const doEdit = () => {
    if (!editTarget) return;
    const title = editForm.title.trim();
    if (!title) {
      pushToast('作品标题不能为空', 'warning');
      return;
    }
    // 教师是审批人，改内容不重新送审——保留原状态（已通过的仍已通过）
    updateShowcaseItem(
      editTarget.id,
      { title, coverImage: editForm.coverImage.trim(), description: editForm.description },
      true
    );
    pushToast(`已更新「${title}」`, 'success');
    setEditTarget(null);
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    deleteShowcaseItem(deleteTarget.id);
    pushToast(`已下架「${deleteTarget.title}」`, 'success');
    setDeleteTarget(null);
  };

  const TABS: Array<{ key: Filter; label: string }> = [
    { key: 'pending', label: `待审批 (${counts.pending})` },
    { key: 'approved', label: `已通过 (${counts.approved})` },
    { key: 'rejected', label: `已驳回 (${counts.rejected})` },
    { key: 'all', label: `全部 (${counts.all})` },
  ];

  return (
    <div className="space-y-6">
      {/* ============ 标题 ============ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
      >
        <div className="absolute -top-10 right-10 w-64 h-64 rounded-full bg-alert-400/10 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <span className="mission-label">
            <Trophy size={12} />
            SHOWCASE REVIEW · 成果审批
          </span>
          <h1 className="mt-3 text-[28px] md:text-[32px] font-extrabold text-ink-900 leading-[1.15] tracking-tight">
            成果展览馆审批
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-500 max-w-lg leading-relaxed">
            学生提交的作品需经审批才正式展出。通过时可奖励该小组能量币（会真实计入小组总能量与流水）。
          </p>

          <div className="flex flex-wrap gap-2 mt-5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  'px-4 py-2 rounded-xl text-[13px] font-bold transition-all',
                  filter === t.key
                    ? 'bg-gradient-to-br from-mission-500 to-nova-500 text-white shadow-glowMission'
                    : 'glass-card !shadow-none text-ink-600 hover:text-mission-700'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ============ 列表 ============ */}
      {list.length === 0 ? (
        <div className="glass-card p-12 text-center text-ink-400 text-[13px]">
          {filter === 'pending' ? '当前没有待审批的作品 🎉' : '暂无作品'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((item, idx) => {
            const meta = STATUS_META[item.status];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                className="glass-card p-4 rounded-[22px] flex gap-4"
              >
                <div className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-mission-400/30 via-nova-400/20 to-energy-400/20 relative flex items-center justify-center">
                  <ImageIcon size={22} className="absolute text-white/60" />
                  {item.coverImage && (
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="relative w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="text-[14.5px] font-extrabold text-ink-900 leading-snug">{item.title}</h3>
                    <span className={cn(meta.chip, '!py-0 !px-1.5 !text-[10px]')}>{meta.label}</span>
                  </div>
                  <div className="text-[12px] text-ink-500 mt-1">{item.authorUserId || groupNameOf(item.groupId)}</div>
                  {item.htmlContent && <div className="my-3"><button className="btn-outline" onClick={() => setHtmlPreview(htmlPreview === item.id ? null : item.id)}>{htmlPreview === item.id ? '关闭 HTML 预览' : '预览 HTML 交互作品'}</button>{htmlPreview === item.id && <HtmlDemo html={item.htmlContent} title={item.title} />}</div>}
                  {item.description && (
                    <p className="text-[12px] text-ink-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                  )}
                  {item.status === 'rejected' && item.rejectReason && (
                    <p className="text-[12px] text-danger-600 mt-1.5 leading-relaxed">
                      驳回理由：{item.rejectReason}
                    </p>
                  )}
                  {item.status === 'approved' && item.awardedCoins > 0 && (
                    <p className="text-[12px] text-growth-700 font-semibold mt-1.5">
                      已奖励 {item.awardedCoins} ⚡
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => { setApproveTarget(item); setCoins(item.groupId ? 50 : 0); }}
                          className="px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-white bg-gradient-to-br from-growth-400 to-growth-600 inline-flex items-center gap-1"
                        >
                          <Check size={13} />通过
                        </button>
                        <button
                          onClick={() => { setRejectTarget(item); setReason(''); }}
                          className="px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-danger-700 bg-danger-50 hover:bg-danger-100 inline-flex items-center gap-1 transition-colors"
                        >
                          <X size={13} />驳回
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openEdit(item)}
                      className="px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-ink-600 bg-ink-50 hover:bg-ink-100 inline-flex items-center gap-1 transition-colors"
                    >
                      <Pencil size={13} />编辑
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold text-danger-700 bg-danger-50 hover:bg-danger-100 inline-flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={13} />下架
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ============ 通过 + 奖励弹窗 ============ */}
      {approveTarget && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
          onClick={() => setApproveTarget(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-growth-400 to-growth-600 flex items-center justify-center text-white">
                <Check size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-[17px] text-ink-900">通过并奖励</h3>
                <p className="text-[12px] text-ink-500 truncate">{approveTarget.title}</p>
              </div>
              <button
                onClick={() => setApproveTarget(null)}
                className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[12.5px] text-ink-600 mb-3">
              奖励给 <b className="text-ink-800">{approveTarget.authorUserId || groupNameOf(approveTarget.groupId)}</b> 的能量币（填 0 表示只通过不奖励）：
            </p>
            <input
              type="number"
              min={0}
              disabled={!approveTarget.groupId}
              aria-label="奖励能量币"
              value={coins}
              onChange={(e) => setCoins(Math.max(0, Number(e.target.value) || 0))}
              className="input w-full mb-5"
            />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setApproveTarget(null)}>取消</button>
              <button
                onClick={doApprove}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-growth-400 to-growth-600 inline-flex items-center justify-center gap-1.5"
              >
                <Zap size={14} />确认通过
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 驳回弹窗（必填理由） ============ */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
          onClick={() => setRejectTarget(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-danger-400 to-alert-500 flex items-center justify-center text-white">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-[17px] text-ink-900">驳回作品</h3>
                <p className="text-[12px] text-ink-500 truncate">{rejectTarget.title}</p>
              </div>
              <button
                onClick={() => setRejectTarget(null)}
                className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400"
              >
                <X size={16} />
              </button>
            </div>

            <label className="text-[12px] font-bold text-ink-600 mb-1.5 block">驳回理由（学生能看到）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="例如：作品描述太简略，请补充实验数据与结论"
              className="input w-full mb-5 resize-none"
            />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setRejectTarget(null)}>取消</button>
              <button
                onClick={doReject}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-danger-400 to-danger-600"
              >
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 编辑作品（保留原审批状态） ============ */}
      {editTarget && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
          onClick={() => setEditTarget(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white">
                <Pencil size={19} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-[17px] text-ink-900">编辑作品</h3>
                <p className="text-[12px] text-ink-500 truncate">{editTarget.authorUserId || groupNameOf(editTarget.groupId)}</p>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400"
              >
                <X size={16} />
              </button>
            </div>

            <label className="text-[12px] font-bold text-ink-600 mb-1.5 block">作品标题</label>
            <input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="input w-full mb-4"
            />

            <label className="text-[12px] font-bold text-ink-600 mb-1.5 block">封面图片地址</label>
            <input
              value={editForm.coverImage}
              onChange={(e) => setEditForm({ ...editForm, coverImage: e.target.value })}
              placeholder="留空则不显示封面"
              className="input w-full mb-4"
            />

            <label className="text-[12px] font-bold text-ink-600 mb-1.5 block">作品说明</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              rows={3}
              className="input w-full mb-3 resize-none"
            />

            <p className="text-[11.5px] text-ink-400 mb-5 leading-relaxed">
              教师的修改<b className="text-ink-600">不会改变审批状态</b>
              ——「已通过」的改完仍是已通过，不会退回待审批。
            </p>

            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setEditTarget(null)}>取消</button>
              <button
                onClick={doEdit}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-mission-500 to-nova-500 inline-flex items-center justify-center gap-1.5"
              >
                <Check size={14} />保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 下架确认 ============ */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-danger-400 to-danger-600 flex items-center justify-center text-white">
                <Trash2 size={19} />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-[17px] text-ink-900">下架作品</h3>
                <p className="text-[12px] text-ink-500 truncate">{deleteTarget.title}</p>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="ml-auto w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[12.5px] text-ink-600 leading-relaxed mb-2">
              将把「{deleteTarget.title}」从成果展览馆移除，学生端不再展示。
            </p>
            {deleteTarget.awardedCoins > 0 && (
              <p className="text-[12px] text-alert-700 bg-alert-50 rounded-xl px-3 py-2.5 leading-relaxed mb-2">
                该作品曾奖励 <b>{deleteTarget.awardedCoins} ⚡</b>，
                <b>这笔能量币不会收回</b>——它已经计入小组总分与流水。
              </p>
            )}
            <p className="text-[12px] text-ink-400 mb-5">此操作不可撤销。</p>

            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>取消</button>
              <button
                onClick={doDelete}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-danger-400 to-danger-600"
              >
                确认下架
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
