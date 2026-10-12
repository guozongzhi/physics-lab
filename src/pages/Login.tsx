import '@/design-system/styles/login.css';
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
  ArrowRight,
  Users,
  Mail,
  UserPlus,
  Info,
  Globe2,
  Menu,
  X,
  Play,
  ChevronRight,
  BookOpen,
  FlaskConical,
  BarChart3,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';
import LoginCredentials from '@/components/auth/LoginCredentials';
import LoginInfoDialog, { LoginInfoTopic } from '@/components/auth/LoginInfoDialog';
import { apiEnabled, getLoginPersistence, setLoginPersistence } from '@/lib/apiClient';
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

  const [remember, setRemember] = useState(getLoginPersistence);
  const [infoTopic, setInfoTopic] = useState<LoginInfoTopic | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
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
      setLoginPersistence(remember);
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
    setLoginPersistence(remember);
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
    setLoginPersistence(remember);
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

  const enterLogin = () => {
    setInfoTopic(null);
    setMenuOpen(false);
    document.querySelector<HTMLInputElement>('.login-form-card input')?.focus();
  };
  const openInfo = (topic: LoginInfoTopic) => { setMenuOpen(false); setInfoTopic(topic); };

  return (
    <main className="login-stage">
      <div className="login-shell">
        <header className="login-header">
          <div className="login-brand">
            <div className="login-brand-icon"><Rocket size={30} strokeWidth={1.5} aria-hidden="true" /></div>
            <div><strong>物理任务指挥中心</strong><span>PBL 高中物理探究平台</span></div>
          </div>
          <nav className="login-desktop-nav" aria-label="平台导航">
            {(['探索', '项目', '社区', '帮助'] as const).map((item) => <button key={item} type="button" onClick={() => openInfo(item)}>{item}</button>)}
            <div className="login-language">
              <button type="button" aria-expanded={languageOpen} aria-controls="login-language-menu" onClick={() => setLanguageOpen((value) => !value)}><Globe2 size={20} />简体中文<ChevronDown size={15} /></button>
              {languageOpen && <div id="login-language-menu" className="login-language-menu"><button type="button" onClick={() => setLanguageOpen(false)} aria-label="当前语言：简体中文">✓ 简体中文</button></div>}
            </div>
          </nav>
          <button type="button" className="login-menu-toggle" aria-label={menuOpen ? '关闭导航' : '打开导航'} aria-expanded={menuOpen} aria-controls="login-mobile-nav" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={26} /> : <Menu size={26} />}</button>
          {menuOpen && <nav className="login-mobile-nav" id="login-mobile-nav" aria-label="手机平台导航">
            {(['探索', '项目', '社区', '帮助'] as const).map((item) => <button key={item} type="button" onClick={() => openInfo(item)}>{item}<ChevronRight size={17} /></button>)}
          </nav>}
        </header>
        <div className="login-content">
          <section className="login-hero-panel" aria-labelledby="login-hero-title">
            <p className="login-kicker">用 探 究 连 接 真 实 世 界<span /></p>
            <h1 id="login-hero-title">探索物理世界<span className="login-hero-accent">点亮科学发现</span></h1>
            <p className="login-hero-description">围绕 11 步完整学习闭环，结合 AI 自学、<br className="login-mobile-break" />能量币激励<br className="login-desktop-break" />与真实实验项目，构建沉浸式<br className="login-mobile-break" />高中物理创新指挥中心。</p>
            <div className="login-journey">
              <span><BookOpen size={26} />理论探索</span><i />
              <span><Users size={26} />小组协作</span><i />
              <span><FlaskConical size={26} />实验项目</span><i />
              <span><BarChart3 size={26} />成果展示</span>
            </div>
          </section>
          <div className="login-orbit-labels" aria-hidden="true">
            <svg className="login-orbit-path" viewBox="0 0 1054 694" preserveAspectRatio="none"><path d="M 458 6 C 420 42 478 44 473 59 C 468 94 430 122 442 158 S 479 216 547 249 C 594 274 658 286 730 288" /><path d="M 473 59 C 552 105 623 163 757 188" /></svg>
            <span className="login-orbit-explore"><i />探索<small>EXPLORE</small></span>
            <span className="login-orbit-experiment"><i />实验<small>EXPERIMENT</small></span>
            <span className="login-orbit-discover"><i />发现<small>DISCOVER</small></span>
          </div>
          <section className={`login-form-card ${studentMode === 'register' && tab === 'student' ? 'login-register-card' : ''}`} aria-label="登录入口">
            <div className="login-role-tabs" role="group" aria-label="选择登录身份">
              <button type="button" aria-pressed={tab === 'student'} className={tab === 'student' ? 'is-active' : ''} onClick={() => setTab('student')}><UserCircle2 size={22} />学生入口</button>
              <button type="button" aria-pressed={tab === 'teacher'} className={tab === 'teacher' ? 'is-active' : ''} onClick={() => setTab('teacher')}><GraduationCap size={23} />教师入口</button>
            </div>
            <div className="login-card-heading">
              <h2>{tab === 'teacher' ? '欢迎回到教师任务指挥台' : studentMode === 'register' ? '开启你的科学探索之旅' : '欢迎回到物理任务指挥中心'}</h2>
              <p>{tab === 'teacher' ? '管理班级，陪伴每一次科学发现' : '选择身份，开启你的探索之旅'}</p>
            </div>
            {tab === 'teacher' || (apiEnabled && studentMode === 'login') ? <>
              <LoginCredentials teacher={tab === 'teacher'} identifier={tab === 'teacher' ? teacherUsername : credId}
                password={tab === 'teacher' ? teacherPwd : credPwd}
                onIdentifierChange={(value) => { if (tab === 'teacher') { setTeacherUsername(value); setTeacherErr(''); } else { setCredId(value); setCredErr(''); } }}
                onPasswordChange={(value) => { if (tab === 'teacher') { setTeacherPwd(value); setTeacherErr(''); } else { setCredPwd(value); setCredErr(''); } }}
                remember={remember} onRememberChange={setRemember} onForgotPassword={() => openInfo('帮助')}
                onSubmit={tab === 'teacher' ? handleTeacherLogin : handleCredentialLogin}
                submitting={submitting} error={tab === 'teacher' ? teacherErr : credErr} />
              <div className="login-register-entry">
                <div className="login-divider"><span />或<span /></div>
                {tab === 'student' ? <button type="button" className="login-secondary" onClick={() => { setStudentMode('register'); setStudentErr(''); }}><UserPlus size={22} />注册新账号</button> : <button type="button" className="login-secondary" onClick={() => openInfo('帮助')}><Info size={22} />账号登录帮助</button>}
              </div>
              <div className="login-account-hint"><Info size={20} /><p>{tab === 'teacher' ? '教师和管理员请使用分配的账号登录。忘记密码请联系系统管理员进行重置。' : '请使用教师分配的用户名和初始密码登录；预置演示账号使用编号（例如 u-01），不是姓名。登录不上请联系老师。'}</p></div>
            </> : studentMode === 'register' && apiEnabled ? <div className="login-register-fields space-y-4">
              <button type="button" className="login-back" onClick={() => { setStudentMode('login'); setRegErr(''); }}>← 返回账号登录</button>
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

            </div> : <div className="login-offline-fields space-y-4">
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

            </div>}
          </section>
        </div>
        <button type="button" className="login-product-intro" onClick={() => openInfo('产品介绍')}>
          <span className="login-play-icon"><Play size={24} fill="currentColor" /></span>
          <span><strong>观看产品介绍</strong><small>1 分钟了解平台如何助力你的物理探究之旅</small></span><ChevronRight size={23} />
        </button>
      </div>
      <LoginInfoDialog topic={infoTopic} onClose={() => setInfoTopic(null)} onEnter={enterLogin} />
    </main>
  );
}
