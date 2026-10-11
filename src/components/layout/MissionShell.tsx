import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback, avatarFallback } from '@/lib/imageFallback';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, BookOpen, Sparkles, FolderKanban, ShieldCheck, ShoppingCart, Trophy, Medal, Users, UsersRound, Rocket, Bell, LogOut, Zap, Info, CheckCircle2, AlertTriangle, X, Camera, Gauge, ClipboardList, Shield, Menu, FileCheck, KeyRound, UserRound, ChevronRight, Search, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import { apiEnabled } from '@/lib/apiClient';
import { usersApi } from '@/lib/apiService';
import Dialog from '@/components/ui/Dialog';
import ChangePasswordModal from '@/components/ui/ChangePasswordModal';

interface MissionShellProps {
  children: ReactNode;
  requireAuth?: boolean;
}

async function compressImageToDataUrl(file: File, size = 128, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    const edge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - edge) / 2;
    const sy = (bitmap.height - edge) / 2;
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close?.();
  }
}

const AVATAR_OPTIONS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&backgroundColor=cbf3f0',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Bailey&backgroundColor=e0f2fe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie&backgroundColor=ede9fe',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana&backgroundColor=fce7f3',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Ethan&backgroundColor=dcfce7',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Fiona&backgroundColor=fff7ed',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=George&backgroundColor=f0fdfa',
];

interface NavItem {
  id: string;
  label: string;
  subLabel?: string;
  icon: LucideIcon;
  to: string;
}

const STUDENT_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '主控看板', subLabel: '综合态势', icon: LayoutDashboard, to: '/dashboard' },
  { id: 'learning', label: '知识星系', subLabel: '理论体系', icon: BookOpen, to: '/theory/topics' },
  { id: 'galaxy', label: '关卡挑战', subLabel: '答题竞技', icon: Sparkles, to: '/theory/challenge' },
  { id: 'challenges', label: '知识擂台', subLabel: '挑战发布', icon: Trophy, to: '/theory/challenges' },
  { id: 'project', label: '课题中心', subLabel: '实验研发', icon: FolderKanban, to: '/projects' },
  { id: 'safety', label: '安全准入', subLabel: '实验资质', icon: ShieldCheck, to: '/safety-lab' },
  { id: 'team', label: '我的小组', subLabel: '团队协同', icon: UsersRound, to: '/my-team' },
  { id: 'communicator', label: '小组通讯', subLabel: '组间协作', icon: Users, to: '/communicator' },
  { id: 'market', label: '悬赏市场', subLabel: '招募投标', icon: ShoppingCart, to: '/recruit/market' },
  { id: 'league', label: '能量天梯', subLabel: '积分榜单', icon: Trophy, to: '/coins' },
  { id: 'achievement', label: '成果殿堂', subLabel: '结题展示', icon: Medal, to: '/showcase' },
  { id: 'profile', label: '个人档案', subLabel: '学习成果', icon: UserRound, to: '/profile' },
];

const TEACHER_NAV_ITEMS: NavItem[] = [
  { id: 't-overview', label: '指挥总览', subLabel: '全局数据', icon: Gauge, to: '/teacher/overview' },
  { id: 't-groups', label: '分组调度', subLabel: '班级编制', icon: Users, to: '/teacher/groups' },
  { id: 't-projects', label: '课题治理', subLabel: '立项审核', icon: FolderKanban, to: '/teacher/projects' },
  { id: 't-roster', label: '学生名册', subLabel: '档案名录', icon: ClipboardList, to: '/teacher/roster' },
  { id: 't-questions', label: '题库审核', subLabel: '提题审批', icon: FileCheck, to: '/teacher/question-bank' },
  { id: 't-safety', label: '安全考评', subLabel: '题库与任务', icon: Shield, to: '/teacher/safety' },
  { id: 't-showcase', label: '成果审核', subLabel: '作品审批', icon: Medal, to: '/teacher/showcase' },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'admin', label: '管理控制台', subLabel: '权限与班级', icon: Shield, to: '/admin' },
];

