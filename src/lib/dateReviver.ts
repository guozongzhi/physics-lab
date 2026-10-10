/**
 * 全局 ISO 日期智能反序列化解析器
 * 自动识别 ISO 8601 格式，无时区标记时规范为 UTC 并转为 JS Date 对象
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export function autoReviveDate(value: unknown): unknown {
  if (typeof value === "string") {
    if (ISO_DATE_REGEX.test(value)) {
      // 若无时区后缀，补充 'Z' 确保按绝对 UTC 解析，规避东八区本地时间解析偏移
      const normalized = value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value)
        ? value
        : `${value}Z`;
      const date = new Date(normalized);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(autoReviveDate);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = autoReviveDate((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  return value;
}
