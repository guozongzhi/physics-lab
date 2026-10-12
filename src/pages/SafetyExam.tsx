import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectStore } from '@/store/projectStore';
import { useTheoryStore } from '@/store/theoryStore';
import { useSafetyStore } from '@/store/safetyStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import Checkbox from '@/components/ui/Checkbox';
import ProgressRing from '@/components/ui/ProgressRing';
import ReactMarkdown from 'react-markdown';
import { safetyNotices, sampleExamQuestions } from '@/data/safetyContent';
import type { Question, SafetyCategory } from '@/types';
import { Shield, AlertTriangle, CheckCircle, BookOpen, ClipboardCheck, Unlock, ChevronLeft, ChevronRight, Send, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { safetyApi, safetyAssignmentApi, SafetyAssignment } from '@/lib/apiService';
import { apiEnabled } from '@/lib/apiClient';
import { bootstrapFromApi } from '@/lib/bootstrap';

type ExamStep = 'notice' | 'quiz' | 'result';

const STEPS = [
  { key: 'notice', label: '安全须知', icon: <BookOpen size={16} /> },
  { key: 'quiz',   label: '在线考核', icon: <ClipboardCheck size={16} /> },
  { key: 'result', label: '考核结果', icon: <CheckCircle size={16} /> },
];

const CATEGORY_LABEL: Record<SafetyCategory, string> = {
  electric: '电气', thermal: '热学', optical: '光学',
  mechanical: '机械', radiation: '辐射', chemical: '化学', combined: '综合',
};

function isAnswerCorrect(q: Question, userAnswer: Question['answer'] | undefined): boolean {
  if (q.type === 'multiple') {
    const correct = (q.answer as number[]).slice().sort().join(',');
    const user = Array.isArray(userAnswer) ? userAnswer.slice().sort().join(',') : '';
    return correct === user;
  }
  if (q.type === 'judge') return Boolean(userAnswer) === Boolean(q.answer);
  return Number(userAnswer) === Number(q.answer);
}

/**
 * 考试倒计时（教师指派会带限时）。
 *
 * - 用**绝对截止时刻**而非每次累加，避免 setInterval 漂移
 * - onExpire 存在 ref 里：父组件重渲染不会重启计时器
 * - 到点只触发一次；seconds<=0 表示不计时
 */
function useExamTimer(seconds: number, active: boolean, onExpire: () => void): number {
  const [remaining, setRemaining] = useState(seconds);
  const fireRef = useRef(onExpire);
  fireRef.current = onExpire;
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active || seconds <= 0) return;
    doneRef.current = false;
    setRemaining(seconds);
    const deadlineMs = Date.now() + seconds * 1000;
    const t = setInterval(() => {
      const r = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0 && !doneRef.current) {
        doneRef.current = true;
        fireRef.current();
      }
    }, 250);
    return () => clearInterval(t);
  }, [active, seconds]);

  return remaining;
}

