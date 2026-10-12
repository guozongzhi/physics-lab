import { create } from 'zustand';
import type { Project, ProjectStatus, Recruitment, RecruitmentBid, ShowcaseItem, SafetyCategory, EquipmentItem } from '../types';
import { LS_KEYS, loadLS, saveLS } from '../lib/storage';
import { useCoinStore } from './coinStore';
import { useGroupStore } from './groupStore';
import { projectsApi, recruitmentsApi, showcaseApi, groupsApi, usersApi, coinsApi } from '../lib/apiService';
import { syncToApi } from '../lib/syncQueue';
import { reviveDates } from '../lib/reviveDates';
import { windowState, windowClosedMessage } from '../lib/activityWindow';

type PartialProject = Partial<Project> & {
  title: string;
  topic: string;
  ownerGroupId: string;
};

type PartialRecruitment = Partial<Recruitment> & {
  projectId: string;
  title: string;
  description: string;
  reward: number;
  deadline: Date;
};

type PartialShowcaseItem = Partial<ShowcaseItem> & {
  title: string;
  coverImage: string;
  groupId: string;
};

interface ProjectState {
  projects: Project[];
  recruitments: Recruitment[];
  showcaseItems: ShowcaseItem[];
  createProject: (partial: PartialProject) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  updateStatus: (id: string, status: ProjectStatus) => void;
  setProgress: (id: string, progressVal: number) => void;
  markProjectDone: (id: string) => void;
  createRecruitment: (partial: PartialRecruitment) => Recruitment;
  placeBid: (recruitmentId: string, bid: Omit<RecruitmentBid, 'bidAt'>) => void;
  assignRecruitment: (recruitmentId: string, userId: string) => void;
  resolveRecruitment: (
    recruitmentId: string,
    result: 'success' | 'partial' | 'fail'
  ) => void;
  markSafetyPass: (projectId: string, userId: string) => void;
  addShowcaseItem: (item: PartialShowcaseItem) => ShowcaseItem;
  /**
   * 修改作品。学生改本组作品后状态置回 pending（需重新审批）；
   * 教师/管理员改则传 keepStatus=true 保留原状态（本人就是审批人）。
   */
  updateShowcaseItem: (
    id: string,
    patch: Partial<Pick<ShowcaseItem, 'title' | 'coverImage' | 'description' | 'category'>>,
    keepStatus?: boolean
  ) => void;
  /** 教师/管理员下架作品；已奖励的能量币不回滚 */
  deleteShowcaseItem: (id: string) => void;
  /** 教师审批：approve 可带 coins 奖励该小组，reject 必带 reason */
  reviewShowcaseItem: (
    id: string,
    action: 'approve' | 'reject',
    coins?: number,
    reason?: string
  ) => void;
  toggleShowcaseLove: (showcaseId: string, userId: string) => void;
  getProjectById: (projectId: string) => Project | undefined;
  getRecruitmentsByProject: (projectId: string) => Recruitment[];
}

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// 后端重拉后的日期反序列化包装（camelCase 字段与前端类型对齐）。
const reviveProjectDates = (items: Project[]) =>
  reviveDates(items, ['startDate', 'dueDate']);
const reviveRecruitmentDates = (items: Recruitment[]) =>
  reviveDates(items, ['deadline']);
const reviveShowcaseDates = (items: ShowcaseItem[]) =>
  reviveDates(items, ['createdAt']);

/**
 * 结算类操作（项目完成 / 招募裁决）后，后端已改动小组余额、个人币与交易流水。
 * 这里重拉这些数据并注入 group/coin store，纠正本地乐观结算与后端的差异。
 */
async function refetchAfterSettlement(): Promise<void> {
  const [groups, users, coinTxs] = await Promise.all([
    groupsApi.list(),
    usersApi.list(),
    coinsApi.transactions(),
  ]);
  useGroupStore.setState({ groups, users });
  useCoinStore.setState({ coinTxs: reviveDates(coinTxs, ['createdAt']) });
}

const inferSafetyCategory = (equipmentList: EquipmentItem[]): SafetyCategory => {
  const cats = new Set(equipmentList.map((e) => e.category));
  const mapping: Record<string, SafetyCategory> = {
    electric: 'electric',
    thermal: 'thermal',
    optical: 'optical',
    mechanical: 'mechanical',
    radiation: 'radiation',
    chemical: 'chemical',
  };
  const matched = Array.from(cats)
    .map((c) => mapping[c])
    .filter(Boolean) as SafetyCategory[];
  if (matched.length === 0) return 'mechanical';
  if (matched.length === 1) return matched[0];
  return 'combined';
};

