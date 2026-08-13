# 分析师使用指南

## 产品是什么

**DFC Data Agent（大风车数据分析助手）** 帮你用自然语言查大风车业务数据。

你只需要说要查什么，例如：「我想知道客户手机号为 13166990795 的客户信息」。也可按微信号查。Agent 会自动判断查哪个库、哪张表、用什么条件，生成只读 SQL；你确认后即可看到结果。一般**不需要**手动选择数据库或表（偏好库默认为「自动」）。

## 快速开始

1. 内网打开问数助手 `/agents`（或 SSO 统一入口）
2. 输入自然语言问题
3. 检查 Agent 生成的 SQL，可在确认前编辑
4. 点击「确认执行」查看表格/图表
5. 继续追问：「那按城市分布呢？」

## 业务口径

| 场景 | 建议条件 |
|------|----------|
| 正式车源/求购 | `test_type = 0` |
| 有效订单 | `delete_time IS NULL` |
| 大表查询 | 带时间范围 + LIMIT |

## 数据环境

大风车有 **测试 / 预发 / 线上** 三套 MySQL 数据环境。问数页输入框左下角 **「环境」** 下拉可切换；选择会保存在浏览器本地，下次打开仍生效。

- **测试**：日常开发验证（默认）
- **预发**：上线前联调
- **线上**：生产数据（需只读账号 + 表白名单，请谨慎查询）

若某环境显示「未配置」，说明服务端 `.env` 中尚未填写该环境的 `ANALYTICS_MYSQL_*` 连接信息，联系管理员配置。

## 多业务库

同一 MySQL 实例上可分析多个大风车库（matador、danube_member、danube_topcars 等）。

- **接口优先**：按手机号/ID 查客户、用户、会员等**明细**时，Agent 会从全量接口库（约 1 万条 HTTP/Dubbo）中自动匹配，先 `route_api`，必要时 `search_api`，再 `call_backend_api`；未配置网关或调用失败时回退 SQL
- Agent 会先 `route_api` / `route_question` 自动推断查哪个服务或库表，再执行；**默认无需手动选库**
- 输入区「偏好库」默认为「自动规划」；仅在你想加权某个库时再切换
- 也可直接问：「现在个人会员一共有多少？」Agent 会自动选库，无需记库名
- 跨库 SQL 使用 `` `库名`.`表名` ``（系统禁止 `USE`）

### 启用后端 HTTP 调用（管理员）

在 `.env` 中配置后，明细查询会真实调用内网服务而非仅走 SQL：

- `AUTH_MODE=sso` — 使用大风车 SSO 登录态（推荐内网/外网部署）
- `SSO_LOGIN_URL` — 未登录时跳转的大风车 Mars 入口（默认测试外网 dashboard）
- `DFC_API_ENABLED=1`
- `DFC_API_SUPER_MARIO_BASE_URL=http://super-mario.stable.dasouche.net`（与 `web-app-mars-h5-customer` 测试配置一致；须 `*.dasouche.net`，勿用线上 `*.souche.com`）
- `DFC_API_MATADOR_BASE_URL=http://matador.dasouche.net`
- 可选 `DFC_API_SERVICE_CHAIN`（多环境；前端默认注释）
- 本地无同域 Cookie 时配置 `DFC_API_DEV_SSO_TOKEN`（Mars **测试外网**登录后从 `_security_token` 复制）

**CRM 客户详情（对齐前后端）**：
- 业务主路径（手机号/微信号）：`GET /v1/customerAction/queryCustomerDetailsByContact.json?contact=`
- 仅当已知内部客户 ID：`GET /v1/customerAction/crmQueryCustomerInfo.json?recordId=`
- 鉴权头：只写一次 `Souche-Security-Token`（勿再双写 `souche-security-token`，Node fetch 会合并成非法 `token, token`），Cookie `_security_token`，CRM 另加 `_source_code=WEB`
- 经 **MCP → HTTP**；缺 SSO 返回 `failureKind=auth`

未配置 `DFC_API_*` 时 Agent 仍会识别推荐接口，并自动用等价 SQL 回退（如 `super_mario.customer` 按 `phone` / `weichat` 查询）。

接口目录见 `config/dfc-api-catalog.json`、`docs/dfc-backend-apis.md` 与 `docs/dfc-backend-repos.md`。

输入框上方是**模板分类 Tab**（只展示热度最高的 6 个，超出横向滚动）；点击分类会填入该分类下使用最多的问法。

右侧还有：

- **团队问法模板**：全员共享口径（含内置模板）；管理员可「发布」当前输入为团队模板
- **收藏问法**：个人常用问题，仅自己可见
- **最近查询**：服务端历史，点击回填

## 结果操作

- **导出 CSV**：查询结果表格右上角
- **最近查询**：右侧历史面板，点击可回填问题

## 规则模式提示

LLM 未启用或调用失败时会直接报错（不再回退规则规划器）。请检查输入框所选模型、`.env` 中对应 API Key，以及本地 Ollama 是否已启动。

运行时基于 **LangChain + LangGraph**；管理员可通过 `LLM_PROVIDER=ollama|openai` 切换本地 Ollama 与云端 OpenAI 兼容 API（见 `.env.example`）。

## 常见问题

**Q: 确认 SQL 后报错「未授权表」**  
A: 该表不在生产白名单，联系管理员扩展 `TABLE_ALLOWLIST`。

**Q: EXPLAIN 扫描行数超限**  
A: 缩小时间范围或增加 WHERE 条件。

**Q: 连不上数据库**  
A: 需公司 VPN / 内网访问 `*.scsite.net`。

## 禁止事项

- 不要尝试写操作 SQL（系统会拒绝）
- 不要分享访问令牌
- 不要将查询结果含 PII 外传（系统已部分脱敏，仍需遵守数据规范）
