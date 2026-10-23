import type { LucideIcon } from 'lucide-react';
import { applyAvatarFallback } from '@/lib/imageFallback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HtmlDemo from '@/components/showcase/HtmlDemo';
import VideoShowcasePlayer from '@/components/showcase/VideoShowcasePlayer';
import PaperArticleReader from '@/components/showcase/PaperArticleReader';
import Model3DViewer from '@/components/showcase/Model3DViewer';
import ShowcaseContentRenderer from '@/components/showcase/ShowcaseContentRenderer';
import UploadGuidePanel from '@/components/showcase/UploadGuidePanel';
import { motion } from 'framer-motion';
import {
  Trophy,
  Heart,
  Image as ImageIcon,
  Video,
  FileText,
  Box,
  Medal,
  Sparkles,
  MessageSquare,
  LineChart,
  BarChart3,
  Activity,
  BookOpen,
  Upload,
  X,
  Plus,
  Pencil,
  Code2,
  FolderKanban,
} from 'lucide-react';
import {
  LineChart as ReLineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { useGroupStore } from '@/store/groupStore';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { ShowcaseCategory } from '@/types';
import { cn } from '@/lib/utils';
import { apiEnabled, getToken } from '@/lib/apiClient';
import { showcaseApi } from '@/lib/api/projects';
import { reviveDates } from '@/lib/reviveDates';
import {
  MAX_SHOWCASE_PAYLOAD_BYTES,
  MAX_VIDEO_FILE_BYTES,
  PAPER_MARKDOWN_TEMPLATE,
  PAPER_TEMPLATES,
  HTML_SIM_TEMPLATE,
  HTML_SIM_TEMPLATES,
  PRESET_3D_MODELS,
  captureVideoFrame,
  encodeShowcaseMedia,
  getMediaBadgeLabel,
  parseShowcaseMedia,
  utf8ByteLength,
  type Model3DFormat,
} from '@/lib/showcaseMedia';

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
  demoKind?: '' | 'optics' | 'motor';
  projectId: string;
  id: string;
  imageUrl: string;
  title: string;
  groupId: string;
  description: string;
  loves: number;
  lovedBy: string[];
  /** 作品分类，决定它出现在顶部哪个 tab 下 */
  category: ShowcaseCategory;
  /** 教师审批状态；只有本组作品会在卡片上显示徽章 */
  status: 'pending' | 'approved' | 'rejected';
  rejectReason: string;
  awardedCoins: number;
}

