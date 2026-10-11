import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheoryStore } from '@/store/theoryStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useLearningProgressStore } from '@/store/learningProgressStore';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Search,
  Filter,
  Star,
  BookOpen,
  Zap,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  PlayCircle,
  Lock,
} from 'lucide-react';
import { mockTopics } from '@/data/mockTopics';
import { cn } from '@/lib/utils';

interface GalaxyNode {
  id: string;
  label: string;
  topicId: string;
  chapterIdx: number;
  pointIdx: number;
  cx: number;
  cy: number;
  mastered: boolean;
  questionCount: number;
  difficulty: number;
  dependsOn: string[];
}

interface GalaxySystem {
  id: string;
  topicId: string;
  title: string;
  cx: number;
  cy: number;
  radius: number;
  nodes: GalaxyNode[];
}

const SUBJECTS = ['全部学科', ...mockTopics.map((topic) => topic.title)];
const DIFFICULTIES = ['全部难度', '入门 ⭐', '进阶 ⭐⭐', '挑战 ⭐⭐⭐'];

function buildGalaxySystems(): GalaxySystem[] {
  const systems: GalaxySystem[] = [];
  const gridPositions = [
    { cx: 180, cy: 180 }, { cx: 500, cy: 180 }, { cx: 820, cy: 180 },
    { cx: 180, cy: 480 }, { cx: 500, cy: 480 }, { cx: 820, cy: 480 },
    { cx: 180, cy: 780 }, { cx: 500, cy: 780 }, { cx: 820, cy: 780 },
  ];

  mockTopics.forEach((topic, sIdx) => {
    if (sIdx >= 9) return;
    const pos = gridPositions[sIdx];
    const nodes: GalaxyNode[] = [];
    let nodeIdx = 0;

    topic.outline.forEach((chapter, cIdx) => {
      chapter.points.forEach((point, pIdx) => {
        const angle = (nodeIdx / 12) * Math.PI * 2;
        const r = 70 + (cIdx * 15);
        const nx = pos.cx + Math.cos(angle) * r;
        const ny = pos.cy + Math.sin(angle) * r;
        nodes.push({
          id: `${topic.id}-${cIdx}-${pIdx}`,
          label: point,
          topicId: topic.id,
          chapterIdx: cIdx,
          pointIdx: pIdx,
          cx: nx,
          cy: ny,
          mastered: false,
          questionCount: 0,
          difficulty: cIdx + 1,
          dependsOn: nodes.length ? [nodes[nodes.length - 1].id] : [],
        });
        nodeIdx++;
      });
    });

    systems.push({
      id: `system-${sIdx}`,
      topicId: topic.id,
      title: topic.title,
      cx: pos.cx,
      cy: pos.cy,
      radius: 110,
      nodes: nodes.slice(0, 12),
    });
  });

  return systems;
}

const GALAXY_SYSTEMS = buildGalaxySystems();

