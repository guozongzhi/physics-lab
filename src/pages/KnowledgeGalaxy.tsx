import AdaptiveNavigation from '@/components/ui/AdaptiveNavigation';
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheoryStore } from '@/store/theoryStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useLearningProgressStore } from '@/store/learningProgressStore';
import { Search, Star, BookOpen, ChevronRight, CheckCircle2, Zap, X, Orbit, Magnet, Sun, Thermometer, Atom, Waves, ChartNoAxesColumn, ArrowLeft, Pause, Play } from 'lucide-react';
import { mockTopics } from '@/data/mockTopics';
import { getKnowledgeGuide, getRelatedQuestions } from '@/lib/knowledgeSystem';
import { getLearningExamples } from '@/lib/learningExamples';
import { cn } from '@/lib/utils';

const TOPIC_ICONS = [Orbit, Magnet, Sun, Thermometer, Atom, Waves, Orbit, ChartNoAxesColumn];
const DIFFICULTIES = ['全部难度', '入门', '进阶', '挑战'];
// Preserve persisted knowledge-point IDs and the existing chapter-order learning path.
const SYSTEMS = mockTopics.map((topic, topicIndex) => {
  const nodes = topic.outline.flatMap((chapter, chapterIdx) => chapter.points.map((label, pointIdx) => ({
    id: `${topic.id}-${chapterIdx}-${pointIdx}`, label, topicId: topic.id, chapterIdx, pointIdx,
    chapter: chapter.chapter, difficulty: topic.id === 'topic-7' || getKnowledgeGuide(topic.id, label)?.level === '拓展了解' ? 3 : chapterIdx === 0 ? 1 : 2,
  })));
  return { ...topic, icon: TOPIC_ICONS[topicIndex % TOPIC_ICONS.length], nodes };
});
const ALL_NODES = SYSTEMS.flatMap((system) => system.nodes);
type KnowledgeNode = typeof ALL_NODES[number];

