import type { ClassMeta } from '@/data/mockData';

export type WindowKind = 'challenge' | 'recruit' | 'transfer';

/**
 * 教师可控的开放窗口 —— 前端镜像。
 *
 * 与后端 `services.window_state` 是同一套规则，必须保持一致：
 * - 窗口**只挡新开局**（建挑战 / 发招募 / 投标 / 发起转账），已开的照常作答与结算
 * - `closesAt` 为空＝不限时；到点是惰性判定，不需要定时器
 * - 组间转账不单设开关：任一窗口开着即视为"课上有监督"
 */
/**
 * 把后端的时间串解析成时间戳。
 *
 * 后端的 datetime 列是**无时区的 UTC 字面值**（SQLite 不保存 tz），`isoformat()` 出来的
 * 字符串不带 Z。JS 的 `new Date('2026-09-30T05:50:32')` 会按**本地时间**解析，
 * 在东八区就整体偏 8 小时——窗口的"开/关"会因此判错（曾经真的判错：13:50 关闭的窗口
 * 在 13:21 就被显示成"已关闭"）。所以这里对没有时区后缀的串补一个 Z，明确按 UTC 解析。
 */
function parseUtc(v: string | Date): number {
  if (v instanceof Date) return v.getTime();
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(v);
  return new Date(hasZone ? v : `${v}Z`).getTime();
}

function windowOpen(
  open: boolean | undefined,
  closesAt: string | Date | null | undefined,
  now: number
): boolean {
  // 缺字段按"开着"处理：旧 localStorage 里没有这两个字段，
  // 与后端迁移回填成"开着"是同一个口径——上线不能把现有功能突然锁上。
  if (open === false) return false;
  if (!closesAt) return true;
  const t = parseUtc(closesAt);
  return Number.isNaN(t) || now < t;
}

/** 把 closesAt 显示成手机/电脑上的本地时间（HH:MM）。 */
export function formatCloseTime(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const t = parseUtc(v);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function windowState(
  meta: ClassMeta | undefined,
  now: number = Date.now()
): Record<WindowKind, boolean> {
  const challenge = windowOpen(meta?.challengeWindowOpen, meta?.challengeWindowClosesAt, now);
  const recruit = windowOpen(meta?.recruitWindowOpen, meta?.recruitWindowClosesAt, now);
  return { challenge, recruit, transfer: challenge || recruit };
}

/** 窗口关闭时给学生看的话术，与后端 detail 文案一致。 */
export const WINDOW_LABELS: Record<WindowKind, string> = {
  challenge: '挑战窗口',
  recruit: '招募窗口',
  transfer: '组间转账',
};

export function windowClosedMessage(kind: WindowKind): string {
  return `${WINDOW_LABELS[kind]}已关闭，请联系老师开放`;
}
