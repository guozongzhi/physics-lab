/**
 * 安全题库维护 —— 教师/管理员视图
 *
 * 功能：
 *  - 按安全类别浏览内置 + 教师自定义题目
 *  - 新增 / 编辑 / 删除题目（单选、多选、判断）
 *  - 批量导入题库（JSON 文件上传或粘贴文本，支持合并/替换两种模式）
 *  - 导出当前题库 JSON
 *  - 一键恢复内置默认题库
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Plus,
  Upload,
  Download,
  RotateCcw,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import { useSafetyStore, normalizeQuestions } from '@/store/safetyStore';
import { useUIStore } from '@/store/uiStore';
import {
  safetyAssignmentApi,
  classesApi,
  groupsApi,
  SafetyAssignment,
} from '@/lib/apiService';
import type { SchoolClass, Group } from '@/types';
import type { Question, SafetyCategory } from '@/types';
import { categoryNameMap } from '@/data/safetyContent';
import { cn } from '@/lib/utils';

const CATEGORIES = Object.keys(categoryNameMap) as SafetyCategory[];
const DIFF_LABEL = ['', '简单', '中等', '困难'];
const DIFF_CHIP = ['', 'chip-growth', 'chip-energy', 'chip-danger'];
const TYPE_LABEL: Record<Question['type'], string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
};

interface EditorState {
  id?: string;
  cat: SafetyCategory;
  type: Question['type'];
  difficulty: 1 | 2 | 3;
  stem: string;
  kp: string;
  options: string[];
  answer: number | number[] | boolean;
}

const blankEditor = (cat: SafetyCategory = 'electric'): EditorState => ({
  cat,
  type: 'single',
  difficulty: 1,
  stem: '',
  kp: '',
  options: ['', '', '', ''],
  answer: 0,
});

/** 考核任务指派表单 */
interface AssignEditor {
  title: string;
  cat: SafetyCategory;
  questionCount: number;
  timeLimit: number;
  passScore: number;
  deadline: string; // datetime-local 的值；空串 = 不限截止
  targetKind: 'class' | 'group';
  targetId: string;
}

const blankAssign = (cat: SafetyCategory = 'electric'): AssignEditor => ({
  title: '',
  cat,
  questionCount: 10,
  timeLimit: 15,
  passScore: 80,
  deadline: '',
  targetKind: 'class',
  targetId: '',
});

