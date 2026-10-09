# 现状审计与基线

日期：2026-10-08；提交：`ba8ae35`。本次检查覆盖前端路由、布局、代表页面、全部目录清单、数据引导、存储、日期处理、后端核心模型/依赖/路由/服务、测试配置及部署配置。UI 判断来自源码结构和样式，尚未做三角色的完整浏览器视觉走查；没有登录生产环境、读取生产数据库或验证生产权限。

## 1. 验证结果

| 检查 | 本次结果 | 解释 |
|---|---|---|
| Git 工作区 | 文档编写前干净 | 已有 design-system / features 是基线的一部分，应继续承接 |
| `npm run check` | 通过，退出码 0 | 类型可编译不等于交互和权限正确 |
| `npm run build` | 通过，退出码 0 | Vite 实际输出版本 6.4.3；仍有大包警告 |
| ESLint 全仓库 JSON 检查 | 170 errors / 8 warnings，ESLint 退出码 1 | 不应沿用文档中“约 160 告警”的历史描述；迁移模块要清零，存量按基线逐步消化 |
| 主业务 JS | 1,689.01 kB，gzip 259.79 kB | 来自本次 Vite 构建输出，不代表首屏下载量或用户实测耗时 |
| CSS | 129.15 kB，gzip 18.72 kB | 后续拆层和清理需比较实际构建结果 |
| 后端 pytest | 未能启动 | `backend/.venv/bin/python` 不存在，退出码 127；没有把历史用例数量当作通过结果 |
| 前端测试入口 | package.json 未配置 | 需要建立关键行为测试，而不是只靠类型检查 |

## 2. 已确认的问题

| 编号 / 优先级 | 代码证据 | 影响与重构方向 |
|---|---|---|
| A01 / P1 | `src/pages/TeacherGroups.tsx` 1539 行，TeacherSafety 1116 行，ProjectCenter 1061 行，GroupCommunicator 923 行 | 页面包含表单、计算、交互和业务操作；按场景拆组件、控制器、查询和命令 |
| A02 / P1 | `src/components/layout/MissionShell.tsx` 658 行，包含头像压缩、导航、顶栏与通知等 | 全局框架承载业务能力；布局、导航配置、账户菜单、通知、头像编辑分离 |
| A03 / P1 | `App.tsx` 逐页包布局，另有 6 个页面自行包 MissionShell | 当前是混合归属，不能认定现在仍渲染双层；统一为父布局 + Outlet，逐页移除内部包裹 |
| A04 / P0 | `syncQueue.ts` 直接执行 task().catch，无排队、持久化或回滚；coinStore.transferCoins 先改余额和本地流水，再后台写 | API 拒绝时本地仍显示成功结果；关键写入 await 服务端提交，失败保留输入并对齐权威数据 |
| A05 / P0 | `App.tsx` 无条件 initMockData；bootstrap 请求失败保留原 store 数据，最后仍 loaded=true | 在线页面可能残留本地/演示内容；在线与演示显式隔离，各资源暴露失败状态 |
| A06 / P0 | `sessionCleanup.ts` 清个人测验/流水，却保留 groups/users/projects 等；bootstrap 无会话代次检查 | 账号切换与旧异步响应存在污染风险；尚未动态复现，需补会话隔离测试 |
| A07 / P0 | `questionBankStore.ts` 审核池仅 localStorage，空列表会重新 seed；TeacherOverview 直接调用本地 approveQuestion | 跨浏览器审核不可共享，“审核完成”不代表后端已入库；建立正式题库审核资源并迁移存量 |
| A08 / P1 | `src/data/mockData.ts` 674 行，包含领域类型、存储键、种子数据；`src/types/index.ts` 另定义 User/Group/Question 等且结构不同 | 类型和演示数据耦合，多套模型易漂移；领域类型移到对应模块，传输 DTO 明确转换 |
| A09 / P1 | `apiClient.ts` 自动递归将 ISO 串转 Date；bootstrap 又用 reviveDates；后者对已带 Z/offset 字符串仍追加 Z | 存在无效日期路径；转为统一的 UTC 字符串 DTO，边界适配和显示格式分开 |
| A10 / P1 | `QuizPage.tsx` 跳转 `/theory`，App 没有该路由 | 完成/返回可能进入 404；集中路径生成，检查所有导航目标 |
| A11 / P1 | index.css + tailwind.config.js + design-system/tokens 三套样式入口；Dialog 仍用 physics 类，新卡片使用 slate/mission | 新旧视觉语义混用；建立唯一 token 来源和兼容层，再替换旧组件 |
| A12 / P1 | tokens 使用 z-60；新卡片使用 mission-950 / energy-950，而配置未定义这些扩展 | class 存在不代表生成 CSS；构建产物检查 token 覆盖，清理无效工具类 |
| A13 / P1 | `components/ui/Dialog.tsx` 支持 Escape，但没有 role=dialog、aria-modal、焦点圈定/恢复 | 键盘及读屏体验不完整；作为设计系统优先修复项 |
| A14 / P1 | App 静态导入全部页面；目前主要 vendor 分包 | 业务页没有按路由拆包；迁移时增加 lazy 与加载/异常边界，不能只提高包体警告阈值 |
| A15 / P0 | require_teacher 仅检查角色；coins 列表/排名读取全量数据；部分业务读接口仅认证 | 班级范围不是统一权限边界；公开排行榜是否允许跨班须明确，个人流水/名册等必须有资源范围约束 |
| A16 / P1 | 后端 models/schemas/services 集中；projects 路由同时含项目、招募、成果 | 业务域依赖不清；分模块、集中规则/权限/事务，避免复制结算逻辑 |
| A17 / P0 | database.py 启动期 create_all + 手写 ALTER；ClassMeta 多处固定 db.get(...,1) | 迁移缺少版本记录；班级模型与全局活动配置语义不一致，先确认产品语义再迁移 |
| A18 / P1 | README 与 CLAUDE 对 `/` 同源部署是否需重建的说明不一致；DESIGN 的 syncQueue 被描述成离线队列 | 文档已漂移；代码确定后的事实写入 DESIGN，部署说明以实际值为准 |

## 3. 需要核实，不能直接当作已证实缺陷

- 旧文档声称“重复入账/多个端点无幂等”。当前 coinStore 已改用 adjustGroupCoinsLocal；项目 done 已检查归属和 done 状态。不能将旧描述直接复述成现状。但并发重试、请求超时后的重复提交与数据库约束仍需专项测试。
- 两个 KanbanColumn 分处 `components/ui` 与 `components/project`，要比较行为、props 和引用后才决定合并。
- ClassComposition 未直接出现在路由中，但被 AdminConsole 内嵌使用；不能按“无路由”删除。
- `/theory/challenge` 与 `/theory/challenges` 当前是两个业务页面，不是重复拼写；保留功能，先明确导航含义。
- 是否存在真实的跨账号泄露、并发超扣、班级越权，需要用匿名测试数据验证；本次只确认缺少统一机制的代码位置。
- 当前视图只看到源码。暗色、移动端、课堂投屏、弹窗滚动、交互控件与实际数据可读性需阶段 0 截图验收。

## 4. 审计复现入口

从仓库根目录运行 `npm run check`、`npm run build`；统计 lint 使用 `./node_modules/.bin/eslint . -f json`，汇总各文件 errorCount/warningCount。恢复隔离的 backend/.venv 后，从 backend 运行 `.venv/bin/python -m pytest tests/ -q`。不要让测试连接真实本地或 Docker 数据库；现有 conftest 为内存 SQLite，并覆盖 get_db，后续还应覆盖启动过程。