export default function KnowledgeGalaxy() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const userId = useAuthStore((state) => state.userId);
  const { questions, startQuiz } = useTheoryStore();
  const { masteredNodes, toggleMastered } = useLearningProgressStore();
  const pushToast = useUIStore((state) => state.pushToast);
  const navigate = useNavigate();
  const [startingQuiz, setStartingQuiz] = useState(false);
  const relatedQuestions = (node: GalaxyNode) => questions.filter((question) => question.topicId === node.topicId && question.knowledgePoint && (node.label.includes(question.knowledgePoint) || question.knowledgePoint.includes(node.label)));
  const systems = GALAXY_SYSTEMS.map((system) => ({ ...system, nodes: system.nodes.map((node) => ({ ...node, mastered: Boolean(userId && masteredNodes[userId]?.[node.id]), questionCount: relatedQuestions(node).length })) }));
  const allNodes = systems.flatMap((system) => system.nodes);
  const selectedNode = allNodes.find((node) => node.id === selectedId) ?? null;
  const selectedQuestions = selectedNode ? relatedQuestions(selectedNode) : [];
  const handlePractice = async () => {
    if (!selectedNode || startingQuiz) return;
    setStartingQuiz(true);
    try {
      const session = await startQuiz(selectedNode.topicId, userId);
      navigate(`/theory/quiz/${session.id}`);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '无法开始练习', 'error');
      setStartingQuiz(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('全部学科');
  const [difficultyFilter, setDifficultyFilter] = useState('全部难度');
  const [hoveredNode, setHoveredNode] = useState<GalaxyNode | null>(null);

  const difficulty = DIFFICULTIES.indexOf(difficultyFilter);
  const filteredSystems = systems.map((system) => ({ ...system, nodes: system.nodes.filter((node) => (!difficulty || node.difficulty === difficulty) && (!searchQuery || system.title.toLowerCase().includes(searchQuery.toLowerCase()) || node.label.toLowerCase().includes(searchQuery.toLowerCase()))) })).filter((s) => {
    if (!s.nodes.length) return false;
    if (subjectFilter !== '全部学科' && s.title !== subjectFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.nodes.some((n) => n.label.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const masteredCount = allNodes.filter((n) => n.mastered).length;
  const totalCount = allNodes.length;

  return (
    <div className="w-full space-y-6">
      <section className="glass-card glass-card-hover p-8 rounded-[20px] relative overflow-hidden">
        <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-gradient-to-br from-nova-300/25 via-mission-300/15 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-10 w-80 h-80 rounded-full bg-gradient-to-br from-growth-300/20 via-mission-300/10 to-transparent blur-3xl pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <div className="mission-label mb-4">
              <Sparkles size={12} />
              EXPAND YOUR UNIVERSE
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-3">
              <span className="text-gradient-nova">知识星河</span>
              <span className="text-ink-800"> · 每一个知识点都是一颗星</span>
            </h1>
            <p className="text-lg text-ink-600 font-medium leading-relaxed">
              漫游 {systems.length} 大知识星系，自评点亮 {masteredCount}/{totalCount} 颗知识星。
              沿着贝塞尔曲线路径，追溯知识的起源与关联。
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <div className="glass-card !py-2.5 !px-4 rounded-xl flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-growth-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-sm font-bold text-ink-700">自评已掌握 {masteredCount}</span>
              </div>
              <div className="glass-card !py-2.5 !px-4 rounded-xl flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-mission-500 shadow-[0_0_8px_rgba(79,124,255,0.6)]" />
                <span className="text-sm font-bold text-ink-700">学习中 {totalCount - masteredCount}</span>
              </div>
              <div className="glass-card !py-2.5 !px-4 rounded-xl flex items-center gap-2">
                <Star size={14} className="text-nova-500 fill-nova-400" />
                <span className="text-sm font-bold text-ink-700">{systems.length} 大星系</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400">
                <Search size={18} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索知识点、章节、物理概念..."
                className="input-field !pl-12 !py-4 !text-base !rounded-2xl"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-mission-500" />
                <span className="text-xs font-bold text-ink-500 uppercase tracking-wide">学科</span>
                <div className="flex flex-wrap gap-1.5">
                  {SUBJECTS.map((s) => (
                    <button
                      key={s}
                      aria-pressed={subjectFilter === s}
                      onClick={() => setSubjectFilter(s)}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                        subjectFilter === s
                          ? 'bg-gradient-to-r from-mission-500 to-nova-500 text-white shadow-glowMission'
                          : 'glass-card text-ink-600 hover:text-mission-600'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs font-bold text-ink-500 uppercase tracking-wide">难度</span>
                <select
                  aria-label="知识点难度"
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                  className="glass-card !py-1.5 !px-3 rounded-xl text-xs font-bold text-ink-600 border-0 outline-none cursor-pointer"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-9 glass-card p-6 rounded-[20px] relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-fine opacity-40 pointer-events-none" />
          <div className="relative">
            {!filteredSystems.length && <p className="text-center text-ink-500 py-6" role="status">没有匹配的知识点，请调整搜索或筛选条件。</p>}
            <svg aria-label="知识点地图" viewBox="0 0 1000 960" className="w-full h-auto">
              <defs>
                <radialGradient id="systemGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4F7CFF" stopOpacity="0.18" />
                  <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#4F7CFF" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="pathDash" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4F7CFF" stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="0.5" />
                </linearGradient>
                <filter id="starGlowMastered" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="starGlowActive" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {filteredSystems.map((system) => (
                <g key={system.id}>
                  <circle
                    cx={system.cx}
                    cy={system.cy}
                    r={system.radius + 20}
                    fill="url(#systemGlow)"
                    className="animate-pulse"
                    style={{ animationDuration: '4s' }}
                  />
                  <circle
                    cx={system.cx}
                    cy={system.cy}
                    r={system.radius}
                    fill="none"
                    stroke="rgba(79,124,255,0.12)"
                    strokeWidth="1.5"
                    strokeDasharray="4 8"
                  />
                  <circle
                    cx={system.cx}
                    cy={system.cy}
                    r={system.radius - 25}
                    fill="none"
                    stroke="rgba(139,92,246,0.1)"
                    strokeWidth="1"
                    strokeDasharray="2 6"
                  />
                  <foreignObject
                    x={system.cx - 60}
                    y={system.cy - 14}
                    width="120"
                    height="28"
                  >
                    <div className="flex items-center justify-center">
                      <span className="chip-mission !py-1 !text-[11px] !font-bold whitespace-nowrap">
                        {system.title}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              ))}

              {filteredSystems.flatMap((system) =>
                system.nodes.flatMap((node) =>
                  node.dependsOn.map((depId) => {
                    const depNode = allNodes.find((n) => n.id === depId);
                    if (!depNode) return null;
                    const midX = (node.cx + depNode.cx) / 2;
                    const midY = (node.cy + depNode.cy) / 2 - 30;
                    return (
                      <path
                        key={`${node.id}-${depId}`}
                        d={`M ${depNode.cx} ${depNode.cy} Q ${midX} ${midY} ${node.cx} ${node.cy}`}
                        fill="none"
                        stroke="url(#pathDash)"
                        strokeWidth="1.5"
                        strokeDasharray="6 6"
                        className="animate-flowDash"
                        opacity={node.mastered && depNode.mastered ? 0.8 : 0.35}
                      />
                    );
                  })
                )
              )}

              {filteredSystems.flatMap((system) =>
                system.nodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  const isHovered = hoveredNode?.id === node.id;
                  const showLabel = isHovered || isSelected;
                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={`查看知识点：${node.label}`}
                      aria-pressed={selectedId === node.id}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id); } }}
                      onClick={() => setSelectedId(node.id)}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <circle
                        cx={node.cx}
                        cy={node.cy}
                        r={isSelected || isHovered ? 18 : 13}
                        fill={node.mastered ? 'rgba(34,197,94,0.18)' : 'rgba(79,124,255,0.12)'}
                        filter={node.mastered ? 'url(#starGlowMastered)' : 'url(#starGlowActive)'}
                        style={{ transition: 'all 0.3s ease' }}
                      />
                      <circle
                        cx={node.cx}
                        cy={node.cy}
                        r={isSelected || isHovered ? 11 : 8}
                        fill={node.mastered ? 'url(#gradStarG)' : 'url(#gradStarM)'}
                        style={{ transition: 'all 0.3s ease' }}
                      />
                      <defs>
                        <linearGradient id="gradStarG" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6CE9A6" />
                          <stop offset="100%" stopColor="#22C55E" />
                        </linearGradient>
                        <linearGradient id="gradStarM" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#8FAEFF" />
                          <stop offset="100%" stopColor="#4F7CFF" />
                        </linearGradient>
                      </defs>
                      {showLabel && (
                        <foreignObject
                          x={node.cx - 90}
                          y={node.cy - 52}
                          width="180"
                          height="44"
                        >
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-card !p-2 !rounded-xl text-center shadow-glowMission"
                          >
                            <div className="text-[11px] font-bold text-ink-800 truncate leading-tight">
                              {node.label}
                            </div>
                            <div className="text-[10px] text-ink-500 mt-0.5">
                              {node.questionCount} 道关联题
                            </div>
                          </motion.div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })
              )}
            </svg>
          </div>
        </section>

        <aside className="lg:col-span-3 space-y-4">
          {selectedNode ? (
            <motion.div
              key={selectedNode.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <button
                onClick={() => setSelectedId(null)}
                className="btn-ghost text-sm"
              >
                <ArrowLeft size={14} /> 返回星河
              </button>

              <div className="glass-card p-5 rounded-2xl relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gradient-to-br from-nova-300/30 to-mission-300/20 blur-2xl" />
                <div className="relative">
                  <div className="flex items-start gap-3 mb-4">
                    <div className={cn(
                      'node-badge',
                      selectedNode.mastered ? 'done' : 'active'
                    )}>
                      {selectedNode.mastered ? <CheckCircle2 size={22} /> : <Star size={22} className="fill-white/20" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="chip-nova !py-0.5 !text-[10px] mb-1">知识点详情</div>
                      <h3 className="font-black text-lg text-ink-800 leading-snug">
                        {selectedNode.label}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-2 mb-5">
                    {(() => {
                      const system = GALAXY_SYSTEMS.find((s) => s.topicId === selectedNode.topicId);
                      const topic = mockTopics.find((t) => t.id === selectedNode.topicId);
                      const chapter = topic?.outline[selectedNode.chapterIdx];
                      return (
                        <>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-mission-50/40">
                            <span className="text-sm text-ink-500 font-medium">所属章节</span>
                            <span className="text-sm font-bold text-mission-700">{chapter?.chapter}</span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-nova-50/40">
                            <span className="text-sm text-ink-500 font-medium">学科星系</span>
                            <span className="chip-nova !py-0.5 !text-[11px]">{system?.title}</span>
                          </div>
                          <div className="flex items-center justify-between p-2.5 rounded-xl bg-growth-50/40">
                            <span className="text-sm text-ink-500 font-medium">掌握状态</span>
                            <span className={cn(
                              'text-sm font-bold',
                              selectedNode.mastered ? 'text-growth-700' : 'text-alert-700'
                            )}>
                              {selectedNode.mastered ? '✓ 自评已掌握' : '○ 学习中'}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-ink-700 flex items-center gap-1.5">
                        <BookOpen size={14} className="text-mission-500" />
                        关联典型题 ({selectedNode.questionCount})
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 mb-5">
                    {selectedQuestions.slice(0, 3).map((question, index) => (
                      <div key={question.id} className="p-3.5 rounded-xl bg-white/70 border border-mission-100">
                        <span className="chip-mission !py-0.5 !text-[10px]">Q{index + 1} · 难度 {question.difficulty}</span>
                        <p className="text-xs text-ink-600 leading-relaxed mt-2">{question.stem}</p>
                      </div>
                    ))}
                    {!selectedQuestions.length && <p className="text-sm text-ink-500">该知识点暂无精确关联题，可进行所属主题的综合练习。</p>}
                  </div>

                  <button className="btn-outline w-full mb-3" disabled={!userId} onClick={() => userId && toggleMastered(userId, selectedNode.id)}>
                    <CheckCircle2 size={16} />{selectedNode.mastered ? '取消自评掌握' : '标记自评已掌握'}
                  </button>
                  <p className="text-xs text-ink-500 mb-3">自评标记仅保存在本设备，不计入测验成绩。</p>
                  <button className="btn-primary w-full !py-3" onClick={handlePractice} disabled={startingQuiz}>
                    <Zap size={16} />
                    {startingQuiz ? '正在创建练习…' : '所属主题 · 综合练习'}
                  </button>
                </div>
              </div>

              <div className="glass-card p-5 rounded-2xl">
                <div className="chip-alert !py-0.5 mb-3">
                  <Lock size={10} /> 推荐前置知识
                </div>
                <div className="space-y-2">
                  {selectedNode.dependsOn.length > 0 ? (
                    selectedNode.dependsOn.map((depId) => {
                      const dep = allNodes.find((n) => n.id === depId);
                      if (!dep) return null;
                      return (
                        <button
                          key={depId}
                          onClick={() => setSelectedId(dep.id)}
                          className="w-full p-3 rounded-xl bg-ink-50/60 hover:bg-mission-50/40 flex items-center gap-2.5 transition-colors group"
                        >
                          <div className={cn(
                            'node-badge !w-7 !h-7 !text-[10px]',
                            dep.mastered ? 'done' : 'pending'
                          )}>
                            <ChevronRight size={12} />
                          </div>
                          <span className="text-sm font-medium text-ink-700 group-hover:text-mission-700 truncate text-left">
                            {dep.label}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-ink-400 text-sm">
                      <Star size={20} className="mx-auto mb-1 opacity-50" />
                      本节点是入门概念
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="glass-card p-6 rounded-2xl text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-nova-100 via-mission-50 to-growth-100 flex items-center justify-center">
                <Sparkles size={32} className="text-nova-500 animate-floatSlow" />
              </div>
              <h3 className="font-black text-lg text-ink-800 mb-2">选择一颗知识星</h3>
              <p className="text-sm text-ink-500 leading-relaxed mb-4">
                点击左侧星海中任意发光节点，查看知识点详情、关联题目与知识图谱路径
              </p>
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-growth-50/50">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-growth-400 to-growth-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                  <span className="text-xs font-bold text-growth-700">绿色发光 = 自评已掌握</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-mission-50/50">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-mission-400 to-mission-500 shadow-[0_0_6px_rgba(79,124,255,0.5)]" />
                  <span className="text-xs font-bold text-mission-700">蓝色发光 = 学习中</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-nova-50/50">
                  <PlayCircle size={16} className="text-nova-500" />
                  <span className="text-xs font-bold text-nova-700">虚线路径 = 知识依赖</span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