export default function AchievementHall() {
  const { groups, users } = useGroupStore();
  const {
    showcaseItems,
    projects,
    addShowcaseItem,
    updateShowcaseItem,
    toggleShowcaseLove,
  } = useProjectStore();
  const { userId, groupId } = useAuthStore();
  const pushToast = useUIStore((s) => s.pushToast);

  const myGroupProjects = useMemo(
    () => (groupId ? projects.filter((p) => p.ownerGroupId === groupId) : []),
    [projects, groupId]
  );

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
          comment:
            s.awardedCoins > 0
              ? `基地荣誉嘉奖 +${s.awardedCoins}⚡ · ${s.loves} 人点赞`
              : `本学期优秀作品 · ${s.loves} 人点赞`,
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
      progress: projects.filter(
        (p) => p.ownerGroupId === g.id && ['progress', 'review', 'planning'].includes(p.status)
      ).length,
      frozen: projects.filter((p) => p.ownerGroupId === g.id && p.status === 'failed').length,
    }));
    return [
      {
        id: 'ds-1',
        title: '各小组课题完成度分布',
        subtitle: `${membered.length} 小组 · 按状态`,
        color: '#FF8A34',
        chip: 'chip-energy',
        chart: 'bar' as 'line' | 'bar',
        data: rows,
      },
    ];
  }, [groups, users, projects]);

  const [tab, setTab] = useState<GalleryTab>('photo');
  const previewRef = useRef<HTMLDivElement>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [htmlError, setHtmlError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [showHtmlCodeEditor, setShowHtmlCodeEditor] = useState(false);
  const [paperPreviewMode, setPaperPreviewMode] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    type: 'photo' as GalleryTab,
    projectId: '',
    title: '',
    description: '',
    imageUrl: '',
    htmlContent: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const cards = useMemo<ShowcaseCard[]>(() => {
    return showcaseItems.map((item) => ({
      id: item.id,
      projectId: item.projectId || '',
      imageUrl: item.coverImage,
      title: item.title,
      groupId: item.groupId,
      authorUserId: item.authorUserId,
      demoKind: item.demoKind,
      htmlContent: item.htmlContent,
      loves: item.loves,
      lovedBy: item.lovedBy || [],
      description: item.description,
      category: item.category,
      status: item.status,
      rejectReason: item.rejectReason,
      awardedCoins: item.awardedCoins,
    }));
  }, [showcaseItems]);

  const lightbox = useMemo(
    () => (lightboxId ? cards.find((c) => c.id === lightboxId) || null : null),
    [cards, lightboxId]
  );

  const parsedFormMedia = useMemo(
    () => parseShowcaseMedia(uploadForm.htmlContent),
    [uploadForm.htmlContent]
  );

  const resetForm = (defaultType: GalleryTab = 'photo') => {
    setHtmlError('');
    setSaveError('');
    setEditingId(null);
    setShowHtmlCodeEditor(false);
    setPaperPreviewMode(false);
    setUploadForm({
      type: defaultType,
      projectId: '',
      title: '',
      description: '',
      imageUrl: '',
      htmlContent: '',
    });
  };

  /** 打开修改弹窗并预填现有内容 */
  const openEdit = (card: { id: string; title: string; imageUrl: string; groupId: string }) => {
    const item = showcaseItems.find((s) => s.id === card.id);
    setHtmlError('');
    setSaveError('');
    setShowHtmlCodeEditor(false);
    setPaperPreviewMode(false);
    setEditingId(card.id);
    setUploadForm({
      type: (item?.category || 'photo') as GalleryTab,
      projectId: item?.projectId || '',
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
      if (e.key === 'Escape') setLightboxId(null);
      if (e.key === 'Tab') {
        const controls = previewRef.current?.querySelectorAll<HTMLElement>(
          'button, input, [tabindex="0"]'
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [lightbox]);

  const isCardLoved = (card: ShowcaseCard) =>
    Boolean(userId && card.lovedBy.includes(String(userId)));

  const handleToggleLove = (id: string) => {
    if (!userId) return;
    toggleShowcaseLove(id, userId);
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

  const setEncodedMedia = (encoded: string) => {
    if (utf8ByteLength(encoded) > MAX_SHOWCASE_PAYLOAD_BYTES) {
      setHtmlError('作品内嵌内容超过 1 MB 上限，请精简内容或改用外部直链');
      return false;
    }
    setHtmlError('');
    setUploadForm((prev) => ({ ...prev, htmlContent: encoded }));
    return true;
  };

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov)$/i.test(file.name)) {
      setHtmlError('请选择有效的视频文件（.mp4 / .webm / .mov）');
      return;
    }
    if (file.size > MAX_VIDEO_FILE_BYTES) {
      setHtmlError('视频文件超出 100 MB 上限，请适当压缩或裁剪后再上传');
      return;
    }
    setHtmlError('');
    if (!uploadForm.imageUrl) {
      const poster = await captureVideoFrame(file);
      if (poster) {
        setUploadForm((prev) => ({ ...prev, imageUrl: prev.imageUrl || poster }));
      }
    }
    if (apiEnabled) {
      setVideoUploading(true);
      setVideoUploadProgress(1);
      try {
        const uploaded = await showcaseApi.uploadVideo(file, (pct) => {
          setVideoUploadProgress(pct);
        });
        setEncodedMedia(encodeShowcaseMedia({ kind: 'video', videoSrc: uploaded.url }));
      } catch (err) {
        setHtmlError(
          err instanceof Error ? err.message : '视频上传失败，请检查网络连接后重试'
        );
      } finally {
        setVideoUploading(false);
        setVideoUploadProgress(0);
      }
    } else {
      const blobUrl = URL.createObjectURL(file);
      setEncodedMedia(encodeShowcaseMedia({ kind: 'video', videoSrc: blobUrl }));
    }
  };

  const handlePaperFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      setHtmlError('请选择 Markdown (.md) 或文本 (.txt) 格式的论文文稿');
      return;
    }
    try {
      const text = await file.text();
      setEncodedMedia(encodeShowcaseMedia({ kind: 'paper', markdown: text }));
    } catch {
      setHtmlError('读取论文文稿失败，请重试');
    }
  };

  const handleModel3DFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ext = file.name.toLowerCase().endsWith('.stl')
      ? 'stl'
      : file.name.toLowerCase().endsWith('.obj')
      ? 'obj'
      : null;
    if (!ext) {
      setHtmlError('请选择 .obj 或 ASCII .stl 格式的三维模型文件');
      return;
    }
    try {
      const text = await file.text();
      setEncodedMedia(
        encodeShowcaseMedia({ kind: 'model3d', format: ext as Model3DFormat, data: text })
      );
    } catch {
      setHtmlError('读取 3D 模型文件失败，请重试');
    }
  };

  const handleUpload = async () => {
    if (saving) return;
    setSaveError('');
    if (!uploadForm.title.trim()) return setSaveError('请填写作品标题');
    if (!uploadForm.imageUrl && !uploadForm.htmlContent)
      return setSaveError('请上传封面图片或作品内容（HTML / 视频 / 论文 / 3D 模型）');
    if (!groupId) return setSaveError('请先加入小组后提交作品');
    const payload = {
      projectId: uploadForm.projectId || '',
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
        const savedRaw = editingId
          ? await showcaseApi.update(editingId, payload)
          : await showcaseApi.create({ ...payload, groupId });
        if (getToken() !== token) return;
        const [saved] = reviveDates([savedRaw], ['createdAt']);
        useProjectStore.setState((state) => ({
          showcaseItems: editingId
            ? state.showcaseItems.map((item) => (item.id === editingId ? saved : item))
            : [...state.showcaseItems, saved],
        }));
      } else if (editingId) {
        updateShowcaseItem(editingId, payload);
      } else {
        addShowcaseItem({ ...payload, groupId });
      }
      setTab(uploadForm.type);
      pushToast(
        editingId ? '已保存，需等待教师重新审批' : '作品已提交，等待教师审批',
        'success'
      );
      setUploadDialogOpen(false);
      resetForm();
    } catch (error) {
      setSaveError(
        error instanceof TypeError
          ? '网络连接失败，内容已保留，请检查网络后重试'
          : error instanceof Error
          ? `保存失败：${error.message}`
          : '保存失败，请重试'
      );
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

  const matchesTab = (card: ShowcaseCard, targetTab: GalleryTab) => {
    if (targetTab === 'award') {
      return (
        card.category === 'award' || (card.status === 'approved' && card.awardedCoins > 0)
      );
    }
    return card.category === targetTab;
  };

  const visibleCards = useMemo(
    () => cards.filter((c) => matchesTab(c, tab)),
    [cards, tab]
  );
  const countOf = (k: GalleryTab) => cards.filter((c) => matchesTab(c, k)).length;
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
                    全方位收录实验摄影、研究视频、学术论文、3D 物理模型与交互仿真。优秀成果经教师审批可获能量币嘉奖。
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
                      <span
                        className={cn(
                          'text-[11px] font-bold tabular-nums',
                          active ? 'text-white/80' : 'text-ink-400'
                        )}
                      >
                        {countOf(t.key)}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    resetForm(tab);
                    setUploadDialogOpen(true);
                  }}
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
                <span className="chip-mission">
                  {CATEGORY_LABEL[tab]} · {visibleCards.length} 项
                </span>
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
                      const linkedProject = card.projectId
                        ? projects.find((p) => p.id === card.projectId)
                        : undefined;
                      const gi = Math.max(0, (parseInt(card.groupId.split('-')[1]) || 1) - 1);
                      const loved = isCardLoved(card);
                      const isMine = !!groupId && card.groupId === groupId;
                      const mediaBadge = getMediaBadgeLabel(card.htmlContent, card.demoKind);
                      const groupChipColor = card.authorUserId
                        ? 'chip-mission'
                        : [
                            'chip-mission',
                            'chip-energy',
                            'chip-growth',
                            'chip-nova',
                            'chip-alert',
                            'chip-ink',
                          ][gi % 6];
                      return (
                        <motion.article
                          key={card.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: (ci * 6 + i) * 0.04 }}
                          onClick={() => setLightboxId(card.id)}
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
                            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 pr-2">
                              <span
                                className={cn(
                                  groupChipColor,
                                  '!py-0.5 !px-2 !text-[10px] backdrop-blur-md bg-opacity-80'
                                )}
                              >
                                {card.authorUserId || (group?.name || '未知小组').slice(0, 6)}
                              </span>
                              {mediaBadge && (
                                <span className="chip-growth !py-0.5 !px-2 !text-[10px]">
                                  {mediaBadge}
                                </span>
                              )}
                              {card.status === 'approved' && card.awardedCoins > 0 && (
                                <span className="chip-energy !py-0.5 !px-2 !text-[10px]">
                                  ⚡ 获奖 +{card.awardedCoins}
                                </span>
                              )}
                              {isMine && card.status !== 'approved' && (
                                <span
                                  className={cn(
                                    card.status === 'pending' ? 'chip-energy' : 'chip-danger',
                                    '!py-0.5 !px-2 !text-[10px] backdrop-blur-md'
                                  )}
                                >
                                  {card.status === 'pending' ? '待审批' : '已驳回'}
                                </span>
                              )}
                            </div>
                            <div className="absolute inset-x-0 bottom-0 p-4 pt-10">
                              <h3 className="font-bold text-[14px] md:text-[15px] text-white leading-snug drop-shadow-md mb-1">
                                {card.title}
                              </h3>
                              {linkedProject && (
                                <p className="text-[11px] text-sky-200 truncate">
                                  关联课题：{linkedProject.title}
                                </p>
                              )}
                              {isMine && card.status === 'rejected' && card.rejectReason && (
                                <p className="text-[11.5px] text-danger-100 leading-snug mt-1">
                                  驳回理由：{card.rejectReason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleToggleLove(card.id);
                                }}
                                aria-label={`点赞 ${card.title}`}
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
                                <span className="ticker tabular-nums">{card.loves}</span>
                              </button>
                              <div className="flex items-center gap-1 text-[12px] text-ink-500 font-semibold">
                                <span className="text-[11px]">
                                  {mediaBadge
                                    ? `打开${mediaBadge.split(' · ')[0]} →`
                                    : CATEGORY_LABEL[card.category]}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-[11px] text-ink-400 font-mono">
                                #
                                {String(
                                  visibleCards.findIndex((c) => c.id === card.id) + 1
                                ).padStart(2, '0')}
                              </div>
                              {isMine && (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openEdit(card);
                                  }}
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
                  <h3 className="font-bold text-ink-800 text-[15px]">优秀作品名人堂</h3>
                  <p className="text-[11px] text-ink-400">点赞 Top3 · 点击可预览</p>
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
                      onClick={() => setLightboxId(hof.id)}
                      className="p-3 rounded-2xl bg-gradient-to-br from-alert-50/60 via-energy-50/40 to-mission-50/30 border border-alert-100/50 relative cursor-pointer hover:shadow-md transition"
                    >
                      <div className="student-showcase-rank">#{hof.rank}</div>
                      <div className="rounded-xl overflow-hidden aspect-[16/10] mb-3 ring-1 ring-white/60 shadow-sm relative bg-gradient-to-br from-mission-400/30 via-nova-400/20 to-energy-400/20 flex items-center justify-center">
                        <img
                          src={hof.imageUrl || showcaseFallback}
                          alt={hof.title}
                          loading="lazy"
                          onError={useShowcaseFallback}
                          className="relative w-full h-full object-cover"
                        />
                      </div>
                      <h4 className="font-bold text-[13px] text-ink-800 leading-snug mb-1">
                        {hof.title}
                      </h4>
                      <div className="flex items-center justify-between text-[11px] text-ink-500 mb-2">
                        <span className="flex items-center gap-1.5">
                          {author && (
                            <img
                              src={author.avatar}
                              onError={applyAvatarFallback}
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
                      <h4 className="font-bold text-[12.5px] text-ink-800 leading-snug pr-2">
                        {ds.title}
                      </h4>
                      <span className={cn(ds.chip, '!py-0.5 !px-2 !text-[10px] shrink-0 mt-0.5')}>
                        {ds.chart === 'line' ? <LineChart size={10} /> : <BarChart3 size={10} />}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-500 mb-2">{ds.subtitle}</p>
                    <div className="h-[90px] -mx-2">
                      <ResponsiveContainer width="100%" height="100%">
                        {ds.chart === 'line' ? (
                          <ReLineChart
                            data={ds.data}
                            margin={{ top: 6, right: 10, left: -22, bottom: 0 }}
                          >
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
                          <BarChart
                            data={ds.data}
                            margin={{ top: 6, right: 10, left: -22, bottom: 0 }}
                          >
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
                    <button
                      className="mt-1 w-full btn-ghost !py-1.5 !px-2 text-[11px] justify-start"
                      onClick={() => {
                        const csvContent = [
                          Object.keys(ds.data[0]).join(','),
                          ...ds.data.map((row) => Object.values(row).join(',')),
                        ].join('\n');
                        const blob = new Blob([`\uFEFF${csvContent}`], {
                          type: 'text/csv;charset=utf-8;',
                        });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `${ds.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}.csv`;
                        link.click();
                      }}
                    >
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

      {/* ============ 上传 / 编辑作品弹窗 ============ */}
      {uploadDialogOpen &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm"
              onClick={() => setUploadDialogOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label={editingId ? '编辑作品' : '上传作品'}
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
                  <h3 className="font-bold text-ink-800 text-lg">
                    {editingId ? '编辑作品' : '上传作品'}
                  </h3>
                  <p className="text-[12px] text-ink-500">
                    选择分类与关联课题 → 上传图片/视频/论文/3D模型/HTML → 预览提交
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-ink-700 mb-2">
                    作品分类
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {GALLERY_TABS.map((t) => {
                      const Icon = t.icon;
                      const active = uploadForm.type === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
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

                {/* ============ 分类联动上传规范指引与实时格式体检 ============ */}
                <UploadGuidePanel
                  category={uploadForm.type}
                  htmlContent={uploadForm.htmlContent}
                />

                {myGroupProjects.length > 0 && (
                  <div>
                    <label className="block text-[12px] font-semibold text-ink-700 mb-2">
                      关联本组科研课题（可选）
                    </label>
                    <select
                      aria-label="关联本组课题"
                      value={uploadForm.projectId}
                      onChange={(e) =>
                        setUploadForm((prev) => ({ ...prev, projectId: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-ink-200 text-ink-800 text-sm focus:outline-none focus:border-mission-400"
                    >
                      <option value="">-- 不关联特定课题 --</option>
                      {myGroupProjects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.title}（{proj.topic}）
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[12px] font-semibold text-ink-700 mb-2">
                    作品标题
                  </label>
                  <input
                    type="text"
                    aria-label="作品标题"
                    value={uploadForm.title}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="输入作品标题..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-ink-200 text-ink-800 text-sm focus:outline-none focus:border-mission-400 focus:ring-2 focus:ring-mission-500/10 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-ink-700 mb-2">
                    作品描述
                  </label>
                  <textarea
                    aria-label="作品描述"
                    value={uploadForm.description}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="描述你的作品背景、实验原理或核心结论..."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-ink-200 text-ink-800 text-sm focus:outline-none focus:border-mission-400 focus:ring-2 focus:ring-mission-500/10 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-ink-700 mb-2">
                    封面图片（视频/论文/模型/HTML 作品可选）
                  </label>
                  <div className="relative">
                    {uploadForm.imageUrl ? (
                      <div className="h-28 rounded-xl overflow-hidden ring-2 ring-mission-400/50">
                        <img
                          src={uploadForm.imageUrl}
                          alt="预览"
                          className="w-full h-full object-cover"
                        />
                        <label className="absolute bottom-2 right-2 rounded-lg bg-white px-3 py-2 text-blue-700 text-xs cursor-pointer">
                          更换封面
                          <input
                            aria-label="更换封面"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageUpload}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-ink-300 bg-ink-50/50 hover:border-mission-400 hover:bg-mission-50/50 transition-all cursor-pointer">
                        <Plus size={22} className="text-ink-400 mb-1.5" />
                        <span className="text-[12px] text-ink-500">点击上传图片</span>
                        <input
                          aria-label="上传封面图片"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* ============ 分类专属多模态上传面板 ============ */}
                {uploadForm.type === 'video' && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-sky-900 flex items-center gap-1.5">
                        <Video size={15} />
                        实验视频源文件或流地址
                      </span>
                      {parsedFormMedia.kind === 'video' && (
                        <button
                          type="button"
                          onClick={() =>
                            setUploadForm((prev) => ({ ...prev, htmlContent: '' }))
                          }
                          className="text-xs text-red-600 underline"
                        >
                          移除视频
                        </button>
                      )}
                    </div>
                    <input
                      type="url"
                      aria-label="视频地址"
                      value={parsedFormMedia.kind === 'video' && !parsedFormMedia.videoSrc.startsWith('data:') ? parsedFormMedia.videoSrc : ''}
                      onChange={(e) =>
                        setEncodedMedia(
                          encodeShowcaseMedia({ kind: 'video', videoSrc: e.target.value })
                        )
                      }
                      placeholder="输入 MP4/WebM 视频流地址 (https://...) 或在下方上传最大 100 MB 本地实验视频..."
                      className="w-full px-3.5 py-2 rounded-lg bg-white border border-sky-200 text-xs text-slate-800"
                    />
                    <label className="block text-xs font-medium text-sky-800">
                      上传本地实拍实验视频（支持 .mp4 / .webm / .mov，最大 100 MB，自动流式存储并抓取首帧封面）：
                      <input
                        aria-label="上传实验视频"
                        type="file"
                        disabled={videoUploading}
                        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                        className="block w-full text-xs mt-1.5"
                        onChange={handleVideoFileUpload}
                      />
                    </label>
                    {videoUploading && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-sky-800 font-semibold">
                          <span>正在流式上传实验视频至服务器…</span>
                          <span>{videoUploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-sky-200 overflow-hidden">
                          <div
                            className="h-full bg-sky-600 transition-all"
                            style={{ width: `${Math.max(4, videoUploadProgress)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {parsedFormMedia.kind === 'video' && (
                      <VideoShowcasePlayer
                        src={parsedFormMedia.videoSrc}
                        poster={uploadForm.imageUrl || showcaseFallback}
                        title={uploadForm.title || '实验视频预览'}
                      />
                    )}
                  </div>
                )}

                {uploadForm.type === 'paper' && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
                        <FileText size={15} />
                        学术论文 / 实验研究报告正文 (Markdown)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEncodedMedia(
                              encodeShowcaseMedia({
                                kind: 'paper',
                                markdown: PAPER_MARKDOWN_TEMPLATE,
                              })
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition"
                        >
                          载入标准论文模板
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaperPreviewMode((m) => !m)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold"
                        >
                          {paperPreviewMode ? '返回编辑正文' : '预览学术排版'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PAPER_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() =>
                            setEncodedMedia(
                              encodeShowcaseMedia({
                                kind: 'paper',
                                markdown: tpl.markdown,
                              })
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-100/70 text-[11.5px] font-semibold transition"
                        >
                          范例：{tpl.name}
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs text-indigo-800">
                      导入本地 Markdown / 文本论文（.md / .txt）：
                      <input
                        aria-label="上传论文文稿"
                        type="file"
                        accept=".md,.markdown,.txt,text/markdown,text/plain"
                        className="block w-full text-xs mt-1"
                        onChange={handlePaperFileUpload}
                      />
                    </label>
                    {paperPreviewMode && parsedFormMedia.kind === 'paper' ? (
                      <PaperArticleReader
                        markdown={parsedFormMedia.markdown}
                        title={uploadForm.title || '论文预览'}
                      />
                    ) : (
                      <textarea
                        aria-label="论文正文"
                        rows={8}
                        value={parsedFormMedia.kind === 'paper' ? parsedFormMedia.markdown : ''}
                        onChange={(e) =>
                          setEncodedMedia(
                            encodeShowcaseMedia({ kind: 'paper', markdown: e.target.value })
                          )
                        }
                        placeholder="支持 Markdown 标题 (# / ##)、实验数据表格 (| 列1 | 列2 |)、公式代码等..."
                        className="w-full p-3 rounded-xl bg-white border border-indigo-200 text-xs font-mono text-slate-800 leading-relaxed"
                      />
                    )}
                  </div>
                )}

                {uploadForm.type === 'model' && (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-cyan-900 flex items-center gap-1.5">
                        <Box size={15} />
                        三维物理模型 (.obj / .stl) 或内置实验装置
                      </span>
                      {parsedFormMedia.kind === 'model3d' && (
                        <button
                          type="button"
                          onClick={() =>
                            setUploadForm((prev) => ({ ...prev, htmlContent: '' }))
                          }
                          className="text-xs text-red-600 underline"
                        >
                          移除 3D 模型
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_3D_MODELS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setEncodedMedia(
                              encodeShowcaseMedia({
                                kind: 'model3d',
                                format: 'preset',
                                data: preset.id,
                              })
                            )
                          }
                          className={cn(
                            'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition',
                            parsedFormMedia.kind === 'model3d' &&
                              parsedFormMedia.data === preset.id
                              ? 'bg-cyan-600 text-white border-cyan-600'
                              : 'bg-white text-cyan-800 border-cyan-200 hover:bg-cyan-100/60'
                          )}
                        >
                          预设：{preset.name}
                        </button>
                      ))}
                    </div>
                    <label className="block text-xs text-cyan-900">
                      上传自定义 3D 网格文件（支持 .obj 或 ASCII .stl，不超过 1 MB）：
                      <input
                        aria-label="上传 3D 模型"
                        type="file"
                        accept=".obj,.stl"
                        className="block w-full text-xs mt-1"
                        onChange={handleModel3DFileUpload}
                      />
                    </label>
                    {parsedFormMedia.kind === 'model3d' && (
                      <Model3DViewer
                        format={parsedFormMedia.format}
                        data={parsedFormMedia.data}
                        title={uploadForm.title || '3D 物理模型预览'}
                      />
                    )}
                  </div>
                )}

                {/* ============ 通用交互作品 HTML 上传与在线源码面板 ============ */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-sm font-bold text-blue-900">
                      交互作品 HTML
                      <input
                        aria-label="上传 HTML 作品"
                        type="file"
                        accept=".html,.htm,text/html"
                        className="block w-full text-xs mt-3"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = '';
                          if (!/\.html?$/i.test(file.name) || file.size > 1_000_000) {
                            setHtmlError('请选择不超过 1 MB 的 HTML 文件');
                            return;
                          }
                          setHtmlError('');
                          try {
                            const html = await file.text();
                            if (utf8ByteLength(html) > 1_000_000) {
                              setHtmlError('请选择不超过 1 MB 的 HTML 文件');
                              return;
                            }
                            setUploadForm((prev) => ({ ...prev, htmlContent: html }));
                          } catch {
                            setHtmlError('读取 HTML 文件失败，请重新选择');
                          }
                        }}
                      />
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setHtmlError('');
                          setUploadForm((prev) => ({ ...prev, htmlContent: HTML_SIM_TEMPLATE }));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition"
                      >
                        载入仿真模板
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowHtmlCodeEditor((v) => !v)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-800 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Code2 size={12} />
                        {showHtmlCodeEditor ? '收起代码框' : '在线编辑 HTML'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-blue-800 leading-5">
                    支持内嵌 CSS、JavaScript 和 data 图片的单文件演示，大小不超过 1 MB；不加载外部脚本、网络接口或同目录文件。光学和电机为平台内置 Demo。
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {HTML_SIM_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setHtmlError('');
                          setUploadForm((prev) => ({
                            ...prev,
                            htmlContent: tpl.html,
                            title: prev.title || tpl.name,
                            description: prev.description || tpl.description,
                          }));
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-800 hover:bg-blue-100/70 text-[11.5px] font-semibold transition"
                      >
                        Demo：{tpl.name}（{tpl.tag.split(' · ')[0]}）
                      </button>
                    ))}
                  </div>
                  {showHtmlCodeEditor && (
                    <textarea
                      aria-label="HTML 源码编辑"
                      rows={6}
                      value={parsedFormMedia.kind === 'html' ? parsedFormMedia.html : ''}
                      onChange={(e) => setEncodedMedia(e.target.value)}
                      placeholder="<!doctype html> 在此粘贴或编写自包含的物理交互仿真 HTML 代码..."
                      className="w-full p-3 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs leading-relaxed"
                    />
                  )}
                  {htmlError && (
                    <p role="alert" className="text-sm text-red-700">
                      {htmlError}
                    </p>
                  )}
                  {parsedFormMedia.kind === 'html' && (
                    <>
                      <HtmlDemo html={parsedFormMedia.html} title="HTML 作品预览" />
                      <button
                        type="button"
                        className="text-sm text-blue-700 underline"
                        onClick={() =>
                          setUploadForm((prev) => ({ ...prev, htmlContent: '' }))
                        }
                      >
                        移除 HTML 作品
                      </button>
                    </>
                  )}
                </div>

                {saveError && (
                  <p role="alert" className="text-sm text-red-700">
                    {saveError}
                  </p>
                )}
                <button
                  disabled={saving}
                  onClick={handleUpload}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
                >
                  {saving ? '正在保存…' : editingId ? '保存作品' : '提交作品审核'}
                </button>
              </div>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {/* ============ 作品详情与多模态交互预览弹窗 ============ */}
      {lightbox &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-900/80 backdrop-blur-sm p-4"
            onClick={() => setLightboxId(null)}
          >
            <div
              ref={previewRef}
              role="dialog"
              aria-modal="true"
              aria-label={lightbox.title}
              className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[24px] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLightboxId(null)}
                className="absolute top-3 right-3 z-20 w-9 h-9 rounded-xl bg-ink-900/60 text-white flex items-center justify-center hover:bg-ink-900/80 transition-colors"
                aria-label="关闭"
              >
                <X size={18} />
              </button>

              <ShowcaseContentRenderer
                title={lightbox.title}
                imageUrl={lightbox.imageUrl}
                htmlContent={lightbox.htmlContent}
                demoKind={lightbox.demoKind}
                description={lightbox.description}
                category={lightbox.category}
                author={
                  lightbox.authorUserId ||
                  groups.find((g) => g.id === lightbox.groupId)?.name ||
                  '未知小组'
                }
              />

              <div className="p-6">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="chip-mission !py-0.5 !px-2 !text-[10px]">
                    {CATEGORY_LABEL[lightbox.category]}
                  </span>
                  <span className="chip-ink !py-0.5 !px-2 !text-[10px]">
                    {lightbox.authorUserId ||
                      groups.find((g) => g.id === lightbox.groupId)?.name ||
                      '未知小组'}
                  </span>
                  {lightbox.projectId && (
                    <span className="chip-nova !py-0.5 !px-2 !text-[10px] inline-flex items-center gap-1">
                      <FolderKanban size={10} />
                      课题：
                      {projects.find((p) => p.id === lightbox.projectId)?.title ||
                        lightbox.projectId}
                    </span>
                  )}
                  {lightbox.status === 'approved' && lightbox.awardedCoins > 0 && (
                    <span className="chip-energy !py-0.5 !px-2 !text-[10px]">
                      ⚡ 基地嘉奖 +{lightbox.awardedCoins} 能量币
                    </span>
                  )}
                  {lightbox.status !== 'approved' && (
                    <span
                      className={cn(
                        lightbox.status === 'pending' ? 'chip-energy' : 'chip-danger',
                        '!py-0.5 !px-2 !text-[10px]'
                      )}
                    >
                      {lightbox.status === 'pending' ? '待审批' : '已驳回'}
                    </span>
                  )}
                </div>
                <h2 className="text-[20px] font-extrabold text-ink-900">{lightbox.title}</h2>
                {lightbox.description && (
                  <p className="text-[13.5px] text-ink-600 leading-relaxed mt-3">
                    {lightbox.description}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-5 pt-4 border-t border-ink-100">
                  <button
                    onClick={() => handleToggleLove(lightbox.id)}
                    className={cn(
                      'flex items-center gap-1.5 text-[13px] font-semibold transition-colors',
                      isCardLoved(lightbox)
                        ? 'text-danger-600'
                        : 'text-ink-500 hover:text-danger-600'
                    )}
                  >
                    <Heart
                      size={16}
                      fill={isCardLoved(lightbox) ? 'currentColor' : 'none'}
                    />
                    {lightbox.loves} 人点赞
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