function MissionHeader({ onOpenNav, onOpenSearch }: { onOpenNav: () => void; onOpenSearch: () => void }) {
  const navigate = useNavigate();
  const { userId, role, groupId, name, logout } = useAuthStore();
  const getUserById = useGroupStore((s) => s.getUserById);
  const groups = useGroupStore((s) => s.groups);
  const pushToast = useUIStore((s) => s.pushToast);

  const [accountProfile, setAccountProfile] = useState<{ id: string; name: string; avatar: string } | null>(null);
  useEffect(() => {
    setAccountProfile(null);
    if (!apiEnabled || !userId) return;
    let active = true;
    void usersApi.get(userId).then((profile) => {
      if (active) setAccountProfile(profile);
    }).catch(() => { /* 名册中的学生资料仍可作为回退。 */ });
    return () => { active = false; };
  }, [userId]);
  const currentUser = (accountProfile?.id === userId ? accountProfile : null) || (userId ? getUserById(userId) : null);
  const displayName = currentUser?.name || name || (role === 'admin' ? '管理员' : role === 'teacher' ? '教师' : '研究员');
  const roleLabel = role === 'admin' ? '管理员' : role === 'teacher' ? '教师' : '学生';
  const currentGroup = groupId ? groups.find((g) => g.id === groupId) : null;
  const coreCoins = currentGroup ? currentGroup.totalCoins : 0;

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showChangePwdModal, setShowChangePwdModal] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [compressing, setCompressing] = useState(false);
  const [avatarErr, setAvatarErr] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleAvatarFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarErr('请选择有效的图片文件');
      return;
    }
    setCompressing(true);
    setAvatarErr('');
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setSelectedAvatar(dataUrl);
    } catch {
      setAvatarErr('图片处理失败，请换一张试试');
    } finally {
      setCompressing(false);
    }
  };

  const handleAvatarChange = async () => {
    if (!selectedAvatar || !userId) return;
    try {
      if (apiEnabled) {
        const profile = await usersApi.updateAvatar(userId, selectedAvatar);
        setAccountProfile(profile);
      } else {
        useGroupStore.getState().updateUserAvatar(userId, selectedAvatar);
      }
      pushToast('头像已更新', 'success');
      setShowAvatarModal(false);
      setSelectedAvatar('');
    } catch {
      pushToast('头像更新失败', 'error');
    }
  };

  return (
    <>
      <header className="mission-header fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-4 md:px-8">
        {/* 左侧：菜单开关与品牌 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenNav}
            aria-label="打开导航菜单"
            className="mission-menu-button md:hidden shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          >
            <Menu size={20} />
          </button>

          <button aria-label="返回指挥中心" className="flex items-center gap-3 text-left" onClick={() => navigate(role === 'teacher' ? '/teacher/overview' : role === 'admin' ? '/admin' : '/dashboard')}>
            <div className="mission-brand-mark w-9 h-9 rounded-xl bg-gradient-to-br from-mission-500 to-nova-600 flex items-center justify-center text-white shadow-sm shadow-mission-500/20 shrink-0">
              <Rocket size={18} />
            </div>
            <div className="leading-tight">
              <div className="mission-brand-title text-[14px] font-bold tracking-tight">
                <span className="sm:hidden">物理任务</span>
                <span className="hidden sm:inline">物理任务指挥中心</span>
              </div>
              <div className="mission-brand-subtitle hidden sm:block text-[11px] font-medium">
                PBL 高中物理探究平台
              </div>
            </div>
          </button>
        </div>

        {/* 右侧：能量统计与用户档案 */}
        <div className="flex items-center gap-3">
          <button className="workspace-search-button" onClick={onOpenSearch} aria-label="查找页面">
            <Search size={17} /><span>查找页面</span><kbd>⌘ K</kbd>
          </button>
          {role === 'student'  && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-energy-50/80 dark:bg-energy-950/40 border border-energy-200/80 dark:border-energy-800/60 text-xs">
              <Zap size={14} className="text-energy-500 fill-energy-400/30" />
              <span className="font-bold text-energy-700 dark:text-energy-300 font-mono">
                {coreCoins}
              </span>
              <span className="text-[10px] text-energy-600 dark:text-energy-400 font-medium">⚡能量</span>
            </div>
          )}

          <div className="relative">
            <button
              aria-label="用户菜单" aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="mission-profile-button flex items-center gap-2 p-1 rounded-xl transition-colors"
            >
              <img
                src={currentUser?.avatar || avatarFallback} onError={applyAvatarFallback}
                alt={displayName}
                className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
              />
              <span className="mission-profile-name hidden sm:inline text-xs font-semibold max-w-[90px] truncate">
                {displayName}
              </span>
            </button>

            {/* 用户下拉菜单 */}
            <AnimatePresence>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 text-xs"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{displayName}</p>
                      <p className="text-[11px] text-slate-400 capitalize">角色：{roleLabel}</p>
                    </div>

                    {role === 'student' && (
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate('/profile');
                        }}
                        className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <UserRound size={14} /> 个人档案
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowAvatarModal(true);
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Camera size={14} /> 更换头像
                    </button>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowChangePwdModal(true);
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                    >
                      <KeyRound size={14} /> 修改密码
                    </button>

                    <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          logout();
                          navigate('/login');
                        }}
                        className="w-full text-left px-3 py-2 text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950/40 flex items-center gap-2"
                      >
                        <LogOut size={14} /> 退出登录
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* 头像弹窗 */}
      {showAvatarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">选择个性头像</h3>
              <button onClick={() => setShowAvatarModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-4 gap-2.5 mb-5">
              {AVATAR_OPTIONS.map((avatar, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedAvatar(avatar)}
                  className={cn(
                    'relative rounded-xl overflow-hidden border-2 transition-all aspect-square',
                    selectedAvatar === avatar
                      ? 'border-mission-500 ring-2 ring-mission-200 scale-105'
                      : 'border-transparent hover:border-mission-200'
                  )}
                >
                  <img src={avatar} onError={applyAvatarFallback} alt={`头像 ${idx + 1}`} className="w-full h-full object-cover" />
                  {selectedAvatar === avatar && (
                    <div className="absolute inset-0 bg-mission-500/20 flex items-center justify-center">
                      <CheckCircle2 size={18} className="text-mission-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="mb-5">
              <label className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                <Camera size={14} />
                {compressing ? '正在处理…' : '上传自定义照片'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handleAvatarFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {avatarErr && (
                <p className="mt-2 text-xs text-danger-600 flex items-center gap-1">
                  <AlertTriangle size={12} /> {avatarErr}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowAvatarModal(false)} className="flex-1 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
                取消
              </button>
              <button
                onClick={handleAvatarChange}
                disabled={!selectedAvatar || compressing}
                className="flex-1 py-2 text-xs rounded-xl bg-mission-600 text-white font-medium hover:bg-mission-500 disabled:opacity-50"
              >
                确认更换
              </button>
            </div>
          </div>
        </div>
      )}

      {showChangePwdModal && <ChangePasswordModal onClose={() => setShowChangePwdModal(false)} />}
    </>
  );
}

function NavRail({ open, onClose }: { open: boolean; onClose: () => void }) {
  const railRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => railRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const buttons = railRef.current?.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [open, mobile]);
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuthStore();

  const baseItems: NavItem[] =
    role === 'teacher' || role === 'admin' ? TEACHER_NAV_ITEMS : STUDENT_NAV_ITEMS;
  const adminItems: NavItem[] = role === 'admin' ? ADMIN_NAV_ITEMS : [];
  const allItems = [...baseItems, ...adminItems];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      <aside ref={railRef} aria-label="主要导航" aria-hidden={mobile && !open}
        className={cn(
          'mission-nav fixed z-40 flex flex-col transition-transform duration-300 ease-out',
          // 桌面端：紧凑型常驻面板
          'md:left-4 md:top-20 md:w-52 md:h-[calc(100vh-96px)] md:rounded-2xl md:translate-x-0',
          'md:bg-white/80 md:dark:bg-slate-900/80 md:border md:border-slate-200/80 md:dark:border-slate-800/80 md:backdrop-blur-xl md:p-3',
          // 移动端：滑出式全尺寸抽屉
          'left-0 top-0 h-full w-64 bg-white dark:bg-slate-900 p-4 shadow-2xl border-r border-slate-200 dark:border-slate-800',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <button tabIndex={mobile && !open ? -1 : undefined} onClick={onClose} aria-label="关闭导航菜单" className="mission-nav-close hidden md:hidden items-center justify-between text-white pb-4 px-3">
          <span>研究导航</span><X size={20} />
        </button>
        <div className="space-y-1 flex-1 overflow-y-auto pr-1">
          {allItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to || (item.to !== '/dashboard' && location.pathname.startsWith(`${item.to}/`));
            return (
              <button
                key={item.id}
                tabIndex={mobile && !open ? -1 : undefined}
                onClick={() => {
                  navigate(item.to);
                  onClose();
                }}
                className={cn(
                  'mission-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all relative text-left',
                  active
                    ? 'bg-mission-50 dark:bg-mission-950/50 text-mission-700 dark:text-mission-300 border border-mission-200/60 dark:border-mission-800/60 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                )}
                aria-current={active ? 'page' : undefined}
                data-active={active}
              >
                <Icon size={16} className={active ? 'text-mission-600 dark:text-mission-400 shrink-0' : 'text-slate-400 shrink-0'} />
                <div className="truncate flex-1">
                  <div className="truncate">{item.label}</div>
                  {item.subLabel && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal truncate">
                      {item.subLabel}
                    </div>
                  )}
                </div>
                {active && (
                  <div className="w-1.5 h-1.5 rounded-full bg-mission-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}

function ToastStack() {
  const { toasts, removeToast, clearToasts } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="查看通知"
        className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-mission-600 hover:scale-105 transition-all"
      >
        <Bell size={18} />
        {toasts.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {toasts.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed bottom-20 right-6 z-50 w-80 max-h-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 flex flex-col"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">通知消息中心</span>
                {toasts.length > 0 && (
                  <button onClick={clearToasts} className="text-[11px] text-mission-600 hover:underline">
                    全部清空
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 text-xs">
                {toasts.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">暂无未读消息通知</div>
                ) : (
                  toasts.map((t) => (
                    <div key={t.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Info size={14} className="text-mission-500 shrink-0 mt-0.5" />
                        <span className="text-slate-700 dark:text-slate-300 leading-snug">{t.msg}</span>
                      </div>
                      <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default function MissionShell({ children, requireAuth = true }: MissionShellProps) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { userId, role, init } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setQuery(''); setSearchOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  const homePath = role === 'teacher' ? '/teacher/overview' : role === 'admin' ? '/admin' : '/dashboard';
  const homeLabel = role === 'teacher' ? '指挥总览' : role === 'admin' ? '管理控制台' : '主控看板';
  const navItems = role === 'admin' ? [...TEACHER_NAV_ITEMS, ...ADMIN_NAV_ITEMS] : role === 'teacher' ? TEACHER_NAV_ITEMS : STUDENT_NAV_ITEMS;
  const pageLabel = navItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))?.label;

  useEffect(() => {
    init();
  }, [init]);

  if (requireAuth && !userId) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }


  return (
    <>
      <div data-workspace-role={role} className="mission-stage min-h-screen w-full relative text-slate-900 dark:text-slate-100">
        <div className="mission-ambient" aria-hidden="true">
          <span className="mission-ambient-orb mission-ambient-orb-a" />
          <span className="mission-ambient-orb mission-ambient-orb-b" />
          <span className="mission-ambient-orb mission-ambient-orb-c" />
        </div>
        <a href="#workspace-main" className="workspace-skip-link">跳到页面内容</a>
        <MissionHeader onOpenNav={() => setNavOpen(true)} onOpenSearch={() => { setQuery(''); setSearchOpen(true); }} />
        <NavRail open={navOpen} onClose={() => setNavOpen(false)} />
        <ToastStack />

        {/* 桌面端常驻导航预留 220px 边距 */}
        <main id="workspace-main" tabIndex={-1} className="mission-content md:ml-[220px] px-4 md:px-8 pt-20 pb-12">
          <div className="max-w-[1440px] mx-auto w-full">
            {pageLabel && location.pathname !== homePath && (
              <nav className="mission-page-context" aria-label="当前位置">
                <Link to={homePath}>{homeLabel}</Link>
                <ChevronRight size={13} aria-hidden="true" />
                <span aria-current="page">{pageLabel}</span>
              </nav>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0 : 0.25 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="查找页面" size="lg">
          <label className="field-label" htmlFor="workspace-search">输入页面名称或功能</label>
          <input data-dialog-autofocus id="workspace-search" className="input-field" placeholder="例如：课题、安全、能量" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="workspace-search-results">
            {navItems.filter((item) => `${item.label} ${item.subLabel}`.includes(query.trim())).map((item) => {
              const Icon = item.icon;
              return <button key={item.id} className="workspace-search-result" onClick={() => { setSearchOpen(false); navigate(item.to); }}>
                <Icon size={20} /><span className="flex-1"><strong>{item.label}</strong><small>{item.subLabel}</small></span><ArrowRight size={17} />
              </button>;
            })}
            {!navItems.some((item) => `${item.label} ${item.subLabel}`.includes(query.trim())) && <p role="status" className="text-sm text-center py-6">没有找到相关页面，请换一个关键词。</p>}
          </div>
        </Dialog>
      </div>
    </>
  );
}
