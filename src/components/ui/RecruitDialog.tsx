import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useProjectStore } from '@/store/projectStore';
import { useGroupStore } from '@/store/groupStore';

/**
 * 组长发布招募对话框：为某个项目发布跨组招募（组长/教师可用）。
 * 复用 createRecruitment，发布后学生可在招募市场投标。
 * 酬劳即押金——发布时立刻从本组扣下，结算时再按结果转给中标组或退回，
 * 所以这里必须把余额摆出来并挡住付不起的数额。
 */
export default function RecruitDialog({
  open,
  onClose,
  projectId,
  projectTitle,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
}) {
  const pushToast = useUIStore((s) => s.pushToast);
  const createRecruitment = useProjectStore((s) => s.createRecruitment);
  const ownerGroupId = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.ownerGroupId
  );
  const balance = useGroupStore((s) => (ownerGroupId ? s.getGroupById(ownerGroupId)?.totalCoins ?? 0 : 0));
  const [form, setForm] = useState({ title: '', description: '', skills: '', reward: 50, daysLeft: 7 });
  const [saving, setSaving] = useState(false);

  const insufficient = form.reward > balance;

  const submit = async () => {
    if (!form.title.trim()) { pushToast('请填写招募标题', 'warning'); return; }
    if (!form.description.trim()) { pushToast('请填写任务描述', 'warning'); return; }
    if (!form.skills.trim()) { pushToast('请填写技能要求', 'warning'); return; }
    if (form.reward <= 0) { pushToast('酬劳需大于 0 能量币', 'warning'); return; }
    if (insufficient) {
      pushToast(`本组只有 ${balance} ⚡，付不起 ${form.reward} ⚡ 的酬劳`, 'warning');
      return;
    }
    setSaving(true);
    try {
      createRecruitment({
        projectId,
        title: form.title.trim(),
        description: form.description.trim(),
        skills: form.skills.split(/[,，\s]+/).filter(Boolean),
        reward: Number(form.reward) || 0,
        deadline: new Date(Date.now() + (Number(form.daysLeft) || 7) * 86400000),
      });
      pushToast('招募已发布，学生可在招募市场投标', 'success');
      setForm({ title: '', description: '', skills: '', reward: 50, daysLeft: 7 });
      onClose();
    } catch (e: unknown) {
      pushToast((e instanceof Error ? e.message : undefined) || '发布失败', 'error');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2">
            <Megaphone size={18} className="text-energy-500" />发布招募 · {projectTitle}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div><label className="label">招募标题</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：数据分析助手" /></div>
          <div><label className="label">任务描述</label><textarea className="input min-h-[80px] resize-y" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="需要完成的工作与交付物..." /></div>
          <div><label className="label">技能要求（用逗号或空格分隔）</label><input className="input" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="Python, 数据分析, Excel" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">酬劳（能量币）</label><input type="number" min={1} className="input" value={form.reward} onChange={(e) => setForm({ ...form, reward: Number(e.target.value) || 0 })} /></div>
            <div><label className="label">截止天数</label><input type="number" min={1} className="input" value={form.daysLeft} onChange={(e) => setForm({ ...form, daysLeft: Math.max(1, Number(e.target.value) || 1) })} /></div>
          </div>
          <p className={`text-[12px] ${insufficient ? 'text-danger-600' : 'text-ink-500'}`}>
            本组余额 {balance} ⚡。酬劳作为押金在发布时立即扣除，
            {insufficient
              ? `当前差额 ${form.reward - balance} ⚡，请先调低酬劳或让老师发放能量币。`
              : `发布后余额 ${balance - form.reward} ⚡；任务失败或未完成的部分会退回本组。`}
          </p>
        </div>
        <div className="flex gap-2 mt-6">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-energy flex-1" onClick={submit} disabled={saving || insufficient}>{saving ? '发布中…' : '发布招募'}</button>
        </div>
      </div>
    </div>
  );
}
