import { parseApiDate } from './dateReviver';

/** 对显式日期字段做同一套转换，重复调用不会损坏已有 Date 或时区。 */
export function reviveDates<T extends object>(items: T[], dateKeys: string[]): T[] {
  return items.map((item) => {
    const clone = { ...item } as Record<string, unknown>;
    for (const key of dateKeys) clone[key] = parseApiDate(clone[key]);
    return clone as T;
  });
}
