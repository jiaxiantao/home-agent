# 演进路线图

## 已完成

- [x] matador MySQL + 只读 guard + HITL + A2UI
- [x] 数据库元数据工具全集
- [x] 企业安全：鉴权、审计、表白名单、Redis、限流
- [x] 分析师体验：多轮、历史、CSV、SQL 编辑
- [x] 生产加固：PII 脱敏、EXPLAIN 守卫、RBAC、pending 归属、health ready、生产配置校验
- [x] 服务端查询历史（`/api/history`）
- [x] 审计持久化（内存/Redis + `/api/audit` 管理员查询）
- [x] K8s 部署清单（`deploy/k8s/`）
- [x] NL→SQL 黄金用例回归（规则规划器）
- [x] 收藏问法（`/api/favorites`）
- [x] 审计 HTTP sink（`AUDIT_HTTP_URL`）
- [x] 多环境分析库切换（test/prepub profiles）
- [x] 团队公共问法模板（`/api/templates`）
- [x] staging MySQL 集成测试（无凭证自动 skip）
- [x] Agent 主流程：HITL 失败可重试、规划上下文截断、查询后答案合成、规则多轮追问、错误补 `done`
- [x] Agent 前端交互：Cursor 风格对话流、活动步骤折叠、粘性 Composer、审批式 SQL 确认卡
- [x] 多业务库分析：登记 danube_* / matador 等，会话可选偏好库，SQL 支持 \`db\`.\`table\`
- [x] 问题自动路由：`route_question` 按语义规划候选库/表；业务问数先探索再 `propose_sql`；跨库 `search_schema`
- [x] 项目更名为 DFC Data Agent（包名 `dfc-data-agent`）

## 可选增强

- [ ] 审计写入独立 DB
- [ ] 元数据结果 A2UI 化（list_tables / describe_table）
- [ ] 确认卡增加「重新生成 SQL / 先 EXPLAIN」
- [ ] 非 matador 库的手写业务口径目录
- [ ] 路由规则从业务知识库/表注释持续扩充

## 文档

- [security.md](./security.md) · [deployment.md](./deployment.md) · [analyst-guide.md](./analyst-guide.md)
