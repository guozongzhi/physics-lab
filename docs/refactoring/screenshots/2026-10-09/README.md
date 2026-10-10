# 2026-10-09 第一批重构后的 UI 截图

环境：本地 Vite 演示模式，无真实账户或生产数据；Chrome 无头模式，亮色主题。每张均为完整页面截图。浏览器检查详情见 [report.json](report.json)。

| 场景 | 视口 | 截图 |
|---|---:|---|
| 学生首页 | 1440×900 | [student-dashboard.png](student-dashboard.png) |
| 学生能量榜 | 1440×900 | [student-energy.png](student-energy.png) |
| 教师总览 | 1440×900 | [teacher-overview.png](teacher-overview.png) |
| 教师分组 | 1440×900 | [teacher-groups.png](teacher-groups.png) |
| 管理控制台空状态 | 1440×900 | [admin-console.png](admin-console.png) |
| 学生首页手机 | 390×844 | [student-mobile.png](student-mobile.png) |

复现：用 `VITE_API_BASE_URL= npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` 启动前端；安装 Python Playwright 后运行 `scripts/capture-refactor-ui.py`。脚本为每个角色创建独立浏览器上下文，在本地演示模式下写入演示登录态并截图，同时检查页面错误、重复布局和横向溢出。默认使用 macOS 的 Google Chrome；可通过 `UI_CAPTURE_CHROME`、`UI_CAPTURE_BASE_URL` 改路径和本地地址。截图只用于这个工作区，不使用生产登录信息。