export const useProjectStore = create<ProjectState>((set, get) => {
  const initialProjects = loadLS<Project[]>(LS_KEYS.PROJECTS, []);
  const initialRecruitments = loadLS<Recruitment[]>(LS_KEYS.RECRUITMENTS, []);
  const initialShowcase = loadLS<ShowcaseItem[]>(LS_KEYS.SHOWCASE, []);

  const persist = (
    projects: Project[],
    recruitments: Recruitment[],
    showcaseItems: ShowcaseItem[]
  ) => {
    saveLS(LS_KEYS.PROJECTS, projects);
    saveLS(LS_KEYS.RECRUITMENTS, recruitments);
    saveLS(LS_KEYS.SHOWCASE, showcaseItems);
  };

  return {
    projects: initialProjects,
    recruitments: initialRecruitments,
    showcaseItems: initialShowcase,

    getProjectById: (projectId) => get().projects.find((p) => p.id === projectId),

    getRecruitmentsByProject: (projectId) =>
      get().recruitments.filter((r) => r.projectId === projectId),

    createProject: (partial) => {
      const { projects, recruitments, showcaseItems } = get();
      const equipList = partial.equipmentList || [];
      const project: Project = {
        id: `proj_${uid()}`,
        title: partial.title,
        topic: partial.topic,
        ownerGroupId: partial.ownerGroupId,
        startDate: partial.startDate || new Date(),
        dueDate: partial.dueDate || new Date(Date.now() + 30 * 86400000),
        progress: partial.progress || 0,
        status: partial.status || 'planning',
        techPoints: partial.techPoints || '',
        difficulties: partial.difficulties || '',
        equipmentList: equipList,
        safetyCategory: partial.safetyCategory || inferSafetyCategory(equipList),
        safetyPassed: partial.safetyPassed || {},
        photos: partial.photos || [],
        results: partial.results || '',
        rewardCoins: partial.rewardCoins ?? 200,
      };
      const next = [...projects, project];
      persist(next, recruitments, showcaseItems);
      set({ projects: next });
      // 后端生成自己的 ID 与 ownerGroupId（取自 JWT），创建成功后重拉对齐本地。
      syncToApi(async () => {
        await projectsApi.create({
          title: project.title,
          topic: project.topic,
          techPoints: project.techPoints,
          difficulties: project.difficulties,
          equipmentList: project.equipmentList,
          dueDate: (project.dueDate instanceof Date
            ? project.dueDate
            : new Date(project.dueDate)
          ).toISOString(),
          rewardCoins: project.rewardCoins,
          ownerGroupId: project.ownerGroupId,
        });
        const fresh = await projectsApi.list();
        set({ projects: reviveProjectDates(fresh) });
      }, 'projects.create');
      return project;
    },

    updateProject: (id, patch) => {
      const { projects, recruitments, showcaseItems } = get();
      const next = projects.map((p) => (p.id === id ? { ...p, ...patch } : p));
      persist(next, recruitments, showcaseItems);
      set({ projects: next });
      // 日期字段需序列化为 ISO 字符串后再发送给后端。
      syncToApi(() => {
        const body: Record<string, unknown> = { ...patch };
        if (patch.dueDate !== undefined) {
          const d = patch.dueDate;
          body.dueDate = (d instanceof Date ? d : new Date(d)).toISOString();
        }
        return projectsApi.update(id, body as Partial<Project>);
      }, 'projects.update');
    },

    deleteProject: (id) => {
      const { projects, recruitments, showcaseItems } = get();
      const next = projects.filter((p) => p.id !== id);
      const nextRecruitments = recruitments.filter((r) => r.projectId !== id);
      persist(next, nextRecruitments, showcaseItems);
      set({ projects: next, recruitments: nextRecruitments });
      syncToApi(() => projectsApi.remove(id), 'projects.remove');
    },

    updateStatus: (id, status) => {
      const { projects, recruitments, showcaseItems } = get();
      const next = projects.map((p) => (p.id === id ? { ...p, status } : p));
      persist(next, recruitments, showcaseItems);
      set({ projects: next });
      syncToApi(() => projectsApi.updateStatus(id, status), 'projects.updateStatus');
    },

    setProgress: (id, progressVal) => {
      const { projects, recruitments, showcaseItems } = get();
      const val = Math.max(0, Math.min(100, progressVal));
      const next = projects.map((p) => (p.id === id ? { ...p, progress: val } : p));
      persist(next, recruitments, showcaseItems);
      set({ projects: next });
      syncToApi(() => projectsApi.updateProgress(id, val), 'projects.updateProgress');
    },

    markProjectDone: (id) => {
      const { projects, recruitments, showcaseItems } = get();
      let doneProject: Project | null = null;
      const nextProjects = projects.map((p) => {
        if (p.id === id) {
          doneProject = { ...p, status: 'done' as ProjectStatus, progress: 100 };
          return doneProject;
        }
        return p;
      });
      if (doneProject) {
        // 本地乐观结算（仅更新内存 UI）；后端 markDone 端点内部完成正式记账。
        useCoinStore.getState().settleProjectDone(doneProject);
      }
      persist(nextProjects, recruitments, showcaseItems);
      set({ projects: nextProjects });
      // 后端会同时结算金币，完成后重拉小组/交易以对齐余额。
      syncToApi(async () => {
        await projectsApi.markDone(id);
        await refetchAfterSettlement();
      }, 'projects.markDone');
    },

    createRecruitment: (partial) => {
      // 窗口关闭时不能发布新招募（但已发的照常投标、分配、结算）
      if (!windowState(useGroupStore.getState().classMeta).recruit) {
        throw new Error(windowClosedMessage('recruit'));
      }
      const { projects, recruitments, showcaseItems } = get();
      const ownerGroupId = projects.find((p) => p.id === partial.projectId)?.ownerGroupId;
      const recruitment: Recruitment = {
        id: `rec_${uid()}`,
        projectId: partial.projectId,
        title: partial.title,
        description: partial.description,
        skills: partial.skills || [],
        reward: partial.reward,
        deadline: partial.deadline,
        status: 'open',
        bids: [],
        escrowPaid: partial.reward,
      };
      // 酬劳即押金：发布时就扣下。本地乐观更新；在线时后端还会独立扣一次权威记账。
      // 不扣的话结算就成了凭空发币，「失败」一档更会让发包组白得一笔没付过的钱。
      if (ownerGroupId) {
        useCoinStore.getState().addTx(ownerGroupId, {
          source: 'recruit',
          refId: recruitment.id,
          delta: -partial.reward,
          note: `招募「${partial.title}」预扣押金`,
        });
      }
      const next = [...recruitments, recruitment];
      persist(projects, next, showcaseItems);
      set({ recruitments: next });
      syncToApi(async () => {
        await recruitmentsApi.create({
          projectId: recruitment.projectId,
          title: recruitment.title,
          description: recruitment.description,
          skills: recruitment.skills,
          reward: recruitment.reward,
          deadline: (recruitment.deadline instanceof Date
            ? recruitment.deadline
            : new Date(recruitment.deadline)
          ).toISOString(),
        });
        const fresh = await recruitmentsApi.list();
        set({ recruitments: reviveRecruitmentDates(fresh) });
      }, 'recruitments.create');
      return recruitment;
    },

    placeBid: (recruitmentId, bid) => {
      // 投标也算"新开局"：窗口关闭时不许接新活
      if (!windowState(useGroupStore.getState().classMeta).recruit) {
        throw new Error(windowClosedMessage('recruit'));
      }
      const { projects, recruitments, showcaseItems } = get();
      const next = recruitments.map((r) => {
        if (r.id !== recruitmentId) return r;
        const newBid: RecruitmentBid = { ...bid, bidAt: new Date() };
        return { ...r, bids: [...r.bids, newBid] };
      });
      persist(projects, next, showcaseItems);
      set({ recruitments: next });
      syncToApi(
        () =>
          recruitmentsApi.bid(recruitmentId, {
            userId: bid.userId,
            skillDesc: bid.skillDesc,
            hours: bid.hours,
          }),
        'recruitments.bid'
      );
    },

    assignRecruitment: (recruitmentId, userId) => {
      const { projects, recruitments, showcaseItems } = get();
      const next: Recruitment[] = recruitments.map((r) =>
        r.id === recruitmentId
          ? { ...r, status: 'assigned' as const, assigneeUserId: userId }
          : r
      );
      persist(projects, next, showcaseItems);
      set({ recruitments: next });
      syncToApi(() => recruitmentsApi.assign(recruitmentId, userId), 'recruitments.assign');
    },

    resolveRecruitment: (recruitmentId, result) => {
      const { projects, recruitments, showcaseItems } = get();
      const target = recruitments.find((r) => r.id === recruitmentId);
      let paid = 0;
      if (target) {
        // 本地乐观结算；后端 resolve 端点内部完成正式记账。
        const proj = get().projects.find((p) => p.id === target.projectId);
        paid = useCoinStore.getState().settleRecruitment(target, result, proj?.ownerGroupId).assigneePay;
      }
      const next: Recruitment[] = recruitments.map((r) => {
        if (r.id !== recruitmentId) return r;
        const updated: Recruitment = {
          ...r,
          status: (result === 'fail' ? 'failed' : 'done') as Recruitment['status'],
          result,
          // 记实际付出去的钱：押金不足或中标学生没有小组时会少于理论值
          actualPay: paid,
        };
        return updated;
      });
      persist(projects, next, showcaseItems);
      set({ recruitments: next });
      syncToApi(async () => {
        await recruitmentsApi.resolve(recruitmentId, result);
        await refetchAfterSettlement();
      }, 'recruitments.resolve');
    },

    markSafetyPass: (projectId, userId) => {
      const { projects, recruitments, showcaseItems } = get();
      const next = projects.map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, safetyPassed: { ...p.safetyPassed, [userId]: true } };
      });
      persist(next, recruitments, showcaseItems);
      set({ projects: next });
      // 后端以当前 JWT 用户记录安全认证通过（忽略传入 userId）。
      syncToApi(() => projectsApi.markSafetyPass(projectId), 'projects.markSafetyPass');
    },

    addShowcaseItem: (partial) => {
      const { projects, recruitments, showcaseItems } = get();
      const item: ShowcaseItem = {
        id: `showcase_${uid()}`,
        projectId: partial.projectId || '',
        title: partial.title,
        coverImage: partial.coverImage,
        groupId: partial.groupId,
        description: partial.description || '',
        loves: 0,
        lovedBy: [],
        createdAt: new Date(),
        // 本地乐观新增即为待审批，与后端 create 行为一致
        status: 'pending',
        rejectReason: '',
        awardedCoins: 0,
        category: partial.category || 'photo',
      };
      const next = [...showcaseItems, item];
      persist(projects, recruitments, next);
      set({ showcaseItems: next });
      syncToApi(async () => {
        await showcaseApi.create({
          projectId: item.projectId || undefined,
          title: item.title,
          coverImage: item.coverImage,
          groupId: item.groupId,
          description: item.description,
          category: item.category,
        });
        const fresh = await showcaseApi.list();
        set({ showcaseItems: reviveShowcaseDates(fresh) });
      }, 'showcase.create');
      return item;
    },

    updateShowcaseItem: (id, patch, keepStatus = false) => {
      const { projects, recruitments, showcaseItems } = get();
      // 本地乐观更新：学生改要重新送审（置回 pending、清驳回理由），教师改保留原状态
      const next = showcaseItems.map((s) =>
        s.id === id
          ? keepStatus
            ? { ...s, ...patch }
            : { ...s, ...patch, status: 'pending' as const, rejectReason: '' }
          : s
      );
      persist(projects, recruitments, next);
      set({ showcaseItems: next });
      syncToApi(async () => {
        await showcaseApi.update(id, patch);
        const fresh = await showcaseApi.list();
        set({ showcaseItems: reviveShowcaseDates(fresh) });
      }, 'showcase.update');
    },

    deleteShowcaseItem: (id) => {
      const { projects, recruitments, showcaseItems } = get();
      const next = showcaseItems.filter((s) => s.id !== id);
      persist(projects, recruitments, next);
      set({ showcaseItems: next });
      syncToApi(async () => {
        await showcaseApi.remove(id);
        const fresh = await showcaseApi.list();
        set({ showcaseItems: reviveShowcaseDates(fresh) });
      }, 'showcase.delete');
    },

    reviewShowcaseItem: (id, action, coins, reason) => {
      const { projects, recruitments, showcaseItems } = get();
      const next = showcaseItems.map((s) =>
        s.id === id
          ? {
              ...s,
              status: (action === 'approve' ? 'approved' : 'rejected') as ShowcaseItem['status'],
              rejectReason: action === 'reject' ? reason || '' : '',
              awardedCoins: action === 'approve' ? coins || 0 : s.awardedCoins,
            }
          : s
      );
      persist(projects, recruitments, next);
      set({ showcaseItems: next });
      syncToApi(async () => {
        await showcaseApi.review(id, { action, coins, reason });
        // 通过时会奖励小组能量币，必须重拉 groups/coinTxs，否则能量与流水要手动刷新才变
        if (action === 'approve') await refetchAfterSettlement();
      }, 'showcase.review');
    },

    toggleShowcaseLove: (showcaseId, userId) => {
      const { projects, recruitments, showcaseItems } = get();
      const uidStr = String(userId);
      const next = showcaseItems.map((s) => {
        if (s.id !== showcaseId) return s;
        const loved = s.lovedBy.includes(uidStr);
        if (loved) {
          return {
            ...s,
            loves: Math.max(0, s.loves - 1),
            lovedBy: s.lovedBy.filter((x) => x !== uidStr),
          };
        }
        return { ...s, loves: s.loves + 1, lovedBy: [...s.lovedBy, uidStr] };
      });
      persist(projects, recruitments, next);
      set({ showcaseItems: next });
      syncToApi(() => showcaseApi.toggleLove(showcaseId), 'showcase.toggleLove');
    },
  };
});