export default function KnowledgeGalaxy() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.userId);
  const questions = useTheoryStore((state) => state.questions);
  const startQuiz = useTheoryStore((state) => state.startQuiz);
  const masteredNodes = useLearningProgressStore((state) => state.masteredNodes);
  const toggleMastered = useLearningProgressStore((state) => state.toggleMastered);
  const pushToast = useUIStore((state) => state.pushToast);
  const [motionPaused, setMotionPaused] = useState(false);
  const [topicId, setTopicId] = useState(SYSTEMS[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState(0);
  const [startingQuiz, setStartingQuiz] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const mastered = userId ? masteredNodes[userId] ?? {} : {};
  const masteredCount = ALL_NODES.filter((node) => mastered[node.id]).length;
  const progress = Math.round(masteredCount / ALL_NODES.length * 100);
  const query = searchQuery.trim().toLowerCase();
  const matches = (node: KnowledgeNode) => (!difficulty || node.difficulty === difficulty) && (!query || `${node.label} ${node.chapter} ${SYSTEMS.find((topic) => topic.id === node.topicId)?.title}`.toLowerCase().includes(query));
  const system = SYSTEMS.find((topic) => topic.id === topicId) ?? SYSTEMS[0];
  const displaySystems = topicId === 'all' ? SYSTEMS : [system];
  const visibleNodes = displaySystems.flatMap((topic) => topic.nodes.filter(matches));
  const selectedNode = visibleNodes.find((node) => node.id === selectedId) ?? visibleNodes[0] ?? null;
  const questionMap = useMemo(() => new Map(ALL_NODES.map((node) => [node.id, getRelatedQuestions(node.topicId, node.label, questions)])), [questions]);
  const selectedSystem = SYSTEMS.find((topic) => topic.id === selectedNode?.topicId) ?? system;
  const selectedQuestions = selectedNode ? questionMap.get(selectedNode.id) ?? [] : [];
  const selectedGuide = selectedNode ? getKnowledgeGuide(selectedNode.topicId, selectedNode.label) : null;
  const selectedExamples = selectedNode ? getLearningExamples(selectedNode.topicId, selectedNode.label, questions) : [];
  const predecessor = selectedNode ? selectedSystem.nodes[selectedSystem.nodes.findIndex((node) => node.id === selectedNode.id) - 1] : undefined;
  const selectTopic = (id: string) => {
    setTopicId(id); setSelectedId(null); setCollapsedChapters({});
  };
  const selectNode = (node: KnowledgeNode) => { setSelectedId(node.id); };
  const handlePractice = async () => {
    if (!selectedNode || startingQuiz) return;
    setStartingQuiz(true);
    try {
      const session = await startQuiz(selectedNode.topicId, userId);
      navigate(`/theory/quiz/${session.id}`);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '无法开始练习', 'error');
    } finally { setStartingQuiz(false); }
  };
  const detail = selectedNode && (
    <div className="galaxy-detail-content" key={selectedNode.id}>
      <div className="galaxy-detail-context">{selectedSystem.title} <ChevronRight size={12} aria-hidden="true" /> {selectedNode.chapter}</div>
      <div className="galaxy-detail-title"><Star size={22} aria-hidden="true" /><h3>{selectedNode.label}</h3></div>
      <span className={cn('galaxy-status', mastered[selectedNode.id] && 'is-mastered')}>
        {mastered[selectedNode.id] ? <CheckCircle2 size={14} aria-hidden="true" /> : <BookOpen size={14} aria-hidden="true" />}
        {mastered[selectedNode.id] ? '自评已掌握' : '学习中'} · {DIFFICULTIES[selectedNode.difficulty]}
      </span>
      <section className="galaxy-related galaxy-concept">
        <h4>学习要点 <span>{selectedGuide?.level}</span></h4>
        <p>{selectedGuide?.summary}</p>
      </section>
      <section className="galaxy-related">
        <h4>配套例题 <span>{selectedExamples.length}</span></h4>
        {selectedExamples.map((example, index) => <div className="galaxy-question" key={index}>
          <span>例题 {index + 1}</span><p className="whitespace-pre-line">{example.question}</p>
          <details><summary>查看答案与说明</summary><p className="whitespace-pre-line">{example.answer}</p>{example.analysis && <p className="whitespace-pre-line">{example.analysis}</p>}</details>
        </div>)}
      </section>
      <section className="galaxy-related">
        <h4>测验题库关联 <span>{selectedQuestions.length}</span></h4>
        {selectedQuestions.length ? selectedQuestions.slice(0, 3).map((question) => <div className="galaxy-question" key={question.id}><p>{question.stem}</p><ol type="A">{question.options.map((option, index) => <li key={index}>{option}</li>)}</ol></div>) : <p>该点已有配套例题，暂未纳入自动判分题库；综合练习按所属主题抽题。</p>}
      </section>
      <div className="galaxy-detail-actions">
        <button className="btn-outline" disabled={!userId} onClick={() => userId && toggleMastered(userId, selectedNode.id)}><CheckCircle2 size={16} aria-hidden="true" />{mastered[selectedNode.id] ? '取消自评掌握' : '标记自评已掌握'}</button>
        <button className="btn-primary" disabled={startingQuiz} onClick={handlePractice}><Zap size={16} aria-hidden="true" />{startingQuiz ? '正在创建练习…' : '综合练习'}</button>
      </div>
      <p className="galaxy-local-note">自评仅保存在本设备，不计入测验成绩。综合练习覆盖所属主题。</p>
      {predecessor ? <button className="galaxy-predecessor" onClick={() => { setDifficulty(0); setSearchQuery(''); setCollapsedChapters({}); selectNode(predecessor); }}><ArrowLeft size={14} aria-hidden="true" /><span>按目录回看：{predecessor.label}</span></button> : <p className="galaxy-local-note">这是该主题目录中的第一个知识点。目录顺序供学习参考，不表示全部知识点都具有前置依赖。</p>}
    </div>
  );

  return (
    <div className="knowledge-explorer">
      <section className="galaxy-intro">
        <div><h1>知识星河</h1><p>沿概念、规律与应用建立知识联系；拓展内容单独标注。</p></div>
        <div className="galaxy-progress"><div><span>自评已掌握 <strong>{masteredCount}</strong> / {ALL_NODES.length} 个知识点</span><strong>{progress}%</strong></div><progress aria-label="知识点自评掌握进度" value={masteredCount} max={ALL_NODES.length} /></div>
      </section>
      <section className={cn('galaxy-constellation', motionPaused && 'is-paused')} aria-label="知识主题星图">
        <div className="galaxy-map-toolbar">
          <p>选择一片星域，开启知识探索</p>
          <div>
            <button className={cn('galaxy-map-all', topicId === 'all' && 'is-active')} aria-pressed={topicId === 'all'} onClick={() => selectTopic('all')}><Star size={15} aria-hidden="true" />全部主题</button>
            <button aria-label={motionPaused ? '播放星图动画' : '暂停星图动画'} aria-pressed={motionPaused} onClick={() => setMotionPaused((paused) => !paused)}>{motionPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}<span>{motionPaused ? '播放动画' : '暂停动画'}</span></button>
          </div>
        </div>
        <div className="galaxy-map-stage">
          <svg className="galaxy-trails" viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true">
            <path className="galaxy-trail-base" d="M100 55 L370 82 L625 52 L895 80 M100 210 L365 235 L630 205 L895 230 M100 55 L100 210 M370 82 L365 235 M625 52 L630 205 M895 80 L895 230" />
            <path className="galaxy-trail-light" d="M100 55 L370 82 L625 52 L895 80 M100 210 L365 235 L630 205 L895 230" />
            <path className="galaxy-trail-light galaxy-trail-cross" d="M100 55 L100 210 M370 82 L365 235 M625 52 L630 205 M895 80 L895 230" />
          </svg>
          <div className="galaxy-starfields" aria-label="学科主题">{SYSTEMS.map((topic, index) => {
            const Icon = topic.icon;
            const completed = topic.nodes.filter((node) => mastered[node.id]).length;
            return <button key={topic.id} className={cn('galaxy-starfield', topicId === topic.id && 'is-active')} style={{ '--star-delay': `${index * -0.7}s`, '--entry-delay': `${index * 45}ms` } as CSSProperties} aria-label={`探索${topic.title}`} aria-pressed={topicId === topic.id} onClick={() => selectTopic(topic.id)}>
              <span className="galaxy-starfield-icon"><Icon size={30} aria-hidden="true" /></span>
              <span className="galaxy-starfield-copy"><strong>{topic.title}</strong><small>{topic.nodes.length} 个知识点 · {topic.outline.length} 个章节</small></span>
              <span className="galaxy-starfield-progress"><span style={{ width: `${completed / topic.nodes.length * 100}%` }} /></span>
              <span className="galaxy-starfield-footer"><span>自评掌握 {completed}/{topic.nodes.length}</span><ChevronRight size={15} aria-hidden="true" /></span>
            </button>;
          })}</div>
        </div>
      </section>
      <div className="galaxy-tools">
        <label className="galaxy-search"><Search size={18} aria-hidden="true" /><input aria-label="搜索知识点或章节" placeholder="搜索知识点或章节" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); }} />{searchQuery && <button aria-label="清空搜索" onClick={() => setSearchQuery('')}><X size={16} /></button>}</label>
        <select aria-label="知识点难度" value={difficulty} onChange={(event) => { setDifficulty(Number(event.target.value)); }}>{DIFFICULTIES.map((label, index) => <option key={label} value={index}>{label}</option>)}</select>
      </div>
      <AdaptiveNavigation title="知识点目录" summary={selectedNode?.label ?? system.title} width={340} navigation={
        <section className="galaxy-path" aria-label={`${topicId === 'all' ? '全部主题' : system.title}知识点`}>
          <header className="galaxy-path-heading"><system.icon size={26} aria-hidden="true" /><div><h2>{topicId === 'all' ? '全部主题' : system.title}</h2><p>{visibleNodes.length} 个知识点{query || difficulty ? '匹配筛选' : ` · ${displaySystems.reduce((sum, topic) => sum + topic.outline.length, 0)} 个章节`}</p></div><span>{displaySystems.flatMap((topic) => topic.nodes).filter((node) => mastered[node.id]).length} / {displaySystems.reduce((sum, topic) => sum + topic.nodes.length, 0)}</span></header>
          {!visibleNodes.length ? <div className="galaxy-empty" role="status"><Search size={28} aria-hidden="true" /><h3>没有匹配的知识点</h3><p>可切换左侧主题，或清空当前搜索与难度筛选。</p><button className="btn-outline" onClick={() => { setSearchQuery(''); setDifficulty(0); }}>重置筛选</button></div> : displaySystems.flatMap((listedSystem) => listedSystem.outline.map((chapter, chapterIdx) => {
            const nodes = visibleNodes.filter((node) => node.topicId === listedSystem.id && node.chapterIdx === chapterIdx);
            if (!nodes.length) return null;
            const key = `${listedSystem.id}-${chapterIdx}`;
            const collapsed = Boolean(collapsedChapters[key]);
            return <section className="galaxy-chapter" key={key}><button className="galaxy-chapter-heading" aria-expanded={!collapsed} aria-controls={`galaxy-chapter-${key}`} onClick={() => setCollapsedChapters((state) => ({ ...state, [key]: !state[key] }))}><strong>{topicId === 'all' ? `${listedSystem.title} · ` : ''}{chapter.chapter}</strong><span>{nodes.length} 个知识点<ChevronRight size={15} className={cn(!collapsed && 'is-expanded')} aria-hidden="true" /></span></button><div id={`galaxy-chapter-${key}`} hidden={collapsed}>{nodes.map((node) => {
              const selected = selectedNode?.id === node.id;
              return <div className="galaxy-point" key={node.id}><button className={cn('galaxy-node', selected && 'is-selected')} aria-label={`查看知识点：${node.label}`} aria-pressed={selected} data-nav-select onClick={() => selectNode(node)}><span className={cn('galaxy-node-index', mastered[node.id] && 'is-mastered')}>{mastered[node.id] ? <CheckCircle2 size={19} aria-hidden="true" /> : listedSystem.nodes.findIndex((point) => point.id === node.id) + 1}</span><span className="galaxy-node-label">{node.label}</span>{mastered[node.id] && <span className="galaxy-node-done">已掌握</span>}<ChevronRight size={16} aria-hidden="true" /></button></div>;
            })}</div></section>;
          }))}
        </section>}>
        <aside className="galaxy-detail-desktop" aria-label="知识点详情">{detail ?? <div className="galaxy-empty"><BookOpen size={28} aria-hidden="true" /><h3>选择知识点开始探索</h3><p>调整筛选条件后，点击知识点查看关联题目和学习入口。</p></div>}</aside>
      </AdaptiveNavigation>
    </div>
  );
}
