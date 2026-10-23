import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback } from '@/lib/imageFallback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HtmlDemo from '@/components/showcase/HtmlDemo';
import PhysicsDemo from '@/components/showcase/PhysicsDemo';
import { motion } from 'framer-motion';
import { Trophy, Heart, Image as ImageIcon, Video, FileText, Box, Medal, Sparkles, MessageSquare, LineChart, BarChart3, Activity, BookOpen, Upload, X, Plus, Pencil } from 'lucide-react';
import { LineChart as ReLineChart, Line, BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

import { useGroupStore } from '@/store/groupStore';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { ShowcaseCategory } from '@/types';
import { cn } from '@/lib/utils';
import { apiEnabled, getToken } from '@/lib/apiClient';
import { showcaseApi } from '@/lib/api/projects';

type GalleryTab = ShowcaseCategory;

const showcaseFallback = '/images/showcase-fallback.jpg';

function useShowcaseFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (!image.src.endsWith(showcaseFallback)) {
    image.src = showcaseFallback;
  }
}

const GALLERY_TABS: Array<{ key: GalleryTab; label: string; icon: LucideIcon }> = [
  { key: 'photo', label: '照片展', icon: ImageIcon },
  { key: 'video', label: '视频', icon: Video },
  { key: 'paper', label: '论文', icon: FileText },
  { key: 'model', label: '模型', icon: Box },
  { key: 'award', label: '获奖作品', icon: Medal },
];

const CATEGORY_LABEL: Record<ShowcaseCategory, string> = Object.fromEntries(
  GALLERY_TABS.map((t) => [t.key, t.label])
) as Record<ShowcaseCategory, string>;

interface ShowcaseCard {
  htmlContent?: string;
  authorUserId?: string;
  demoKind?: "" | "optics" | "motor";
  id: string;
  imageUrl: string;
  title: string;
  groupId: string;
  description: string;
  loves: number;
  /** 作品分类，决定它出现在顶部哪个 tab 下 */
  category: ShowcaseCategory;
  /** 教师审批状态；只有本组作品会在卡片上显示徽章 */
  status: 'pending' | 'approved' | 'rejected';
  rejectReason: string;
  awardedCoins: number;
}



