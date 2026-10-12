/**
 * 题库审核中心 —— 教师/管理员视图
 *
 * 功能：
 *  - 查看两个分区：学生提交（pending/approved/rejected）与教师上传
 *  - 对每道题：查看题干/选项/答案、写教师评价（学生可见）、修改原题内容、通过/驳回、删除
 *  - 教师上传题库：手动新增 / JSON 批量导入
 */
/**
 * 题库审核中心 —— 教师/管理员视图
 *
 * 功能：
 *  - 查看两个分区：学生提交（pending/approved/rejected）与教师上传
 *  - 对每道题：查看题干/选项/答案、写教师评价（学生可见）、修改原题内容、通过/驳回、删除
 *  - 教师上传题库：手动新增 / JSON 批量导入
 */
import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LibraryBig, Plus, Upload, Download, Pencil, Trash2, X, CheckCircle2, AlertTriangle, FileUp, Loader2, MessageSquare, Check, XCircle } from 'lucide-react';
import { useQuestionBankStore } from '@/store/questionBankStore';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { QuestionType } from '@/types';
import { cn } from '@/lib/utils';

type Tab = 'students' | 'teacher';
type Status = 'pending' | 'approved' | 'rejected';

const STATUS_META: Record<Status, { label: string; chip: string; dot: string }> = {
  pending: { label: '待审核', chip: 'chip-energy', dot: 'bg-alert-400' },
  approved: { label: '已通过', chip: 'chip-growth', dot: 'bg-growth-400' },
  rejected: { label: '已驳回', chip: 'chip-danger', dot: 'bg-danger-400' },
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
};

const DIFF_LABEL = ['', '简单', '中等', '困难'];
const DIFF_CHIP = ['', 'chip-growth', 'chip-energy', 'chip-danger'];

interface EditorState {
  id?: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  stem: string;
  kp: string;
  options: string[];
  answer: number | number[] | boolean;
}

const blankEditor = (): EditorState => ({
  type: 'single',
  difficulty: 1,
  stem: '',
  kp: '',
  options: ['', '', '', ''],
  answer: 0,
});

