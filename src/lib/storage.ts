export const LS_KEYS = {
  GROUPS: 'plab_groups',
  CURRENT_USER: 'plab_current_user',
  TOPICS: 'plab_topics',
  QUESTIONS: 'plab_questions',
  QUIZ_SESSIONS: 'plab_quiz_sessions',
  CHALLENGES: 'plab_challenges',
  PROJECTS: 'plab_projects',
  RECRUITMENTS: 'plab_recruitments',
  COIN_TXS: 'plab_coin_txs',
  SHOWCASE: 'plab_showcase',
  CLASS_META: 'plab_class_meta',
} as const;


export function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** 在线会话结束时移除业务缓存。与 store 解耦，401 处理亦可安全调用。 */
export function clearSessionStorage(): void {
  try {
    for (const key of [
      ...Object.values(LS_KEYS), 'plab_users_cache', 'plab_safety_questions',
    ]) localStorage.removeItem(key);
  } catch {
    /* 存储不可用时由内存状态和登录跳转收尾 */
  }
}
