# PhysicsClass 完整重构计划

状态：实施中；初版日期：2026-10-08；初版基线：`ba8ae35`。第一批进展见 [PROGRESS](PROGRESS.md)，初始事实见 [AUDIT](AUDIT.md)，实施任务与回归见 [BACKLOG](BACKLOG.md)。

## 1. 目标与范围

让学生能找到下一步学习任务，让教师能完成班级管理与审核，让开发者能在明确的业务模块中修改功能。重构必须同时改善 UI、数据正确性和代码可维护性。

本轮覆盖三角色页面、导航、设计系统、前端状态和 API 边界、后端模块/权限/事务、迁移和文档。保留现有 URL、业务数据、能量币规则和课堂活动能力；如要改变业务规则，应单独写明并验收。NFC 只预留设备访问边界，硬件设计仍位于仓库外的 nfc-energy-terminal-design；本轮不实现或部署硬件服务。

假设：继续按单仓库维护，由 1 名熟悉项目的开发者实施，课堂使用要求小批交付。实际班级数量、同时在线数和生产数据规模尚未采样；不以此前硬件设计的目标人数作为软件实测规模。暂保留 SQLite、同源 API 和 Docker Compose，不做微服务、SSR 或整套框架替换。数据库是否升级在完成并发结算测试后决定。

## 2. 架构决策

| 决策 | 选择与收益 | 代价 / 复议条件 |
|---|---|---|
| 前端组织 | app 负责组装；features 按业务域；design-system 无业务逻辑；shared 只放通用基础能力 | 需要迁移 import；不引入多层完整 FSD，避免每个简单组件都配一套目录 |
| 服务端数据 | 推荐新增 TanStack Query v5，承担查询、缓存与失效；Zustand 保留会话和 UI 状态 | 增加一项依赖与学习成本；先做首页只读试点，不与旧 store 双向镜像同一资源 |
| 演示模式 | 显式 online/demo 模式；各领域 adapter 共用契约，演示用隔离存储 | 双模式需测试；真实离线写业务另立项目，不把网络故障自动变成演示成功 |
| 后端 | FastAPI 模块化单体，领域 service + policy + schema + model | 不强制每个查询建立 repository；仅复杂/复用查询再抽取 |
| 数据库迁移 | 推荐 Alembic 版本化迁移，逐步替代启动 ALTER | 首次接管要检查旧库结构并演练，不可对未知库直接 stamp |
| UI 风格 | 承接已有 mission/energy 语义与 Bento；教学页面重清晰层级，管理页面重操作效率 | 老页面分批适配；允许名册/审核列表使用表格，装饰服从任务 |
| 接口 | 先保持已有路径与 camelCase，增加明确响应 schema 和领域 DTO mapper | 类型生成作为后续步骤；不同时改接口命名与页面结构 |

