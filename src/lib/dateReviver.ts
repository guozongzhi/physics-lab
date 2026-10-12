/** 后端的无时区时间按 UTC 解析；保留明确时区，拒绝非法日期。 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export function parseApiDate(value: unknown): unknown {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) return value;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date;
}

// 只转换领域模型声明为 Date 的字段。投稿时间/反馈时间契约是 string，正文亦不能误转。
const DATE_FIELDS = new Set([
  'createdAt', 'startDate', 'dueDate', 'deadline', 'bidAt',
  'challengeWindowClosesAt', 'recruitWindowClosesAt',
]);

export function autoReviveDate(value: unknown): unknown {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(autoReviveDate);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, DATE_FIELDS.has(key) ? parseApiDate(item) : autoReviveDate(item),
    ]));
  }
  return value;
}