export default function TeacherSafety() {
  const pushToast = useUIStore((s) => s.pushToast);
  const questions = useSafetyStore((s) => s.questions);
  const addQuestion = useSafetyStore((s) => s.addQuestion);
  const updateQuestion = useSafetyStore((s) => s.updateQuestion);
  const deleteQuestion = useSafetyStore((s) => s.deleteQuestion);
  const importQuestions = useSafetyStore((s) => s.importQuestions);
  const resetToDefault = useSafetyStore((s) => s.resetToDefault);

  const [filterCat, setFilterCat] = useState<SafetyCategory | 'all'>('all');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorErr, setEditorErr] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importErr, setImportErr] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  // ---- 考核任务指派 ----
  const [assignments, setAssignments] = useState<SafetyAssignment[]>([]);
  const [assignEditor, setAssignEditor] = useState<AssignEditor | null>(null);
  const [assignErr, setAssignErr] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  const [deleteAssignTarget, setDeleteAssignTarget] = useState<SafetyAssignment | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const reloadAssignments = () => {
    safetyAssignmentApi.list().then(setAssignments).catch(() => {});
  };
  useEffect(() => {
    reloadAssignments();
    classesApi.list().then(setClasses).catch(() => {});
    groupsApi.list().then(setGroups).catch(() => {});
  }, []);

  const catQuestionCount = (cat: SafetyCategory) =>
    questions.filter((q) => q.safetyCategory === cat).length;

  const saveAssign = async () => {
    if (!assignEditor) return;
    const title = assignEditor.title.trim();
    if (!title) return setAssignErr('请填写考核名称');
    if (!assignEditor.targetId) {
      return setAssignErr(assignEditor.targetKind === 'class' ? '请选择班级' : '请选择小组');
    }
    const avail = catQuestionCount(assignEditor.cat);
    if (assignEditor.questionCount > avail) {
      return setAssignErr(`该类别目前只有 ${avail} 道题，题数不能超过它`);
    }
    setSavingAssign(true);
    try {
      await safetyAssignmentApi.create({
        title,
        category: assignEditor.cat,
        questionCount: assignEditor.questionCount,
        timeLimit: assignEditor.timeLimit,
        passScore: assignEditor.passScore,
        deadline: assignEditor.deadline ? new Date(assignEditor.deadline).toISOString() : null,
        classId: assignEditor.targetKind === 'class' ? assignEditor.targetId : null,
        groupId: assignEditor.targetKind === 'group' ? assignEditor.targetId : null,
      });
      reloadAssignments();
      setAssignEditor(null);
      setAssignErr('');
      pushToast(`已指派「${title}」`, 'success');
    } catch (err) {
      setAssignErr(err instanceof Error ? err.message : '指派失败');
    } finally {
      setSavingAssign(false);
    }
  };

  const doDeleteAssign = async () => {
    if (!deleteAssignTarget) return;
    try {
      await safetyAssignmentApi.remove(deleteAssignTarget.id);
      reloadAssignments();
      pushToast(`已撤销「${deleteAssignTarget.title}」`, 'success');
    } catch {
      pushToast('撤销失败', 'error');
    } finally {
      setDeleteAssignTarget(null);
    }
  };

  const targetLabel = (a: SafetyAssignment) => {
    if (a.groupId) {
      return `小组 · ${groups.find((g) => g.id === a.groupId)?.name ?? a.groupId}`;
    }
    if (a.classId) {
      return `班级 · ${classes.find((c) => c.id === a.classId)?.name ?? a.classId}`;
    }
    return '未指定对象';
  };

  const assignExpired = (a: SafetyAssignment) =>
    !!a.deadline && new Date(a.deadline).getTime() < Date.now();

  const [resetOpen, setResetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: questions.length };
    for (const c of CATEGORIES) map[c] = questions.filter((q) => q.safetyCategory === c).length;
    return map;
  }, [questions]);

  const visible = useMemo(
    () => (filterCat === 'all' ? questions : questions.filter((q) => q.safetyCategory === filterCat)),
    [questions, filterCat]
  );

  // ---------- 编辑 / 新增 ----------
  const openCreate = () => {
    setEditor(blankEditor(filterCat === 'all' ? 'electric' : filterCat));
    setEditorErr('');
  };

  const openEdit = (q: Question) => {
    setEditor({
      id: q.id,
      cat: q.safetyCategory || 'combined',
      type: q.type,
      difficulty: q.difficulty,
      stem: q.stem,
      kp: q.knowledgePoint,
      options: [...q.options],
      answer: Array.isArray(q.answer) ? [...q.answer] : q.answer,
    });
    setEditorErr('');
  };

  const switchType = (type: Question['type']) => {
    if (!editor) return;
    if (type === 'judge') {
      setEditor({ ...editor, type, options: ['正确', '错误'], answer: editor.type === 'judge' ? editor.answer : true });
    } else if (type === 'multiple') {
      const a = typeof editor.answer === 'number' ? [editor.answer] : editor.answer === true ? [0] : editor.answer === false ? [1] : [];
      setEditor({ ...editor, type, options: editor.options.length >= 2 ? editor.options : ['', '', '', ''], answer: a });
    } else {
      const a = Array.isArray(editor.answer) ? editor.answer[0] ?? 0 : typeof editor.answer === 'boolean' ? (editor.answer ? 0 : 1) : editor.answer;
      setEditor({ ...editor, type, options: editor.options.length >= 2 ? editor.options : ['', '', '', ''], answer: a });
    }
  };

  const setOption = (i: number, val: string) => {
    if (!editor) return;
    const options = [...editor.options];
    options[i] = val;
    setEditor({ ...editor, options });
  };

  const addOption = () => {
    if (!editor) return;
    setEditor({ ...editor, options: [...editor.options, ''] });
  };

  const removeOption = (i: number) => {
    if (!editor || editor.options.length <= 2) return;
    const options = editor.options.filter((_, idx) => idx !== i);
    let answer = editor.answer;
    if (editor.type === 'single' && typeof answer === 'number') {
      answer = Math.max(0, answer - (answer > i ? 1 : 0));
      if (answer >= options.length) answer = 0;
    } else if (editor.type === 'multiple' && Array.isArray(answer)) {
      answer = answer.filter((n) => n !== i).map((n) => (n > i ? n - 1 : n));
    }
    setEditor({ ...editor, options, answer });
  };

  const markAnswer = (i: number) => {
    if (!editor) return;
    if (editor.type === 'single') setEditor({ ...editor, answer: i });
    else if (editor.type === 'multiple') {
      const arr = Array.isArray(editor.answer) ? [...editor.answer] : [];
      setEditor({ ...editor, answer: arr.includes(i) ? arr.filter((n) => n !== i) : [...arr, i] });
    }
  };

  const saveEditor = () => {
    if (!editor) return;
    const stem = editor.stem.trim();
    const kp = editor.kp.trim();
    if (!stem) return setEditorErr('请填写题干');
    let options: string[];
    let answer = editor.answer;
    if (editor.type !== 'judge') {
      // 自动丢弃留空的选项，并把正确答案的下标映射到压缩后的位置
      const trimmed = editor.options.map((o) => o.trim());
      const keptIdx: number[] = [];
      trimmed.forEach((o, i) => {
        if (o) keptIdx.push(i);
      });
      if (keptIdx.length < 2) return setEditorErr('至少需要 2 个有效选项');
      options = keptIdx.map((i) => trimmed[i]);
      if (editor.type === 'single') {
        const oldIdx = typeof answer === 'number' ? answer : 0;
        const newIdx = keptIdx.indexOf(oldIdx);
        answer = newIdx < 0 ? 0 : newIdx;
      } else {
        const arr = Array.isArray(answer) ? answer : [];
        answer = arr.map((oldIdx) => keptIdx.indexOf(oldIdx)).filter((n) => n >= 0);
        if ((answer as number[]).length === 0) return setEditorErr('多选题请至少勾选一个正确答案');
      }
    } else {
      options = ['正确', '错误'];
    }
    const payload = {
      type: editor.type,
      stem,
      options,
      answer,
      knowledgePoint: kp,
      safetyCategory: editor.cat,
      difficulty: editor.difficulty,
    };
    if (editor.id) {
      updateQuestion(editor.id, payload);
      pushToast('题目已更新', 'success');
    } else {
      addQuestion(payload);
      pushToast('题目已加入安全题库', 'success');
    }
    setEditor(null);
  };

  // ---------- 导入 / 导出 ----------
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result || ''));
      setImportErr('');
    };
    reader.onerror = () => setImportErr('文件读取失败，请重试');
    reader.readAsText(file);
  };

  const doImport = () => {
    if (!importText.trim()) {
      setImportErr('请粘贴 JSON 内容或选择文件');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportErr('JSON 格式错误，请检查内容');
      return;
    }
    const questions = parsed && typeof parsed === 'object' && 'questions' in parsed ? parsed.questions : undefined;
    const rawList: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(questions) ? questions : [];
    const list = normalizeQuestions(rawList);
    if (list.length === 0) {
      setImportErr('未解析到有效题目（每题需包含 stem、options、safetyCategory）');
      return;
    }
    setImporting(true);
    setTimeout(() => {
      const n = importQuestions(list, importMode);
      setImporting(false);
      setImportOpen(false);
      setImportText('');
      pushToast(
        importMode === 'replace' ? `已替换为导入的 ${list.length} 道题目` : `成功导入 ${n} 道新题（重复题干已跳过）`,
        'success'
      );
    }, 300);
  };

  const doExport = () => {
    const data = JSON.stringify(questions, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `安全题库_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`已导出 ${questions.length} 道题目`, 'success');
  };

  const isAnswer = (q: Question, i: number) => {
    if (Array.isArray(q.answer)) return q.answer.includes(i);
    // 判断题：options[0]=正确(true)，options[1]=错误(false)
    if (q.type === 'judge') return (i === 0) === Boolean(q.answer);
    return q.answer === i;
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="glass-card p-5 md:p-7 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-growth-400 to-growth-600 flex items-center justify-center text-white shadow-lg">
          <ShieldCheck size={28} strokeWidth={2.2} />
        </div>
        <div>
          <span className="chip-growth !py-0.5 !px-2 !text-[10px]">SAFETY BANK</span>
          <h1 className="mt-1 text-[24px] font-extrabold text-ink-900 tracking-tight">安全题库维护</h1>
          <p className="text-[13px] text-ink-500 font-medium">共 {questions.length} 道题 · 新增 / 编辑 / 批量导入 · 改动即时生效于学生安全考核</p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="glass-card p-5 rounded-[22px] flex flex-wrap items-center gap-3">
        <button onClick={openCreate} className="btn-mission inline-flex items-center gap-2 !py-2.5">
          <Plus size={16} /> 新增题目
        </button>
        <button
          onClick={() => {
            setImportOpen(true);
            setImportErr('');
            setImportText('');
          }}
          className="btn-ghost-mission inline-flex items-center gap-2 !py-2.5"
        >
          <Upload size={15} /> 批量导入
        </button>
        <button onClick={doExport} className="btn-ghost-mission inline-flex items-center gap-2 !py-2.5">
          <Download size={15} /> 导出题库
        </button>
        <button
          onClick={() => setResetOpen(true)}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card glass-card-hover text-[13px] font-semibold text-ink-600 hover:text-danger-600"
        >
          <RotateCcw size={15} /> 恢复内置题库
        </button>
      </div>

      {/* ===== 考核任务指派 ===== */}
      <div className="glass-card p-5 rounded-[22px]">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-bold text-ink-800 flex items-center gap-2">
              <ClipboardList size={17} className="text-growth-600" /> 考核任务指派
            </h2>
            <p className="text-[12.5px] text-ink-500 font-medium mt-0.5">
              指派后，目标班级 / 小组的学生会在「安全实验室」看到这条考核，按你设定的题数与限时作答
            </p>
          </div>
          <button
            onClick={() => {
              setAssignEditor(blankAssign(filterCat === 'all' ? 'electric' : filterCat));
              setAssignErr('');
            }}
            className="ml-auto btn-mission inline-flex items-center gap-2 !py-2.5"
          >
            <Plus size={16} /> 新建指派
          </button>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 py-8 text-center text-[13px] text-ink-400">
            还没有指派。点击「新建指派」把考核推送到班级或小组。
          </div>
        ) : (
          <div className="space-y-2.5">
            {assignments.map((a) => {
              const expired = assignExpired(a);
              return (
                <div
                  key={a.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 transition',
                    expired ? 'border-ink-100 bg-ink-50/60 opacity-70' : 'border-ink-100 bg-white/70'
                  )}
                >
                  <div className="min-w-[180px] flex-1">
                    <div className="text-[14px] font-bold text-ink-800 flex items-center gap-2">
                      {a.title}
                      {expired && <span className="chip-ink !py-0.5 !px-2 !text-[10px]">已截止</span>}
                    </div>
                    <div className="text-[12.5px] text-ink-500 font-medium mt-0.5">
                      {categoryNameMap[a.category as SafetyCategory] ?? a.category}安全 · {targetLabel(a)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                    <span className="chip-growth !py-0.5 !px-2">{a.questionCount} 题</span>
                    <span className="chip-energy !py-0.5 !px-2">{a.timeLimit} 分钟</span>
                    <span className="chip-mission !py-0.5 !px-2">{a.passScore} 分及格</span>
                    {a.deadline && (
                      <span className="chip-ink !py-0.5 !px-2">
                        截止 {new Date(a.deadline).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteAssignTarget(a)}
                    className="w-9 h-9 rounded-xl glass-card glass-card-hover flex items-center justify-center text-ink-400 hover:text-danger-600"
                    title="撤销指派"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 类别筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilterCat('all')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition border',
            filterCat === 'all'
              ? 'bg-gradient-to-br from-growth-400 to-growth-600 text-white border-transparent shadow-md'
              : 'glass-card text-ink-600 border-ink-100 hover:border-growth-300'
          )}
        >
          全部（{counts.all}）
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition border',
              filterCat === c
                ? 'bg-gradient-to-br from-growth-400 to-growth-600 text-white border-transparent shadow-md'
                : 'glass-card text-ink-600 border-ink-100 hover:border-growth-300'
            )}
          >
            {categoryNameMap[c]}安全（{counts[c]}）
          </button>
        ))}
      </div>

      {/* 题目列表 */}
      {visible.length === 0 ? (
        <div className="glass-card p-10 rounded-[22px] text-center text-ink-400">
          该类别暂无题目，点击「新增题目」或「批量导入」添加
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visible.map((q) => (
            <motion.div
              key={q.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-[20px] p-4 group"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="chip-growth !py-0.5 !px-2 !text-[10px]">
                  {categoryNameMap[q.safetyCategory || 'combined']}安全
                </span>
                <span className={cn(DIFF_CHIP[q.difficulty], '!py-0.5 !px-2 !text-[10px]')}>
                  {DIFF_LABEL[q.difficulty]}
                </span>
                <span className="chip-nova !py-0.5 !px-2 !text-[10px]">{TYPE_LABEL[q.type]}</span>
                {q.knowledgePoint && (
                  <span className="text-[11px] text-ink-400">知识点：{q.knowledgePoint}</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => openEdit(q)}
                    className="w-7 h-7 rounded-lg hover:bg-mission-50 flex items-center justify-center text-ink-400 hover:text-mission-600"
                    title="编辑"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(q)}
                    className="w-7 h-7 rounded-lg hover:bg-danger-50 flex items-center justify-center text-ink-400 hover:text-danger-600"
                    title="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="text-[13.5px] font-semibold text-ink-800 leading-relaxed mb-2.5">{q.stem}</p>
              <div className="space-y-1.5">
                {q.options.map((opt, i) => {
                  const correct = isAnswer(q, i);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] border',
                        correct
                          ? 'bg-growth-50 border-growth-200 text-ink-800 font-semibold'
                          : 'bg-white/50 border-ink-100/70 text-ink-500'
                      )}
                    >
                      {correct ? (
                        <CheckCircle2 size={13} className="text-growth-500 shrink-0" />
                      ) : (
                        <span className="w-[13px] shrink-0" />
                      )}
                      <span className="font-mono text-ink-400 shrink-0">{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ===== 新增 / 编辑弹窗 ===== */}
      <AnimatePresence>
        {editor && (
          <Modal onClose={() => setEditor(null)} title={editor.id ? '编辑题目' : '新增安全题目'}>
            <div className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="field-label">安全类别</span>
                  <select
                    value={editor.cat}
                    onChange={(e) => setEditor({ ...editor, cat: e.target.value as SafetyCategory })}
                    className="input-field cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {categoryNameMap[c]}安全
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="field-label">题型</span>
                  <select
                    value={editor.type}
                    onChange={(e) => switchType(e.target.value as Question['type'])}
                    className="input-field cursor-pointer"
                  >
                    <option value="single">单选题</option>
                    <option value="multiple">多选题</option>
                    <option value="judge">判断题</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="field-label">难度</span>
                  <select
                    value={editor.difficulty}
                    onChange={(e) => setEditor({ ...editor, difficulty: Number(e.target.value) as 1 | 2 | 3 })}
                    className="input-field cursor-pointer"
                  >
                    <option value={1}>简单</option>
                    <option value={2}>中等</option>
                    <option value={3}>困难</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="field-label">题干</span>
                <textarea
                  value={editor.stem}
                  onChange={(e) => setEditor({ ...editor, stem: e.target.value })}
                  className="input-field min-h-[72px] resize-y"
                  placeholder="输入完整题干，例如：发现电器设备冒烟，首先应当？"
                />
              </label>

              {editor.type !== 'judge' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="field-label">
                      选项（{editor.type === 'single' ? '点圆点标记唯一正确答案' : '勾选所有正确答案'}）
                    </span>
                    {editor.options.length < 8 && (
                      <button onClick={addOption} className="text-[12px] font-semibold text-mission-600 inline-flex items-center gap-1">
                        <Plus size={12} /> 添加选项
                      </button>
                    )}
                  </div>
                  {editor.options.map((opt, i) => {
                    const marked =
                      editor.type === 'single'
                        ? editor.answer === i
                        : Array.isArray(editor.answer) && editor.answer.includes(i);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => markAnswer(i)}
                          title="标记为正确答案"
                          className={cn(
                            'w-6 h-6 rounded-full shrink-0 flex items-center justify-center border-2 transition',
                            marked ? 'bg-growth-500 border-growth-500 text-white' : 'border-ink-200 text-transparent hover:border-growth-400'
                          )}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <span className="font-mono text-[12px] text-ink-400 shrink-0 w-4">{String.fromCharCode(65 + i)}.</span>
                        <input
                          value={opt}
                          onChange={(e) => setOption(i, e.target.value)}
                          className="input-field !py-1.5 flex-1"
                          placeholder={`选项 ${String.fromCharCode(65 + i)} 内容`}
                        />
                        {editor.options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="w-7 h-7 rounded-lg hover:bg-danger-50 flex items-center justify-center text-ink-300 hover:text-danger-500 shrink-0"
                            title="删除选项"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="field-label">判断答案</span>
                  <div className="flex gap-2">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => setEditor({ ...editor, answer: v })}
                        className={cn(
                          'flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition',
                          editor.answer === v
                            ? 'bg-growth-50 border-growth-300 text-growth-700'
                            : 'bg-white/60 border-ink-100 text-ink-500'
                        )}
                      >
                        {v ? '✓ 正确' : '✗ 错误'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block space-y-1">
                <span className="field-label">知识点（可选）</span>
                <input
                  value={editor.kp}
                  onChange={(e) => setEditor({ ...editor, kp: e.target.value })}
                  className="input-field"
                  placeholder="例如：异常即断电"
                />
              </label>

              {editorErr && (
                <div className="flex items-center gap-1.5 text-[12.5px] text-danger-600">
                  <AlertTriangle size={14} /> {editorErr}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button className="btn-ghost-mission flex-1" onClick={() => setEditor(null)}>
                  取消
                </button>
                <button className="btn-growth flex-1" onClick={saveEditor}>
                  <CheckCircle2 size={15} /> {editor.id ? '保存修改' : '加入题库'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===== 批量导入弹窗 ===== */}
      <AnimatePresence>
        {importOpen && (
          <Modal onClose={() => setImportOpen(false)} title="批量导入安全题库" wide>
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="field-label">导入模式：</span>
                <button
                  onClick={() => setImportMode('merge')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12px] font-semibold border',
                    importMode === 'merge' ? 'bg-growth-50 border-growth-300 text-growth-700' : 'bg-white/60 border-ink-100 text-ink-500'
                  )}
                >
                  合并（重复题干跳过）
                </button>
                <button
                  onClick={() => setImportMode('replace')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[12px] font-semibold border',
                    importMode === 'replace' ? 'bg-alert-50 border-alert-300 text-alert-700' : 'bg-white/60 border-ink-100 text-ink-500'
                  )}
                >
                  替换（覆盖整个题库）
                </button>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-growth-200 rounded-xl py-5 text-growth-600 hover:bg-growth-50/50 transition flex flex-col items-center gap-1.5"
              >
                <FileUp size={22} />
                <span className="text-[13px] font-semibold">选择 JSON 题库文件</span>
                <span className="text-[11px] text-ink-400">也可直接在下方粘贴 JSON 文本</span>
              </button>

              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="input-field min-h-[160px] resize-y font-mono text-[12px]"
                placeholder={'JSON 数组格式，例如：\n[\n  {\n    "stem": "发现电器冒烟首先应当？",\n    "type": "single",\n    "options": ["继续观察", "立即切断电源", "用水浇灭", "找老师再说"],\n    "answer": 1,\n    "knowledgePoint": "异常即断电",\n    "safetyCategory": "electric",\n    "difficulty": 1\n  }\n]'}
              />
              <p className="text-[11.5px] text-ink-400">
                safetyCategory 可选值：electric / thermal / optical / mechanical / radiation / chemical / combined；判断题 answer 用 true/false，多选题 answer 用数组如 [0,2]。
              </p>

              {importErr && (
                <div className="flex items-center gap-1.5 text-[12.5px] text-danger-600">
                  <AlertTriangle size={14} /> {importErr}
                </div>
              )}

              <div className="flex gap-2">
                <button className="btn-ghost-mission flex-1" onClick={() => setImportOpen(false)}>
                  取消
                </button>
                <button
                  className="btn-growth flex-1 inline-flex items-center justify-center gap-2"
                  onClick={doImport}
                  disabled={importing}
                >
                  {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {importing ? '导入中…' : '确认导入'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===== 删除确认 ===== */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteQuestion(deleteTarget.id);
            pushToast(`已删除题目`, 'success');
            setDeleteTarget(null);
          }
        }}
        title="删除题目"
        message={`确定删除这道题吗？\n「${deleteTarget?.stem}」`}
        confirmText="确认删除"
        danger
      />

      {/* ===== 恢复默认确认 ===== */}
      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          resetToDefault();
          setResetOpen(false);
          pushToast('已恢复为内置安全题库', 'success');
        }}
        title="恢复内置题库"
        message="将丢弃所有教师新增/修改/导入的题目，恢复为系统内置的标准安全考核题。此操作不可撤销。"
        confirmText="确认恢复"
        danger
      />

      {/* ===== 新建指派 ===== */}
      <AnimatePresence>
        {assignEditor && (
          <Modal onClose={() => setAssignEditor(null)} title="新建考核指派" wide>
            <div className="space-y-3.5">
              <label className="space-y-1 block">
                <span className="text-[12.5px] font-semibold text-ink-600">考核名称</span>
                <input
                  value={assignEditor.title}
                  onChange={(e) => setAssignEditor({ ...assignEditor, title: e.target.value })}
                  placeholder="如：实验室用电安全考核"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[12.5px] font-semibold text-ink-600">安全类别</span>
                <select
                  value={assignEditor.cat}
                  onChange={(e) => setAssignEditor({ ...assignEditor, cat: e.target.value as SafetyCategory })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryNameMap[c]}安全（题库 {catQuestionCount(c)} 题）
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 block">
                  <span className="text-[12.5px] font-semibold text-ink-600">题数</span>
                  <input
                    type="number"
                    min={1}
                    value={assignEditor.questionCount}
                    onChange={(e) => setAssignEditor({ ...assignEditor, questionCount: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[12.5px] font-semibold text-ink-600">限时（分钟）</span>
                  <input
                    type="number"
                    min={1}
                    value={assignEditor.timeLimit}
                    onChange={(e) => setAssignEditor({ ...assignEditor, timeLimit: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[12.5px] font-semibold text-ink-600">及格线</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={assignEditor.passScore}
                    onChange={(e) => setAssignEditor({ ...assignEditor, passScore: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[12.5px] font-semibold text-ink-600">截止时间（可选）</span>
                <input
                  type="datetime-local"
                  value={assignEditor.deadline}
                  onChange={(e) => setAssignEditor({ ...assignEditor, deadline: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                />
              </label>

              <div className="space-y-2">
                <span className="text-[12.5px] font-semibold text-ink-600">指派给</span>
                <div className="flex gap-2">
                  {(['class', 'group'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setAssignEditor({ ...assignEditor, targetKind: k, targetId: '' })}
                      className={cn(
                        'px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition border',
                        assignEditor.targetKind === k
                          ? 'bg-gradient-to-br from-growth-400 to-growth-600 text-white border-transparent shadow-md'
                          : 'glass-card text-ink-600 border-ink-100 hover:border-growth-300'
                      )}
                    >
                      {k === 'class' ? '整个班级' : '单个小组'}
                    </button>
                  ))}
                </div>
                <select
                  value={assignEditor.targetId}
                  onChange={(e) => setAssignEditor({ ...assignEditor, targetId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-ink-200 bg-white/80 text-[13.5px] focus:outline-none focus:border-growth-400"
                >
                  <option value="">请选择{assignEditor.targetKind === 'class' ? '班级' : '小组'}</option>
                  {(assignEditor.targetKind === 'class' ? classes : groups).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {assignErr && (
                <div className="rounded-xl bg-danger-50 text-danger-600 text-[12.5px] font-medium px-3.5 py-2.5">
                  {assignErr}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button className="btn-ghost-mission flex-1" onClick={() => setAssignEditor(null)}>
                  取消
                </button>
                <button
                  className="btn-growth flex-1 inline-flex items-center justify-center gap-2"
                  onClick={saveAssign}
                  disabled={savingAssign}
                >
                  {savingAssign ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  确认指派
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===== 撤销指派确认 ===== */}
      <ConfirmModal
        open={!!deleteAssignTarget}
        onClose={() => setDeleteAssignTarget(null)}
        onConfirm={doDeleteAssign}
        title="撤销指派"
        message={`确定撤销这条考核指派吗？\n「${deleteAssignTarget?.title ?? ''}」\n学生将不再在安全实验室看到它（已提交的成绩保留）。`}
        confirmText="确认撤销"
        danger
      />
    </div>
  );
}

// ---------- 复用弹窗组件 ----------

function Modal({
  onClose,
  title,
  children,
  wide,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
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
        className={cn('glass-card w-full rounded-[24px] p-6 shadow-2xl max-h-[88vh] overflow-y-auto', wide ? 'max-w-[620px]' : 'max-w-[520px]')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold text-ink-800">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
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
          className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="glass-card w-full max-w-[420px] rounded-[24px] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  danger ? 'bg-danger-50 text-danger-600' : 'bg-alert-50 text-alert-600'
                )}
              >
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-ink-800">{title}</h3>
                <p className="text-[13px] text-ink-500 mt-1 leading-relaxed whitespace-pre-line">{message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost-mission flex-1" onClick={onClose}>
                取消
              </button>
              <button
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-2 !py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all',
                  danger ? 'bg-gradient-to-br from-danger-400 to-danger-600' : 'btn-growth'
                )}
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
