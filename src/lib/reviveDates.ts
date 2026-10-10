/**
 * 把后端返回的日期字符串反序列化为 Date（前端类型多处使用 Date）。
 * 供 bootstrap 与各 store 在重拉后端数据后统一复用。
 */
export function reviveDates<T extends object>(items: T[], dateKeys: string[]): T[] {
  return items.map((item) => {
    const clone = { ...item } as Record<string, unknown>;
    for (const key of dateKeys) {
      const raw = clone[key];
      if (!raw) continue;
      // 后端 datetime 是"无时区后缀"的 naive UTC 字符串（如 2026-09-09T13:00:45）
      // 追加 Z 按 UTC 解析，输出由 Date 按本地时区显示，避免 8 小时偏移。
      clone[key] = new Date(
        typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) ? `${raw}Z` : raw as string | number
      );
    }
    return clone as T;
  });
}
