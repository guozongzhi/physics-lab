import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback } from '@/lib/imageFallback';
/**
 * 班级构成管理 —— 管理员视图
 *
 * 层级结构：班级 → 小组 → 成员
 * 支持操作：
 *  - 选择班级查看其下小组和成员
 *  - 创建/重命名/删除小组
 *  - 移动小组到其他班级
 *  - 移动成员到其他小组
 *  - 移除成员（设为未分组）
 *  - 设置/取消组长
 */
/**
 * 班级构成管理 —— 管理员视图
 *
 * 层级结构：班级 → 小组 → 成员
 * 支持操作：
 *  - 选择班级查看其下小组和成员
 *  - 创建/重命名/删除小组
 *  - 移动小组到其他班级
 *  - 移动成员到其他小组
 *  - 移除成员（设为未分组）
 *  - 设置/取消组长
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { School, Users, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Crown, UserMinus, ArrowRightLeft, X, Loader2, Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { classesApi, groupsApi, usersApi, adminGroupsApi } from '@/lib/apiService';
import type { SchoolClass, Group, User } from '@/types';
import { cn } from '@/lib/utils';

export default function ClassComposition() {
  const pushToast = useUIStore((s) => s.pushToast);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 操作弹窗
  const [newGroupName, setNewGroupName] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState<{ id: string; name: string } | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [movingGroup, setMovingGroup] = useState<{ id: string; name: string } | null>(null);
  const [moveTargetClass, setMoveTargetClass] = useState('');
  const [movingMember, setMovingMember] = useState<{ userId: string; name: string; fromGroupId: string } | null>(null);
  const [moveTargetGroup, setMoveTargetGroup] = useState('');

  // ---- 数据加载 ----
  const loadClasses = useCallback(async () => {
    try {
      const list = await classesApi.list();
      setClasses(list);
      if (list.length > 0 && !selectedClassId) {
        setSelectedClassId(list[0].id);
      }
    } catch {
      pushToast('班级列表加载失败', 'error');
    }
  }, [pushToast, selectedClassId]);

  const loadClassData = useCallback(async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const [groupList, userList] = await Promise.all([
        groupsApi.list(selectedClassId),
        usersApi.listByClass(selectedClassId),
      ]);
      setGroups(groupList);
      setAllUsers(userList);
      // 默认展开所有小组
      setExpandedGroups(new Set(groupList.map((g) => g.id)));
    } catch {
      pushToast('班级数据加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, pushToast]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (selectedClassId) loadClassData();
  }, [selectedClassId, loadClassData]);

  // ---- 派生数据 ----
  const groupMembers = useMemo(() => {
    const map: Record<string, User[]> = {};
    for (const g of groups) map[g.id] = [];
    const unassigned: User[] = [];
    for (const u of allUsers) {
      if (u.groupId && map[u.groupId]) {
        map[u.groupId].push(u);
      } else {
        unassigned.push(u);
      }
    }
    return { map, unassigned };
  }, [groups, allUsers]);

  const otherClasses = useMemo(
    () => classes.filter((c) => c.id !== selectedClassId),
    [classes, selectedClassId]
  );

  // 可移动到的目标小组（同班其他小组）
  const moveTargetGroups = useMemo(() => {
    if (!movingMember) return [];
    return groups.filter((g) => g.id !== movingMember.fromGroupId);
  }, [movingMember, groups]);

  // ---- 小组操作 ----
  const toggleExpand = (gid: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || !selectedClassId) return;
    try {
      const g = await groupsApi.create(name, 500, selectedClassId);
      setGroups((prev) => [...prev, g]);
      setExpandedGroups((prev) => new Set(prev).add(g.id));
      setNewGroupName('');
      setShowCreateGroup(false);
      pushToast(`小组「${name}」创建成功`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '创建失败', 'error');
    }
  };

  const handleRenameGroup = async () => {
    if (!renamingGroup) return;
    const name = renamingGroup.name.trim();
    if (!name) return;
    try {
      const g = await groupsApi.rename(renamingGroup.id, name);
      setGroups((prev) => prev.map((x) => (x.id === g.id ? g : x)));
      setRenamingGroup(null);
      pushToast('小组重命名成功', 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '重命名失败', 'error');
    }
  };

  const handleDeleteGroup = async () => {
    if (!deletingGroupId) return;
    try {
      await groupsApi.remove(deletingGroupId);
      setGroups((prev) => prev.filter((g) => g.id !== deletingGroupId));
      setAllUsers((prev) => prev.filter((u) => u.groupId !== deletingGroupId));
      setDeletingGroupId(null);
      pushToast('小组已删除', 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '删除失败', 'error');
    }
  };

  const handleMoveGroup = async () => {
    if (!movingGroup || !moveTargetClass) return;
    try {
      const g = await adminGroupsApi.moveClass(movingGroup.id, moveTargetClass);
      // 移出当前列表（已归属其他班级）
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      setAllUsers((prev) => prev.filter((u) => u.groupId !== g.id));
      setMovingGroup(null);
      setMoveTargetClass('');
      pushToast(`小组已移动到「${classes.find((c) => c.id === g.classId)?.name || ''}」`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '移动失败', 'error');
    }
  };

  // ---- 成员操作 ----
  const handleMoveMember = async () => {
    if (!movingMember || !moveTargetGroup) return;
    try {
      const updated = await usersApi.assignGroup(movingMember.userId, moveTargetGroup, 'member');
      setAllUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setMovingMember(null);
      setMoveTargetGroup('');
      pushToast(`成员已移动到新小组`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '移动失败', 'error');
    }
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    try {
      const updated = await usersApi.assignGroup(userId, null, 'member');
      setAllUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      pushToast(`已将「${userName}」移出小组`, 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '移除失败', 'error');
    }
  };

  const handleSetLeader = async (groupId: string, userId: string) => {
    try {
      await groupsApi.setLeader(groupId, userId);
      // 更新本地：该组内 leader 重排
      setAllUsers((prev) =>
        prev.map((u) => {
          if (u.groupId !== groupId) return u;
          return { ...u, role: (u.id === userId ? 'leader' : 'member') as 'leader' | 'member' };
        })
      );
      pushToast('已设置组长', 'success');
    } catch (err: unknown) {
      pushToast((err instanceof Error ? err.message : undefined) || '设置失败', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* 班级选择器 + 创建小组 */}
      <div className="glass-card p-5 rounded-[22px] flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <School size={18} className="text-mission-500 shrink-0" />
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="input-field cursor-pointer"
          >
            {classes.length === 0 ? (
              <option value="">暂无班级</option>
            ) : (
              classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))
            )}
          </select>
        </div>
        <button
          onClick={() => setShowCreateGroup(true)}
          disabled={!selectedClassId}
          className="btn-mission disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 !py-2.5"
        >
          <Plus size={16} /> 新建小组
        </button>
      </div>

      {/* 统计 */}
      {!loading && selectedClassId && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="chip-mission !py-1 !px-3 inline-flex items-center gap-1.5">
            <Layers size={13} /> {groups.length} 个小组
          </span>
          <span className="chip-nova !py-1 !px-3 inline-flex items-center gap-1.5">
            <Users size={13} /> {allUsers.length} 名学生
          </span>
          {groupMembers.unassigned.length > 0 && (
            <span className="chip-alert !py-1 !px-3 inline-flex items-center gap-1.5">
              <AlertTriangle size={13} /> {groupMembers.unassigned.length} 人未分组
            </span>
          )}
        </div>
      )}

      {/* 加载中 */}
      {loading ? (
        <div className="glass-card p-10 rounded-[22px] text-center text-ink-400 flex items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin" /> 加载中…
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card p-10 rounded-[22px] text-center text-ink-400">
          该班级暂无小组，点击「新建小组」创建
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const members = groupMembers.map[g.id] || [];
            const expanded = expandedGroups.has(g.id);
            return (
              <div key={g.id} className="glass-card rounded-[22px] overflow-hidden">
                {/* 小组头部 */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => toggleExpand(g.id)}
                    className="w-7 h-7 rounded-lg hover:bg-mission-50 flex items-center justify-center text-ink-400 transition"
                  >
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mission-400 to-nova-500 flex items-center justify-center text-white shadow-md shrink-0">
                    <Users size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-ink-800 truncate">{g.name}</div>
                    <div className="text-[11px] text-ink-400 font-medium mt-0.5">
                      {members.length} 人 · {g.totalCoins} ⚡
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setRenamingGroup({ id: g.id, name: g.name })}
                      className="w-8 h-8 rounded-lg glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-mission-600"
                      title="重命名"
                    >
                      <Pencil size={14} />
                    </button>
                    {otherClasses.length > 0 && (
                      <button
                        onClick={() => {
                          setMovingGroup({ id: g.id, name: g.name });
                          setMoveTargetClass('');
                        }}
                        className="w-8 h-8 rounded-lg glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-energy-600"
                        title="移动到其他班级"
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeletingGroupId(g.id)}
                      className="w-8 h-8 rounded-lg glass-card glass-card-hover flex items-center justify-center text-ink-500 hover:text-danger-600"
                      title="删除小组"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 成员列表 */}
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-1 space-y-1.5 border-t border-ink-100/60">
                        {members.length === 0 ? (
                          <div className="py-4 text-center text-[12px] text-ink-400">
                            该小组暂无成员
                          </div>
                        ) : (
                          members.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-mission-50/40 transition group"
                            >
                              <img
                                src={m.avatar} onError={applyAvatarFallback}
                                alt={m.name}
                                className="w-8 h-8 rounded-lg object-cover bg-gradient-to-br from-mission-100 to-nova-100 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-[13px] font-semibold text-ink-700">{m.name}</span>
                                {m.role === 'leader' && (
                                  <span className="ml-2 chip-nova !py-0 !px-1.5 !text-[9px] inline-flex items-center gap-0.5">
                                    <Crown size={9} /> 组长
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                                {m.role !== 'leader' && (
                                  <button
                                    onClick={() => handleSetLeader(g.id, m.id)}
                                    className="w-7 h-7 rounded-lg hover:bg-nova-50 flex items-center justify-center text-ink-400 hover:text-nova-600 transition"
                                    title="设为组长"
                                  >
                                    <Crown size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setMovingMember({ userId: m.id, name: m.name, fromGroupId: g.id });
                                    setMoveTargetGroup('');
                                  }}
                                  className="w-7 h-7 rounded-lg hover:bg-mission-50 flex items-center justify-center text-ink-400 hover:text-mission-600 transition"
                                  title="移动到其他小组"
                                >
                                  <ArrowRightLeft size={13} />
                                </button>
                                <button
                                  onClick={() => handleRemoveMember(m.id, m.name)}
                                  className="w-7 h-7 rounded-lg hover:bg-alert-50 flex items-center justify-center text-ink-400 hover:text-alert-600 transition"
                                  title="移出小组"
                                >
                                  <UserMinus size={13} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* 未分组学生 */}
      {!loading && groupMembers.unassigned.length > 0 && (
        <div className="glass-card rounded-[22px] overflow-hidden border-2 border-alert-200/50">
          <div className="flex items-center gap-3 p-4 bg-alert-50/30">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-alert-400 to-energy-500 flex items-center justify-center text-white shadow-md shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-ink-800">未分组学生 ({groupMembers.unassigned.length})</div>
              <div className="text-[11px] text-ink-400 mt-0.5">这些学生已归属本班但尚未分配到具体小组</div>
            </div>
          </div>
          <div className="px-4 pb-4 pt-2 space-y-1.5">
            {groupMembers.unassigned.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-mission-50/40 transition group"
              >
                <img
                  src={m.avatar} onError={applyAvatarFallback}
                  alt={m.name}
                  className="w-8 h-8 rounded-lg object-cover bg-gradient-to-br from-mission-100 to-nova-100 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-ink-700">{m.name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  {groups.length > 0 && (
                    <button
                      onClick={() => {
                        setMovingMember({ userId: m.id, name: m.name, fromGroupId: '' });
                        setMoveTargetGroup('');
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-mission-50 flex items-center justify-center text-ink-400 hover:text-mission-600 transition"
                      title="分配到小组"
                    >
                      <ArrowRightLeft size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Modals ===== */}

      {/* 创建小组 */}
      <Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} title="新建小组" icon={Plus}>
        <input
          type="text"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          className="input-field"
          placeholder="小组名称"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
        />
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setShowCreateGroup(false)}>取消</button>
          <button className="btn-mission flex-1" onClick={handleCreateGroup}>创建</button>
        </div>
      </Modal>

      {/* 重命名小组 */}
      <Modal open={!!renamingGroup} onClose={() => setRenamingGroup(null)} title="重命名小组" icon={Pencil}>
        <input
          type="text"
          value={renamingGroup?.name || ''}
          onChange={(e) => setRenamingGroup((prev) => (prev ? { ...prev, name: e.target.value } : null))}
          className="input-field"
          placeholder="小组名称"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleRenameGroup()}
        />
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setRenamingGroup(null)}>取消</button>
          <button className="btn-mission flex-1" onClick={handleRenameGroup}>确认</button>
        </div>
      </Modal>

      {/* 移动小组到其他班级 */}
      <Modal open={!!movingGroup} onClose={() => setMovingGroup(null)} title={`移动小组 · ${movingGroup?.name || ''}`} icon={ArrowRightLeft}>
        <label className="field-label">目标班级</label>
        <select
          value={moveTargetClass}
          onChange={(e) => setMoveTargetClass(e.target.value)}
          className="input-field cursor-pointer"
        >
          <option value="">选择目标班级…</option>
          {otherClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <p className="mt-2 text-[12px] text-ink-500 leading-relaxed">
          移动后，小组及其所有成员将归属新班级。学生的班级归属会自动同步。
        </p>
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setMovingGroup(null)}>取消</button>
          <button
            className="btn-mission flex-1"
            onClick={handleMoveGroup}
            disabled={!moveTargetClass}
          >
            确认移动
          </button>
        </div>
      </Modal>

      {/* 移动成员到其他小组 */}
      <Modal
        open={!!movingMember}
        onClose={() => setMovingMember(null)}
        title={`分配小组 · ${movingMember?.name || ''}`}
        icon={ArrowRightLeft}
      >
        <label className="field-label">目标小组</label>
        {moveTargetGroups.length === 0 ? (
          <p className="text-[12px] text-ink-400 py-2">该班级没有其他可分配的小组</p>
        ) : (
          <select
            value={moveTargetGroup}
            onChange={(e) => setMoveTargetGroup(e.target.value)}
            className="input-field cursor-pointer"
          >
            <option value="">选择目标小组…</option>
            {moveTargetGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2 mt-4">
          <button className="btn-ghost-mission flex-1" onClick={() => setMovingMember(null)}>取消</button>
          <button
            className="btn-mission flex-1"
            onClick={handleMoveMember}
            disabled={!moveTargetGroup}
          >
            确认分配
          </button>
        </div>
      </Modal>

      {/* 删除小组确认 */}
      <ConfirmModal
        open={!!deletingGroupId}
        onClose={() => setDeletingGroupId(null)}
        onConfirm={handleDeleteGroup}
        title="删除小组"
        message="删除小组将同时移除组内学生的分组关系（学生保留在班级中但变为未分组状态）。此操作不可撤销。"
        confirmText="确认删除"
        danger
      />
    </div>
  );
}

// ---------- Reusable modal components (local copy to keep self-contained) ----------

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
