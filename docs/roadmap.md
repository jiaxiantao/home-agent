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

## 可选增强

- [ ] 审计写入独立 DB

## 文档

- [security.md](./security.md) · [deployment.md](./deployment.md) · [analyst-guide.md](./analyst-guide.md)
