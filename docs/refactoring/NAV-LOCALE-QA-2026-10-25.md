# 可折叠导航与英语界面验证记录

日期：2026-10-25；分支：codex/showcase-html-editor；起点：31a78f1。本记录覆盖提交前本地验证；服务器发布结果另见发布记录。

## 环境与范围

- 本地前端 http://127.0.0.1:18100，隔离 API 18101，独立测试数据库 /tmp/physics-ui-20261025.db。
- Browser plugin not available；使用现有 CUA 浏览器与其 Playwright locator / CDP 接口验证，没有另装浏览器依赖。
- 桌面 1280×720；窄屏 390×844（响应式视口模拟，并非真机 Safari 验收）。
- 英语范围：登录、公共导航、学生工作区与常用弹窗/作品预览工具栏。课程正文、题目、用户姓名、小组名称与上传作品内容保留原文；教师/管理员后台正文未完整翻译。

## 浏览器验证

| 检查项 | 结果与证据 |
| --- | --- |
| 页面身份 | localhost 18100；英文标题 Physics Mission Control · Learning Platform；html lang=en |
| 页面加载 | 登录及学生 12 个主要入口都有实际内容；无框架错误覆盖层或空白页 |
| 桌面折叠 | 导航 208px → 72px；内容宽度 1060px → 1192px，内容左边距 88px |
| 图标入口 | 折叠后保留 aria-label、当前页状态及 title 提示；实际点击 Learning Hub、各学生入口成功 |
| 偏好记忆 | 刷新 Learning Hub 后仍为英语，导航仍为 72px；展开按钮恢复到 208px |
| 语言切换 | 中英切换即时生效；填入合成登录资料后经过中英切换仍可成功登录测试账号 |
| 英文搜索 | 输入 SAFETY，只显示 Safety Lab，点击后跳转 /safety-lab |
| 手机抽屉 | 桌面折叠偏好不隐藏手机文字；打开、选页自动关闭、关闭按钮、Escape 均正常；关闭后焦点回到打开按钮 |
| 手机布局 | 登录和工作区无横向溢出；关闭按钮位于页头下方，不再被遮挡 |
| 草稿保留 | 英文上传表单填写 Locale QA draft，关闭、切换中文、重开后标题仍相同；最后恢复空标题，未提交作品 |
| 登录角色布局 | 英文 Student 与 Teacher 两种状态表单宽度均为 400px，无横向溢出；手机表单 358px |
| 控制台 | 巡检各入口后读取 warn/error 日志为 [] |

巡检入口：Dashboard、Learning Hub、Knowledge Galaxy、Challenge Arena、Project Center、Safety Lab、My Team、Team Communication、Marketplace、Leaderboard、Showcase、My Profile。此项是页面冒烟与英语布局检查，不代表重新执行了每项业务写入。

## 自动验证

全部退出码为 0：

- npm run check
- npm run lint
- npm run build（已有的 bootstrap/sessionCleanup 静态与动态导入提示仍存在，不阻止构建）
- npm run test:locale：语言读写、插值、缺失值、保留未知内容、原型属性键、存储不可用、导航偏好持久化；1,278 条翻译非空与占位符一致性。
- npm run test:core：日期、JSON 错误、过期/当前 401、缓存清理、模块边界。
- node scripts/test-showcase-upload.cjs：5 个异步上传交互场景。
- node scripts/test-dashboard-refresh.cjs：过期响应、独立数据域、会话重置与错误。
- node scripts/test-student-review-fixes.cjs：交卷顺序/失败、服务端判分、招募确认/弹窗、冻结状态。
- node scripts/test-ui-reliability.cjs：挑战关联、学习指标、隔离草稿、写入确认。
- node scripts/test-learning-content.cjs：104 个知识点全部通过，104 个有配套例题。
- git diff --check

本轮无后端业务改动；未重新执行全部后端测试、云端验收或真实文件上传。未修改未跟踪的 .claude-engineer/。

## 证据文件

- /tmp/physics-english-collapsed.png：桌面英语折叠导航。
- /tmp/physics-mobile-navigation.png：手机完整英语导航抽屉。
- /tmp/physics-english-login.png：桌面英语教师登录入口。
- /tmp/physics-english-login-mobile.png：手机英语登录入口。
- /tmp/physics-locale-browser-qa.json：自动巡检的 9 个入口 DOM 摘要；其余 3 个入口在单独步骤验证。
- /tmp/physics-locale-build.log：生产构建记录。
- /tmp/physics-locale-learning-content.json：知识内容回归输出。
