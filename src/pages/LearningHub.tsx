import AdaptiveNavigation from '@/components/ui/AdaptiveNavigation';
import { useLearningProgressStore } from '@/store/learningProgressStore';
import { apiEnabled } from '@/lib/apiClient';
import type { LucideIcon } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Atom, Zap, Eye, ThermometerSun, RadioTower, Waves, Rocket, Scale, CheckCircle2, Star, Sparkles, PlayCircle, Trophy, Target, Lightbulb, Brain, ChevronRight, ChevronDown, BookOpen, X, HelpCircle } from 'lucide-react';
import { useTheoryStore } from '@/store/theoryStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { mockTopics } from '@/data/mockTopics';
import { getKnowledgeGuide } from '@/lib/knowledgeSystem';
import { getLearningExamples } from '@/lib/learningExamples';
import { cn } from '@/lib/utils';

type TopicTab = 'ai-study' | 'knowledge' | 'quiz';

interface TopicMeta {
  id: string;
  title: string;
  icon: LucideIcon;
  chapters: number;
  difficulty: 1 | 2 | 3;
  completed: boolean;
  unlocked: boolean;
}

const TOPIC_META: TopicMeta[] = [
  { id: 'topic-1', title: '力学', icon: Atom, chapters: 12, difficulty: 1, completed: true, unlocked: true },
  { id: 'topic-2', title: '电磁学', icon: Zap, chapters: 15, difficulty: 2, completed: false, unlocked: true },
  { id: 'topic-3', title: '光学', icon: Eye, chapters: 10, difficulty: 2, completed: true, unlocked: true },
  { id: 'topic-4', title: '热学', icon: ThermometerSun, chapters: 9, difficulty: 1, completed: true, unlocked: true },
  { id: 'topic-5', title: '原子物理', icon: RadioTower, chapters: 11, difficulty: 3, completed: false, unlocked: true },
  { id: 'topic-6', title: '波动', icon: Waves, chapters: 10, difficulty: 2, completed: false, unlocked: true },
  { id: 'topic-7', title: '相对论', icon: Rocket, chapters: 8, difficulty: 3, completed: false, unlocked: false },
  { id: 'topic-8', title: '误差分析', icon: Scale, chapters: 7, difficulty: 2, completed: false, unlocked: false },
];



