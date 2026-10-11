import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate,
} from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { initMockData } from '@/data/mockData';
import { apiEnabled, getToken } from '@/lib/apiClient';
import { bootstrapFromApi } from '@/lib/bootstrap';
import { clearBusinessData } from '@/lib/sessionCleanup';
import { useUIStore } from '@/store/uiStore';
import AppShell from './layouts/AppShell';

const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const MyTeam = lazy(() => import('@/pages/MyTeam'));
const LearningHub = lazy(() => import('@/pages/LearningHub'));
const KnowledgeGalaxy = lazy(() => import('@/pages/KnowledgeGalaxy'));
const QuizPage = lazy(() => import('@/pages/QuizPage'));
const TheoryChallenge = lazy(() => import('@/pages/TheoryChallenge'));
const ProjectCenter = lazy(() => import('@/pages/ProjectCenter'));
const SafetyExam = lazy(() => import('@/pages/SafetyExam'));
const SafetyLab = lazy(() => import('@/pages/SafetyLab'));
const ResearchMarketplace = lazy(() => import('@/pages/ResearchMarketplace'));
const ResearchLeague = lazy(() => import('@/pages/ResearchLeague'));
const AchievementHall = lazy(() => import('@/pages/AchievementHall'));
const ResearchProfile = lazy(() => import('@/pages/ResearchProfile'));
const GroupCommunicator = lazy(() => import('@/pages/GroupCommunicator'));
const AdminConsole = lazy(() => import('@/pages/AdminConsole'));
const TeacherOverview = lazy(() => import('@/pages/TeacherOverview'));
const TeacherGroups = lazy(() => import('@/pages/TeacherGroups'));
const TeacherProjects = lazy(() => import('@/pages/TeacherProjects'));
const StudentRoster = lazy(() => import('@/pages/StudentRoster'));
const TeacherQuestionBank = lazy(() => import('@/pages/TeacherQuestionBank'));
const TeacherShowcaseReview = lazy(() => import('@/pages/TeacherShowcaseReview'));
const TeacherSafety = lazy(() => import('@/pages/TeacherSafety'));

function TeacherOnly() {
  const role = useAuthStore((s) => s.role);
  const location = useLocation();
  if (role !== 'teacher' && role !== 'admin') {
    return <Navigate to={role ? '/dashboard' : '/login'} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function AdminOnly() {
  const role = useAuthStore((s) => s.role);
  const location = useLocation();
  if (role !== 'admin') {
    return <Navigate to={role === 'teacher' ? '/teacher/overview' : role ? '/dashboard' : '/login'} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function DashboardRoleGate() {
  const role = useAuthStore((s) => s.role);
  if (role === 'teacher') return <Navigate to="/teacher/overview" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  return <Dashboard />;
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="glass-card max-w-md w-full p-10 text-center shadow-soft">
        <div className="w-24 h-24 rounded-full bg-danger-50 flex items-center justify-center mx-auto mb-6 border border-danger-100">
          <AlertTriangle className="w-12 h-12 text-danger-500" strokeWidth={1.8} />
        </div>
        <div className="font-mono text-6xl font-black text-mission-200 mb-2 tracking-tight">404</div>
        <h2 className="text-2xl font-extrabold text-ink-800 mb-2">坐标偏离航道</h2>
        <p className="text-ink-500 mb-6">你访问的研究舱可能已被迁移或不存在。</p>
        <div className="flex items-center justify-center gap-3">
          <button className="btn-mission" onClick={() => navigate('/dashboard')}>
            <Home className="w-4 h-4" /> 返回指挥中心
          </button>
          <button className="btn-ghost-mission" onClick={() => navigate(-1)}>返回上一站</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'ready' | 'error'>(
    apiEnabled && getToken() ? 'loading' : 'ready'
  );
  const loadSequence = useRef(0);

  const reloadBusinessData = useCallback(() => {
    const sequence = ++loadSequence.current;
    setBootstrapState('loading');
    clearBusinessData();
    void bootstrapFromApi(true)
      .then(() => { if (sequence === loadSequence.current) setBootstrapState('ready'); })
      .catch(() => { if (sequence === loadSequence.current) setBootstrapState('error'); });
  }, []);

  useEffect(() => {
    if (!apiEnabled) initMockData();
    initAuth();
    if (apiEnabled && getToken()) reloadBusinessData();
  }, [initAuth, reloadBusinessData]);

  useEffect(() => {
    if (!userId || !role) useUIStore.getState().clearToasts();
  }, [userId, role]);

  if (bootstrapState !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mission-50 p-6">
        <div className="glass-card max-w-md w-full p-8 text-center">
          <h1 className="font-serif text-xl font-bold text-mission-800 mb-3">
            {bootstrapState === 'loading' ? '正在加载研究数据…' : '研究数据加载失败'}
          </h1>
          {bootstrapState === 'error' && (
            <button className="btn-mission" onClick={reloadBusinessData}>重新加载</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Suspense fallback={<div role="status">页面加载中…</div>}><Login /></Suspense>} />
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardRoleGate />} />
          <Route path="my-team" element={<MyTeam />} />
          <Route path="theory" element={<Navigate to="/theory/topics" replace />} />
          <Route path="theory/topics" element={<LearningHub />} />
          <Route path="theory/topics/:id" element={<LearningHub />} />
          <Route path="theory/quiz/:sessionId" element={<QuizPage mode="quiz" />} />
          <Route path="theory/challenge" element={<KnowledgeGalaxy />} />
          <Route path="theory/challenge/:id/accept" element={<QuizPage mode="challenge" />} />
          <Route path="theory/challenges" element={<TheoryChallenge />} />
          <Route path="projects" element={<ProjectCenter />} />
          <Route path="projects/:id" element={<ProjectCenter />} />
          <Route path="projects/:id/safety" element={<SafetyExam />} />
          <Route path="projects/:id/recruit/:rid" element={<ResearchMarketplace />} />
          <Route path="safety-lab" element={<SafetyLab />} />
          <Route path="safety-exam/:category" element={<SafetyExam />} />
          <Route path="recruit/market" element={<ResearchMarketplace />} />
          <Route path="coins" element={<ResearchLeague />} />
          <Route path="showcase" element={<AchievementHall />} />
          <Route path="profile" element={<ResearchProfile />} />
          <Route path="group" element={<Navigate to="/communicator" replace />} />
          <Route path="communicator" element={<GroupCommunicator />} />
          <Route element={<TeacherOnly />}>
            <Route path="teacher/overview" element={<TeacherOverview />} />
            <Route path="teacher/groups" element={<TeacherGroups />} />
            <Route path="teacher/projects" element={<TeacherProjects />} />
            <Route path="teacher/roster" element={<StudentRoster />} />
            <Route path="teacher/question-bank" element={<TeacherQuestionBank />} />
            <Route path="teacher/showcase" element={<TeacherShowcaseReview />} />
            <Route path="teacher/safety" element={<TeacherSafety />} />
          </Route>
          <Route element={<AdminOnly />}>
            <Route path="admin" element={<AdminConsole />} />
          </Route>
        </Route>
        <Route element={<AppShell requireAuth={false} />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
