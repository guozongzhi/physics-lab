import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback } from '@/lib/imageFallback';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Users,
  School,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  GraduationCap,
  Building2,
  Layers,
  ClipboardList,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { classesApi, teachersApi } from '@/lib/apiService';
import type { SchoolClass } from '@/types';
import { cn } from '@/lib/utils';
import ClassComposition from './ClassComposition';
import StudentRoster from './StudentRoster';

interface TeacherInfo {
  id: string;
  username: string;
  name: string;
  avatar: string;
}

type Tab = 'composition' | 'roster' | 'classes' | 'teachers';

export default function AdminConsole() {
  const pushToast = useUIStore((s) => s.pushToast);
  const [tab, setTab] = useState<Tab | null>(null);

  // ---- 班级管理 ----
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [newClassName, setNewClassName] = useState('');
  const [editingClass, setEditingClass] = useState<{ id: string; name: string } | null>(null);
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null);

  // ---- 教师管理 ----
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ username: '', password: '', name: '' });
  const [deleteTeacherId, setDeleteTeacherId] = useState<string | null>(null);
  const [resetTeacher, setResetTeacher] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const list = await classesApi.list();
      setClasses(list);
    } catch {
      pushToast('班级列表加载失败', 'error');
    } finally {
      setLoadingClasses(false);
    }
  }, [pushToast]);

  const loadTeachers = useCallback(async () => {
    setLoadingTeachers(true);
    try {
      const list = await teachersApi.list();
      setTeachers(list);
    } catch {
      pushToast('教师列表加载失败', 'error');
    } finally {
      setLoadingTeachers(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (tab === 'teachers') loadTeachers();
  }, [tab, loadTeachers]);

  // ---- 班级操作 ----
  const handleCreateClass = async () => {
    const name = newClassName.trim();
    if (!name) return;
    try {
      const cls = await classesApi.create(name);
      setClasses((prev) => [...prev, cls]);
      setNewClassName('');
      pushToast(`班级「${name}」创建成功`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '创建失败', 'error');
    }
  };

  const handleRenameClass = async () => {
    if (!editingClass) return;
    const name = editingClass.name.trim();
    if (!name) return;
    try {
      const cls = await classesApi.rename(editingClass.id, name);
      setClasses((prev) => prev.map((c) => (c.id === cls.id ? cls : c)));
      setEditingClass(null);
      pushToast('班级重命名成功', 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '重命名失败', 'error');
    }
  };

  const handleDeleteClass = async () => {
    if (!deleteClassId) return;
    try {
      await classesApi.remove(deleteClassId);
      setClasses((prev) => prev.filter((c) => c.id !== deleteClassId));
      setDeleteClassId(null);
      pushToast('班级已删除', 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '删除失败', 'error');
    }
  };

  // ---- 教师操作 ----
  const handleCreateTeacher = async () => {
    const { username, password, name } = teacherForm;
    if (!username.trim() || !password) {
      pushToast('请填写用户名和密码', 'warning');
      return;
    }
    try {
      const t = await teachersApi.create(username.trim(), password, name.trim() || undefined);
      setTeachers((prev) => [...prev, t]);
      setTeacherForm({ username: '', password: '', name: '' });
      setShowTeacherForm(false);
      pushToast(`教师「${t.name}」创建成功`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '创建失败', 'error');
    }
  };

  const handleDeleteTeacher = async () => {
    if (!deleteTeacherId) return;
    try {
      await teachersApi.remove(deleteTeacherId);
      setTeachers((prev) => prev.filter((t) => t.id !== deleteTeacherId));
      setDeleteTeacherId(null);
      pushToast('教师账号已删除', 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '删除失败', 'error');
    }
  };

  const handleResetPassword = async () => {
    if (!resetTeacher) return;
    if (resetPassword.length < 6) {
      pushToast('密码至少 6 位', 'warning');
      return;
    }
    try {
      await teachersApi.resetPassword(resetTeacher.id, resetPassword);
      pushToast(`教师「${resetTeacher.name}」密码已重置`, 'success');
      setResetTeacher(null);
      setResetPassword('');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '重置失败', 'error');
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="mission-page-intro flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ink-700 via-mission-700 to-nova-700 flex items-center justify-center text-white shadow-lg">
          <Shield size={28} strokeWidth={2.2} />
        </div>
        <div>
          <span className="chip-nova !py-0.5 !px-2 !text-[10px]">SUPER ADMIN</span>
          <h1 className="mt-1 text-[24px] font-extrabold text-ink-900 tracking-tight">管理控制台</h1>
          <p className="text-[13px] text-ink-500 font-medium">选择一个管理工作区，集中处理对应事务。</p>
        </div>
      </div>

      {/* 工作区入口 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { key: 'composition' as Tab, label: '班级构成', description: '查看各班小组与成员分布', icon: Layers },
          { key: 'roster' as Tab, label: '学生名单', description: '检索研究员与归属信息', icon: ClipboardList },
          { key: 'classes' as Tab, label: '班级管理', description: '创建、重命名与维护班级', icon: School },
          { key: 'teachers' as Tab, label: '教师管理', description: '配置教师账号与权限', icon: Users },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={cn('admin-portal-card', active && 'admin-portal-card-active')}
            >
              <span className="admin-portal-icon"><Icon size={20} /></span>
              <strong>{t.label}</strong>
              <small>{t.description}</small>
            </button>
          );
        })}
      </div>

      {!tab && (
        <div className="admin-portal-hint">
          <Shield size={24} />
          <strong>选择一个工作区开始管理</strong>
          <span>班级、学生与教师信息将分别在对应卡片中展开。</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          {/* ========== 班级构成（小组与成员管理） ========== */}
          {tab === 'composition' && <ClassComposition />}

          {/* ========== 学生名单 ========== */}
          {tab === 'roster' && <StudentRoster />}

          {/* ========== 班级管理 ========== */}
          {tab === 'classes' && (
            <div className="space-y-5">
              {/* Create bar */}
              <div className="glass-card p-5 rounded-[22px] flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Plus size={18} className="text-mission-500 shrink-0" />
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                    className="input-field flex-1"
                    placeholder="输入新班级名称，如：高三(3)班"
                  />
                </div>
                <button
                  onClick={handleCreateClass}
                  disabled={!newClassName.trim()}
                  className="btn-mission disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 !py-2.5"
                >
                  <Plus size={16} /> 创建班级
                </button>
              </div>

              {/* Class list */}
              {loadingClasses ? (
                <div className="glass-card p-10 rounded-[22px] text-center text-ink-400 flex items-center justify-center gap-2">
                  <Loader2 size={20} className="animate-spin" /> 加载中…
                </div>
              ) : classes.length === 0 ? (
                <div className="glass-card p-10 rounded-[22px] text-center text-ink-400">
                  暂无班级，请创建第一个班级
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {classes.map((cls) => (
                    <div
                      key={cls.id}
                      className="glass-card glass-card-hover p-5 rounded-[22px] flex items-center gap-4"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shadow-lg shrink-0">
                        <Building2 size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-ink-800 truncate">{cls.name}</div>
                        <div className="text-[11px] text-ink-400 font-mono mt-0.5">{cls.id}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setEditingClass({ id: cls.id, name: cls.name })}
                          className="w-9 h-9 rounded-xl glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-mission-600"
                          title="重命名"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteClassId(cls.id)}
                          className="w-9 h-9 rounded-xl glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-danger-600"
                          title="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========== 教师管理 ========== */}
          {tab === 'teachers' && (
            <div className="space-y-5">
              {/* Create bar */}
              <div className="glass-card p-5 rounded-[22px] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <GraduationCap size={20} className="text-mission-500" />
                  <span className="text-[14px] font-semibold text-ink-700">
                    教师账号 ({teachers.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowTeacherForm(true)}
                  className="btn-mission inline-flex items-center gap-2 !py-2.5"
                >
                  <Plus size={16} /> 新增教师
                </button>
              </div>

              {/* Teacher list */}
              {loadingTeachers ? (
                <div className="glass-card p-10 rounded-[22px] text-center text-ink-400 flex items-center justify-center gap-2">
                  <Loader2 size={20} className="animate-spin" /> 加载中…
                </div>
              ) : teachers.length === 0 ? (
                <div className="glass-card p-10 rounded-[22px] text-center text-ink-400">
                  暂无教师账号
                </div>
              ) : (
                <div className="space-y-3">
                  {teachers.map((t) => (
                    <div
                      key={t.id}
                      className="glass-card glass-card-hover p-4 rounded-[20px] flex items-center gap-4"
                    >
                      <img
                        src={t.avatar} onError={applyAvatarFallback}
                        alt={t.name}
                        className="w-11 h-11 rounded-xl object-cover bg-gradient-to-br from-mission-100 to-nova-100"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-ink-800">{t.name}</div>
                        <div className="text-[11px] text-ink-400 font-mono mt-0.5">
                          @{t.username} · {t.id}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            setResetTeacher({ id: t.id, name: t.name });
                            setResetPassword('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl glass-card glass-card-hover text-[12px] font-semibold text-ink-600 hover:text-energy-600"
                          title="重置密码"
                        >
                          <KeyRound size={14} /> 重置密码
                        </button>
                        <button
                          onClick={() => setDeleteTeacherId(t.id)}
                          className="w-9 h-9 rounded-xl glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-danger-600"
                          title="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ===== Modals ===== */}

      {/* Rename class modal */}
      <Modal open={!!editingClass} onClose={() => setEditingClass(null)} title="重命名班级" icon={Pencil}>
        <input
          type="text"
          value={editingClass?.name || ''}
          onChange={(e) => setEditingClass((prev) => (prev ? { ...prev, name: e.target.value } : null))}
          className="input-field"
          placeholder="班级名称"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleRenameClass()}
        />
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setEditingClass(null)}>取消</button>
          <button className="btn-mission flex-1" onClick={handleRenameClass}>确认</button>
        </div>
      </Modal>

      {/* Delete class confirm */}
      <ConfirmModal
        open={!!deleteClassId}
        onClose={() => setDeleteClassId(null)}
        onConfirm={handleDeleteClass}
        title="删除班级"
        message="删除班级将同时删除该班下所有小组、学生和金币流水，此操作不可撤销。"
        confirmText="确认删除"
        danger
      />

      {/* Create teacher modal */}
      <Modal open={showTeacherForm} onClose={() => setShowTeacherForm(false)} title="新增教师账号" icon={GraduationCap}>
        <div className="space-y-3">
          <div>
            <label className="field-label">用户名</label>
            <input
              type="text"
              value={teacherForm.username}
              onChange={(e) => setTeacherForm((f) => ({ ...f, username: e.target.value }))}
              className="input-field"
              placeholder="登录用户名"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">显示名（可选）</label>
            <input
              type="text"
              value={teacherForm.name}
              onChange={(e) => setTeacherForm((f) => ({ ...f, name: e.target.value }))}
              className="input-field"
              placeholder="如：王老师"
            />
          </div>
          <div>
            <label className="field-label">密码</label>
            <input
              type="password"
              value={teacherForm.password}
              onChange={(e) => setTeacherForm((f) => ({ ...f, password: e.target.value }))}
              className="input-field"
              placeholder="至少 6 位"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setShowTeacherForm(false)}>取消</button>
          <button className="btn-mission flex-1" onClick={handleCreateTeacher}>创建</button>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={!!resetTeacher}
        onClose={() => setResetTeacher(null)}
        title={`重置密码 · ${resetTeacher?.name || ''}`}
        icon={KeyRound}
      >
        <input
          type="password"
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
          className="input-field"
          placeholder="输入新密码（至少 6 位）"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
        />
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setResetTeacher(null)}>取消</button>
          <button className="btn-mission flex-1" onClick={handleResetPassword}>确认重置</button>
        </div>
      </Modal>

      {/* Delete teacher confirm */}
      <ConfirmModal
        open={!!deleteTeacherId}
        onClose={() => setDeleteTeacherId(null)}
        onConfirm={handleDeleteTeacher}
        title="删除教师账号"
        message="删除后该教师将无法登录，此操作不可撤销。"
        confirmText="确认删除"
        danger
      />
    </div>
  );
}

// ---------- Reusable modal components ----------

function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="glass-card w-full max-w-[440px] rounded-[24px] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white">
                  <Icon size={16} />
                </div>
                <h3 className="text-[16px] font-bold text-ink-800">{title}</h3>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400">
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="glass-card w-full max-w-[400px] rounded-[24px] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                danger ? 'bg-danger-50 text-danger-600' : 'bg-alert-50 text-alert-600'
              )}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-ink-800">{title}</h3>
                <p className="text-[13px] text-ink-500 mt-1 leading-relaxed">{message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost-mission flex-1" onClick={onClose}>取消</button>
              <button
                className={cn('flex-1 inline-flex items-center justify-center gap-2 !py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all', danger ? 'bg-gradient-to-br from-danger-400 to-danger-600 hover:shadow-[0_0_0_1px_rgba(239,68,68,0.25),0_12px_40px_rgba(239,68,68,0.22)]' : 'btn-mission')}
                onClick={onConfirm}
              >
                <CheckCircle2 size={16} /> {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