export default function LearningHub() {
  const { id: routeTopicId } = useParams();
  const [activeTopicId, setActiveTopicId] = useState(routeTopicId || 'topic-1');
  const [activeTab, setActiveTab] = useState<TopicTab>('ai-study');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<{ point: string; question: string; answer: string; analysis: string } | null>(null);

  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const { quizSessions: allQuizSessions, startQuiz, questions } = useTheoryStore();
  const userId = useAuthStore((s) => s.userId);
  const quizSessions = useMemo(() => allQuizSessions.filter((session) => (session.userId === userId || (apiEnabled && !session.userId)) && session.graded), [allQuizSessions, userId]);

  // 完成/解锁：从真实测验派生（某主题有通过记录即完成；主题按顺序解锁）
  const completedTopicIds = useMemo(() => new Set(quizSessions.filter((s) => s.passed).map((s) => s.topicId)), [quizSessions]);
  const topicMeta = useMemo(
    () =>
      TOPIC_META.map((t, i) => {
        const completed = completedTopicIds.has(t.id);
        const prevDone = i === 0 || TOPIC_META.slice(0, i).every((pt) => completedTopicIds.has(pt.id));
        return { ...t, completed, unlocked: prevDone };
      }),
    [completedTopicIds]
  );
  useEffect(() => {
    const requested = topicMeta.find((topic) => topic.id === routeTopicId && topic.unlocked);
    const fallback = topicMeta.find((topic) => topic.unlocked && !topic.completed) ?? topicMeta[0];
    setActiveTopicId(requested?.id ?? fallback.id);
    setExpandedChapter(null);
    setSelectedPoint(null);
    if (routeTopicId && !requested) {
      pushToast('该主题不存在或尚未解锁，已返回可学习的主题', 'warning');
      navigate('/theory/topics', { replace: true });
    }
  }, [routeTopicId, topicMeta, navigate, pushToast]);

  const quizHistory = useMemo(
    () =>
      quizSessions
        .slice()
        .reverse()
        .slice(0, 4)
        .map((s, i) => {
          const d = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
          return { id: i, date: `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`, accuracy: s.score, passed: s.passed, reward: 0 };
        }),
    [quizSessions]
  );
  const avgAccuracy = quizSessions.length > 0 ? Math.round(quizSessions.reduce((sum, s) => sum + s.score, 0) / quizSessions.length) : 0;

  const activeTopicData = mockTopics.find((t) => t.id === activeTopicId) || mockTopics[0];
  const selectedExamples = getLearningExamples(activeTopicId, selectedPoint, questions);
  const activeMeta = topicMeta.find((t) => t.id === activeTopicId) || topicMeta[0];
  const markVisited = useLearningProgressStore((state) => state.markVisited);
  useEffect(() => {
    if (!userId || !activeMeta.unlocked) return;
    if (activeTab === 'ai-study') markVisited(userId, 'ai_learn');
    if (activeTab === 'knowledge') markVisited(userId, 'knowledge_organize');
  }, [userId, activeTab, activeMeta.unlocked, markVisited]);
  const unlockedCount = topicMeta.filter((t) => t.unlocked).length;
  const completedCount = topicMeta.filter((t) => t.completed).length;
  const totalProgress = Math.round((completedCount / topicMeta.length) * 100);

  const [startingQuiz, setStartingQuiz] = useState(false);

  /** 建一条真实测验会话再跳转。之前是跳 `${topicId}-quiz` 这个编造的 id，
   *  测验页找不到它就退化成「抽全局前 10 题」，交卷时还报「会话不存在」。 */
  const handleStartQuiz = async () => {
    if (startingQuiz || !activeMeta.unlocked) return;
    setStartingQuiz(true);
    try {
      const session = await startQuiz(activeTopicId, userId);
      navigate(`/theory/quiz/${session.id}`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : '无法开始测验，请稍后再试', 'error');
      setStartingQuiz(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <section className="student-learning-intro glass-card p-8 rounded-[20px] relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-gradient-to-br from-mission-300/30 to-nova-300/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-56 h-56 rounded-full bg-gradient-to-br from-growth-300/20 to-mission-300/20 blur-3xl pointer-events-none" />
        
        <div className="student-learning-hero-grid relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8">
            <div className="mission-label mb-4">
              <BookOpen size={12} />
              LEARNING HUB · AI POWERED
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-3">
              <span className="student-learning-title text-ink-800">AI 学习中枢</span>
              <span className="student-learning-subtitle text-gradient-mission">Learning Hub</span>
            </h1>
            <p className="text-lg text-ink-600 font-medium leading-relaxed max-w-2xl">
              从探索到精通，8大物理主题 AI 陪你一路升级。每一个知识点都是一颗星，每一次挑战都是成长的阶梯。
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <span className="chip-mission">
                <Target size={12} /> 8 大主题体系
              </span>
              <span className="chip-growth">
                <Trophy size={12} /> {completedCount} 个已通关
              </span>
              <span className="chip-nova">
                <Sparkles size={12} /> AI 智能导师
              </span>
            </div>
          </div>

          <div className="student-learning-summary">
            <div className="student-learning-progress-heading"><span>总体学习进度</span><strong>{totalProgress}<small>%</small></strong></div>
            <progress aria-label="总体学习进度" value={totalProgress} max={100} />
            <div className="student-learning-summary-row"><Zap size={16} aria-hidden="true" /><span>当前学习</span><strong>{activeMeta.title}</strong></div>
            <div className="student-learning-summary-row"><CheckCircle2 size={16} aria-hidden="true" /><span>已解锁主题</span><strong>{unlockedCount} / 8</strong></div>
          </div>
        </div>
      </section>

      <AdaptiveNavigation title="主题导航" summary={activeMeta.title} width={230} navigation={<aside className="space-y-3">
          <div className="mission-label">
            <Atom size={12} />
            物理主题导航
          </div>
          <p className="student-topic-hint text-xs text-white/80">左右滑动查看主题</p>
          <div className="student-topic-list space-y-3" aria-label="物理主题列表" tabIndex={0}>
          {topicMeta.map((meta, idx) => {
            const Icon = meta.icon;
            const isActive = activeTopicId === meta.id;
            return (
              <motion.button
                key={meta.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                data-nav-select
                onClick={() => meta.unlocked && navigate(`/theory/topics/${meta.id}`)}
                disabled={!meta.unlocked}
                className={cn(
                  'w-full glass-card glass-card-hover p-4 text-left relative overflow-hidden group',
                  isActive && 'ring-2 ring-mission-400 shadow-glowMission'
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-mission-50/60 to-nova-50/40 pointer-events-none" />
                )}
                <div className="relative flex items-start gap-3">
                  <div
                    className={cn(
                      'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all',
                      isActive
                        ? 'bg-gradient-to-br from-mission-500 to-nova-500 text-white shadow-glowMission'
                        : 'bg-gradient-to-br from-mission-50 to-mission-100/50 text-mission-600'
                    )}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={cn('font-bold text-base', isActive ? 'text-mission-700' : 'text-ink-800')}>
                        {meta.title}
                      </h3>
                      {meta.completed && (
                        <CheckCircle2 size={16} className="text-growth-500 shrink-0" />
                      )}
                      {!meta.unlocked && (
                        <div className="chip-ink !py-0.5 !text-[10px]">
                          <LockIcon /> 未解锁
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="chip-mission !py-0.5 !text-[10px]">
                        {mockTopics.find((topic) => topic.id === meta.id)?.outline.length ?? 0} 章
                      </span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Star
                            key={i}
                            size={11}
                            className={i < meta.difficulty ? 'text-alert-500 fill-alert-400' : 'text-ink-200'}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
          </div>
        </aside>}>

        <section>
          <div className="workspace-tabs flex flex-wrap items-center gap-2 mb-4">
            {([
              { id: 'ai-study', label: 'AI 自学', icon: Brain, color: 'mission' },
              { id: 'knowledge', label: '知识体系', icon: Sparkles, color: 'nova' },
              { id: 'quiz', label: '综合测验', icon: Trophy, color: 'energy' },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-pressed={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all',
                    isActive
                      ? 'glass-card shadow-glowMission text-mission-700'
                      : 'text-ink-500 hover:text-ink-700 hover:bg-white/50'
                  )}
                >
                  <Icon size={16} className={isActive ? `text-${tab.color}-500` : ''} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'ai-study' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-gradient-to-br from-nova-300/30 to-mission-300/20 blur-2xl" />
                <div className="relative flex items-start gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl bg-nova-400/30 blur-lg animate-pulse" />
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nova-500 via-nova-400 to-mission-400 flex items-center justify-center shadow-glowMission relative">
                      <Sparkles size={28} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="chip-nova mb-2 !py-1">AI PHYSICS TUTOR</div>
                    <h3 className="text-xl font-black text-ink-800 mb-1">
                      嗨！我是你的 AI 物理导师
                    </h3>
                    <p className="text-ink-600 font-medium">
                      今天我们来攻克
                      <span className="text-mission-600 font-bold mx-1">「{activeTopicData.title}」</span>
                      — 掌握核心概念，做题不再难！
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {activeTopicData.aiMaterial.split('## ').filter(Boolean).map((section, idx) => {
                  const [title, ...contentLines] = section.split('\n');
                  const content = contentLines.join('\n').trim().replace(/\n(?=\*\*解\*\*)/g, '\n\n');
                  const iconMap = [Target, Lightbulb, Brain, ChevronRight];
                  const Icon = iconMap[idx] || BookOpen;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className="student-study-section glass-card p-6 rounded-2xl border-2 border-dashed border-mission-200/60"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-mission-500 to-nova-500 flex items-center justify-center text-white">
                          <Icon size={16} />
                        </div>
                        <h4 className="text-lg font-black text-ink-800">{title.trim()}</h4>
                      </div>
                      <div className="student-study-copy prose prose-sm max-w-none text-ink-700 prose-headings:text-ink-800 prose-strong:text-mission-700 prose-code:text-nova-700 prose-code:bg-nova-50 prose-code:px-1 prose-code:rounded">
                        <ReactMarkdown>{content}</ReactMarkdown>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'knowledge' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-w-0"
            >
              <AdaptiveNavigation title="章节目录" summary={selectedPoint ?? activeTopicData.title} width={300} navigation={<div className="glass-card p-4 rounded-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div className="mission-label">
                    <Sparkles size={12} />
                    知识点树
                  </div>
                  <span className="text-sm font-bold text-ink-500">{activeTopicData.title}</span>
                </div>
                <div className="space-y-2">
                  {activeTopicData.outline.map((chapter, cIdx) => {
                    const isExpanded = expandedChapter === chapter.chapter;
                    return (
                      <div key={cIdx} className="rounded-xl overflow-hidden">
                        <button
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedChapter(isExpanded ? null : chapter.chapter)}
                          className="w-full p-4 glass-card rounded-xl flex items-center justify-between hover:bg-mission-50/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-mission-100 to-mission-50 text-mission-600 flex items-center justify-center font-bold text-sm">
                              {cIdx + 1}
                            </div>
                            <span className="font-bold text-ink-800">{chapter.chapter}</span>
                            <span className="chip-ink !text-[10px]">{chapter.points.length} 个知识点</span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown size={18} className="text-mission-500" />
                          ) : (
                            <ChevronRight size={18} className="text-ink-400" />
                          )}
                        </button>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="pl-12 pr-4 py-3 space-y-2"
                          >
                            {chapter.points.map((point, pIdx) => (
                              <button
                                key={pIdx}
                                data-nav-select
                                onClick={() => setSelectedPoint(point)}
                                className={cn(
                                  'w-full p-3 rounded-xl text-left flex items-center gap-3 transition-all',
                                  selectedPoint === point
                                    ? 'bg-gradient-to-r from-mission-500/10 to-nova-500/10 border border-mission-300/40'
                                    : 'hover:bg-ink-50 border border-transparent'
                                )}
                              >
                                <div className="w-7 h-7 shrink-0 rounded-full bg-mission-100 text-mission-700 text-[11px] font-bold flex items-center justify-center">
                                  {pIdx + 1}
                                </div>
                                <span className={cn(
                                  'font-medium text-sm',
                                  selectedPoint === point ? 'text-mission-700 font-bold' : 'text-ink-700'
                                )}>
                                  {point}
                                </span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>}>

              <div className="space-y-4">
                <div className="glass-card p-5 rounded-2xl">
                  <div className="chip-nova mb-3">
                    <Lightbulb size={12} /> 知识要点与例题
                  </div>
                  {selectedPoint ? (
                    <div className="space-y-3">
                      <h4 className="font-bold text-ink-800">{selectedPoint}</h4>
                      <p className="text-xs font-bold text-mission-600">{getKnowledgeGuide(activeTopicId, selectedPoint)?.level}</p>
                      <p className="text-sm text-ink-700 leading-relaxed">{getKnowledgeGuide(activeTopicId, selectedPoint)?.summary}</p>
                      {selectedExamples.length ? selectedExamples.map((example, index) => (
                        <div key={`${selectedPoint}-${index}`} className="p-4 rounded-xl bg-gradient-to-br from-mission-50/60 to-nova-50/40 border border-mission-100">
                          <div className="text-xs font-bold text-mission-600 mb-2">例题 {index + 1}</div>
                          <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-line">{example.question}</p>
                          <button className="btn-mission mt-3 !py-2 !px-4 !text-sm w-full" onClick={() => {
                            setCurrentAnalysis({ point: selectedPoint, ...example });
                            setShowAnalysis(true);
                          }}>
                            <PlayCircle size={14} /> {example.analysis ? '查看解析' : '查看答案'}
                          </button>
                        </div>
                      )) : <p className="text-sm text-ink-500">该知识点暂无配套例题，可先阅读学习材料。</p>}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-ink-400">
                      <Sparkles size={36} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">点击左侧知识点查看例题</p>
                    </div>
                  )}
                </div>
              </div>
            </AdaptiveNavigation>
            </motion.div>
          )}

          {activeTab === 'quiz' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4"
            >
              <div className="lg:col-span-7 glass-card p-8 rounded-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-energy-500/5 via-transparent to-alert-500/5" />
                <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-gradient-to-br from-energy-300/20 to-alert-300/10 blur-3xl" />
                <div className="relative text-center py-6">
                  <div className="inline-block relative mb-6">
                      <div className="absolute inset-0 rounded-3xl bg-energy-400/30 blur-xl animate-pulse" />
                      <button
                        className="btn-energy relative !py-6 !px-10 !text-xl !rounded-2xl shadow-glowEnergy disabled:opacity-60"
                        onClick={handleStartQuiz}
                        disabled={startingQuiz}
                      >
                        <Zap size={24} className="fill-white/30" />
                        {startingQuiz ? '正在准备测验…' : 'START TEST · 开始测验'}
                      </button>
                    </div>
                  <h3 className="text-2xl font-black text-ink-800 mb-2">
                    「{activeTopicData.title}」知识挑战
                  </h3>
                  <p className="text-ink-600 font-medium mb-6">
                    10 道精选题目 · 80 分通关
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    {/* 原先这里还有一个「限时 20 分钟」的芯片——测验页根本没有计时器，
                        是句空头承诺，已去掉。 */}
                    <div className="glass-card !py-3 !px-5 rounded-xl flex items-center gap-2">
                      <Target size={16} className="text-growth-500" />
                      <span className="text-sm font-bold text-ink-700">平均分 {avgAccuracy}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-3">
                <div className="mission-label">
                  <Trophy size={12} />
                  最近测验成绩
                </div>
                {quizHistory.map((record, idx) => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="glass-card glass-card-hover p-4 rounded-xl"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center',
                          record.passed
                            ? 'bg-gradient-to-br from-growth-400 to-growth-500 text-white'
                            : 'bg-gradient-to-br from-alert-400 to-alert-500 text-white'
                        )}>
                          {record.passed ? <Trophy size={16} /> : <Target size={16} />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-ink-500">{record.date}</div>
                          <div className="text-sm font-bold text-ink-800">
                            {record.passed ? '已通过' : '未通过'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          'text-2xl font-black tabular-nums',
                          record.passed ? 'text-growth-600' : 'text-alert-600'
                        )}>
                          {record.accuracy}%
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden mb-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${record.accuracy}%` }}
                        transition={{ delay: idx * 0.1 + 0.2, duration: 0.8 }}
                        className={cn(
                          'h-full rounded-full',
                          record.passed
                            ? 'bg-gradient-to-r from-growth-400 to-growth-500'
                            : 'bg-gradient-to-r from-alert-400 to-alert-500'
                        )}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-500 font-medium">奖励</span>
                      <span className="chip-energy !py-0.5 !text-[11px]">
                        +{record.reward}⚡
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </section>
      </AdaptiveNavigation>

      <AnimatePresence>
        {showAnalysis && currentAnalysis && (
          <motion.div
            className="fixed inset-0 z-[150]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-ink-900/60 via-mission-900/40 to-nova-900/50 backdrop-blur-md"
              onClick={() => setShowAnalysis(false)}
            />
            <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8">
              <motion.div
                className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-[24px] glass-card shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]"
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              >
              <div className="flex items-center justify-between p-5 border-b border-ink-100/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-mission-50 text-mission-700 border border-mission-200">
                    <BookOpen size={14} />
                    <span className="text-[11px] font-bold tracking-wider">ANALYSIS</span>
                  </div>
                  <h2 className="text-lg font-black text-ink-900">{currentAnalysis.point} - 例题解析</h2>
                </div>
                <button
                  onClick={() => setShowAnalysis(false)}
                  aria-label="关闭例题解析"
                  className="w-8 h-8 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(85vh-72px)] space-y-5">
                <div className="p-4 rounded-xl bg-gradient-to-br from-mission-50/60 to-nova-50/40 border border-mission-100">
                  <div className="text-xs font-bold text-mission-600 mb-2 flex items-center gap-1">
                    <HelpCircle size={14} /> 题目
                  </div>
                  <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">{currentAnalysis.question}</p>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-growth-50/60 to-green-50/40 border border-growth-100">
                  <div className="text-xs font-bold text-growth-600 mb-2 flex items-center gap-1">
                    <CheckCircle2 size={14} /> 参考答案
                  </div>
                  <p className="text-sm text-ink-800 leading-relaxed">{currentAnalysis.answer}</p>
                </div>

                {currentAnalysis.analysis && <div className="p-5 rounded-xl bg-white border border-ink-100">
                  <div className="text-xs font-bold text-mission-600 mb-3 flex items-center gap-1">
                    <Lightbulb size={14} /> 详细解析
                  </div>
                  <div className="text-sm text-ink-700 leading-relaxed whitespace-pre-line">
                    {currentAnalysis.analysis}
                  </div>
                </div>}
              </div>

              <div className="flex items-center justify-end gap-3 p-5 border-t border-ink-100/50">
                <button
                  onClick={() => setShowAnalysis(false)}
                  className="btn-outline"
                >
                  关闭
                </button>
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  );
}
