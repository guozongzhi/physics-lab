import { clearSessionStorage } from './storage';
import { autoReviveDate } from './dateReviver';

/**
 * 后端 API 客户端。
 *
 * - 通过环境变量 VITE_API_BASE_URL 指定后端地址（如 http://localhost:8000）。
 * - 未配置时 apiEnabled 为 false，前端保持原有 localStorage 离线模式，零影响。
 * - JWT 根据自动登录选择存于 localStorage 或 sessionStorage，自动附加到 Authorization 头。
 */

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();

// "/" 表示与前端同源：请求走相对路径（/api/...），由 nginx 同源代理到后端，天然无 CORS。
// 这样同一个构建产物在 IP、域名、localhost 下都能直接用，换地址无需重新构建。
// 其余值按绝对地址处理（本地开发时指 http://localhost:8080）。
const API_BASE = RAW_BASE === '/' ? '' : RAW_BASE.replace(/\/$/, '');

export const apiEnabled = Boolean(RAW_BASE);

const TOKEN_KEY = 'plab_token';
const REMEMBER_KEY = 'plab_remember_login';

export function getLoginPersistence(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) === 'true'; } catch { return false; }
}

/** 在登录请求前设置；未设置的旧版本会话继续使用持久化存储。 */
export function setLoginPersistence(remember: boolean): void {
  try { localStorage.setItem(REMEMBER_KEY, String(remember)); } catch { /* ignore */ }
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) {
      const storage = localStorage.getItem(REMEMBER_KEY) === 'false' ? sessionStorage : localStorage;
      storage.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!apiEnabled) {
    throw new ApiError(0, 'API 未启用：请设置 VITE_API_BASE_URL');
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.ok && token && getToken() !== token) {
    throw new ApiError(409, '会话已切换，已忽略旧请求结果');
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let rawData: unknown;
  try {
    rawData = text ? JSON.parse(text) : undefined;
  } catch {
    // nginx 的 HTML 错误页仍保留 HTTP 状态；成功响应格式错则报契约错误。
    if (res.ok) throw new ApiError(res.status, '服务器返回了无效的 JSON');
  }

  if (res.ok && token && getToken() !== token) {
    throw new ApiError(409, '会话已切换，已忽略旧请求结果');
  }
  if (!res.ok) {
    if (res.status === 401 && token && getToken() === token) {
      // 旧账号迟到的 401 不得注销新账号；先处理状态，再解释响应正文。
      setToken(null);
      clearSessionStorage();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    const errorData = rawData && typeof rawData === 'object' ? rawData as Record<string, unknown> : null;
    const detail = errorData?.detail || errorData?.message || res.statusText;
    throw new ApiError(res.status, typeof detail === 'string' ? detail : '请求失败');
  }
  return autoReviveDate(rawData) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ---------- 类型 ----------
export interface LoginResult {
  accessToken: string;
  tokenType: string;
  userId: string;
  role: 'admin' | 'teacher' | 'student';
  classId: string | null;
  groupId: string | null;
  name: string;
  /** 该学生是否还在用统一初始密码（教师/管理员恒为 false）。用于首页提示改密。 */
  isDefaultPassword?: boolean;
}

// ---------- 认证 ----------
export async function apiLogin(username: string, password: string): Promise<LoginResult> {
  const result = await api.post<LoginResult>('/api/auth/login', { username, password });
  setToken(result.accessToken);
  return result;
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  classId: string;
  name?: string;
}

export async function apiRegister(payload: RegisterPayload): Promise<LoginResult> {
  const result = await api.post<LoginResult>('/api/auth/register', payload);
  setToken(result.accessToken);
  return result;
}

export function apiLogout(): void {
  setToken(null);
}
