# 聚焦式 UI 视觉打磨

[设计参考图](concept.png)用于确定主次关系、配色、项目图像和卡片密度；[学生首页最终截图](student-dashboard.png)是 React 应用在本地演示模式下的真实渲染。参考图由 Image Gen 生成，不作为产品界面或截图证明。最终页面保留代码原生文字、控件和真实路由。

| 场景 | 视口 | 截图 |
|---|---:|---|
| 学生首页 | 1440×900 | [student-dashboard.png](student-dashboard.png) |
| 学生手机首页 | 390×844 | [student-mobile.png](student-mobile.png) |
| 学生完整总览 | 1440×900 | [student-full-overview.png](student-full-overview.png) |
| 教师首页 | 1440×900 | [teacher-overview.png](teacher-overview.png) |
| 教师数据驾驶舱 | 1440×900 | [teacher-analytics.png](teacher-analytics.png) |
| 教师分组 | 1440×900 | [teacher-groups.png](teacher-groups.png) |
| 管理控制台 | 1440×900 | [admin-console.png](admin-console.png) |
| 学生能量榜 | 1440×900 | [student-energy.png](student-energy.png) |

[浏览器检查记录](report.json)覆盖八个场景的页面错误、重复壳层和横向溢出。复现方式见[前一版截图说明](../2026-10-09-focused/README.md)，将 `UI_CAPTURE_OUTPUT` 改为本目录即可。

## 视觉对照

| 检查点 | 参考图 | 最终渲染 |
|---|---|---|
| 主次关系 | 当前项目最大、学习卡次之 | 两张主卡保留，项目卡用实物图像形成视觉锚点 |
| 信息架构 | Hero → 下一步 → 四个任务 → 完整总览 | 顺序与可点击入口一致 |
| 字体与数值 | 姓名、能量与主要任务标题突出 | 姓名和指标放大，次级任务卡压缩 |
| 配色与材质 | 深蓝导航、亮色内容、少量暖色能量点缀 | 沿用深蓝/毛玻璃，铜色来自项目图像；保留现有语义色 |
| 响应式 | 参考图为桌面屏 | 手机屏单列主卡与任务卡，无横向溢出 |

有意差异：参考图的星球与轨道装饰未加入产品，避免压过教学信息。电动机图像只在项目标题包含“电动机”时展示；其他课题仍使用深色主卡，避免图文不符。图像为示意视觉，不代表项目实际制作成果。