export default function SafetyExam() {
  const { id = '', category } = useParams<{ id: string; category: SafetyCategory }>();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.getProjectById(id));
  const updateStatus = useProjectStore((s) => s.updateStatus);
  const markSafetyPass = useProjectStore((s) => s.markSafetyPass);
  const theoryQuestions = useTheoryStore((s) => s.questions);
  const safetyQuestions = useSafetyStore((s) => s.questions);
  const userId = useAuthStore((s) => s.userId);
  const pushToast = useUIStore((s) => s.pushToast);

  const examCategory = category || project?.safetyCategory;

  const [step, setStep] = useState<ExamStep>('notice');
  const [agreed, setAgreed] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Question['answer']>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitted, setSubmitted] = useState<null | { score: number; passed: boolean }>(null);
  const [, setFrozenHintOpen] = useState(false);

  const notice = examCategory ? safetyNotices[examCategory] : null;

  // 该领域实际可出的题量。安全题现在来自后端（bootstrap 已把 safetyCategory 的题
  // 分流进 safetyStore），理论题里不会再有安全题——这里合并两边按 id 去重，避免将来
  // 分流策略变化时又算错。用于替换原先写死的"考核 10 题"。
  const availableCount = useMemo(() => {
    if (!examCategory) return 0;
    const ids = new Set<string>();
    for (const q of theoryQuestions) if (q.safetyCategory === examCategory) ids.add(q.id);
    for (const q of safetyQuestions) if (q.safetyCategory === examCategory) ids.add(q.id);
    return ids.size;
  }, [examCategory, theoryQuestions, safetyQuestions]);

  // 来自教师指派的考核参数（?assignment=xxx）。没有该参数就是自由练习，用默认值。
  const [searchParams] = useSearchParams();
  const assignmentParam = searchParams.get('assignment');
  const [assignment, setAssignment] = useState<SafetyAssignment | null>(null);
  const [assignmentError, setAssignmentError] = useState('');
  useEffect(() => {
    if (!assignmentParam) {
      setAssignment(null);
      setAssignmentError('');
      return;
    }
    let alive = true;
    safetyAssignmentApi
      .get(assignmentParam)
      .then((a) => { if (alive) { setAssignment(a); setAssignmentError(''); } })
      .catch(() => { if (alive) setAssignmentError('这条考核指派不存在，或你没有权限参加'); });
    return () => { alive = false; };
  }, [assignmentParam]);

  // 生效参数：有指派就按指派的，否则沿用自由练习的默认值
  const examCount = assignment?.questionCount ?? 10;
  const passScore = assignment?.passScore ?? 80;
  const timeBudgetSec = assignment ? Math.max(0, assignment.timeLimit * 60) : 0; // 0 = 不计时
  const isExpired = !!assignment?.deadline && new Date(assignment.deadline).getTime() < Date.now();

  // 限时倒计时：只在答题阶段走，手动交卷后（step 变 result）自动停。
  // 必须放在下面两个 early return 之前——Hook 不能出现在提前返回之后。
  const remainingSec = useExamTimer(timeBudgetSec, step === 'quiz' && !submitted, () => {
    pushToast('时间到，已自动交卷', 'warning');
    finalize(true);
  });
  const timerText = `${String(Math.floor(remainingSec / 60)).padStart(2, '0')}:${String(remainingSec % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (apiEnabled || step !== 'quiz' || questions.length > 0 || !examCategory) return;
    let pool = theoryQuestions.filter((q) => q.safetyCategory === examCategory);
    if (pool.length < 10) {
      // 教师维护的安全题库（含内置题与教师上传/修改的题目）
      const maintained = safetyQuestions.filter(
        (q) => q.safetyCategory === examCategory
      );
      pool = [...pool, ...maintained];
    }
    setQuestions(sampleExamQuestions(examCategory, pool, examCount));
  }, [step, questions.length, examCategory, theoryQuestions, safetyQuestions, examCount]);

  // 实际会出的题数：指派题数与该类别可出题量取小（题库不够时只能少出）
  const effectiveExamCount = assignment
    ? Math.min(examCount, availableCount || examCount)
    : availableCount;

  // 指派相关异常：不存在/无权，或已过截止时间 —— 明确报错，不静默退化成自由练习
  // （否则这次成绩挂不到指派上，学生以为考过了其实没记）
  if (assignmentParam && (assignmentError || isExpired)) {
    return (
      <div className="container mx-auto py-16 text-center">
        <AlertTriangle size={48} className="mx-auto text-danger-400 mb-4" />
        <h2 className="text-xl font-serif text-mission-800 mb-2">
          {assignmentError ? '考核指派出错' : '该考核已截止'}
        </h2>
        <p className="text-[13px] text-ink-500 mb-6">
          {assignmentError || '请联系老师重新布置，或去安全实验室自主练习。'}
        </p>
        <button className="btn-outline" onClick={() => navigate('/safety-lab')}>返回安全实验室</button>
      </div>
    );
  }

  if (!examCategory || !notice) {
    return (
      <div className="container mx-auto py-16 text-center">
        <AlertTriangle size={48} className="mx-auto text-danger-400 mb-4" />
        <h2 className="text-xl font-serif text-mission-800 mb-2">安全考核未找到</h2>
        <button className="btn-outline mt-4" onClick={() => navigate('/safety-lab')}>返回安全实验室</button>
      </div>
    );
  }

  const goQuiz = async () => {
    if (!agreed) {
      pushToast('请先勾选「我已阅读并理解上述所有内容」', 'warning');
      return;
    }
    if (assignmentParam && !assignment) {
      pushToast('正在加载考核指派，请稍后再试', 'warning');
      return;
    }
    if (apiEnabled && examCategory) {
      try {
        const exam = await safetyApi.startExam(examCategory, assignment?.id, project?.id);
        setAttemptId(exam.id);
        setQuestions(exam.questions);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : '安全考核启动失败', 'error');
        return;
      }
    }
    setStep('quiz');
  };

  const handleAnswer = (qid: string, val: Question['answer']) => {
    setAnswers((prev) => ({ ...prev, [qid]: val }));
  };

  const toggleMultiple = (qid: string, idx: number) => {
    const cur: number[] = Array.isArray(answers[qid]) ? [...answers[qid]] : [];
    const i = cur.indexOf(idx);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(idx);
    handleAnswer(qid, cur);
  };

  /** 交卷。auto=true 表示到点自动交卷——此时不拦"未答完"，直接按已答的判分 */
  async function finalize(auto: boolean) {
    if (questions.length === 0) return;
    if (!auto) {
      const unanswered = questions.filter((q) => answers[q.id] === undefined);
      if (unanswered.length > 0) {
        pushToast(`还有 ${unanswered.length} 道题未作答`, 'warning');
        return;
      }
    }
    if (apiEnabled) {
      if (!attemptId) {
        pushToast('考核会话不存在，请重新进入', 'error');
        return;
      }
      try {
        const result = await safetyApi.submitExam(attemptId, answers);
        setSubmitted({ score: result.score, passed: result.passed });
        setStep('result');
        await bootstrapFromApi(true).catch(() => {
          pushToast('考核结果已保存，项目数据暂未刷新', 'warning');
        });
        pushToast(result.passed ? `安全考核通过：${result.score} 分` : `安全考核未通过：${result.score} 分`, result.passed ? 'success' : 'warning');
        if (!result.passed) setFrozenHintOpen(true);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : '交卷失败，请重试', 'error');
      }
      return;
    }
    let correct = 0;
    questions.forEach((q) => {
      if (isAnswerCorrect(q, answers[q.id])) correct++;
    });
    const score = Math.round((correct / questions.length) * 100);
    // 及格线取指派的设置，自由练习时沿用默认 80
    const passed = score >= passScore;
    setSubmitted({ score, passed });
    setStep('result');
    if (passed) {
      if (project && userId) markSafetyPass(project.id, userId);
      pushToast(`恭喜通过安全考核！得分 ${score} 分`, 'success');
    } else {
      if (project) updateStatus(project.id, 'frozen');
      setFrozenHintOpen(true);
      pushToast(`未通过安全考核（${score} 分，及格线 ${passScore}）`, 'error');
    }
  }

  const submitExam = () => finalize(false);

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 max-w-5xl">
      <button onClick={() => navigate(project ? `/projects/${project.id}` : '/safety-lab')} className="btn-ghost mb-4 -ml-2 text-sm">
        <ChevronRight size={16} className="rotate-180" />
        {project ? '返回项目详情' : '返回安全实验室'}
      </button>

      <div className="card-base p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-xl2 bg-grad-mission text-white flex items-center justify-center shadow-md">
            <Shield size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif text-lg font-semibold text-mission-900 truncate">{project ? project.title : `${CATEGORY_LABEL[examCategory]}安全考核`}</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className="chip chip-mission">{CATEGORY_LABEL[examCategory]}安全</span>
              <span className="chip chip-ink">考核 {questions.length || effectiveExamCount} 题 · {passScore} 分通过</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl2 text-sm transition',
                  step === s.key
                    ? 'bg-grad-mission text-white shadow-md'
                      : STEPS.findIndex((x) => x.key === step) > i
                        ? 'bg-growth-50 text-growth-700 ring-1 ring-growth-200'
                      : 'bg-ink-50 text-ink-400'
                )}
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full border-current border text-[11px] font-bold">
                  {STEPS.findIndex((x) => x.key === step) > i ? <CheckCircle size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="font-medium">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={16} className="text-ink-300 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'notice' && (
          <motion.div
            key="notice"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="card-base overflow-hidden"
          >
            <div className="bg-gradient-to-r from-mission-500 to-mission-600 text-white px-6 py-4">
              <h3 className="font-serif text-xl font-bold flex items-center gap-2">
                <Shield size={22} />
                {notice.title}
              </h3>
              <p className="text-white/80 text-sm mt-1">请务必仔细阅读并理解以下所有内容</p>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto scroll-thin">
              <div className="prose-safety max-w-none">
                <ReactMarkdown>{notice.content}</ReactMarkdown>
              </div>
              <div className="mt-6 p-4 rounded-xl2 bg-growth-50 ring-1 ring-growth-200">
                <h4 className="font-serif font-semibold text-growth-800 mb-2.5 flex items-center gap-2">
                  <Unlock size={16} />
                  安全操作要点（记住这些关键规范）
                </h4>
                <div className="flex flex-wrap gap-2">
                  {notice.keyPoints.map((kp, i) => (
                    <span key={i} className="chip chip-lab text-[12px] px-3 py-1.5">
                      <span className="font-bold mr-1 opacity-70">{i + 1}.</span>
                      {kp}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-mission-50 bg-ink-50/60 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
              <Checkbox
                checked={agreed}
                onCheckedChange={setAgreed}
                label="我已阅读并理解上述所有安全须知内容，愿意严格遵守操作规程"
              />
              <button onClick={goQuiz} className="btn-primary min-w-[180px]">
                我已理解，开始考核
                <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'quiz' && questions.length > 0 && (
          <motion.div
            key="quiz"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5"
          >
            <div className="card-base p-4 h-fit sticky top-4">
              <div className="text-xs text-ink-500 mb-2 flex items-center justify-between">
                <span>答题卡</span>
                <span className="font-semibold text-mission-700">{answeredCount}/{questions.length}</span>
              </div>
              {/* 限时来自教师指派；自由练习不限时，不显示 */}
              {timeBudgetSec > 0 && (
                <div
                  className={cn(
                    'mb-3 flex items-center justify-center gap-1.5 py-2 rounded-xl font-mono font-black tabular-nums text-[15px]',
                    remainingSec <= 60 ? 'bg-danger-50 text-danger-700 animate-pulse' : 'bg-mission-50 text-mission-700'
                  )}
                >
                  <Clock size={14} />
                  剩余 {timerText}
                </div>
              )}
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, i) => {
                  const done = answers[q.id] !== undefined;
                  const cur = i === currentQ;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQ(i)}
                      className={cn(
                        'aspect-square rounded-lg text-sm font-bold transition',
                        cur
                          ? 'bg-grad-mission text-white shadow-md ring-2 ring-mission-200'
                            : done
                              ? 'bg-growth-100 text-growth-700 ring-1 ring-growth-300'
                            : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 h-2 rounded-full bg-ink-100 overflow-hidden">
                <div
                  className="h-full bg-grad-growth transition-all"
                  style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                />
              </div>
              <button
                onClick={submitExam}
                className="btn-energy w-full mt-4"
              >
                <Send size={16} />
                提交试卷
              </button>
            </div>

            <div className="card-base p-6">
              {(() => {
                const q = questions[currentQ];
                const ua = answers[q.id];
                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl2 bg-grad-mission text-white font-serif font-bold">
                          {currentQ + 1}
                        </span>
                        <span className={cn(
                          'chip',
                          q.type === 'single' ? 'chip-mission' : q.type === 'multiple' ? 'chip-energy' : 'chip-growth'
                        )}>
                          {q.type === 'single' ? '单选题' : q.type === 'multiple' ? '多选题' : '判断题'}
                        </span>
                        <span className="chip chip-ink">知识点：{q.knowledgePoint}</span>
                      </div>
                      <span className="text-sm text-ink-500 flex items-center gap-1">
                        <Clock size={14} />
                        共 {questions.length} 题
                      </span>
                    </div>
                    <div className="text-lg font-medium text-mission-900 mb-6 leading-relaxed">
                      {q.stem}
                    </div>
                    <div className="space-y-2.5">
                      {q.options.map((opt, i) => {
                        let active = false;
                        if (q.type === 'multiple') active = Array.isArray(ua) && ua.includes(i);
                        else if (q.type === 'judge') active = Boolean(ua) === (i === 0);
                        else active = Number(ua) === i;
                        const letter = String.fromCharCode(65 + i);
                        return (
                          <button
                            key={i}
                            onClick={() =>
                              q.type === 'multiple'
                                ? toggleMultiple(q.id, i)
                                : handleAnswer(q.id, q.type === 'judge' ? i === 0 : i)
                            }
                            className={cn(
                              'w-full text-left p-4 rounded-xl2 border transition flex items-start gap-3',
                              active
                                ? 'border-mission-400 bg-mission-50 ring-2 ring-mission-100'
                                : 'border-mission-100 bg-white hover:bg-ink-50 hover:border-mission-200'
                            )}
                          >
                            <span
                              className={cn(
                                'flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-sm',
                                active
                                  ? 'bg-mission-500 border-mission-500 text-white'
                                  : 'border-ink-300 text-ink-500'
                              )}
                            >
                              {q.type === 'judge' ? (i === 0 ? '✓' : '✗') : letter}
                            </span>
                            <span className={cn('text-sm flex-1 pt-0.5', active ? 'text-mission-800 font-medium' : 'text-ink-700')}>
                              {opt}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between mt-8 pt-4 border-t border-mission-50">
                      <button
                        onClick={() => setCurrentQ((v) => Math.max(0, v - 1))}
                        disabled={currentQ === 0}
                        className="btn-outline"
                      >
                        <ChevronLeft size={16} />
                        上一题
                      </button>
                      {currentQ < questions.length - 1 ? (
                        <button onClick={() => setCurrentQ((v) => v + 1)} className="btn-primary">
                          下一题
                          <ChevronRight size={16} />
                        </button>
                      ) : (
                        <button onClick={submitExam} className="btn-energy">
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
        )}

        {step === 'result' && submitted && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="card-base p-8 md:p-10 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
              className="mx-auto mb-6"
            >
              {submitted.passed ? (
                <div className="relative inline-block">
                  <div className="absolute inset-0 rounded-full bg-growth-200 blur-2xl opacity-60 animate-pulse" />
                  <ProgressRing
                    value={submitted.score}
                    size={180}
                    strokeWidth={14}
                    trackColor="#C2F1E6"
                    indicatorColor="#00BFA5"
                    showLabel={false}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', delay: 0.4 }}
                      className="w-24 h-24 rounded-full bg-grad-growth text-white flex items-center justify-center shadow-lg"
                    >
                      <CheckCircle size={56} strokeWidth={3} />
                    </motion.div>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block">
                  <div className="absolute inset-0 rounded-full bg-danger-200 blur-2xl opacity-60" />
                  <ProgressRing
                    value={submitted.score}
                    size={180}
                    strokeWidth={14}
                    trackColor="#F9CAC7"
                    indicatorColor="#E53935"
                    showLabel={false}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', delay: 0.4 }}
                      className="w-24 h-24 rounded-full bg-grad-danger text-white flex items-center justify-center shadow-lg"
                    >
                      <AlertTriangle size={52} strokeWidth={2.5} />
                    </motion.div>
                  </div>
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <h2 className={cn(
                'font-serif text-3xl font-bold mb-2',
                submitted.passed ? 'text-growth-700' : 'text-danger-700'
              )}>
                {submitted.passed ? '安全考核通过！' : '考核未通过'}
              </h2>
              <p className="text-ink-600 mb-4">
                本次得分 <span className="font-mono font-bold text-2xl mx-1 text-mission-800">{submitted.score}</span> 分
                <span className="text-ink-400 mx-1">（</span>
                {passScore} 分通过
                <span className="text-ink-400 mx-1">）</span>
              </p>

              {submitted.passed ? (
                <div className="max-w-md mx-auto mb-6 p-5 rounded-xl2 bg-growth-50 ring-1 ring-growth-200 text-left space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-growth-800">
                    <Unlock size={18} />
                    已解锁实验权限
                  </div>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    你已通过【{CATEGORY_LABEL[examCategory]}安全】考核，可以进入相关实验阶段。
                    请在实验中继续严格遵守安全操作规程，确保人身与设备安全。
                  </p>
                </div>
              ) : (
                <div className="max-w-md mx-auto mb-6 p-5 rounded-xl2 bg-danger-50 ring-1 ring-danger-200 text-left space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-danger-800">
                    <Clock size={18} />
                    {project ? '项目已进入冻结状态' : '未达到及格线'}
                  </div>
                  <p className="text-sm text-ink-600 leading-relaxed">
                    {project
                      ? '根据平台规则，安全考核未通过将自动冻结项目，防止未受训人员进入危险实验环节。请在 30 分钟后重新发起考核。'
                      : '请复习该领域的安全要点后重新考核，达到及格线即可通过。'}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => navigate(project ? `/projects/${project.id}` : '/safety-lab')}
                  className={submitted.passed ? 'btn-primary' : 'btn-outline'}
                >
                  {project ? '返回项目详情' : '返回安全实验室'}
                </button>
                {!submitted.passed && (
                  <button
                    onClick={() => {
                      setAnswers({});
                      setSubmitted(null);
                      setCurrentQ(0);
                      setAgreed(false);
                      setStep('notice');
                    }}
                    disabled={!!project}
                    className={project ? 'btn-ghost cursor-not-allowed opacity-70' : 'btn-outline'}
                  >
                    <Clock size={15} />
                    {project ? '30 分钟后可重新考核' : '立即重新考核'}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