export default function AchievementHall() {
  const { groups, users } = useGroupStore();
  const { showcaseItems, projects, addShowcaseItem, updateShowcaseItem } = useProjectStore();
  const { groupId } = useAuthStore();

  // 名人堂 = 真实 showcaseItems 点赞最高的前 3
  const hallOfFame = useMemo(
    () =>
      showcaseItems
        .filter((item) => item.status === 'approved')
        .slice()
        .sort((a, b) => b.loves - a.loves)
        .slice(0, 3)
        .map((s, i) => ({
          id: s.id,
          rank: i + 1,
          imageUrl: s.coverImage,
          title: s.title || '优秀成果',
          author: s.authorUserId || groups.find((g) => g.id === s.groupId)?.name || '学生团队',
          authorId: '',
          groupId: s.groupId,
          comment: `本学期优秀作品 · ${s.loves} 人点赞`,
          tutor: '教师评审组',
          loves: s.loves,
        })),
    [showcaseItems, groups]
  );

  // 精选数据集 = 真实小组课题完成度分布
  const datasets = useMemo(() => {
    const membered = groups.filter((g) => users.some((u) => u.groupId === g.id)).slice(0, 6);
    const rows = membered.map((g) => ({
      name: g.name.slice(0, 2),
      done: projects.filter((p) => p.ownerGroupId === g.id && p.status === 'done').length,
      progress: projects.filter((p) => p.ownerGroupId === g.id && ['progress', 'review', 'planning'].includes(p.status)).length,
      frozen: projects.filter((p) => p.ownerGroupId === g.id && p.status === 'failed').length,
    }));
    return [
      { id: 'ds-1', title: '各小组课题完成度分布', subtitle: `${membered.length} 小组 · 按状态`, color: '#FF8A34', chip: 'chip-energy', chart: 'bar' as 'line' | 'bar', data: rows },
    ];
  }, [groups, users, projects]);
  const pushToast = useUIStore((s) => s.pushToast);
  
  const [tab, setTab] = useState<GalleryTab>('photo');
  // 点卡片放大看图（原先卡片上根本没有 onClick，整个文件也没有预览状态）
  const previewRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<ShowcaseCard | null>(null);
  const [lovedCards, setLovedCards] = useState<Set<string>>(new Set());
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [htmlError, setHtmlError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    type: 'photo' as GalleryTab,
    title: '',
    description: '',
    imageUrl: '',
    htmlContent: '',
  });
  // 非空表示正在修改这条作品（本组的），而不是新建
  const [editingId, setEditingId] = useState<string | null>(null);

  /** 打开修改弹窗并预填现有内容 */
  const openEdit = (card: { id: string; title: string; imageUrl: string; groupId: string }) => {
    const item = showcaseItems.find((s) => s.id === card.id);
    setHtmlError('');
    setSaveError('');
    setEditingId(card.id);
    setUploadForm({
      type: (item?.category || 'photo') as GalleryTab,
      title: item?.title || card.title,
      description: item?.description || '',
      imageUrl: item?.coverImage || card.imageUrl || '',
      htmlContent: item?.htmlContent || '',
    });
    setUploadDialogOpen(true);
  };

  useEffect(() => {
    if (!lightbox) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    previewRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'Tab') {
        const controls = previewRef.current?.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [lightbox]);

  const toggleLove = (id: string) => {
    setLovedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadForm((prev) => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (saving) return;
    setSaveError('');
    if (!uploadForm.title.trim()) return setSaveError('请填写作品标题');
    if (!uploadForm.imageUrl && !uploadForm.htmlContent) return setSaveError('请上传封面图片或 HTML 作品');
    if (!groupId) return setSaveError('请先加入小组后提交作品');
    const payload = {
      title: uploadForm.title.trim(),
      coverImage: uploadForm.imageUrl || showcaseFallback,
      htmlContent: uploadForm.htmlContent,
      description: uploadForm.description.trim(),
      category: uploadForm.type,
    };
    setSaving(true);
    const token = getToken();
    try {
      if (apiEnabled) {
        const saved = editingId
          ? await showcaseApi.update(editingId, payload)
          : await showcaseApi.create({ ...payload, groupId });
        if (getToken() !== token) return;
        useProjectStore.setState(state => ({ showcaseItems: editingId
          ? state.showcaseItems.map(item => item.id === editingId ? saved : item)
          : [...state.showcaseItems, saved] }));
      } else if (editingId) {
        updateShowcaseItem(editingId, payload);
      } else {
        addShowcaseItem({ ...payload, groupId });
      }
      pushToast(editingId ? '已保存，需等待教师重新审批' : '作品已提交，等待教师审批', 'success');
      setUploadDialogOpen(false);
      setEditingId(null);
      setUploadForm({ type: 'photo', title: '', description: '', imageUrl: '', htmlContent: '' });
    } catch (error) {
      setSaveError(error instanceof TypeError ? '网络连接失败，内容已保留，请检查网络后重试' : error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const distributeByWaterfall = (list: ShowcaseCard[], cols: number) => {
    const colHeights = Array(cols).fill(0);
    const colCards: ShowcaseCard[][] = Array.from({ length: cols }, () => []);
    list.forEach((card) => {
      const minIdx = colHeights.indexOf(Math.min(...colHeights));
      colCards[minIdx].push(card);
      colHeights[minIdx] += 1;
    });
    return colCards;
  };

  const cards = useMemo(() => {
    // 真实展示墙：用 showcaseItems，不再拼接 buildShowcaseCards 的假卡片
    return showcaseItems.map((item) => ({
      id: item.id,
      imageUrl: item.coverImage,
      title: item.title,
      groupId: item.groupId,
      authorUserId: item.authorUserId,
      demoKind: item.demoKind,
      htmlContent: item.htmlContent,
      loves: item.loves,
      description: item.description,
      category: item.category,
      // 审批状态：只有本组的作品才在卡片上显示徽章
      status: item.status,
      rejectReason: item.rejectReason,
      awardedCoins: item.awardedCoins,
    }));
  }, [showcaseItems]);

  const visibleCards = useMemo(() => cards.filter((c) => c.category === tab), [cards, tab]);
  const countOf = (k: GalleryTab) => cards.filter((c) => c.category === k).length;
  const columns3 = distributeByWaterfall(visibleCards, 3);

  return (
    <>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card p-6 md:p-8 rounded-[28px] relative overflow-hidden"
        >
          <div className="absolute -top-10 right-10 w-72 h-72 rounded-full bg-alert-400/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 left-0 w-80 h-80 rounded-full bg-nova-400/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="col-span-12 lg:col-span-7">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-alert-400 via-energy-500 to-danger-500 flex items-center justify-center shadow-glowEnergy">
                    <Trophy size={34} className="text-white" />
                  </div>
                  <div className="absolute -inset-2 rounded-[28px] bg-gradient-to-br from-alert-400/20 via-energy-400/15 to-transparent blur-xl -z-10 animate-pulse" />
                  <Sparkles
                    size={20}
                    className="absolute -top-2 -right-2 text-alert-400 animate-floatY drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]"
                  />
                </div>
                <div className="min-w-0">
                  <span className="mission-label">HALL OF ACHIEVEMENTS · PUBLIC EXHIBITION</span>
                  <h1 className="mt-3 text-[30px] md:text-[36px] font-extrabold text-ink-900 leading-[1.1] tracking-tight">
                    Achievement Hall
                    <span className="block text-gradient-energy mt-1">成果展览馆</span>
                  </h1>
                  <p className="mt-2 text-[14px] text-ink-500 max-w-xl">
                    优秀研究成果将被整个基地看见。最佳作品可获得教授推荐信、全国创新大赛直通名额。
                  </p>
                </div>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5">
              <div className="glass-card !shadow-none p-1.5 rounded-2xl border-mission-100/70 inline-flex flex-wrap gap-1 w-full justify-end">
                {GALLERY_TABS.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        'px-3.5 py-2 rounded-xl text-[12.5px] font-semibold transition-all flex items-center gap-1.5 flex-1 justify-center',
                        active
                          ? 'bg-gradient-to-br from-mission-500 to-nova-500 text-white shadow-glowMission'
                          : 'text-ink-600 hover:bg-mission-50/60 hover:text-mission-700'
                      )}
                    >
                      <Icon size={14} />
                      {t.label}
                      <span className={cn('text-[11px] font-bold tabular-nums', active ? 'text-white/80' : 'text-ink-400')}>
                        {countOf(t.key)}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => { setHtmlError(''); setSaveError(''); setEditingId(null); setUploadForm({ type: 'photo', title: '', description: '', imageUrl: '', htmlContent: '' }); setUploadDialogOpen(true); }}
                  className={cn(
                    'px-3.5 py-2 rounded-xl text-[12.5px] font-semibold transition-all flex items-center gap-1.5',
                    'bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-glowEmerald hover:shadow-glowEmerald/80'
                  )}
                >
                  <Upload size={14} />
                  上传作品
                </button>
              </div>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-9">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink-800">
                <ImageIcon size={20} className="text-mission-500" />
                精选展廊
              </h2>
              <div className="flex items-center gap-3 text-[12px] text-ink-500">
                <span className="chip-mission">{CATEGORY_LABEL[tab]} · {visibleCards.length} 项</span>
                <span className="chip-ink">全部 {cards.length} 项</span>
              </div>
            </div>

            {visibleCards.length === 0 ? (
              <div className="glass-card p-10 rounded-[22px] text-center text-ink-400 text-[13px]">
                「{CATEGORY_LABEL[tab]}」下还没有作品
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {columns3.map((col, ci) => (
                <div key={ci} className="waterfall-col">
                  {col.map((card, i) => {
                    const group = groups.find((g) => g.id === card.groupId);
                    const gi = parseInt(card.groupId.split('-')[1]) - 1;
                    const loved = lovedCards.has(card.id);
                    // 只有本组的作品才显示审批状态、才允许修改
                    const isMine = !!groupId && card.groupId === groupId;
                    const groupChipColor = card.authorUserId ? 'chip-mission' : ['chip-mission', 'chip-energy', 'chip-growth', 'chip-nova', 'chip-alert', 'chip-ink'][gi % 6];
                    return (
                      <motion.article
                        key={card.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: (ci * 6 + i) * 0.04 }}
                        onClick={() => setLightbox(card)}
                        className="glass-card glass-card-hover rounded-[22px] overflow-hidden relative group cursor-pointer"
                      >
                        <div className="relative w-full overflow-hidden h-44">
                          <img
                            src={card.imageUrl || showcaseFallback}
                            alt={card.title}
                            loading="lazy"
                            onError={useShowcaseFallback}
                            className="relative w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/20 to-transparent" />
                          <div className="absolute top-3 left-3 flex items-center gap-1.5">
                            <span className={cn(groupChipColor, '!py-0.5 !px-2 !text-[10px] backdrop-blur-md bg-opacity-80')}>
                              {card.authorUserId || (group?.name || '未知小组').slice(0, 6)}
                            </span>
                            {card.demoKind && <span className="chip-growth !py-0.5 !px-2 !text-[10px]">交互 Demo · 公共展示</span>}
                            {isMine && card.status !== 'approved' && (
                              <span className={cn(
                                card.status === 'pending' ? 'chip-energy' : 'chip-danger',
                                '!py-0.5 !px-2 !text-[10px] backdrop-blur-md'
                              )}>
                                {card.status === 'pending' ? '待审批' : '已驳回'}
                              </span>
                            )}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-4 pt-10">
                            <h3 className="font-bold text-[14px] md:text-[15px] text-white leading-snug drop-shadow-md mb-2">
                              {card.title}
                            </h3>
                            {isMine && card.status === 'rejected' && card.rejectReason && (
                              <p className="text-[11.5px] text-danger-100 leading-snug">
                                驳回理由：{card.rejectReason}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(event) => { event.stopPropagation(); toggleLove(card.id); }}
                              className={cn(
                                'flex items-center gap-1 text-[12px] font-semibold transition-all',
                                loved ? 'text-danger-600' : 'text-ink-500 hover:text-danger-600'
                              )}
                            >
                              <Heart
                                size={15}
                                fill={loved ? 'currentColor' : 'none'}
                                className={loved ? 'scale-110 transition-transform' : ''}
                              />
                              <span className="ticker tabular-nums">
                                {card.loves + (loved ? 1 : 0)}
                              </span>
                            </button>
                            <div className="flex items-center gap-1 text-[12px] text-ink-500 font-semibold">
                              <span className="text-[11px]">{card.demoKind || card.htmlContent ? '打开交互演示 →' : CATEGORY_LABEL[card.category]}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] text-ink-400 font-mono">
                              #{String(visibleCards.findIndex((c) => c.id === card.id) + 1).padStart(2, '0')}
                            </div>
                            {isMine && (
                              <button
                                onClick={(event) => { event.stopPropagation(); openEdit(card); }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:text-mission-600 hover:bg-mission-50 transition"
                                title="修改本组作品（改后需教师重新审批）"
                                aria-label={`修改作品 ${card.title}`}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              ))}
            </div>
            )}
          </div>

          <div className="col-span-12 lg:col-span-3 space-y-5">
            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="glass-card p-5 rounded-[24px]"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-alert-400 to-energy-500 flex items-center justify-center text-white shadow-lg shadow-energy-500/20">
                  <Medal size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink-800 text-[15px]">Hall of Fame</h3>
                  <p className="text-[11px] text-ink-400">点赞 Top3 · 全时段</p>
                </div>
              </div>
              <div className="space-y-4">
                {hallOfFame.map((hof, i) => {
                  const author = users.find((u) => u.id === hof.authorId);
                  return (
                    <motion.div
                      key={hof.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.15 + i * 0.06 }}
                      className="p-3 rounded-2xl bg-gradient-to-br from-alert-50/60 via-energy-50/40 to-mission-50/30 border border-alert-100/50 relative"
                    >
                      <div className="student-showcase-rank">
                        #{hof.rank}
                      </div>
                      <div className="rounded-xl overflow-hidden aspect-[16/10] mb-3 ring-1 ring-white/60 shadow-sm relative bg-gradient-to-br from-mission-400/30 via-nova-400/20 to-energy-400/20 flex items-center justify-center">
                        <img
                          src={hof.imageUrl || showcaseFallback}
                          alt={hof.title}
                          loading="lazy"
                          onError={useShowcaseFallback}
                          className="relative w-full h-full object-cover"
                        />
                      </div>
                      <h4 className="font-bold text-[13px] text-ink-800 leading-snug mb-1">{hof.title}</h4>
                      <div className="flex items-center justify-between text-[11px] text-ink-500 mb-2">
                        <span className="flex items-center gap-1.5">
                          {author && (
                            <img
                              src={author.avatar} onError={applyAvatarFallback}
                              alt={author.name}
                              className="w-4 h-4 rounded-full ring-1 ring-white"
                            />
                          )}
                          作者：{hof.author}
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-danger-600">
                          <Heart size={11} fill="currentColor" />
                          {hof.loves}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-alert-100/60">
                        <div className="text-[10px] font-semibold text-alert-700 mb-1 flex items-center gap-1">
                          <MessageSquare size={10} />
                          {hof.tutor}
                        </div>
                        <p className="text-[11.5px] text-ink-600 leading-relaxed line-clamp-2">
                          「{hof.comment}」
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.2 }}
              className="glass-card p-5 rounded-[24px]"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mission-400 to-growth-500 flex items-center justify-center text-white shadow-lg shadow-mission-500/20">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink-800 text-[15px]">精选数据集</h3>
                  <p className="text-[11px] text-ink-400">开放共享 · 可下载</p>
                </div>
              </div>
              <div className="space-y-3">
                {datasets.map((ds, i) => (
                  <motion.div
                    key={ds.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.25 + i * 0.06 }}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-ink-50/80 to-white/60 border border-ink-100/70"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="font-bold text-[12.5px] text-ink-800 leading-snug pr-2">{ds.title}</h4>
                      <span className={cn(ds.chip, '!py-0.5 !px-2 !text-[10px] shrink-0 mt-0.5')}>
                        {ds.chart === 'line' ? (
                          <LineChart size={10} />
                        ) : (
                          <BarChart3 size={10} />
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-500 mb-2">{ds.subtitle}</p>
                    <div className="h-[90px] -mx-2">
                      <ResponsiveContainer width="100%" height="100%">
                        {ds.chart === 'line' ? (
                          <ReLineChart data={ds.data} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                            <XAxis
                              dataKey={Object.keys(ds.data[0])[0]}
                              tick={{ fontSize: 9, fill: '#94A3B8' }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 10,
                                fontSize: 11,
                                border: '1px solid rgba(255,255,255,0.9)',
                                background: 'rgba(255,255,255,0.95)',
                                boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
                              }}
                            />
                            {Object.keys(ds.data[0])
                              .slice(1)
                              .map((k, ki) => {
                                const palette = ['#4F7CFF', '#FF8A34', '#22C55E', '#8B5CF6'];
                                return (
                                  <Line
                                    key={k}
                                    type="monotone"
                                    dataKey={k}
                                    stroke={palette[ki % 4]}
                                    strokeWidth={1.8}
                                    dot={false}
                                  />
                                );
                              })}
                          </ReLineChart>
                        ) : (
                          <BarChart data={ds.data} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 9, fill: '#94A3B8' }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 10,
                                fontSize: 11,
                                border: '1px solid rgba(255,255,255,0.9)',
                                background: 'rgba(255,255,255,0.95)',
                                boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="done" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="progress" stackId="a" fill="#FF8A34" />
                            <Bar dataKey="frozen" stackId="a" fill="#F04438" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                    <button className="mt-1 w-full btn-ghost !py-1.5 !px-2 text-[11px] justify-start" onClick={() => {
                        const csvContent = [
                          Object.keys(ds.data[0]).join(','),
                          ...ds.data.map(row => Object.values(row).join(','))
                        ].join('\n');
                        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `${ds.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.csv`;
                        link.click();
                      }}>
                      <BookOpen size={12} />
                      查看详情 · 下载 CSV
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    {uploadDialogOpen && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" onClick={() => setUploadDialogOpen(false)} />
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog" aria-modal="true" aria-label={editingId ? '编辑作品' : '上传作品'}
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-50 border border-blue-200 rounded-[28px] p-6 shadow-2xl"
          >
            <button
              aria-label="关闭作品编辑"
              onClick={() => setUploadDialogOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-ink-100/50 flex items-center justify-center text-ink-500 hover:bg-ink-200 transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                <Upload size={20} />
              </div>
              <div>
                <h3 className="font-bold text-ink-800 text-lg">{editingId ? '编辑作品' : '上传作品'}</h3>
                <p className="text-[12px] text-ink-500">填写信息 → 上传内容并预览 → 提交审核</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-ink-700 mb-2">作品分类</label>
                <div className="flex flex-wrap gap-2">
                  {GALLERY_TABS.map((t) => {
                    const Icon = t.icon;
                    const active = uploadForm.type === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setUploadForm((prev) => ({ ...prev, type: t.key }))}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1',
                          active
                            ? 'bg-mission-500 text-white shadow-md'
                            : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
                        )}
                      >
                        <Icon size={12} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <label className="block text-[12px] font-semibold text-ink-700 mb-2">作品标题</label>
                <input
                  type="text"
                  aria-label="作品标题"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="输入作品标题..."
                  className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-ink-200 text-ink-800 text-sm focus:outline-none focus:border-mission-400 focus:ring-2 focus:ring-mission-500/10 transition-all"
                />
              </div>
              
              <div>
                <label className="block text-[12px] font-semibold text-ink-700 mb-2">作品描述</label>
                <textarea
                  aria-label="作品描述"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="描述你的作品..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-ink-200 text-ink-800 text-sm focus:outline-none focus:border-mission-400 focus:ring-2 focus:ring-mission-500/10 transition-all resize-none"
                />
              </div>
              
              <div>
                <label className="block text-[12px] font-semibold text-ink-700 mb-2">封面图片（HTML 作品可选）</label>
                <div className="relative">
                  {uploadForm.imageUrl ? (
                    <div className="h-28 rounded-xl overflow-hidden ring-2 ring-mission-400/50">
                      <img src={uploadForm.imageUrl} alt="预览" className="w-full h-full object-cover" />
                      <label className="absolute bottom-2 right-2 rounded-lg bg-white px-3 py-2 text-blue-700 text-xs cursor-pointer">更换封面<input aria-label="更换封面" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} /></label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-ink-300 bg-ink-50/50 hover:border-mission-400 hover:bg-mission-50/50 transition-all cursor-pointer">
                      <Plus size={24} className="text-ink-400 mb-2" />
                      <span className="text-[12px] text-ink-500">点击上传图片</span>
                      <input aria-label="上传封面图片" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
              </div>
              
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
                <label className="block text-sm font-bold text-blue-900">交互作品 HTML
                  <input aria-label="上传 HTML 作品" type="file" accept=".html,.htm,text/html" className="block w-full text-xs mt-3" onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = '';
                    if (!/\.html?$/i.test(file.name) || file.size > 1_000_000) { setHtmlError('请选择不超过 1 MB 的 HTML 文件'); return; }
                    setHtmlError('');
                    try { const html = await file.text(); setUploadForm(prev => ({ ...prev, htmlContent: html })); }
                    catch { setHtmlError('读取 HTML 文件失败，请重新选择'); }
                  }} />
                </label>
                <p className="text-xs text-blue-800 leading-5">支持内嵌 CSS、JavaScript 和 data 图片的单文件演示，大小不超过 1 MB；不加载外部脚本、网络接口或同目录文件。光学和电机为平台内置 Demo。</p>
                {htmlError && <p role="alert" className="text-sm text-red-700">{htmlError}</p>}
                {uploadForm.htmlContent && <><HtmlDemo html={uploadForm.htmlContent} title="HTML 作品预览" /><button type="button" className="text-sm text-blue-700 underline" onClick={() => setUploadForm(prev => ({ ...prev, htmlContent: '' }))}>移除 HTML 作品</button></>}
              </div>
              {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
              <button
                disabled={saving}
                onClick={handleUpload}
                className="w-full py-3 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
              >
                {saving ? '正在保存…' : editingId ? '保存作品' : '提交作品审核'}
              </button>
            </div>
          </motion.div>
        </motion.div>, document.body
      )}
      {/* 点作品放大：大图 + 作者小组 + 说明（原先点卡片没有任何反应） */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-900/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            ref={previewRef} role="dialog" aria-modal="true" aria-label={lightbox.title}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[24px] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-xl bg-ink-900/60 text-white flex items-center justify-center hover:bg-ink-900/80 transition-colors"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
            {lightbox.htmlContent ? <HtmlDemo html={lightbox.htmlContent} title={lightbox.title} /> : lightbox.demoKind ? <PhysicsDemo kind={lightbox.demoKind} /> : <div className="relative w-full min-h-[240px] bg-ink-100 flex items-center justify-center">
              <img
                src={lightbox.imageUrl || showcaseFallback}
                alt={lightbox.title}
                className="relative w-full max-h-[62vh] object-contain"
                onError={useShowcaseFallback}
              />
            </div>}
            <div className="p-6">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="chip-mission !py-0.5 !px-2 !text-[10px]">
                  {CATEGORY_LABEL[lightbox.category]}
                </span>
                <span className="chip-ink !py-0.5 !px-2 !text-[10px]">
                  {lightbox.authorUserId || groups.find((g) => g.id === lightbox.groupId)?.name || '未知小组'}
                </span>
                {lightbox.status !== 'approved' && (
                  <span className={cn(
                    lightbox.status === 'pending' ? 'chip-energy' : 'chip-danger',
                    '!py-0.5 !px-2 !text-[10px]'
                  )}>
                    {lightbox.status === 'pending' ? '待审批' : '已驳回'}
                  </span>
                )}
              </div>
              <h2 className="text-[20px] font-extrabold text-ink-900">{lightbox.title}</h2>
              {lightbox.description && (
                <p className="text-[13.5px] text-ink-600 leading-relaxed mt-3">{lightbox.description}</p>
              )}
              <div className="flex items-center gap-4 mt-5 pt-4 border-t border-ink-100">
                <button
                  onClick={() => toggleLove(lightbox.id)}
                  className={cn(
                    'flex items-center gap-1.5 text-[13px] font-semibold transition-colors',
                    lovedCards.has(lightbox.id) ? 'text-danger-600' : 'text-ink-500 hover:text-danger-600'
                  )}
                >
                  <Heart
                    size={16}
                    fill={lovedCards.has(lightbox.id) ? 'currentColor' : 'none'}
                  />
                  {lightbox.loves + (lovedCards.has(lightbox.id) ? 1 : 0)} 人点赞
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </>
  );
}
