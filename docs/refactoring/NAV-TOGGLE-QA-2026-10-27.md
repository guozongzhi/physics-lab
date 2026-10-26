# 导航折叠入口去重验证

日期：2026-10-27。保留页头桌面折叠按钮，删除侧栏内重复按钮、未使用的回调参数与对应 CSS。手机的打开菜单和抽屉内关闭入口保留。

## 本机验证

环境：127.0.0.1:18100 / 独立测试库 18101，测试学生账户。Browser plugin not available，使用现有 CUA 的 Playwright/CDP。没有新增或修改正式数据。

- 1280×900：可见侧栏折叠按钮为 1；展开 aria-expanded=true、收起 false；刷新后折叠偏好保持。侧栏里的唯一 button 是仅手机显示的抽屉关闭按钮。
- 390×844：打开导航、抽屉关闭按钮和 Escape 均有效；关闭后 aria-hidden=true，焦点回到「打开导航菜单」。文档宽度 390，无横向溢出。
- 复核此前成果卡片遮挡修复：桌面三件精选作品均 object-fit=contain；标签栏底边不超过图片上边，标题上边不小于图片下边。手机同样分区显示，标题距图片底边 16px，无覆盖。
- 成果卡片仍可打开线圈 OBJ 详情，显示 3,936 顶点 / 7,824 面。
- 验收页 error/warn 为空。
- `npm run check`、`npm run test:locale`（1,309 词条）、`VITE_API_BASE_URL=/ npm run build`、`git diff --check` 通过。
- `npm run lint`：0 error，1 个原有警告，位于 ProjectCenter.tsx 的 closeKanban effect 依赖；本次未修改该页面。构建有原有模块静态/动态导入共存提示。

未实测真机 Safari。本次修改不涉及 API、数据模型、账号、作品内容或后端。
