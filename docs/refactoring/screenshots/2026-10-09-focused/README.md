# 聚焦式卡片首页截图

环境：本地 Vite 演示模式、Chrome 无头浏览器、亮色主题；没有使用真实账户或生产数据。截图均为完整页面。[report.json](report.json) 记录运行时错误、重复布局和横向溢出检查；可与[上版沉浸式首页](../2026-10-09-immersive/README.md)对照。

| 场景 | 视口 | 截图 |
|---|---:|---|
| 学生聚焦首页 | 1440×900 | [student-dashboard.png](student-dashboard.png) |
| 学生完整总览 | 1440×900 | [student-full-overview.png](student-full-overview.png) |
| 学生手机首页 | 390×844 | [student-mobile.png](student-mobile.png) |
| 教师聚焦首页 | 1440×900 | [teacher-overview.png](teacher-overview.png) |
| 教师数据驾驶舱 | 1440×900 | [teacher-analytics.png](teacher-analytics.png) |
| 教师分组 | 1440×900 | [teacher-groups.png](teacher-groups.png) |
| 管理控制台卡片入口 | 1440×900 | [admin-console.png](admin-console.png) |
| 学生能量榜 | 1440×900 | [student-energy.png](student-energy.png) |

复现：启动 `VITE_API_BASE_URL= npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`，再运行 `UI_CAPTURE_OUTPUT=docs/refactoring/screenshots/2026-10-09-focused UI_CAPTURE_INCLUDE_DETAILS=1 /tmp/physicsclass-browser/bin/python scripts/capture-refactor-ui.py`。Python 路径需替换成已安装 Playwright 的环境。
