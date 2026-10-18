# NFC 终端只读余额服务

首版流程：管理员创建设备 → 教师登记卡片 → 开发板热点网页配置 Wi-Fi、后台地址和设备令牌 → 刷卡查询学生个人币和所在小组币。卡不存余额，终端不写卡，不产生金币流水。教师管理网页和短期录卡会话暂未实现，先使用接口/维护工具登记屏幕所示 UID。

## 服务端配置

在部署实例的私有环境中设置 `NFC_UID_SECRET`，使用至少 32 字节的随机密钥，例如通过 `python -c 'import secrets; print(secrets.token_hex(32))'` 生成。密钥只填本地 `backend/.env` 或服务器私有 `.env`，不得提交。它用于 HMAC 索引卡 UID；必须持久保存并备份，更换后旧卡需要重新登记。不配置时 NFC 查询返回 503，其他业务照常运行。

沿用现有启动方式，启动时 `init_db()` 创建三张新表 `nfc_devices`、`nfc_cards`、`nfc_admin_audit`，不改现有余额表或清空数据。设备令牌为独立随机值，只保存 SHA-256 哈希；完整令牌仅创建或轮换时返回一次。设备令牌不能调用教师/学生接口，账户 JWT 也不能调用刷卡接口。

Docker Compose 已透传 `NFC_UID_SECRET`，需在实际私有 `.env` 中设置它。HTTPS 推荐经现有反向代理转发 `/api/nfc/`，禁止记录请求体、Authorization 和响应体。局域网开发可以显式选择 HTTP；公网使用 HTTPS。多进程/多实例应在代理层配置共享限流，当前进程内限流为每秒 2 次、突发 4 次。

## 设备及卡片管理

管理员 JWT：

- `POST /api/nfc/devices`：`{"name":"classroom-terminal","allowedClassIds":["<class-id>"]}`；201 返回 `id` 和一次性 `deviceToken`。
- `GET /api/nfc/devices`：设备元信息，不含令牌或哈希。
- `PATCH /api/nfc/devices/{id}`：`{"enabled":false}` 停用，true 启用。
- `POST /api/nfc/devices/{id}/rotate-token`：立即撤销旧令牌，仅此响应返回新令牌。

教师/管理员 JWT，教师仅操作其有权访问的班级：

- `POST /api/nfc/cards/bind`：`{"cardUid":"00112233","userId":"<student-id>"}`；接受 4/7/10 字节十六进制 UID，统一大写。新卡绑定与旧卡撤销同一事务，数据库约束每学生最多一张有效卡。已有归属的卡不可自动转给其他学生。
- `POST /api/nfc/cards/revoke`：`{"userId":"<student-id>"}`，挂失该学生有效卡。
- `GET /api/nfc/cards`：授权范围内的学生 ID、卡掩码和有效状态，不返回原始 UID。

管理动作有独立审计。UID 仅保存 HMAC 索引及末四位掩码；不能阻止复制卡，不应用于扣币等高价值授权。审计暂不自动删除，保留期限应在正式运行时按学校要求配置。

终端工程 `tools/nfc_admin.py` 提供交互式维护命令（用 `--help` 查看）。登录密码和卡 UID 通过不回显输入读取；设备令牌输出到新建的权限 0600 文件。用 `.local` 后缀保存令牌，避免提交。无需把管理员登录密码写进开发板。

## 刷卡协议

`POST /api/nfc/tap`，头 `Authorization: Bearer <device-token>`、`Content-Type: application/json`。

请求：`{"cardUid":"00112233","requestId":"<unique-id>"}`。禁止附加 userId/deviceId 决定查询对象。成功返回：

```json
{"requestId":"<unique-id>","studentName":"DEMO","groupName":"DEMO GROUP","personalCoins":32,"groupCoins":128,"queriedAt":"2026-10-18T00:00:00+00:00"}
```

无小组时 groupName/groupCoins 为 null，真实负数不归零。两个余额在同条 SQL 查询中读取。无效卡、挂失、非学生、未分班、跨设备授权班级统一 404；用户/小组归属矛盾 409；无效设备 401，停用 403，频率限制 429（Retry-After: 1），缺索引密钥 503。错误体 `{"requestId":"...","error":{"code":"..."}}`；所有刷卡响应 `Cache-Control: no-store`。服务端和终端不记录查询姓名/余额/完整 UID。

## 独立演示环境

在 backend 运行：

```sh
.venv/bin/python -m tools.nfc_demo --uid <测试卡UID> --port 8010
```

可重复 `--uid`。脚本使用全新的临时 SQLite 数据库和虚构演示账户，绝不打开现有应用数据库。屏幕第一张卡个人币 32、小组币 128，后续卡个人币按序 64/96。启动输出私有 connection.json 的路径，内含演示设备令牌与管理员凭据。服务器监听本机 0.0.0.0；终端填本机局域网 IP 和端口，不填 localhost。仅在可信局域网启动，结束后 Ctrl+C。

## 验证及边界

2026-10-18：NFC 新增 11 项测试通过；后端全量 245 项通过，前端 `npm run check` 通过。覆盖实时余额/负值/无小组、归属检查、设备令牌轮换/停用、教师权限、挂失补卡、格式/限流/缺配置、没有金币流水，以及旧库升级后余额保留。独立演示服务的真实 HTTP 查询和管理员登录/设备列表已通过。硬件 Wi-Fi 联调结果在独立终端工程 docs/verification.md 中记录。

部署沿用本仓库流程：先本地联调、报告变更与验证，再由用户确认后同步服务器。生产地址、实际卡号、学生姓名和密码不得写入本仓库。
