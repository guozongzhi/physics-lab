import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheoryStore } from '@/store/theoryStore';

import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import ProgressRing from '@/components/ui/ProgressRing';
import type { Question } from '@/types';
import { BookOpen, Swords, ChevronLeft, ChevronRight, Send, CheckCircle2, XCircle, AlertTriangle, Brain, RotateCcw, Trophy, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { theoryApi } from '@/lib/apiService';
import { apiEnabled } from '@/lib/apiClient';
import { bootstrapFromApi } from '@/lib/bootstrap';
import { cn } from '@/lib/utils';

export interface QuizPageProps {
  mode: 'quiz' | 'challenge';
  sessionId?: string;
  challengeId?: string;
}

const MODE_META = {
  quiz: {
    title: '智能检测',
    sub: 'AI 生成的知识点覆盖检测',
    icon: <BookOpen size={24} />,
    passScore: 80,
    gradient: 'from-mission-500 to-mission-600',
    chip: 'chip-mission',
  },
  challenge: {
    title: '挑战答题',
    sub: '小组之间的答题对决',
    icon: <Swords size={24} />,
    passScore: 60,
    gradient: 'from-energy-500 to-energy-600',
    chip: 'chip-energy',
  },
} as const;

function isAnswerCorrect(q: Question, userAnswer: Question['answer'] | undefined): boolean {
  if (q.type === 'multiple') {
    const correct = (q.answer as number[]).slice().sort().join(',');
    const user = Array.isArray(userAnswer) ? userAnswer.slice().sort().join(',') : '';
    return correct === user;
  }
  if (q.type === 'judge') return Boolean(userAnswer) === Boolean(q.answer);
  return Number(userAnswer) === Number(q.answer);
}

export default function QuizPage(props: QuizPageProps) {
  const { mode } = props;
  const routerParams = useParams<{ sessionId?: string; id?: string }>();
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const groupId = useAuthStore((s) => s.groupId);
  const getTopicById = (id: string) => useTheoryStore.getState().topics.find((t) => t.id === id);
  const getChallengeById = (id: string) => useTheoryStore.getState().challenges.find((c) => c.id === id);

  const sessionId = props.sessionId || routerParams.sessionId;
  const challengeId = props.challengeId || routerParams.id;

  const meta = MODE_META[mode];

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Question['answer']>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitted, setSubmitted] = useState<null | {
    score: number;
    correctCount: number;
    passed: boolean;
    blindPoints: string[];
    questionResults: { qid: string; correct: boolean; correctAns: Question['answer']; userAns: Question['answer'] | undefined }[];
    earnedCoins?: number;
  }>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('');
  const [reward, setReward] = useState(0);
  const [loadError, setLoadError] = useState('');
  /** 已初始化的会话 id。deps 里带上了 quizSessions（刷新后 bootstrap 才把会话拉回来，
   *  需要重跑一次），用这个 ref 保证每个会话只灌一次题目/答案，不被后续更新反复覆盖。 */
  const loadedSessionRef = useRef<string | null>(null);
  const quizSessions = useTheoryStore((s) => s.quizSessions);

  useEffect(() => {
    if (mode === 'quiz') {
      const session = sessionId
        ? useTheoryStore.getState().quizSessions.find((s) => s.id === sessionId)
        : undefined;
      if (session) {
        // 只灌一次：deps 里的 quizSessions 每答一题都会变，不加这个判断会把
        // 学生正在做的答案反复重置。
        if (loadedSessionRef.current !== session.id) {
          loadedSessionRef.current = session.id;
          setQuestions(session.questions);
          setAnswers(session.userAnswers || {});
          if (session.graded) {
            const results = session.questions.map((q) => ({
              qid: q.id,
              correct: isAnswerCorrect(q, session.userAnswers[q.id]),
              correctAns: q.answer,
              userAns: session.userAnswers[q.id],
            }));
            setSubmitted({
              score: session.score,
              correctCount: results.filter((r) => r.correct).length,
              passed: session.passed,
              blindPoints: session.blindPoints,
              questionResults: results,
            });
          } else {
            setSubmitted(null);
          }
          const topic = getTopicById(session.topicId);
          setTopicTitle(topic?.title || '未知主题');
        }
        setLoadError('');
        return;
      }
      // 找不到就明确报错。原先会退化成「取最后一条会话」或「抽全局前 10 题」，
      // 正是这两个兜底把坏掉的测验盖住了——学生考完才发现成绩没存上。
      setLoadError('测验不存在或已过期，请回学习中心重新开始。');
      return;
    }
    if (mode === 'challenge') {
      if (challengeId) {
        const challenge = getChallengeById(challengeId);
        if (challenge) {
          setChallengeTitle(challenge.title);
          setReward(challenge.reward);
          const topic = getTopicById(challenge.topicId);
          setTopicTitle(topic?.title || '');
          const qs = challenge.questionIds
            .map((qid) => useTheoryStore.getState().questions.find((q) => q.id === qid))
            .filter(Boolean) as Question[];
          if (qs.length > 0) {
            setQuestions(qs.slice(0, Math.min(10, qs.length)));
          } else {
            const pool = useTheoryStore.getState().questions.filter((q) => q.topicId === challenge.topicId);
            setQuestions(pool.slice(0, 10));
          }
        } else {
          const pool = useTheoryStore.getState().questions.slice(0, 10);
          setQuestions(pool);
          setChallengeTitle('示例挑战');
        }
      } else {
        const pool = useTheoryStore.getState().questions.slice(0, 10);
        setQuestions(pool);
        setChallengeTitle('示例挑战');
      }
    }
  }, [mode, sessionId, challengeId, quizSessions]);

  const answeredCount = Object.keys(answers).length;

  const handleAnswer = (qid: string, val: Question['answer']) => {
    setAnswers((prev) => ({ ...prev, [qid]: val }));
    if (mode === 'quiz' && sessionId) {
      useTheoryStore.getState().submitAnswer(sessionId, qid, val);
    }
  };

  const toggleMultiple = (qid: string, idx: number) => {
    const cur: number[] = Array.isArray(answers[qid]) ? [...answers[qid]] : [];
    const i = cur.indexOf(idx);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(idx);
    handleAnswer(qid, cur);
  };

  const submit = async () => {
    const unanswered = questions.filter((q) => answers[q.id] === undefined);
    if (unanswered.length > 0) {
      pushToast(`还有 ${unanswered.length} 道题未作答`, 'warning');
      return;
    }
    if (apiEnabled) {
      try {
        if (mode === 'quiz') {
          if (!sessionId) throw new Error('测验会话不存在');
          for (const q of questions) {
            await theoryApi.submitAnswer(sessionId, q.id, answers[q.id]);
          }
          const graded = await theoryApi.gradeQuiz(sessionId);
          const results = graded.questions.map((q) => ({
            qid: q.id,
            correct: isAnswerCorrect(q, answers[q.id]),
            correctAns: q.answer,
            userAns: answers[q.id],
          }));
          setSubmitted({
            score: graded.score,
            correctCount: results.filter((r) => r.correct).length,
            passed: graded.passed,
            blindPoints: graded.blindPoints,
            questionResults: results,
          });
          pushToast(`检测得分 ${graded.score} 分`, graded.passed ? 'success' : 'warning');
        } else {
          if (!challengeId || !groupId) throw new Error('挑战会话不存在');
          const result = await theoryApi.submitChallenge(challengeId, answers);
          const own = result.submissions.find((s) => s.groupId === groupId);
          if (!own) throw new Error('服务端未返回挑战结果');
          const accuracy = own.accuracy;
          setSubmitted({
            score: Math.round(accuracy * 100),
            correctCount: Math.round(accuracy * questions.length),
            passed: accuracy >= meta.passScore / 100,
            blindPoints: [],
            questionResults: [],
            earnedCoins: own.earned,
          });
          pushToast(`挑战完成，获得 ${own.earned} 能量币`, 'success');
        }
        await bootstrapFromApi(true).catch(() => {
          pushToast('成绩已保存，其他数据暂未刷新', 'warning');
        });
      } catch (err) {
        pushToast(err instanceof Error ? err.message : '交卷失败，请重试', 'error');
      }
      return;
    }
    let correct = 0;
    const blindSet = new Set<string>();
    const qResults: { qid: string; correct: boolean; correctAns: Question['answer']; userAns: Question['answer'] | undefined }[] = [];
    questions.forEach((q) => {
      const ok = isAnswerCorrect(q, answers[q.id]);
      if (ok) correct++;
      else blindSet.add(q.knowledgePoint);
      qResults.push({
        qid: q.id,
        correct: ok,
        correctAns: q.answer,
        userAns: answers[q.id],
      });
    });
    const total = questions.length || 1;
    const score = Math.round((correct / total) * 100);
    const passed = score >= meta.passScore;
    let earned: number | undefined;

    if (mode === 'quiz') {
      if (sessionId) {
        const graded = useTheoryStore.getState().gradeQuiz(sessionId);
        if (!graded) {
          pushToast('评分会话不存在，无法检测', 'error');
        } else {
          pushToast(
            passed
              ? `检测通过！得分 ${graded.score} 分`
              : `检测未通过，得分 ${graded.score} 分，请继续学习`,
            passed ? 'success' : 'warning'
          );
        }
      }
    } else {
      if (challengeId && groupId) {
        const res = useTheoryStore.getState().submitChallengeAnswers(
          challengeId, groupId, answers
        );
        earned = res.earned;
        pushToast(
          `挑战完成！正确率 ${Math.round(res.accuracy * 100)}%，获得 ${res.earned} 能量币`,
          res.accuracy >= 0.8 ? 'success' : 'info'
        );
      }
    }

    setSubmitted({
      score,
      correctCount: correct,
      passed,
      blindPoints: Array.from(blindSet),
      questionResults: qResults,
      earnedCoins: earned,
    });
  };

  const restart = async () => {
    if (mode === 'quiz' && sessionId) {
      const previous = useTheoryStore.getState().quizSessions.find((s) => s.id === sessionId);
      if (!previous) {
        pushToast('测验会话不存在，请回学习中心重新开始', 'error');
        return;
      }
      try {
        const next = await useTheoryStore.getState().startQuiz(previous.topicId, previous.userId);
        navigate(`/theory/quiz/${next.id}`);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : '无法开始新测验，请重试', 'error');
        return;
      }
    } else {
      navigate('/theory/challenges');
      return;
    }
    setAnswers({});
    setSubmitted(null);
    setCurrentQ(0);
  };

  if (questions.length === 0) {
    if (loadError) {
      return (
        <div className="container mx-auto py-16 text-center">
          <AlertTriangle size={48} className="mx-auto text-danger-400 mb-4" />
          <p className="text-ink-700 font-semibold mb-2">{loadError}</p>
          <button className="btn-outline mt-2" onClick={() => navigate('/theory/topics')}>
            返回学习中心
          </button>
        </div>
      );
    }
    return (
      <div className="container mx-auto py-16 text-center">
        <Brain size={48} className="mx-auto text-ink-400 mb-4" />
        <p className="text-ink-600">正在加载题目...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 max-w-7xl">
      <div className="card-base p-4 md:p-5 mb-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className={cn(
          'w-14 h-14 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shadow-lg',
          meta.gradient
        )}>
          {meta.icon}
        </div>
        <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="font-serif text-xl md:text-2xl font-bold text-ink-900">
                {mode === 'challenge' ? (challengeTitle || meta.title) : meta.title}
              </h1>
              <span className={cn('chip', meta.chip)}>{mode === 'quiz' ? '智能检测' : '小组挑战'}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-sm text-ink-600">
              <span className="flex items-center gap-1">
                <BookOpen size={14} />
                主题：{topicTitle || '—'}
              </span>
              <span className="flex items-center gap-1">
                <Brain size={14} />
                共 {questions.length} 题 · {meta.passScore} 分通过
              </span>
              {mode === 'challenge' && reward > 0 && (
                <span className="flex items-center gap-1 text-energy-600 font-semibold">
                  <Zap size={14} />
                  最高奖励 {reward} 能量币
                </span>
              )}
            </div>
          </div>
          {!submitted && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-ink-500 mb-0.5">已答题数</div>
                <div className="font-mono font-bold text-xl text-mission-700">
                  {answeredCount} <span className="text-sm text-ink-500 font-normal">/ {questions.length}</span>
                </div>
              </div>
            <ProgressRing value={(answeredCount / questions.length) * 100} size={56} strokeWidth={5} />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="quiz"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5"
          >
            <div className="card-base p-4 h-fit lg:sticky lg:top-4">
              <div className="text-xs text-ink-600 mb-3 flex items-center gap-1.5 font-medium">
              <Sparkles size={14} className="text-energy-500" />
              答题卡 · 点击题号跳转
            </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-5 gap-2">
                {questions.map((q, i) => {
                  const done = answers[q.id] !== undefined;
                  const cur = i === currentQ;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQ(i)}
                      className={cn(
                        'aspect-square rounded-xl text-sm font-bold transition',
                        cur
                          ? cn('text-white shadow-md ring-4 ring-mission-100 bg-gradient-to-br', meta.gradient)
                            : done
                              ? 'bg-growth-100 text-growth-700 ring-1 ring-growth-300 hover:bg-growth-200'
                              : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-mission-100 space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-growth-100 ring-1 ring-growth-300" />
                  <span className="text-ink-700">已答题 <strong className="text-growth-700">{answeredCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded bg-ink-100" />
                  <span className="text-ink-700">未答题 <strong className="text-ink-800">{questions.length - answeredCount}</strong></span>
                </div>
              </div>

              <button
                onClick={submit}
                className={cn(
                  'w-full mt-4 py-2.5 rounded-xl2 font-semibold text-sm flex items-center justify-center gap-2 transition',
                  cn('text-white shadow-md bg-gradient-to-r hover:brightness-110', meta.gradient)
                )}
              >
                <Send size={15} />
                交卷
              </button>
            </div>

            <div className="card-base p-6 md:p-8">
              {(() => {
                const q = questions[currentQ];
                const ua = answers[q.id];
                const qr = submitted?.questionResults.find((x) => x.qid === q.id);
                return (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'inline-flex items-center justify-center w-11 h-11 rounded-2xl text-white font-serif text-lg font-bold bg-gradient-to-br',
                          meta.gradient
                        )}>
                          {currentQ + 1}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <span className={cn(
                            'chip',
                            q.type === 'single' ? 'chip-mission' : q.type === 'multiple' ? 'chip-energy' : 'chip-growth'
                          )}>
                            {q.type === 'single' ? '单选题' : q.type === 'multiple' ? '多选题' : '判断题'}
                          </span>
                          <span className="chip chip-mission">
                            <Brain size={12} />
                            {q.knowledgePoint}
                          </span>
                          <span className="chip chip-ink">
                            难度 {'★'.repeat(q.difficulty)}{'☆'.repeat(3 - q.difficulty)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-ink-500">第 {currentQ + 1} / {questions.length} 题</span>
                    </div>

                    <div className="text-lg md:text-xl font-semibold text-ink-900 mb-7 leading-relaxed">
                      {q.stem}
                    </div>

                    <div className="space-y-3">
                      {q.options.map((opt, i) => {
                        let active = false;
                        if (q.type === 'multiple') active = Array.isArray(ua) && ua.includes(i);
                        else if (q.type === 'judge') active = Boolean(ua) === (i === 0);
                        else active = Number(ua) === i;

                        const letter = String.fromCharCode(65 + i);
                        let showCorrect = false;
                        let showWrong = false;
                        if (qr) {
                          if (q.type === 'multiple') {
                            const correctArr = q.answer as number[];
                            showCorrect = correctArr.includes(i);
                            showWrong = active && !correctArr.includes(i);
                          } else {
                            const correctIdx = q.type === 'judge' ? (q.answer ? 0 : 1) : (q.answer as number);
                            showCorrect = i === correctIdx;
                            showWrong = active && i !== correctIdx;
                          }
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => !submitted && (
                              q.type === 'multiple'
                                ? toggleMultiple(q.id, i)
                                : handleAnswer(q.id, q.type === 'judge' ? i === 0 : i)
                            )}
                            disabled={!!submitted}
                            className={cn(
                              'w-full text-left p-4 md:p-4.5 rounded-xl2 border transition flex items-start gap-3 group',
                              showCorrect
                                ? 'border-growth-400 bg-growth-50 ring-2 ring-growth-100'
                                : showWrong
                                  ? 'border-danger-400 bg-danger-50 ring-2 ring-danger-100'
                                  : active
                                    ? 'border-mission-400 bg-mission-50 ring-2 ring-mission-100'
                                    : 'border-ink-200 bg-white hover:bg-ink-50 hover:border-mission-200'
                            )}
                          >
                            <span
                              className={cn(
                              'flex-shrink-0 w-8 h-8 rounded-xl border-2 flex items-center justify-center font-bold text-sm mt-0.5',
                              showCorrect
                                ? 'bg-growth-500 border-growth-500 text-white'
                                : showWrong
                                  ? 'bg-danger-500 border-danger-500 text-white'
                                : active
                                  ? cn('text-white border-0 bg-gradient-to-br', meta.gradient)
                                  : 'border-ink-400 text-ink-700 group-hover:border-mission-400'
                            )}
                            >
                              {q.type === 'judge' ? (i === 0 ? '✓' : '✗') : letter}
                            </span>
                            <span className={cn(
                              'text-sm md:text-base flex-1 pt-1',
                              showCorrect
                                ? 'text-growth-800 font-semibold'
                                : showWrong
                                  ? 'text-danger-700 font-semibold line-through'
                                  : active
                                    ? 'text-mission-800 font-medium'
                                    : 'text-ink-800'
                            )}>
                              {opt}
                            </span>
                            {showCorrect && <CheckCircle2 size={20} className="text-growth-600 mt-1" />}
                            {showWrong && <XCircle size={20} className="text-danger-500 mt-1" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between mt-8 pt-5 border-t border-mission-100">
                      <button
                        onClick={() => setCurrentQ((v) => Math.max(0, v - 1))}
                        disabled={currentQ === 0}
                        className="btn-outline"
                      >
                        <ChevronLeft size={16} />
                        上一题
                      </button>
                      {currentQ < questions.length - 1 ? (
                        <button
                          onClick={() => setCurrentQ((v) => v + 1)}
                          className={cn(
                            'font-semibold text-white shadow-md bg-gradient-to-r hover:brightness-110 px-5 py-2.5 rounded-xl2 inline-flex items-center gap-2',
                            meta.gradient
                          )}
                        >
                          下一题
                          <ChevronRight size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={submit}
                          className={cn(
                            'font-semibold text-white shadow-md bg-gradient-to-r hover:brightness-110 px-5 py-2.5 rounded-xl2 inline-flex items-center gap-2',
                            meta.gradient
                          )}
                        >
                          <Send size={16} />
                          提交试卷
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="card-base p-8 md:p-12"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-8 mb-8 pb-8 border-b border-mission-100">
              <div className="relative mx-auto md:mx-0">
                {submitted.passed && (
                  <div className="absolute inset-0 rounded-full bg-growth-200 blur-2xl opacity-60 animate-pulse" />
                )}
                {!submitted.passed && (
                  <div className="absolute inset-0 rounded-full bg-danger-200 blur-2xl opacity-50" />
                )}
                <ProgressRing
                  value={submitted.score}
                  size={200}
                  strokeWidth={18}
                  trackColor={submitted.passed ? '#C2F1E6' : '#F9CAC7'}
                  indicatorColor={submitted.passed ? '#00BFA5' : '#E53935'}
                  showLabel={false}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={cn(
                    'font-mono font-black text-5xl',
                    submitted.passed ? 'text-growth-700' : 'text-danger-600'
                  )}>
                    {submitted.score}
                    <span className="text-xl font-semibold text-ink-500 ml-1">分</span>
                  </div>
                  <div className={cn(
                    'text-sm mt-1 font-semibold flex items-center gap-1.5',
                    submitted.passed ? 'text-growth-700' : 'text-danger-600'
                  )}>
                    {submitted.passed ? <Trophy size={16} /> : <AlertTriangle size={16} />}
                    {submitted.passed ? '通过！' : '未通过'}
                  </div>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <h2 className={cn(
                  'font-serif text-3xl md:text-4xl font-bold mb-3',
                  submitted.passed ? 'text-lab-700' : 'text-risk-700'
                )}>
                  {submitted.passed
                    ? mode === 'challenge' ? '挑战完成！' : '检测通过！'
                    : '继续加油！'}
                </h2>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-5">
                  <div className="chip chip-growth text-sm px-3 py-1.5">
                    <CheckCircle2 size={14} />
                    答对 {submitted.correctCount} / {questions.length}
                  </div>
                  <div className="chip chip-mission text-sm px-3 py-1.5">
                    正确率 <strong>{submitted.score}%</strong>
                  </div>
                  {submitted.earnedCoins !== undefined && (
                    <div className="chip chip-energy text-sm px-3 py-1.5">
                      <Zap size={14} />
                      获得 {submitted.earnedCoins} 能量币
                    </div>
                  )}
                </div>
                <p className="text-ink-700 leading-relaxed max-w-lg">
                  {submitted.passed
                    ? mode === 'quiz'
                      ? '你已掌握本主题大部分核心知识点，可以挑战更高阶的出题对决了！'
                      : '出色的表现！你已为本小组赢得了荣誉与能量币奖励。'
                    : '别灰心，我们整理了你的知识盲区，先去强化练习，再试一次会更好。'}
                </p>
              </div>
            </div>

            {submitted.blindPoints.length > 0 && (
              <div className="mb-8 p-5 rounded-xl2 bg-danger-50 ring-1 ring-danger-200">
                <h3 className="font-serif font-semibold text-danger-800 mb-3 flex items-center gap-2">
                  <Brain size={18} />
                  知识盲区（答错题目覆盖的知识点，建议优先强化）
                </h3>
                <div className="flex flex-wrap gap-2">
                  {submitted.blindPoints.map((bp) => (
                    <span key={bp} className="chip chip-danger">
                      <AlertTriangle size={12} />
                      {bp}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {!submitted.passed && (
                <button
                  onClick={() => {
                    restart();
                    navigate('/theory');
                  }}
                  className="btn-outline py-3.5"
                >
                  <BookOpen size={18} />
                  重新学习 + 强化练习
                </button>
              )}
              <button
                onClick={restart}
                className="btn-mission py-3.5 inline-flex items-center justify-center gap-2"
              >
                <RotateCcw size={18} />
                {submitted.passed ? '再练一次巩固' : '重新检测'}
              </button>
              {submitted.passed && mode === 'quiz' && (
                <button
                  onClick={() => navigate('/theory/challenges')}
                  className="md:col-span-2 btn-lab py-3.5"
                >
                  <Swords size={18} />
                  去出题挑战其他小组
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
