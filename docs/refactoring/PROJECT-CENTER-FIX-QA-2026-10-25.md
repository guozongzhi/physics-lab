# 课题中心任务点击、器材录入与安全准入打通验证记录

- 日期：2026-10-25
- 关联问题：课题中心项目卡片点击无法进入工作台、器材清单显示「暂未录入器材」且无录入入口、安全状态卡片无法跳转安全考核
- 对应分支：`codex/showcase-html-editor` (PR #3)

---

## 1. 修复内容

1. **课题卡片点击进入看板**：
   - 修复在 `/projects` 下点击课题卡片时，未联动任务工作台的问题。
   - 区分「选择并聚焦右侧面板」与「进入完整任务看板」；点击已选中卡片、点击卡片右下角「进入看板 >」或点击右侧常驻「进入课题任务看板」主按钮时，直接拉起完整任务看板弹窗 (`workspace-dialog-panel`)。
   - 路由状态与 `?kanban=1` 参数绑定，避免页面组件重载时弹窗被重置。

2. **器材清单管理打通**：
   - 在右侧「概览」面板为本组成员及教师提供「录入器材 / 管理器材」入口与弹窗 (`equipModalOpen`)。
   - 支持动态新增器材、指定数量与安全分类（电气、热学、光学、机械、辐射、化学），并与后端 `/api/projects/{id}` 及本地 `updateProject` 自动重算 `safetyCategory`。
   - 在教师端「项目 & 招募管理」（`TeacherProjects`）新建与编辑弹窗中补齐器材清单增删配置。

3. **安全准入考核直达**：
   - 将右侧「安全状态」卡片改为交互式按钮，点击直接导航至 `/projects/:id/safety`，进入安全考核全真题库流程。

4. **参与小组与招募任务联动**：
   - 参与小组支持一键直达 `/my-team` 或按组筛选。
   - 招募任务集成 `RecruitDialog`，组长与教师可直接发布跨组任务；点击已有招募项直接跳转 `/projects/:id/recruit/:rid` 悬赏市场详情。

5. **技术要点与进度在线维护**：
   - 「技术要点」Tab 映射真实 `techPoints` 与 `difficulties`，组员与教师可在线编辑保存并滑动调整项目进度百分比。

---

## 2. 真实浏览器自动化测试结果 (`scripts/test-project-browser.mjs`)

通过 Google Chrome Headless 模式与 CDP (Chrome DevTools Protocol) 在本地 Vite 独立服务 (`http://127.0.0.1:4173`) 真实跑通 4 项端到端用例：

- **用例 1（课题中心页面加载）**：成功加载 `/projects`，10 项物理课题卡片完整渲染。
- **用例 2（卡片点击进入任务看板）**：点击课题卡片成功展开 `workspace-dialog-panel` 任务看板，标题与任务清单一致。
- **用例 3（器材管理弹窗与录入）**：成功弹出「实验器材清单」对话框，录入器材名称并完成分类选择与保存。
- **用例 4（安全状态点击跳转考核）**：点击安全卡片，页面成功跳转至 `/projects/proj-01/safety`，并加载综合类实验安全规范试题。

测试截图已归档至 `docs/test-artifacts/`：
- `01-project-center-main.png`
- `02-project-kanban-dialog.png`
- `03-equipment-editor-modal.png`
- `04-safety-exam-navigation.png`