TanStack Query 官方将其定位为服务端状态的获取、缓存、同步和更新工具，适合替代当前手写全量引导及资源同步机制：[官方概览](https://tanstack.com/query/latest/docs/framework/react/overview)。Alembic 为 SQLAlchemy 提供版本化迁移脚本管理：[官方教程](https://alembic.sqlalchemy.org/en/latest/tutorial.html)。以上是本计划的技术选择，尚未安装。

## 3. UI 与信息架构

### 3.1 三角色导航

| 角色 | 一级分区 | 保留能力 / 页面 |
|---|---|---|
| 学生 | 首页 | 下一步任务、学习进度、个人与小组能量摘要 |
| 学生 | 学习 | LearningHub、KnowledgeGalaxy、TheoryChallenge、Quiz |
| 学生 | 实验 | ProjectCenter、安全学习/考核、成果 |
| 学生 | 协作 | MyTeam、GroupCommunicator、招募 |
| 学生 | 能量与成长 | ResearchLeague、ResearchProfile；个人/小组口径显式标注 |
| 教师 | 总览 | 所选班级指标、待处理任务、异常提示 |
| 教师 | 班级管理 | 名册、小组；保持两个 URL，可共享班级上下文和工具栏 |
| 教师 | 教学与审核 | 项目、题库、安全指派、成果审核 |
| 管理员 | 平台管理 | 班级、教师、学生、班级组成；保留 ClassComposition 内嵌行为 |

采用分区 + 二级菜单，不继续增加平铺入口。普通文案以中文为主，科研主题名称作为辅助，导航和页标题用同一个登记表。知识星系与挑战大厅有清楚的任务说明和互相入口，不直接删除其中一个。

### 3.2 统一布局与页面模板

- 路由根统一挂 AppShell 与角色守卫，页面只返回内容；由一个父路由渲染 Outlet。布局拥有 sidebar/topbar/mobile navigation，头像编辑属于 auth/profile，通知容器属于 app。
- PageHeader：标题、简短任务说明、当前班级/小组范围、最多一个突出主操作。按钮多时归入工具栏或“更多”。
- Overview 模板：行动摘要 → 当前任务 → 指标趋势 → 最近活动；首页不同时承担完整项目 CRUD。
- Collection 模板：范围/搜索/筛选 → 列表或表格 → 分页与空状态；教师名册需要信息密度和批量操作，不强制全部卡片化。
- Detail 模板：对象信息 → 状态与下一步 → 时间线/记录；现有详情 URL 如果暂为重定向，保留兼容，后续实现单独任务。
- Assessment 模板：独立答题区、进度、保存状态、提交确认、结果与正确返回路径；优先避免作答中意外跳转。
- 全页面具备 loading / empty / error / forbidden / ready 状态；更新另有 pending / success / failed。初次加载失败不能显示“0”或演示余额。
- 移动端折叠菜单，宽表格在自身容器横向滚动；桌面主内容最大宽度按页面模板选择，投屏数据保持文字可读。

### 3.3 设计系统

唯一 token 来源放在 design-system/tokens，先用 CSS variables 表达颜色、间距、圆角、阴影、层级和动效，Tailwind 配置引用相同语义。已有 Button/Badge/BentoCard/StatWidget 纳入审核后继续使用，不全盘替换。

基础组件：Button、Input、Select、Textarea、Checkbox、Tabs、Dialog、Drawer、Tooltip、Table、Pagination、Badge、Card、Skeleton、EmptyState、ErrorState。页面模式组件：PageHeader、FilterBar、MetricCard、ConfirmDialog、FormField、StatusBadge。CoinBadge、ProjectCard、RecruitDialog 是业务组件，应迁入对应 feature。

先统一组件行为，再替换外观：Dialog 要有焦点圈定、Esc、焦点恢复、可访问标题；表单要有 label、字段错误、提交错误；按钮有 disabled/pending，纯图标按钮有名称。可点击 Card 使用链接或按钮语义，状态不只用颜色表示。

旧 `.glass-card` / `.btn-*` / `.chip-*` 通过 compatibility.css 临时承接；迁移完组件并核实引用数为零才删除。index.css 最终仅做入口，样式分为 tokens.css、base.css、utilities.css、markdown.css 和临时 compatibility.css。禁止新增页面专用的全局选择器和未定义 class。

亮色作为初始验收基准，暗色必须通过相同场景后再交付。动效尊重 reduced-motion，数据变化不用无意义循环动画。字体提供系统回退；外部字体失败时不能影响阅读。

## 4. 前端目标结构与依赖规则

```text
src/
  app/
    App.tsx
    providers.tsx
    router/                 # routes、路径函数、角色导航登记表、守卫
    layouts/                # AppShell、Sidebar、Topbar、MobileNav
    session/                # 会话生命周期与数据清理协调
  design-system/
    tokens/
    components/
    patterns/               # 页面模板和通用交互组合
    styles/
  features/
    auth/                   # 登录、注册、改密、账户菜单
    classroom/              # 班级、名册、小组、班级组成
    learning/               # 主题、测验、挑战、题库创作与审核
    projects/               # 项目、进度、任务与安全前置条件
    safety/                 # 安全材料、指派、考核、认证
    collaboration/          # 招募、投标、分配、结算、组间沟通
    energy/                 # 个人/小组余额、流水、转账、排行榜
    showcase/               # 成果提交、审核、展示
    profile/                # 个人成长视图、头像能力
    dashboard/              # 学生首页聚合，只读组合与任务入口
    teaching/               # 教师总览聚合
    administration/         # 管理员页面组合
  shared/
    api/                    # transport、生成 DTO、错误类型
    lib/                    # UTC 日期、格式化、CSV、图像等无领域能力
    config/                 # 运行模式、存储命名空间
    testing/                # 通用测试设施
  demo/
    fixtures/
    storage/
  main.tsx
```

各 feature 按实际复杂度使用 pages、components、model、api、hooks、testing；简单模块不建空目录。api 定义领域 DTO mapper、查询和命令；model 包含领域类型、状态转换、选择器；pages 是组合入口。领域演示 adapter 位于 feature/api，引用 demo 中的 fixtures/storage。

依赖方向：app → features / design-system / shared；features → design-system / shared；design-system → 通用工具；shared 不依赖任何 feature。组合 feature 可通过其他 feature 的 public index 使用 query/selector/组件，禁止深层跨模块 import。叶子业务模块不反向依赖 dashboard/teaching。

跨领域写入由服务端业务用例协调：项目完成调用 projects 命令并在提交后使 projects、energy 查询失效；不得从项目 UI 直接操作 coin store。导入限制逐步加入 ESLint，对迁移完的目录立即执行，旧目录先登记豁免到期任务。

### 4.1 旧文件去向

| 现有位置 | 目标 / 迁移方式 |
|---|---|
| App.tsx | app/router；拆守卫、布局与路由注册，保留 src/App 薄转发一轮 |
| MissionShell.tsx | app/layouts；头像/通知能力拆出，6 个自带布局页面逐页去包裹 |
| pages/* | 对应 feature/pages；旧入口暂时 re-export，调用方完成后删除 |
| features/dashboard、teaching/overview | 保留现有组件，补控制器和指标选择器，移除业务页内散落的计算 |
| store/authStore、uiStore | auth model 与 app/session/UI；限制持久化字段 |
| 其他业务 store | 按资源迁移到 query + command；demo adapter 承接本地规则 |
| lib/apiService | 分领域 api，transport 留 shared/api；兼容转发阶段不得另建第二份实现 |
| mockData.ts | 类型入各 feature/model；LS 键入 demo/storage；种子入 demo/fixtures |
| types/index.ts | 全仓引用审计后合并字段语义；无引用且无外部契约时删除 |
| lib/dateReviver、reviveDates | shared/lib/date 单一边界转换，旧函数兼容转发直至调用迁完 |
| components/ui | 无业务基础组件入 design-system；业务组件入 feature |
| components/project | projects/components；两个 KanbanColumn 先核对职责 |
| hooks/useTheme | design-system 主题基础 + app provider 组装 |

## 5. 数据归属与前后端契约

### 5.1 服务端事实与本地状态

服务端事实包括账户、班级、小组、题目审核、测验、挑战、项目、招募、安全记录、成果、余额和流水。Query 缓存按会话、班级/小组、筛选与分页区分；切换会话时取消请求并清理旧缓存。Query key 不能包含 token 明文。

Zustand/组件状态用于侧栏、主题、弹窗、筛选、未提交表单、答题草稿。普通 UI 草稿需说明保存范围和寿命；测验草稿按账号与 sessionId 命名，退出或换人不可读上一人的内容。API 模式不持久化整份用户、组与业务全集到 localStorage。

认证初始化先完成，再启用业务查询。每次 login/logout/401 增加 session generation；请求完成时仅当前代次可以写状态。auth transport 通过回调或事件通知 app/session，不导入业务 store，消除 apiClient → mockData/store 的反向依赖。

### 5.2 写入规则

- 转账、结算、教师调币、审核、角色/分组变化采用 await 提交；请求期间禁用重复操作，服务端成功后才展示已完成。
- 非关键轻量编辑可乐观更新，但必须有快照、失败回滚、查询失效和错误提示；同一实体并发更新需要版本或顺序控制。
- 写请求不自动盲目重试。需要重试的业务使用 idempotency key，由服务端按主体、操作、key 和 payload 指纹保存结果；相同 key 不同 payload 返回冲突。
- 超时可能已经提交，UI 显示“结果待确认”并按 requestId 查状态/重拉。金额不靠前端预测流水作为最终结果。
- 学生读取当前余额与历史流水来自同一服务端口径，排序由 query/selector 明确定义，不能散落 reverse+slice。

### 5.3 模式隔离与题库迁移

显式模式可以由统一配置选择；仍兼容既有 VITE_API_BASE_URL 配置，网络失败只进入错误/离线提示，不自动降级成 demo。演示数据独立命名空间，有可见模式提示；在线首次加载不调用 initMockData。

审核池增加服务端资源，覆盖提交、编辑、审核、驳回和反馈。旧 localStorage 先导出 JSON，不直接上传；由教师预览、去重并明确提交。审核 API 具备范围权限、状态转换检查和操作者审计；已批准题目进入挑战题库必须真实关联同一记录。迁移成功之前保留本地原始副本，避免浏览器中已有成果丢失。

### 5.4 契约与日期

保留 API camelCase，对所有返回资源声明响应 schema，普通 DTO 日期为带时区 UTC ISO 字符串；前端仅展示/计算边界转 Date。兼容既有 naive UTC 数据时只有确实缺失时区才补 Z，支持已带 Z、offset、null 与非法值。

先补齐 OpenAPI schema 和 DTO mapper，再考虑生成 TS 类型；生成文件不手写，领域模型不与生成 DTO 混用。统一 ApiError 的 status/code/message/requestId/fieldErrors，错误 JSON 或非 JSON 均有安全回退。GET 支持 AbortSignal，401 由会话层统一处理。

## 6. 后端模块和数据迁移

```text
backend/
  app/
    main.py                  # 应用组装
    core/                    # 配置、安全、数据库会话、错误、日志
    modules/
      identity/
      classroom/
      learning/
      projects/
      safety/
      collaboration/
      energy/
      showcase/
    bootstrap/               # 显式种子/内置材料初始化
  migrations/                # Alembic revisions
  tests/                     # 按模块 + 集成/契约/迁移测试
```

模块以 router.py、schemas.py、models.py、service.py、policy.py 开始，复杂查询才拆 query.py。包初始化保证所有 model 注册于同一个 Base，不创建多个 engine/session。先从不依赖其他模块的读取接口迁移，再迁移写入。

router 处理 HTTP、参数和依赖；service 执行业务用例；policy 检查角色 + 资源/班级范围；共享数据库会话来自 core。一次业务写入只有一个明确 commit 边界，energy 服务参与同一事务但不自行提前 commit。结算/状态/余额/流水/幂等记录同时提交，失败全部回滚。

班级权限建立可管理班级的显式关系，管理员平台范围，教师仅授权班级；学生当前班级/小组由服务端推导。排行榜可按产品约定公开有限字段，不能借公开排名暴露个人完整流水。既有教师没有授权关系时，迁移报告提示管理员分配；不默认给所有教师跨班权限。

ClassMeta(id=1) 先确定是平台级规则还是班级级规则：若按班管理，则新建 class_settings 并以旧全局值回填每班，旧接口留适配期；若明确是全平台规则，则改名并在 UI 标明影响范围，不做不必要的数据复制。决策必须在新增班级范围功能前完成。

SQLite 并发重点验证：两个转账同时余额校验、两次结算竞态、数据库锁重试。不能依赖 SELECT FOR UPDATE 在 SQLite 上解决竞争；使用条件更新/受控事务配合唯一约束，验证行数和回滚。若课堂负载下仍无法满足一致性或等待时间目标，再立独立 PostgreSQL 迁移任务。

迁移接管步骤：确认正在使用的数据库来源 → SQLite 在线备份或停写备份 → 匿名副本演练 → 比较表/列/索引/数据约束 → 建立历史基线 → 正式版本迁移。只有副本结构完全符合已知 revision 时才 stamp；不符先编写补齐修复 revision。删除启动期 ALTER 与 seed 前，确保启动入口和旧库升级均能执行版本迁移。所有真实数据/备份禁止提交 Git。

## 7. 分阶段实施

| 阶段 | 工作 / 预计人日 | 依赖与交付 | 验收 / 回退 |
|---|---|---|---|
| 0 基线与保护 | 2–3 | UI 三角色截图、路由/操作清单、恢复测试环境、匿名数据夹具、lint/包体基线 | 全部现有测试结果可复现；确认数据库来源与备份恢复；此阶段不改业务行为 |
| 1 布局与契约基础 | 3–4 | 单一布局、路径函数、日期/错误边界、拆领域类型、在线/demo 初始化隔离 | 旧 URL 可直达/刷新、无重复 Shell、日期测试通过；兼容转发可回退 |
| 2 设计系统与首页样板 | 3–5 | tokens、Dialog/表单/状态组件；学生 Dashboard 完整纵向切片；Query 试点 | 关键路径截图通过，查询失败有正确状态；相同资源唯一数据源；模块开关可切旧页 |
| 3 后端正确性基础 | 4–6 | Alembic 接管、班级权限、energy 事务/幂等；补响应 schema | 匿名旧库升级和恢复演练通过；越权/并发/重复提交测试通过；schema 采用可兼容扩展 |
| 4 业务纵向迁移 | 9–13 | 每次迁一个资源的 UI/API/查询/命令；顺序见下 | 每域完成回归与 lint 清零再移下域；按模块回退，未迁资源仍由旧 store 管理 |
| 5 收口与交付 | 3–5 | 删除兼容入口与无引用代码、懒加载、全角色视觉/业务验收、文档同步 | 全量门禁通过、架构依赖检查通过、包体改善；部署需另按授权与演练发布 |

阶段 2 的只读试点与阶段 3 的后端基础可在边界冻结后部分交错，关键写能力必须等待阶段 3 验收。阶段 4 顺序：classroom → learning 与题库审核 → safety → projects → collaboration → energy 页面 → showcase → 教师/管理员聚合与 profile。energy 服务基础提前完成，energy 页面可以后迁；避免先做一套更漂亮的错误余额页面。

每个纵向切片依次完成：列现有行为 → 补关键行为测试 → 新模块 API/模型 → 页面改用新入口 → 对比新旧输出 → 删除该资源的旧写入口 → 更新文档。单次提交不要同时改路由名、业务规则、数据库字段和视觉风格。

## 8. 回退、发布与工作管理

每阶段使用短分支、小提交和独立审查。开始实施时再次检查工作区，保留他人改动；当前已有新组件不删除。试点期间 feature flag 按模块选择整条读写链，不允许 UI 切旧而写链仍新、或两套缓存同时维护同一资源。

数据库采用 expand → 数据回填/验证 → 应用迁移 → 后续 contract。保留旧字段/兼容读取直到新旧版本都可使用。发生数据正确性错误先停用受影响写入口，核对流水，再决定应用回退；新字段写入后不能用简单回退旧代码代替数据恢复。备份恢复会影响备份后的新数据，演练中要记录恢复点和重放/核对方式。

每批上线选择非课堂时间，发布前确认三角色冒烟、备份、版本、回退镜像；发布后检查健康、失败请求、余额/审核样例。生产同步继续遵循项目已有“本地验证并汇报、用户确认后再同步服务器”的约定，本计划不执行发布。

## 9. 完成标准

- 三角色所有现有能力和 URL 在路由清单中有归属与回归记录；ClassComposition 等内嵌能力保留。
- 所有页面只消费一个布局入口；基础 UI 只从 design-system 导入；新代码无失效 token。
- 领域类型不再来自 mockData；生产代码不依赖 demo fixtures；无新增深层跨 feature import 或依赖环。
- 在线业务写入有可等待结果；关键写入无 fire-and-forget；同一在线资源仅由 Query 管理，完成迁移后移除相应旧 store。
- 后端权限覆盖角色和资源范围；能量币业务有事务/幂等/并发证据；题库审核跨浏览器可共享。
- 老库升级/恢复可演练；没有通过清空数据库或 localStorage 完成迁移。
- check/build 通过；迁移模块 lint 错误为 0、全仓错误数量只减不增，最终清零；后端测试、前端关键行为与 E2E 均通过。
- 页面行数建议控制在约 250 行，超过 400 行需解释职责；不以行数硬拆组件。路由拆包后主业务入口建议 gzip ≤150 kB，新增页面 chunk 超过 200 kB需分析；均为待验收目标，不能宣称已实现。
- 390/768/1440px 三个视口无非预期页面级溢出；键盘完成核心流程，弹窗正确管理焦点；移动/暗色/减少动效有检查记录。
- DESIGN.md 描述最终已实现架构；README/部署文档一致；本计划阶段状态和未完成项准确更新。
