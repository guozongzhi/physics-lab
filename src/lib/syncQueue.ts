/**
 * 后端写同步辅助。
 *
 * 设计目标：让各 store 的写方法保持“同步接口”（UI 层零改动、返回值语义不变），
 * 同时在启用后端时把写操作持久化到 FastAPI 后端。
 *
 * 策略：乐观更新 + 后台同步。
 *   - store 方法先在本地内存/localStorage 完成状态更新并同步返回；
 *   - 若 apiEnabled，则在后台 fire-and-forget 调用后端 API；
 *   - 在线写入依次执行，并以服务端快照纠正乐观状态；无法重拉时清空业务快照。
 *
 * 未启用后端时（apiEnabled=false），syncToApi 直接跳过，行为与原离线模式一致。
 */
import { apiEnabled, getToken } from './apiClient';
import { useUIStore } from '../store/uiStore';

type Task = () => Promise<unknown>;

let lastError: { at: number; message: string } | null = null;
let lastToastAt = 0;
let queued: Promise<void> = Promise.resolve();
let sessionVersion = 0;

export function resetSyncQueue(): void {
  sessionVersion++;
  queued = Promise.resolve();
  lastError = null;
  lastToastAt = 0;
}

export function getLastSyncError() {
  return lastError;
}

/**
 * 在后台执行一次后端写操作（fire-and-forget）。
 *
 * @param task    实际的 API 调用（返回 Promise）
 * @param label   用于日志的可读标签
 */
export function syncToApi(task: Task, label: string): void {
  if (!apiEnabled) return;
  const version = sessionVersion;
  const token = getToken();
  // 顺序执行写入；每次以服务端数据覆盖乐观状态，避免失败后保留虚假的余额/记录。
  queued = queued.then(async () => {
    if (version !== sessionVersion || token !== getToken()) return;
    await task();
    if (version !== sessionVersion || token !== getToken()) return;
    const { bootstrapFromApi } = await import('./bootstrap');
    await bootstrapFromApi(true);
  }).catch(async (err: unknown) => {
    if (version !== sessionVersion || token !== getToken()) return;
    const message = err instanceof Error ? err.message : String(err);
    lastError = { at: Date.now(), message: `${label}: ${message}` };
    console.warn(`[sync] ${label} 同步后端失败：`, message);
    // 提示用户（节流，避免连发刷屏），让"表面改了但没入库"可见
    const now = Date.now();
    if (now - lastToastAt > 10000) {
      lastToastAt = now;
      useUIStore.getState().pushToast(`同步后端失败：${label}，请刷新或重试`, 'error');
    }
    try {
      const { bootstrapFromApi } = await import('./bootstrap');
      await bootstrapFromApi(true);
    } catch {
      if (version !== sessionVersion || token !== getToken()) return;
      const { clearBusinessData } = await import('./sessionCleanup');
      if (version !== sessionVersion || token !== getToken()) return;
      clearBusinessData();
      useUIStore.getState().pushToast('无法确认服务器状态，请重新连接后刷新页面', 'error');
    }
  });
}
