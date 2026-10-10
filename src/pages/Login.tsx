import { applyAvatarFallback } from '@/lib/imageFallback';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  UserCircle2,
  Lock,
  ChevronDown,
  Sparkles,
  Rocket,
  Zap,
  ShieldCheck,
  ArrowRight,
  Users,
  BookOpen,
  Mail,
  UserPlus,
  Info,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import { apiEnabled } from '@/lib/apiClient';
import { classesApi } from '@/lib/apiService';
import { bootstrapFromApi } from '@/lib/bootstrap';

export default function Login() {
  const navigate = useNavigate();
  const loginTeacher = useAuthStore((s) => s.loginTeacher);
  const loginStudent = useAuthStore((s) => s.loginStudent);
  const loginWithApi = useAuthStore((s) => s.loginWithApi);
  const registerWithApi = useAuthStore((s) => s.registerWithApi);
  const groups = useGroupStore((s) => s.groups);
  const users = useGroupStore((s) => s.users);

  const [tab, setTab] = useState<'teacher' | 'student'>('student');
  // 学生入口内的子模式：login（选组登录）/ register（邮箱+用户名注册）
  const [studentMode, setStudentMode] = useState<'login' | 'register'>('login');
  const [teacherUsername, setTeacherUsername] = useState('teacher');
  const [teacherPwd, setTeacherPwd] = useState('');
  const [teacherErr, setTeacherErr] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [studentErr, setStudentErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 注册表单
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPwd, setRegPwd] = useState('');
  const [regClassId, setRegClassId] = useState('');
  const [regErr, setRegErr] = useState('');

  // 班级列表（注册时选班用）
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);

  // 凭证登录（用户名或邮箱 + 密码）
  const [credId, setCredId] = useState('');
  const [credPwd, setCredPwd] = useState('');
  const [credErr, setCredErr] = useState('');

  const groupUsers = useMemo(
    () => (selectedGroupId ? users.filter((u) => u.groupId === selectedGroupId) : []),
    [selectedGroupId, users]
  );

  // 进入注册模式时拉取班级列表（后端模式）
  useEffect(() => {
    if (!apiEnabled || tab !== 'student' || studentMode !== 'register') return;
    if (classes.length > 0) return;
    classesApi
      .list()
      .then((list) => {
        setClasses(list);
        if (list.length > 0) setRegClassId((prev) => prev || list[0].id);
      })
      .catch(() => setRegErr('班级列表加载失败，请刷新页面重试'));
  }, [tab, studentMode, classes.length]);

  const handleTeacherLogin = async () => {
    const username = teacherUsername.trim() || 'teacher';
    const candidate = teacherPwd.trim();
    if (!candidate) {
      setTeacherErr('请输入教师密码');
      return;
    }
    if (apiEnabled) {
      setSubmitting(true);
      try {
        const result = await loginWithApi(username, candidate);
        await bootstrapFromApi(true);
        setTeacherErr('');
        navigate(result.role === 'admin' ? '/admin' : '/teacher/overview');
      } catch (err: unknown) {
        setTeacherErr((err instanceof Error ? err.message : undefined) || '密码错误，请联系管理员获取密码');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // 离线模式
    if (candidate !== 'admin123') {
      setTeacherErr('密码错误，请联系管理员获取密码');
      return;
    }
    setTeacherErr('');
    loginTeacher();
    setTimeout(() => navigate('/teacher/overview'), 0);
  };

  const handleStudentLogin = () => {
    if (!selectedGroupId || !selectedUserId) {
      setStudentErr('请先选择小组和成员');
      return;
    }
    // 离线演示入口通过小组与成员选择身份；在线模式使用上方账号表单。
    setStudentErr('');
    loginStudent({ userId: selectedUserId, groupId: selectedGroupId });
    setTimeout(() => navigate('/dashboard'), 0);
  };

  const handleRegister = async () => {
    const email = regEmail.trim();
    const username = regUsername.trim();
    const password = regPwd;
    if (!email || !username || !password) {
      setRegErr('请填写邮箱、用户名和密码');
      return;
    }
    if (!regClassId) {
      setRegErr('请选择你所在的班级');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRegErr('邮箱格式不正确');
      return;
    }
    if (username.length < 2) {
      setRegErr('用户名至少 2 个字符');
      return;
    }
    if (password.length < 6) {
      setRegErr('密码至少 6 位');
      return;
    }
    setSubmitting(true);
    try {
      await registerWithApi({ email, username, password, classId: regClassId, name: regName.trim() || undefined });
      await bootstrapFromApi(true);
      setRegErr('');
      navigate('/dashboard');
    } catch (err: unknown) {
      setRegErr((err instanceof Error ? err.message : undefined) || '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCredentialLogin = async () => {
    const identifier = credId.trim();
    if (!identifier || !credPwd) {
      setCredErr('请输入用户名/邮箱和密码');
      return;
    }
    setSubmitting(true);
    try {
      await loginWithApi(identifier, credPwd);
      await bootstrapFromApi(true);
      setCredErr('');
      navigate('/dashboard');
    } catch (err: unknown) {
      setCredErr((err instanceof Error ? err.message : undefined) || '登录失败，请检查用户名/邮箱或密码');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-stage relative min-h-screen w-full overflow-hidden">
      {/* Background layers */}
      <div className="login-atmosphere absolute inset-0 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none opacity-80 bg-grid-fine"
        style={{ maskImage: 'radial-gradient(ellipse at center, #000 35%, transparent 85%)' }} />

      {/* Floating orbit decoration top-right */}
      <div className="absolute top-10 right-16 w-64 h-64 pointer-events-none opacity-60 hidden lg:block">
        <div className="orbit-ring w-64 h-64 animate-spin" style={{ animationDuration: '35s' }} />
        <div className="orbit-ring w-48 h-48 animate-spin" style={{ animationDuration: '22s', animationDirection: 'reverse' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-gradient-to-br from-mission-400 via-mission-500 to-nova-500 shadow-glowMission flex items-center justify-center">
          <Rocket size={18} className="text-white" />
        </div>
      </div>

      <div className="relative mx-auto max-w-[1400px] px-4 py-5 md:px-6 md:py-8">
      <div className="login-shell px-5 py-7 md:px-8 lg:px-10 lg:py-10">
        {/* Header LOGO */}
        <div className="flex items-center gap-3 mb-8 lg:mb-10">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="orbit-ring w-14 h-14 animate-spin" style={{ animationDuration: '18s' }} />
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-mission-400 via-mission-500 to-nova-500 shadow-glowMission flex items-center justify-center relative z-10">
              <Rocket size={19} className="text-white" />
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-[17px] font-extrabold text-ink-900 tracking-tight">物理任务指挥中心</div>
            <div className="text-[11px] text-ink-500 font-semibold tracking-wider">PBL 高中物理探究平台</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-center">
          {/* ============== LEFT SIDE: Hero ============== */}
          {/* min-w-0：网格子项默认 min-width:auto，不收缩就会被下方 11 步流程图顶宽 */}
          <div className="login-hero-panel order-2 lg:order-1 min-w-0">

            <h1 className="font-sans font-black leading-[1.08] tracking-tight text-[40px] md:text-[44px] lg:text-[48px] mb-6">
              <span className="block text-ink-900">进入物理研究基地</span>
              <span className="block bg-clip-text text-transparent bg-gradient-to-r from-mission-500 via-mission-600 to-nova-500">开启你的探索之旅</span>
            </h1>

            <p className="text-[17px] text-ink-500 leading-[1.75] mb-8 max-w-[560px] font-medium">
              围绕 <strong className="text-mission-700 font-bold">11 步完整学习闭环</strong>，结合
              <strong className="text-nova-600 mx-1 font-bold">AI 自学</strong>、<strong className="text-energy-600 mx-1 font-bold">能量币激励</strong>
              与真实实验项目，构建沉浸式高中物理创新指挥中心。
            </p>

            <div className="grid grid-cols-3 gap-3 mb-8 max-w-[500px]" aria-label="平台能力">
              <div className="login-metric-card">
                <div className="text-[22px] sm:text-[26px] font-black text-gradient-mission leading-none whitespace-nowrap">
                  11 步
                </div>
                <div className="mt-1.5 text-[11px] font-bold text-slate-500 tracking-wide flex items-center justify-center gap-1">
                  <BookOpen size={12} className="text-mission-500" />
                  <span>学习路径</span>
                </div>
              </div>

              <div className="login-metric-card">
                <div className="text-[22px] sm:text-[26px] font-black text-gradient-energy leading-none whitespace-nowrap">
                  协作
                </div>
                <div className="mt-1.5 text-[11px] font-bold text-slate-500 tracking-wide flex items-center justify-center gap-1">
                  <Users size={12} className="text-energy-500" />
                  <span>研究小组</span>
                </div>
              </div>

              <div className="login-metric-card">
                <div className="text-[22px] sm:text-[26px] font-black text-growth-600 leading-none whitespace-nowrap">
                  实验
                </div>
                <div className="mt-1.5 text-[11px] font-bold text-slate-500 tracking-wide flex items-center justify-center gap-1">
                  <ShieldCheck size={12} className="text-growth-500" />
                  <span>安全准入</span>
                </div>
              </div>
            </div>

            <div className="login-hero-window p-5 md:p-6 max-w-[540px]">
              <div className="login-hero-window-bg" />
              <div className="login-hero-window-overlay" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span className="text-[12px] font-bold text-sky-200 tracking-wide">
                      科学研究闭环
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-300">
                    从问题出发 · 走向真实探究
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="login-step-pill">
                    <span className="text-sky-300 font-bold">01</span>
                    <span>理论探索</span>
                  </div>
                  <div className="login-step-pill">
                    <span className="text-amber-300 font-bold">02</span>
                    <span>小组协作</span>
                  </div>
                  <div className="login-step-pill">
                    <div className="flex items-center gap-1">
                      <span className="text-emerald-300 font-bold">03</span>
                      <span>实验项目</span>
                    </div>
                  </div>
                  <div className="login-step-pill">
                    <span className="text-indigo-300 font-bold">04</span>
                    <span>成果展示</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ============== RIGHT SIDE: Login Card ============== */}
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
            <div className="w-full max-w-[460px]">
              <div className="login-form-card glass-card p-7 md:p-8 rounded-[28px] relative overflow-hidden shadow-2xl">
                {/* Decorative blobs */}
                <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-gradient-to-br from-mission-400/20 via-nova-400/15 to-transparent blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -left-20 w-60 h-60 rounded-full bg-gradient-to-tr from-energy-400/18 via-alert-400/10 to-transparent blur-3xl pointer-events-none" />

                <div className="relative">
                  {/* Tabs */}
                  <div className="p-1.5 rounded-2xl bg-mission-50/70 border border-mission-100/70 mb-7 flex gap-1.5">
                    <button
                      onClick={() => setTab('student')}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                        tab === 'student'
                          ? 'bg-gradient-to-br from-energy-400 to-alert-500 text-white shadow-lg shadow-energy-500/25'
                          : 'text-ink-500 hover:text-ink-800'
                      }`}
                    >
                      <UserCircle2 size={15} />
                      学生入口
                    </button>
                    <button
                      onClick={() => setTab('teacher')}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                        tab === 'teacher'
                          ? 'bg-gradient-to-br from-mission-500 to-nova-500 text-white shadow-lg shadow-mission-500/25'
                          : 'text-ink-500 hover:text-ink-800'
                      }`}
                    >
                      <GraduationCap size={15} />
                      教师入口
                    </button>
                  </div>

                  {/* Card Header */}
                  <div className="flex items-center gap-3 mb-7">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                      tab === 'teacher'
                        ? 'bg-gradient-to-br from-mission-400 to-nova-500 shadow-mission-500/25'
                        : 'bg-gradient-to-br from-energy-400 to-alert-500 shadow-energy-500/30'
                    }`}>
                      {tab === 'teacher' ? <GraduationCap size={22} className="text-white" /> : <UserCircle2 size={22} className="text-white" />}
                    </div>
                    <div>
                      <h2 className="text-[20px] font-black text-ink-900 leading-tight">
                        {tab === 'teacher' ? '教师指挥台' : '学生工作台'}
                      </h2>
                      <p className="text-[12px] text-ink-500 mt-0.5 font-medium">
                        {tab === 'teacher' ? '管理全班 · 发放能量币 · 审核项目' : '选择小组与身份 · 开启今日任务'}
                      </p>
                    </div>
                  </div>

                  {/* TEACHER FORM */}
                  {tab === 'teacher' ? (
                    <div className="space-y-4.5">
                      <div>
                        <label className="field-label flex items-center gap-1.5">
                          <UserCircle2 size={13} /> 用户名
                        </label>
                        <div className="relative">
                          <UserCircle2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mission-500 pointer-events-none" />
                          <input
                            type="text"
                            value={teacherUsername}
                            onChange={(e) => { setTeacherUsername(e.target.value); setTeacherErr(''); }}
                            className="input-field pl-9"
                            placeholder="教师用户名或管理员用户名"
                            onKeyDown={(e) => e.key === 'Enter' && handleTeacherLogin()}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label flex items-center gap-1.5">
                          <Lock size={13} /> 访问密码
                        </label>
                        <input
                          type="password"
                          value={teacherPwd}
                          autoComplete="new-password"
                          onChange={(e) => {
                            setTeacherPwd(e.target.value);
                            setTeacherErr('');
                          }}
                          className="input-field"
                          placeholder="请输入教师密码"
                          onKeyDown={(e) => e.key === 'Enter' && handleTeacherLogin()}
                        />
                        {teacherErr && <p className="mt-2 text-[12px] font-semibold text-danger-600 flex items-center gap-1">
                          <Lock size={11} />{teacherErr}
                        </p>}
                      </div>

                      <div className="pt-1.5 space-y-2.5">
                        <button onClick={handleTeacherLogin} className="btn-mission w-full !py-3.5 !text-[15px] shadow-glowMission">
                          <Rocket size={17} />
                          进入教师控制台
                          <ArrowRight size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTeacherPwd('')}
                          className="w-full text-[12px] font-semibold text-mission-600 hover:text-mission-700 bg-mission-50/70 border border-mission-100 rounded-xl !py-2 transition hover:bg-mission-50"
                        >
                          忘记密码？请联系管理员
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-500 font-medium">
                          <ShieldCheck size={12} className="text-growth-500" />
                          入口：<span className="text-growth-700 font-bold">教师与管理员</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-growth-500 animate-pulse" />
                          准备就绪
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* STUDENT FORM */
                    <div className="space-y-4.5">
                      {apiEnabled && (
                        <div className="p-1 rounded-xl bg-ink-50 border border-ink-100 flex gap-1">
                          <button
                            type="button"
                            onClick={() => { setStudentMode('login'); setRegErr(''); }}
                            className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                              studentMode === 'login'
                                ? 'bg-white text-energy-700 shadow-sm'
                                : 'text-ink-500 hover:text-ink-700'
                            }`}
                          >
                            <UserCircle2 size={14} />
                            账号登录
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStudentMode('register'); setStudentErr(''); }}
                            className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                              studentMode === 'register'
                                ? 'bg-white text-energy-700 shadow-sm'
                                : 'text-ink-500 hover:text-ink-700'
                            }`}
                          >
                            <UserPlus size={14} />
                            注册新账号
                          </button>
                        </div>
                      )}

                      {apiEnabled && studentMode === 'register' ? (
                        /* REGISTER FORM */
                        <>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <Mail size={13} /> 邮箱
                            </label>
                            <input
                              type="email"
                              value={regEmail}
                              autoComplete="email"
                              onChange={(e) => { setRegEmail(e.target.value); setRegErr(''); }}
                              className="input-field"
                              placeholder="you@example.com"
                              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                            />
                          </div>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <UserCircle2 size={13} /> 用户名（登录名）
                            </label>
                            <input
                              type="text"
                              value={regUsername}
                              autoComplete="username"
                              onChange={(e) => { setRegUsername(e.target.value); setRegErr(''); }}
                              className="input-field"
                              placeholder="2-32 个字符，用于登录"
                              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                            />
                          </div>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <Users size={13} /> 班级
                            </label>
                            <div className="relative">
                              <select
                                value={regClassId}
                                onChange={(e) => { setRegClassId(e.target.value); setRegErr(''); }}
                                className="input-field appearance-none pr-9 cursor-pointer"
                                disabled={classes.length === 0}
                              >
                                {classes.length === 0 ? (
                                  <option value="">加载班级中…</option>
                                ) : (
                                  classes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))
                                )}
                              </select>
                              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                            </div>
                          </div>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <Sparkles size={13} /> 显示名（选填）
                            </label>
                            <input
                              type="text"
                              value={regName}
                              onChange={(e) => { setRegName(e.target.value); setRegErr(''); }}
                              className="input-field"
                              placeholder="留空则默认使用用户名"
                              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                            />
                          </div>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <Lock size={13} /> 密码
                            </label>
                            <input
                              type="password"
                              value={regPwd}
                              autoComplete="new-password"
                              onChange={(e) => { setRegPwd(e.target.value); setRegErr(''); }}
                              className="input-field"
                              placeholder="至少 6 位"
                              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                            />
                            {regErr && (
                              <p className="mt-2 text-[12px] font-semibold text-danger-600 flex items-center gap-1">
                                <Lock size={11} />{regErr}
                              </p>
                            )}
                          </div>

                          <div className="pt-1.5">
                            <button
                              onClick={handleRegister}
                              disabled={submitting}
                              className="btn-mission w-full !py-3.5 !text-[15px] shadow-glowMission disabled:opacity-60"
                            >
                              <UserPlus size={17} />
                              {submitting ? '注册中…' : '创建账号并进入'}
                              <ArrowRight size={16} />
                            </button>
                          </div>

                          <p className="text-[11px] text-ink-500 font-medium leading-relaxed pt-1">
                            注册后暂未分配小组，登录后可由教师或组长加入研究小组。
                          </p>
                        </>
                      ) : (
                      <>
                      {apiEnabled && (
                        <>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <UserCircle2 size={13} /> 用户名 / 邮箱
                            </label>
                            <input
                              type="text"
                              value={credId}
                              autoComplete="username"
                              onChange={(e) => { setCredId(e.target.value); setCredErr(''); }}
                              className="input-field"
                              placeholder="输入注册的用户名或邮箱"
                              onKeyDown={(e) => e.key === 'Enter' && handleCredentialLogin()}
                            />
                          </div>
                          <div>
                            <label className="field-label flex items-center gap-1.5">
                              <Lock size={13} /> 密码
                            </label>
                            <input
                              type="password"
                              value={credPwd}
                              autoComplete="current-password"
                              onChange={(e) => { setCredPwd(e.target.value); setCredErr(''); }}
                              className="input-field"
                              placeholder="请输入密码"
                              onKeyDown={(e) => e.key === 'Enter' && handleCredentialLogin()}
                            />
                            {credErr && (
                              <p className="mt-2 text-[12px] font-semibold text-danger-600 flex items-center gap-1">
                                <Lock size={11} />{credErr}
                              </p>
                            )}
                          </div>
                          <div className="pt-0.5">
                            <button
                              onClick={handleCredentialLogin}
                              disabled={submitting}
                              className="btn-mission w-full !py-3.5 !text-[15px] shadow-glowMission disabled:opacity-60"
                            >
                              <Rocket size={17} />
                              {submitting ? '登录中…' : '登录并进入指挥中心'}
                              <ArrowRight size={16} />
                            </button>
                          </div>

                          <div className="flex items-center gap-3 py-1">
                            <div className="flex-1 h-px bg-ink-200/70" />
                            <span className="text-[11px] text-ink-400 font-semibold">或按小组快速登录（预置账号）</span>
                            <div className="flex-1 h-px bg-ink-200/70" />
                          </div>
                        </>
                      )}
                      {apiEnabled ? (
                        <div className="p-3.5 rounded-2xl bg-mission-50/70 border border-mission-100/70 flex items-start gap-2.5">
                          <Info size={15} className="text-mission-600 mt-0.5 shrink-0" />
                          <div className="text-[12px] leading-relaxed text-ink-600 font-medium">
                            请使用教师分配的用户名和初始密码登录；预置演示账号使用编号（例如 u-01），不是姓名。登录不上请联系老师。
                          </div>
                        </div>
                      ) : (
                      <>
                      <div>
                        <label className="field-label flex items-center gap-1.5">
                          <Users size={13} /> 选择所在研究小组
                        </label>
                        <div className="relative">
                          <select
                            value={selectedGroupId}
                            onChange={(e) => {
                              setSelectedGroupId(e.target.value);
                              setSelectedUserId('');
                              setStudentErr('');
                            }}
                            className="input-field appearance-none pr-11 cursor-pointer font-medium"
                          >
                            <option value="">-- 请选择研究小组 --</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                🚀 {g.name}  ({users.filter((u) => u.groupId === g.id).length}名成员)
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="field-label flex items-center gap-1.5">
                          <UserCircle2 size={13} /> 选择成员身份
                        </label>
                        <div className="relative">
                          <select
                            value={selectedUserId}
                            onChange={(e) => {
                              setSelectedUserId(e.target.value);
                              setStudentErr('');
                            }}
                            disabled={!selectedGroupId}
                            className="input-field appearance-none pr-11 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                          >
                            <option value="">
                              {selectedGroupId ? '-- 请选择成员 --' : '-- 请先选择小组 --'}
                            </option>
                            {groupUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.role === 'leader' ? '👑 ' : '👤 '}
                                {u.name} {u.role === 'leader' ? '(组长)' : `(成员 · ${u.personalCoins || 0}⚡)`}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                        </div>
                        {studentErr && (
                          <p className="mt-2 text-[12px] font-semibold text-danger-600 flex items-center gap-1">
                            <Lock size={11} />{studentErr}
                          </p>
                        )}
                      </div>

                      {/* Member preview */}
                      {selectedUserId && (
                        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-energy-50/70 to-alert-50/60 border border-energy-100/60 flex items-center gap-3">
                          {(() => {
                            const u = groupUsers.find((x) => x.id === selectedUserId);
                            return u ? (
                              <>
                                <img src={u.avatar} onError={applyAvatarFallback} alt={u.name} className="w-11 h-11 rounded-xl ring-2 ring-white shadow-sm bg-white object-cover" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[14px] font-extrabold text-ink-900">{u.name}</span>
                                    {u.role === 'leader' && <span className="chip-nova !py-0 !px-1.5 !text-[9px]">组长</span>}
                                  </div>
                                  <div className="text-[11px] text-ink-500 mt-0.5 font-medium flex items-center gap-1">
                                    <Zap size={10} className="text-energy-500" />
                                    个人能量：{u.personalCoins || 0}
                                  </div>
                                </div>
                                <div className="chip-energy !py-1 !px-2 !text-[10px]">
                                  <Sparkles size={9} />READY
                                </div>
                              </>
                            ) : null;
                          })()}
                        </div>
                      )}

                      <div className="pt-1.5">
                        <button
                          onClick={handleStudentLogin}
                          disabled={!selectedGroupId || !selectedUserId}
                          className="btn-mission w-full !py-3.5 !text-[15px] shadow-glowMission"
                        >
                          <Rocket size={17} />
                          进入指挥中心
                          <ArrowRight size={16} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-500 font-medium">
                          <Zap size={12} className="text-energy-500" />
                          初始能量：<span className="text-energy-700 font-bold">500 ⚡/组</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-mission-500 animate-pulse" />
                          Mission Ready
                        </div>
                      </div>
                      </>
                      )}
                      </>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-6 border-t border-ink-100/70 pt-4 text-center text-balance text-[11.5px] text-ink-400 font-medium leading-relaxed">
                  © Physics Mission Control · {apiEnabled ? '请使用分配的账号登录' : '学生请先选组后选成员'} · 教师密码请联系管理员获取
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
