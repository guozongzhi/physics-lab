import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Target, Pencil, Trash2, Megaphone, X, Zap } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useGroupStore } from '@/store/groupStore';
import { useProjectStore } from '@/store/projectStore';
import type { Project, ProjectStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: '规划中',
  progress: '进行中',
  review: '评审中',
  done: '已完成',
  failed: '已失败',
  frozen: '已冻结',
};

const STATUS_CHIP: Record<ProjectStatus, string> = {
  planning: 'chip-ink',
  progress: 'chip-mission',
  review: 'chip-alert',
  done: 'chip-growth',
  failed: 'chip-danger',
  frozen: 'chip-nova',
};

export default function TeacherProjects() {
  const { projects, createProject, updateProject, deleteProject, createRecruitment } = useProjectStore();
  const { groups, users } = useGroupStore();
  const pushToast = useUIStore((s) => s.pushToast);

  const groupNameOf = (gid: string) => groups.find((g) => g.id === gid)?.name || '未分组';
  const memberCountOf = (gid: string) => users.filter((u) => u.groupId === gid).length;

  // 项目表单（新建/编辑）
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [pForm, setPForm] = useState({
    title: '', topic: '', status: 'planning' as ProjectStatus, progress: 0,
    dueDate: '', rewardCoins: 200, techPoints: '', difficulties: '', ownerGroupId: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  // 招募表单
  const [recOpen, setRecOpen] = useState(false);
  const [recProject, setRecProject] = useState<Project | null>(null);
  const [recForm, setRecForm] = useState({ title: '', description: '', skills: '', reward: 50, daysLeft: 7 });
  const [recSaving, setRecSaving] = useState(false);

  // 招募酬劳即押金，发布时从项目归属组扣下，先算出余额用来拦人
  const recOwnerGroup = recProject ? groups.find((g) => g.id === recProject.ownerGroupId) : undefined;
  const recBalance = recOwnerGroup?.totalCoins ?? 0;
  const recInsufficient = Number(recForm.reward) > recBalance;

  const openCreate = () => {
    setEditing(null);
    setPForm({
      title: '', topic: '', status: 'planning', progress: 0,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      rewardCoins: 200, techPoints: '', difficulties: '', ownerGroupId: '',
    });
    setFormOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    const d = p.dueDate instanceof Date ? p.dueDate : new Date(p.dueDate);
    setPForm({
      title: p.title, topic: p.topic, status: p.status, progress: p.progress,
      dueDate: isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10),
      rewardCoins: p.rewardCoins, techPoints: p.techPoints || '', difficulties: p.difficulties || '',
      ownerGroupId: p.ownerGroupId,
    });
    setFormOpen(true);
  };

  const submitProject = async () => {
    if (!pForm.title.trim()) { pushToast('请填写项目名称', 'warning'); return; }
    if (!pForm.topic.trim()) { pushToast('请填写课题', 'warning'); return; }
    if (!editing && !pForm.ownerGroupId) { pushToast('请选择所属小组', 'warning'); return; }
    setSaving(true);
    try {
      const patch = {
        title: pForm.title.trim(),
        topic: pForm.topic.trim(),
        status: pForm.status,
        progress: Math.max(0, Math.min(100, Number(pForm.progress) || 0)),
        dueDate: pForm.dueDate ? new Date(pForm.dueDate) : undefined,
        rewardCoins: Number(pForm.rewardCoins) || 0,
        techPoints: pForm.techPoints,
        difficulties: pForm.difficulties,
      };
      if (editing) {
        updateProject(editing.id, patch);
        pushToast('项目已更新', 'success');
      } else {
        createProject({ ...patch, ownerGroupId: pForm.ownerGroupId });
        pushToast('项目已创建', 'success');
      }
      setFormOpen(false);
      setEditing(null);
    } catch (e: unknown) {
      pushToast((e instanceof Error ? e.message : undefined) || '保存失败', 'error');
    } finally { setSaving(false); }
  };

  const openRecruit = (p: Project) => {
    setRecProject(p);
    setRecForm({ title: '', description: '', skills: '', reward: 50, daysLeft: 7 });
    setRecOpen(true);
  };

  const submitRecruit = async () => {
    if (!recProject) return;
    if (!recForm.title.trim()) { pushToast('请填写招募标题', 'warning'); return; }
    if (!recForm.description.trim()) { pushToast('请填写任务描述', 'warning'); return; }
    if (!recForm.skills.trim()) { pushToast('请填写技能要求', 'warning'); return; }
    if (Number(recForm.reward) <= 0) { pushToast('酬劳需大于 0 能量币', 'warning'); return; }
    if (!recOwnerGroup) { pushToast('该项目没有归属小组，无法发布招募', 'warning'); return; }
    if (recInsufficient) {
      pushToast(`归属组只有 ${recBalance} ⚡，付不起 ${recForm.reward} ⚡ 的酬劳`, 'warning');
      return;
    }
    setRecSaving(true);
    try {
      createRecruitment({
        projectId: recProject.id,
        title: recForm.title.trim(),
        description: recForm.description.trim(),
        skills: recForm.skills.split(/[,，\s]+/).filter(Boolean),
        reward: Number(recForm.reward) || 0,
        deadline: new Date(Date.now() + (Number(recForm.daysLeft) || 7) * 86400000),
      });
      pushToast('招募已发布，学生可在招募市场投标', 'success');
      setRecOpen(false);
    } catch (e: unknown) {
      pushToast((e instanceof Error ? e.message : undefined) || '发布失败', 'error');
    } finally { setRecSaving(false); }
  };

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.ownerGroupId.localeCompare(b.ownerGroupId)), [projects]);

  return (
    <div className="w-full space-y-6">
      <section className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <span className="mission-label"><Target size={12} /> PROJECTS & RECRUITMENT</span>
            <h1 className="mt-2 text-[28px] md:text-[32px] font-extrabold text-ink-900 leading-tight">项目 & 招募管理</h1>
            <p className="mt-1.5 text-[14px] text-ink-500">创建项目给各小组、编辑进度、删除项目，并为任意小组发布跨组招募。</p>
          </div>
          <button className="btn-mission flex items-center gap-2 !py-2.5 shrink-0 self-start sm:self-auto" onClick={openCreate}>
            <Plus size={16} /> 新建项目
          </button>
        </div>
      </section>

      <section className="glass-card p-5 md:p-6 rounded-[24px]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-ink-800"><Target size={18} className="text-mission-500" />全部项目 · {sortedProjects.length}</h3>
          <span className="text-[11px] text-ink-400">教师可编辑/删除任意项目、发布招募</span>
        </div>
        <div className="space-y-3 md:hidden">
          {sortedProjects.length === 0 ? (
            <p className="py-8 text-center text-ink-500">暂无项目，点击「新建项目」开始。</p>
          ) : sortedProjects.map((p) => (
            <article key={p.id} className="rounded-2xl border border-mission-100/70 bg-white/75 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-ink-800 break-words">{p.title}</h4>
                  <p className="mt-1 text-xs text-ink-500">{groupNameOf(p.ownerGroupId)} · {memberCountOf(p.ownerGroupId)} 人</p>
                </div>
                <span className={cn(STATUS_CHIP[p.status], '!py-0.5 !px-2 text-[11px] shrink-0')}>{STATUS_LABEL[p.status]}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-ink-600 border-t border-ink-100 pt-3">
                <span>进度 <strong className="text-ink-800">{p.progress}%</strong></span>
                <span className="flex items-center gap-1 text-energy-600 font-bold"><Zap size={13} />{p.rewardCoins} 能量</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn-ghost !px-2 !py-2 text-xs" onClick={() => openEdit(p)}><Pencil size={13} />编辑</button>
                <button className="btn-ghost !px-2 !py-2 text-xs" onClick={() => openRecruit(p)}><Megaphone size={13} />招募</button>
                <button className="btn-ghost !px-2 !py-2 text-xs text-danger-600" onClick={() => setDeleteTarget(p)}><Trash2 size={13} />删除</button>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-[11px] text-ink-400 font-semibold uppercase tracking-wider">
                <th className="text-left py-3 px-3 font-medium">项目</th>
                <th className="text-left py-3 px-3 font-medium">小组</th>
                <th className="text-left py-3 px-3 font-medium">状态</th>
                <th className="text-left py-3 px-3 font-medium">进度</th>
                <th className="text-left py-3 px-3 font-medium">奖励</th>
                <th className="text-right py-3 px-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-ink-400">暂无项目，点击右上角「新建项目」</td></tr>
              ) : sortedProjects.map((p, i) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.03 }}
                  className="border-t border-ink-100/60 hover:bg-mission-50/30 transition"
                >
                  <td className="py-3 px-3 font-semibold text-ink-800">{p.title}</td>
                  <td className="py-3 px-3 text-ink-600">{groupNameOf(p.ownerGroupId)}（{memberCountOf(p.ownerGroupId)}人）</td>
                  <td className="py-3 px-3"><span className={cn(STATUS_CHIP[p.status], '!py-0.5 !px-2 text-[11px]')}>{STATUS_LABEL[p.status]}</span></td>
                  <td className="py-3 px-3"><span className="font-bold tabular-nums text-ink-700">{p.progress}%</span></td>
                  <td className="py-3 px-3"><span className="flex items-center gap-1 font-bold text-energy-600"><Zap size={12} />{p.rewardCoins}</span></td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button title="编辑" className="w-7 h-7 rounded-lg bg-white/80 border border-ink-100 flex items-center justify-center text-ink-500 hover:text-mission-600 transition" onClick={() => openEdit(p)}><Pencil size={13} /></button>
                      <button title="发布招募" className="w-7 h-7 rounded-lg bg-white/80 border border-ink-100 flex items-center justify-center text-ink-500 hover:text-energy-600 transition" onClick={() => openRecruit(p)}><Megaphone size={13} /></button>
                      <button title="删除" className="w-7 h-7 rounded-lg bg-white/80 border border-ink-100 flex items-center justify-center text-ink-500 hover:text-danger-600 transition" onClick={() => setDeleteTarget(p)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 新建/编辑项目 */}
      {formOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2"><Target size={18} className="text-mission-500" />{editing ? '编辑项目' : '新建项目'}</h3>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="label">项目名称</label><input className="input" value={pForm.title} onChange={(e) => setPForm({ ...pForm, title: e.target.value })} placeholder="例如：磁悬浮列车模型" /></div>
              <div><label className="label">课题</label><input className="input" value={pForm.topic} onChange={(e) => setPForm({ ...pForm, topic: e.target.value })} placeholder="例如：电磁学" /></div>
              {!editing && (
                <div><label className="label">所属小组</label>
                  <select className="input" value={pForm.ownerGroupId} onChange={(e) => setPForm({ ...pForm, ownerGroupId: e.target.value })}>
                    <option value="">选择小组…</option>
                    {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">状态</label>
                  <select className="input" value={pForm.status} onChange={(e) => setPForm({ ...pForm, status: e.target.value as ProjectStatus })}>
                    {(['planning', 'progress', 'review', 'done', 'failed', 'frozen'] as ProjectStatus[]).map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
                  </select>
                </div>
                <div><label className="label">进度 %</label><input type="number" min={0} max={100} className="input" value={pForm.progress} onChange={(e) => setPForm({ ...pForm, progress: Number(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">截止日期</label><input type="date" className="input" value={pForm.dueDate} onChange={(e) => setPForm({ ...pForm, dueDate: e.target.value })} /></div>
                <div><label className="label">奖励币 ⚡</label><input type="number" min={0} className="input" value={pForm.rewardCoins} onChange={(e) => setPForm({ ...pForm, rewardCoins: Number(e.target.value) || 0 })} /></div>
              </div>
              <div><label className="label">技术要点（可选）</label><textarea className="input min-h-[60px] resize-y" value={pForm.techPoints} onChange={(e) => setPForm({ ...pForm, techPoints: e.target.value })} placeholder="# 支持 Markdown" /></div>
              <div><label className="label">技术难点（可选）</label><textarea className="input min-h-[60px] resize-y" value={pForm.difficulties} onChange={(e) => setPForm({ ...pForm, difficulties: e.target.value })} placeholder="# 支持 Markdown" /></div>
            </div>
            <div className="flex gap-2 mt-6">
              <button className="btn-ghost flex-1" onClick={() => setFormOpen(false)}>取消</button>
              <button className="btn-mission flex-1" onClick={submitProject} disabled={saving}>{saving ? '保存中…' : editing ? '保存修改' : '创建项目'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2 mb-2"><Target size={18} className="text-danger-500" />删除项目</h3>
            <p className="text-[13px] text-ink-500 mb-5">确定删除「{deleteTarget.title}」？关联的招募公告也会一并删除，此操作不可撤销。</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-danger-400 to-danger-600" onClick={() => { deleteProject(deleteTarget.id); pushToast('项目已删除', 'success'); setDeleteTarget(null); }}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 发布招募 */}
      {recOpen && recProject && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={() => setRecOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-ink-800 flex items-center gap-2"><Megaphone size={18} className="text-energy-500" />发布招募 · {recProject.title}</h3>
              <button onClick={() => setRecOpen(false)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="label">招募标题</label><input className="input" value={recForm.title} onChange={(e) => setRecForm({ ...recForm, title: e.target.value })} placeholder="例如：数据分析助手" /></div>
              <div><label className="label">任务描述</label><textarea className="input min-h-[80px] resize-y" value={recForm.description} onChange={(e) => setRecForm({ ...recForm, description: e.target.value })} placeholder="需要完成的工作与交付物..." /></div>
              <div><label className="label">技能要求（用逗号或空格分隔）</label><input className="input" value={recForm.skills} onChange={(e) => setRecForm({ ...recForm, skills: e.target.value })} placeholder="Python, 数据分析, Excel" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">酬劳（能量币）</label><input type="number" min={1} className="input" value={recForm.reward} onChange={(e) => setRecForm({ ...recForm, reward: Number(e.target.value) || 0 })} /></div>
                <div><label className="label">截止天数</label><input type="number" min={1} className="input" value={recForm.daysLeft} onChange={(e) => setRecForm({ ...recForm, daysLeft: Math.max(1, Number(e.target.value) || 1) })} /></div>
              </div>
              <p className={`text-[12px] ${recInsufficient || !recOwnerGroup ? 'text-danger-600' : 'text-ink-500'}`}>
                {recOwnerGroup
                  ? `归属组「${recOwnerGroup.name}」余额 ${recBalance} ⚡。酬劳作为押金在发布时立即扣除，` +
                    (recInsufficient
                      ? `当前差额 ${Number(recForm.reward) - recBalance} ⚡，请先调低酬劳或为该组发放能量币。`
                      : `发布后余额 ${recBalance - Number(recForm.reward)} ⚡；失败或未完成的部分会退回该组。`)
                  : '该项目没有归属小组，无法发布招募——请先为项目指定归属小组。'}
              </p>
            </div>
            <div className="flex gap-2 mt-6">
              <button className="btn-ghost flex-1" onClick={() => setRecOpen(false)}>取消</button>
              <button className="btn-energy flex-1" onClick={submitRecruit} disabled={recSaving || recInsufficient || !recOwnerGroup}>{recSaving ? '发布中…' : '发布招募'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
