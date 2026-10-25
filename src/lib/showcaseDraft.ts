import type { ShowcaseCategory } from '@/types';

export interface ShowcaseForm {
  type: ShowcaseCategory;
  projectId: string;
  title: string;
  description: string;
  imageUrl: string;
  htmlContent: string;
}
export interface ShowcaseDraft { form: ShowcaseForm; editingId: string | null; savedAt: number }
const categories = ['photo', 'html', 'video', 'paper', 'model', 'award'];
export const showcaseDraftKey = (userId: string, groupId: string, origin: string) =>
  `plab_showcase_draft_v1:${encodeURIComponent(origin)}:${encodeURIComponent(userId)}:${encodeURIComponent(groupId)}`;
export const hasShowcaseDraft = (form: ShowcaseForm) =>
  Boolean(form.title || form.description || form.imageUrl || form.htmlContent || form.projectId);

export function readShowcaseDraft(storage: Storage, key: string, now = Date.now()): ShowcaseDraft | null {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null') as ShowcaseDraft | null;
    if (!value || !value.form || !Number.isFinite(value.savedAt) || now - value.savedAt > 7 * 86400000 ||
      !categories.includes(value.form.type) ||
      !['title', 'projectId', 'description', 'imageUrl', 'htmlContent'].every((key) => typeof value.form[key as keyof ShowcaseForm] === 'string') ||
      !(value.editingId === null || typeof value.editingId === 'string')) return null;
    return value;
  } catch { return null; }
}

export function writeShowcaseDraft(storage: Storage, key: string, form: ShowcaseForm, editingId: string | null): boolean {
  try {
    if (hasShowcaseDraft(form)) storage.setItem(key, JSON.stringify({ form, editingId, savedAt: Date.now() }));
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}