export default function TeacherQuestionBank() {
  const pushToast = useUIStore((s) => s.pushToast);
  const userName = useAuthStore((s) => s.name) || '教师';
  const questions = useQuestionBankStore((s) => s.questions);
  const uploadQuestion = useQuestionBankStore((s) => s.uploadQuestion);
  const approveQuestion = useQuestionBankStore((s) => s.approveQuestion);
  const rejectQuestion = useQuestionBankStore((s) => s.rejectQuestion);
  const editQuestion = useQuestionBankStore((s) => s.editQuestion);
  const setFeedback = useQuestionBankStore((s) => s.setFeedback);
  const deleteQuestion = useQuestionBankStore((s) => s.deleteQuestion);
  const importTeacherQuestions = useQuestionBankStore((s) => s.importTeacherQuestions);

  const [tab, setTab] = useState<Tab>('students');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorErr, setEditorErr] = useState('');
  const [feedbackTarget, setFeedbackTarget] = useState<{ id: string; stem: string; current?: string } | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [rejectTarget, setRejectTarget] = useState<{ id: string; stem: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; stem: string } | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const studentQs = useMemo(() => questions.filter((q) => q.submittedBy), [questions]);
  const teacherQs = useMemo(() => questions.filter((q) => !q.submittedBy), [questions]);
  const list = tab === 'students' ? studentQs : teacherQs;
  const visible = statusFilter === 'all' ? list : list.filter((q) => q.reviewStatus === statusFilter);

  const statusCounts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, approved: 0, rejected: 0 };
    list.forEach((q) => (c[q.reviewStatus]++));
    return c;
  }, [list]);

  const runWrite = async (action:()=>void | Promise<void>) => {
    try { await action();return true; } catch (err) {pushToast(err instanceof Error ? err.message : '保存失败，请重试','error');return false;}
  };

  // ---------- 编辑 ----------
  const openCreate = () => {
    setEditor(blankEditor());
    setEditorErr('');
  };

  const openEdit = (q: (typeof questions)[number]) => {
    setEditor({
      id: q.id,
      type: q.type,
      difficulty: q.difficulty,
      stem: q.stem,
      kp: q.knowledgePoint,
      options: [...q.options],
      answer: Array.isArray(q.answer) ? [...q.answer] : q.answer,
    });
    setEditorErr('');
  };

  const switchType = (type: QuestionType) => {
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

  const addOption = () => editor && editor.options.length < 8 && setEditor({ ...editor, options: [...editor.options, ''] });

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

  const saveEditor = async () => {
    if (!editor) return;
    const stem = editor.stem.trim();
    if (!stem) return setEditorErr('请填写题干');
    let options: string[];
    let answer = editor.answer;
    if (editor.type !== 'judge') {
      const trimmed = editor.options.map((o) => o.trim());
      const keptIdx: number[] = [];
      trimmed.forEach((o, i) => o && keptIdx.push(i));
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
      type: editor.type, stem, options, answer,
      knowledgePoint: editor.kp.trim(), difficulty: editor.difficulty,
    };
    try {
    if (editor.id) {
      await editQuestion(editor.id, payload, userName);
      pushToast('题目已修改', 'success');
    } else {
      await uploadQuestion(payload, userName);
      pushToast('题目已上传并纳入题库', 'success');
    }
    setEditor(null);
    } catch (err) { setEditorErr(err instanceof Error ? err.message : '保存失败'); }
  };

  // ---------- 反馈 ----------
  const openFeedback = (q: (typeof questions)[number]) => {
    setFeedbackTarget({ id: q.id, stem: q.stem, current: q.teacherFeedback });
    setFeedbackText(q.teacherFeedback || '');
  };

  const submitFeedback = async () => {
    if (!feedbackTarget) return;
    const text = feedbackText.trim();
    if (!text) return;
    if (!await runWrite(()=>setFeedback(feedbackTarget.id, text, userName))) return;
    pushToast('评价已发送给提交者', 'success');
    setFeedbackTarget(null);
  };

  // ---------- 驳回 ----------
  const submitReject = async () => {
    if (!rejectTarget) return;
    const text = rejectReason.trim();
    if (!text) {
      pushToast('驳回需填写原因', 'warning');
      return;
    }
    if (!await runWrite(()=>rejectQuestion(rejectTarget.id, text))) return;
    pushToast('已驳回并通知提交者', 'success');
    setRejectTarget(null);
    setRejectReason('');
  };

  // ---------- 导入 ----------
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => { setImportText(String(reader.result || '')); setImportErr(''); };
    reader.onerror = () => setImportErr('文件读取失败');
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!importText.trim()) return setImportErr('请粘贴 JSON 或选择文件');
    let parsed: unknown;
    try { parsed = JSON.parse(importText); } catch { return setImportErr('JSON 格式错误'); }
    const questions = parsed && typeof parsed === 'object' && 'questions' in parsed ? parsed.questions : undefined;
    const list: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(questions) ? questions : [];
    if (!list.length) return setImportErr('未解析到题目');
    setImporting(true);
    try {
      const n = await importTeacherQuestions(list, userName);
      setImporting(false);
      setImportOpen(false);
      setImportText('');
      pushToast(`成功导入 ${n} 道题目`, 'success');
    } catch (err) { setImportErr(err instanceof Error ? err.message : '导入失败'); } finally { setImporting(false); }
  };

  const isAnswer = (q: (typeof questions)[number], i: number) => {
    if (Array.isArray(q.answer)) return q.answer.includes(i);
    // 判断题：options[0]=正确(true)，options[1]=错误(false)
    if (q.type === 'judge') return (i === 0) === Boolean(q.answer);
    return q.answer === i;
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="glass-card p-5 md:p-7 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-mission-400 to-mission-600 flex items-center justify-center text-white shadow-lg">
          <LibraryBig size={28} strokeWidth={2.2} />
        </div>
        <div>
          <span className="chip-mission !py-0.5 !px-2 !text-[10px]">QUESTION BANK</span>
          <h1 className="mt-1 text-[24px] font-extrabold text-ink-900 tracking-tight">题库审核中心</h1>
          <p className="text-[13px] text-ink-500 font-medium">汇总学生提交 · 教师上传 · 审核评价与修改，评价对提交者可见</p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="glass-card p-5 rounded-[22px] flex flex-wrap items-center gap-3">
        <button onClick={openCreate} className="btn-mission inline-flex items-center gap-2 !py-2.5">
          <Plus size={16} /> 教师上传题目
        </button>
        <button
          onClick={() => { setImportOpen(true); setImportErr(''); setImportText(''); }}
          className="btn-ghost-mission inline-flex items-center gap-2 !py-2.5"
        >
          <Upload size={15} /> 批量导入
        </button>
        <button
          onClick={() => {
            const data = JSON.stringify(questions, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `审核题库_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            pushToast(`已导出 ${questions.length} 道题目`, 'success');
          }}
          className="btn-ghost-mission inline-flex items-center gap-2 !py-2.5"
        >
          <Download size={15} /> 导出题库
        </button>
      </div>

      {/* Tab + 状态筛选 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {([
            { key: 'students' as Tab, label: '学生提交', count: studentQs.length },
            { key: 'teacher' as Tab, label: '教师上传', count: teacherQs.length },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-xl text-[13.5px] font-bold transition',
                tab === t.key ? 'bg-gradient-to-br from-mission-400 to-mission-600 text-white shadow-md' : 'glass-card text-ink-600 hover:border-mission-300'
              )}
            >
              {t.label}（{t.count}）
            </button>
          ))}
        </div>
        {tab === 'students' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { key: 'all' as const, label: '全部' },
              { key: 'pending' as const, label: `待审核（${statusCounts.pending}）` },
              { key: 'approved' as const, label: `已通过（${statusCounts.approved}）` },
              { key: 'rejected' as const, label: `已驳回（${statusCounts.rejected}）` },
            ]).map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition',
                  statusFilter === s.key ? 'bg-ink-800 text-white border-transparent' : 'glass-card text-ink-500 border-ink-100 hover:border-mission-300'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 题目列表 */}
      {visible.length === 0 ? (
        <div className="glass-card p-10 rounded-[22px] text-center text-ink-400">
          暂无题目
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visible.map((q) => {
            const meta = STATUS_META[q.reviewStatus];
            return (
              <motion.div
                key={q.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-[20px] p-4"
              >
                {/* 顶部：状态 / 题型 / 提交者 */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={cn(meta.chip, '!py-0.5 !px-2 !text-[10px] inline-flex items-center gap-1')}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} /> {meta.label}
                  </span>
                  <span className="chip-nova !py-0.5 !px-2 !text-[10px]">{TYPE_LABEL[q.type]}</span>
                  <span className={cn(DIFF_CHIP[q.difficulty], '!py-0.5 !px-2 !text-[10px]')}>{DIFF_LABEL[q.difficulty]}</span>
                  <span className="text-[11px] text-ink-400">
                    {q.submittedBy ? `学生：${q.submittedByName}` : `教师上传`}
                    {q.edited && <span className="ml-1 text-mission-600">· 教师已修改</span>}
                  </span>
                  <span className="text-[11px] text-ink-300 ml-auto">
                    {new Date(q.submittedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* 题干 */}
                <p className="text-[13.5px] font-semibold text-ink-800 leading-relaxed mb-2.5">{q.stem}</p>

                {/* 选项 */}
                <div className="space-y-1.5 mb-3">
                  {q.options.map((opt, i) => {
                    const correct = isAnswer(q, i);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] border',
                          correct ? 'bg-growth-50 border-growth-200 text-ink-800 font-semibold' : 'bg-white/50 border-ink-100/70 text-ink-500'
                        )}
                      >
                        {correct ? <CheckCircle2 size={13} className="text-growth-500 shrink-0" /> : <span className="w-[13px] shrink-0" />}
                        <span className="font-mono text-ink-400 shrink-0">{String.fromCharCode(65 + i)}.</span>
                        {opt}
                      </div>
                    );
                  })}
                </div>

                {/* 教师反馈 */}
                {q.teacherFeedback && (
                  <div className="mb-3 p-2.5 rounded-xl bg-mission-50/70 border border-mission-100 text-[12px] text-ink-600 leading-relaxed">
                    <div className="font-bold text-mission-700 flex items-center gap-1 mb-1">
                      <MessageSquare size={12} /> 教师评价
                    </div>
                    {q.teacherFeedback}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {q.reviewStatus !== 'approved' && (
                    <button
                      onClick={() => runWrite(()=>approveQuestion(q.id, q.teacherFeedback))}
                      className="btn-growth !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
                    >
                      <Check size={13} /> 通过
                    </button>
                  )}
                  {q.reviewStatus !== 'rejected' && (
                    <button
                      onClick={() => { setRejectTarget({ id: q.id, stem: q.stem }); setRejectReason(''); }}
                      className="btn-danger !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
                    >
                      <XCircle size={13} /> 驳回
                    </button>
                  )}
                  <button
                    onClick={() => openFeedback(q)}
                    className="btn-ghost !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
                  >
                    <MessageSquare size={13} /> 评价
                  </button>
                  <button
                    onClick={() => openEdit(q)}
                    className="btn-ghost !py-1.5 !px-3 text-[12px] inline-flex items-center gap-1"
                  >
                    <Pencil size={13} /> 修改
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ id: q.id, stem: q.stem })}
                    className="w-7 h-7 rounded-lg hover:bg-danger-50 flex items-center justify-center text-ink-400 hover:text-danger-600 ml-auto"
                    title="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ===== 新增 / 编辑弹窗 ===== */}
      <AnimatePresence>
        {editor && (
          <Modal onClose={() => setEditor(null)} title={editor.id ? '修改题目' : '教师上传题目'}>
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="field-label">题型</span>
                  <select value={editor.type} onChange={(e) => switchType(e.target.value as QuestionType)} className="input-field cursor-pointer">
                    <option value="single">单选题</option>
                    <option value="multiple">多选题</option>
                    <option value="judge">判断题</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="field-label">难度</span>
                  <select value={editor.difficulty} onChange={(e) => setEditor({ ...editor, difficulty: Number(e.target.value) as 1 | 2 | 3 })} className="input-field cursor-pointer">
                    <option value={1}>简单</option>
                    <option value={2}>中等</option>
                    <option value={3}>困难</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="field-label">题干</span>
                <textarea value={editor.stem} onChange={(e) => setEditor({ ...editor, stem: e.target.value })} className="input-field min-h-[64px] resize-y" placeholder="输入题干" />
              </label>

              {editor.type !== 'judge' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="field-label">{editor.type === 'single' ? '点圆点标记唯一正确答案' : '勾选所有正确答案'}</span>
                    {editor.options.length < 8 && (
                      <button onClick={addOption} className="text-[12px] font-semibold text-mission-600 inline-flex items-center gap-1">
                        <Plus size={12} /> 添加选项
                      </button>
                    )}
                  </div>
                  {editor.options.map((opt, i) => {
                    const marked = editor.type === 'single' ? editor.answer === i : Array.isArray(editor.answer) && editor.answer.includes(i);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => markAnswer(i)}
                          className={cn('w-6 h-6 rounded-full shrink-0 flex items-center justify-center border-2 transition', marked ? 'bg-growth-500 border-growth-500 text-white' : 'border-ink-200 text-transparent hover:border-growth-400')}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <span className="font-mono text-[12px] text-ink-400 shrink-0 w-4">{String.fromCharCode(65 + i)}.</span>
                        <input value={opt} onChange={(e) => setOption(i, e.target.value)} className="input-field !py-1.5 flex-1" placeholder={`选项 ${String.fromCharCode(65 + i)} 内容`} />
                        {editor.options.length > 2 && (
                          <button onClick={() => removeOption(i)} className="w-7 h-7 rounded-lg hover:bg-danger-50 flex items-center justify-center text-ink-300 hover:text-danger-500 shrink-0">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setEditor({ ...editor, answer: v })}
                      className={cn('flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition', editor.answer === v ? 'bg-growth-50 border-growth-300 text-growth-700' : 'bg-white/60 border-ink-100 text-ink-500')}
                    >
                      {v ? '✓ 正确' : '✗ 错误'}
                    </button>
                  ))}
                </div>
              )}

              <label className="block space-y-1">
                <span className="field-label">知识点（可选）</span>
                <input value={editor.kp} onChange={(e) => setEditor({ ...editor, kp: e.target.value })} className="input-field" placeholder="例如：电磁感应" />
              </label>

              {editorErr && <div className="flex items-center gap-1.5 text-[12.5px] text-danger-600"><AlertTriangle size={14} /> {editorErr}</div>}

              <div className="flex gap-2 pt-1">
                <button className="btn-ghost-mission flex-1" onClick={() => setEditor(null)}>取消</button>
                <button className="btn-mission flex-1" onClick={saveEditor}>
                  <CheckCircle2 size={15} /> {editor.id ? '保存修改' : '上传题目'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===== 评价弹窗 ===== */}
      <AnimatePresence>
        {feedbackTarget && (
          <Modal onClose={() => setFeedbackTarget(null)} title="教师评价" subtitle={feedbackTarget.stem}>
            <div className="space-y-3.5">
              {feedbackTarget.current && (
                <div className="p-2.5 rounded-xl bg-ink-50 border border-ink-100 text-[12px] text-ink-500">
                  <b>上次评价：</b>{feedbackTarget.current}
                </div>
              )}
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="input-field min-h-[120px] resize-y"
                placeholder="写下对这道题的评价，提交者将看到你的反馈……"
                autoFocus
              />
              <p className="text-[11.5px] text-ink-400">学生提交者可在「我的出题」中查看此评价。</p>
              <div className="flex gap-2">
                <button className="btn-ghost-mission flex-1" onClick={() => setFeedbackTarget(null)}>取消</button>
                <button className="btn-mission flex-1" onClick={submitFeedback}>
                  <MessageSquare size={15} /> 发送评价
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===== 驳回弹窗 ===== */}
      <AnimatePresence>
        {rejectTarget && (
          <Modal onClose={() => setRejectTarget(null)} title="驳回题目" subtitle={rejectTarget.stem}>
            <div className="space-y-3.5">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="input-field min-h-[100px] resize-y"
                placeholder="请填写驳回原因，学生将看到此反馈……"
                autoFocus
              />
              <div className="flex gap-2">
                <button className="btn-ghost-mission flex-1" onClick={() => setRejectTarget(null)}>取消</button>
                <button className="btn-danger flex-1" onClick={submitReject}>
                  <XCircle size={15} /> 确认驳回
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* ===== 批量导入弹窗 ===== */}
      <AnimatePresence>
        {importOpen && (
          <Modal onClose={() => setImportOpen(false)} title="批量导入题库" wide>
            <div className="space-y-3.5">
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-mission-200 rounded-xl py-5 text-mission-600 hover:bg-mission-50/50 transition flex flex-col items-center gap-1.5">
                <FileUp size={22} />
                <span className="text-[13px] font-semibold">选择 JSON 题库文件</span>
                <span className="text-[11px] text-ink-400">或在下方粘贴 JSON 文本</span>
              </button>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="input-field min-h-[160px] resize-y font-mono text-[12px]"
                placeholder={'[\n  {\n    "stem": "题干...",\n    "type": "single",\n    "options": ["A", "B", "C", "D"],\n    "answer": 1,\n    "knowledgePoint": "知识点",\n    "difficulty": 1\n  }\n]'}
              />
              <p className="text-[11.5px] text-ink-400">导入的题目将直接标记为「已通过」并归属教师上传。判断题 answer 用 true/false，多选题用数组如 [0,2]。</p>
              {importErr && <div className="flex items-center gap-1.5 text-[12.5px] text-danger-600"><AlertTriangle size={14} /> {importErr}</div>}
              <div className="flex gap-2">
                <button className="btn-ghost-mission flex-1" onClick={() => setImportOpen(false)}>取消</button>
                <button className="btn-mission flex-1 inline-flex items-center justify-center gap-2" onClick={doImport} disabled={importing}>
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
        onConfirm={async () => { if (deleteTarget && await runWrite(()=>deleteQuestion(deleteTarget.id))) { pushToast('已删除题目', 'success'); setDeleteTarget(null); } }}
        title="删除题目"
        message={`确定删除这道题吗？\n「${deleteTarget?.stem}」`}
        confirmText="确认删除"
        danger
      />
    </div>
  );
}

// ---------- 复用弹窗 ----------

function Modal({ onClose, title, subtitle, children, wide }: { onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className={cn('glass-card w-full rounded-[24px] p-6 shadow-2xl max-h-[88vh] overflow-y-auto', wide ? 'max-w-[620px]' : 'max-w-[520px]')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-ink-800">{title}</h3>
            {subtitle && <p className="text-[12px] text-ink-400 mt-0.5 line-clamp-2">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-400 shrink-0">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function ConfirmModal({ open, onClose, onConfirm, title, message, confirmText, danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmText: string; danger?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="glass-card w-full max-w-[420px] rounded-[24px] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', danger ? 'bg-danger-50 text-danger-600' : 'bg-alert-50 text-alert-600')}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-ink-800">{title}</h3>
                <p className="text-[13px] text-ink-500 mt-1 leading-relaxed whitespace-pre-line">{message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost-mission flex-1" onClick={onClose}>取消</button>
              <button className={cn('flex-1 inline-flex items-center justify-center gap-2 !py-2.5 rounded-xl text-[14px] font-semibold text-white', danger ? 'bg-gradient-to-br from-danger-400 to-danger-600' : 'btn-growth')} onClick={onConfirm}>
                <CheckCircle2 size={16} /> {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
