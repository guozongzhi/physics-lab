import { api } from '../apiClient';
import type { Project, Recruitment, ShowcaseCategory, ShowcaseItem } from '../../types';

// ---------- Projects / Recruitments / Showcase ----------
export const projectsApi = {
  list: () => api.get<Project[]>('/api/projects'),
  get: (id: string) => api.get<Project>(`/api/projects/${id}`),
  create: (payload: Omit<Partial<Project>, 'dueDate'> & { title: string; topic: string; dueDate?: string | Date }) =>
    api.post<Project>('/api/projects', payload),
  update: async (id: string, payload: Partial<Project>) => {
    if (payload.status !== 'done') return api.put<Project>(`/api/projects/${id}`, payload);
    // 教师表单仍可选择完成；把编辑与正式结算分开，不能绕过发奖端点。
    const current = await api.get<Project>(`/api/projects/${id}`);
    const fields = { ...payload };
    delete fields.status;
    const updated = await api.put<Project>(`/api/projects/${id}`, fields);
    return current.status === 'done' ? updated : api.post<Project>(`/api/projects/${id}/done`);
  },
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/projects/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put<Project>(`/api/projects/${id}/status`, { status }),
  updateProgress: (id: string, progress: number) =>
    api.put<Project>(`/api/projects/${id}/progress`, { progress }),
  markDone: (id: string) => api.post<Project>(`/api/projects/${id}/done`),
  markSafetyPass: (id: string) => api.post<Project>(`/api/projects/${id}/safety-pass`),
};

export const recruitmentsApi = {
  list: (projectId?: string) =>
    api.get<Recruitment[]>(`/api/recruitments${projectId ? `?project_id=${projectId}` : ''}`),
  create: (payload: {
    projectId: string;
    title: string;
    description: string;
    skills: string[];
    reward: number;
    deadline: string;
  }) => api.post<Recruitment>('/api/recruitments', payload),
  bid: (recId: string, payload: { userId: string; skillDesc: string; hours: number }) =>
    api.post<Recruitment>(`/api/recruitments/${recId}/bid`, payload),
  assign: (recId: string, userId: string) =>
    api.put<Recruitment>(`/api/recruitments/${recId}/assign`, { userId }),
  resolve: (recId: string, result: 'success' | 'partial' | 'fail') =>
    api.put<Recruitment>(`/api/recruitments/${recId}/resolve`, { result }),
};

export const showcaseApi = {
  list: () => api.get<ShowcaseItem[]>('/api/showcase'),
  create: (payload: {
    projectId?: string;
    title: string;
    htmlContent?: string;
    coverImage: string;
    groupId: string;
    description?: string;
    category: ShowcaseCategory;
  }) => api.post<ShowcaseItem>('/api/showcase', payload),
  toggleLove: (showcaseId: string) =>
    api.post<ShowcaseItem>(`/api/showcase/${showcaseId}/love`),
  /** 学生修改本组作品（改后置回待审批）；教师/管理员修改则保留原状态 */
  update: (
    showcaseId: string,
    payload: { htmlContent?: string; title?: string; coverImage?: string; description?: string; category?: ShowcaseCategory }
  ) => api.put<ShowcaseItem>(`/api/showcase/${showcaseId}`, payload),
  /** 教师下架作品；已奖励的能量币不回滚 */
  remove: (showcaseId: string) => api.delete<{ ok: boolean }>(`/api/showcase/${showcaseId}`),
  /** 教师审批：通过时可带 coins 奖励该小组；驳回时必须带 reason */
  review: (
    showcaseId: string,
    payload: { action: 'approve' | 'reject'; coins?: number; reason?: string }
  ) => api.post<ShowcaseItem>(`/api/showcase/${showcaseId}/review`, payload),
};
