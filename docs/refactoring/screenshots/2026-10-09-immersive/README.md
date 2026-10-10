# 沉浸式 UI 改版截图

环境：本地 Vite 演示模式、Chrome 无头浏览器、亮色主题；没有使用真实账户或生产数据。全部为完整页面截图。[report.json](report.json) 记录页面错误、重复布局和横向溢出检查。可与[改版前截图](../2026-10-09/README.md)对照。

| 场景 | 视口 | 截图 |
|---|---:|---|
| 学生首页 | 1440×900 | [student-dashboard.png](student-dashboard.png) |
| 学生能量榜 | 1440×900 | [student-energy.png](student-energy.png) |
| 教师总览 | 1440×900 | [teacher-overview.png](teacher-overview.png) |
| 教师分组 | 1440×900 | [teacher-groups.png](teacher-groups.png) |
| 管理控制台空状态 | 1440×900 | [admin-console.png](admin-console.png) |
| 学生首页手机 | 390×844 | [student-mobile.png](student-mobile.png) |

复现：运行 `VITE_API_BASE_URL= npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`，随后运行 `UI_CAPTURE_OUTPUT=docs/refactoring/screenshots/2026-10-09-immersive /tmp/physicsclass-browser/bin/python scripts/capture-refactor-ui.py`。`UI_CAPTURE_OUTPUT` 是可选参数；未设置时脚本使用第一批重构截图目录。
