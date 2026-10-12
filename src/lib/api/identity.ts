import { api } from '../apiClient';
import type { Group, SchoolClass, User } from '../../types';

// ---------- Auth (self-service) ----------
export const authApi = {
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post<{ ok: boolean }>('/api/auth/change-password', { oldPassword, newPassword }),
};

// ---------- Classes ----------
export const classesApi = {
  list: () => api.get<SchoolClass[]>('/api/classes'),
  create: (name: string) => api.post<SchoolClass>('/api/classes', { name }),
  rename: (id: string, name: string) => api.patch<SchoolClass>(`/api/classes/${id}`, { name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/classes/${id}`),
  listStudents: (classId: string) => api.get<User[]>(`/api/classes/${classId}/students`),
  uploadStudents: (classId: string, students: { name: string; username?: string; password?: string }[]) =>
    api.post<User[]>(`/api/classes/${classId}/students/batch`, { students }),
  deleteStudent: (userId: string) => api.delete<{ ok: boolean }>(`/api/students/${userId}`),
  /**
   * 教师把一个学生的密码重置为系统初始密码（学生忘记密码时的唯一出路）。
   * 新密码由服务端从配置取，这里不传——返回值带上重置后的密码，方便老师转告学生。
   */
  resetStudentPassword: (userId: string) =>
    api.post<{ ok: boolean; password: string }>(`/api/students/${userId}/password/reset`),
};

// ---------- Admin: Teacher management ----------
export interface TeacherInfo {
  id: string;
  username: string;
  name: string;
  avatar: string;
}

export const teachersApi = {
  list: () => api.get<TeacherInfo[]>('/api/teachers'),
  create: (username: string, password: string, name?: string) =>
    api.post<TeacherInfo>('/api/teachers', { username, password, name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/teachers/${id}`),
  resetPassword: (id: string, password: string) =>
    api.patch<{ ok: boolean }>(`/api/teachers/${id}/password`, { password }),
};

// ---------- Groups / Users ----------
export const groupsApi = {
  list: (classId?: string) =>
    api.get<Group[]>(`/api/groups${classId ? `?class_id=${classId}` : ''}`),
  create: (name: string, initialCoins: number, classId?: string) =>
    api.post<Group>('/api/groups', { name, initialCoins, classId }),
  rename: (id: string, name: string) => api.patch<Group>(`/api/groups/${id}`, { name }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/api/groups/${id}`),
  updateContribution: (groupId: string, ratioRecord: Record<string, number>) =>
    api.put<Group>(`/api/groups/${groupId}/contribution`, { ratioRecord }),
  setLeader: (groupId: string, userId: string) =>
    api.put<{ ok: boolean }>(`/api/groups/${groupId}/leader/${userId}`),
  /** 教师调币；note 为发放/扣除理由，会写进流水并对学生可见 */
  adjustCoins: (groupId: string, delta: number, note?: string) =>
    api.post<{ balanceAfter: number }>(`/api/groups/${groupId}/coins`, { delta, note }),
  resetCoins: (targetCoins: number) =>
    api.post<{ ok: boolean; count: number; targetCoins: number }>('/api/groups/reset-coins', { targetCoins }),
  join: (groupId: string) => api.post<User>(`/api/groups/${groupId}/join`),
};

export const usersApi = {
  list: (groupId?: string) =>
    api.get<User[]>(`/api/users${groupId ? `?group_id=${groupId}` : ''}`),
  listByClass: (classId: string) =>
    api.get<User[]>(`/api/users?class_id=${classId}`),
  listUnassigned: () => api.get<User[]>('/api/users?unassigned=true'),
  get: (userId: string) => api.get<User>(`/api/users/${userId}`),
  updateAvatar: (userId: string, avatar: string) =>
    api.put<User>(`/api/users/${userId}/avatar`, { avatar }),
  assignGroup: (userId: string, groupId: string | null, role: 'leader' | 'member' = 'member') =>
    api.put<User>(`/api/users/${userId}/group`, { groupId, role }),
  adjustCoins: (userId: string, delta: number, note?: string) =>
    api.post<{ ok: boolean; personalCoins: number }>(`/api/users/${userId}/coins`, { delta, note }),
  resetEarned: (userId: string) =>
    api.post<{ ok: boolean; userId: string }>(`/api/users/${userId}/earned-reset`),
};

// ---------- Admin: Group class transfer ----------
export const adminGroupsApi = {
  moveClass: (groupId: string, classId: string) =>
    api.patch<Group>(`/api/groups/${groupId}/class`, { classId }),
};
