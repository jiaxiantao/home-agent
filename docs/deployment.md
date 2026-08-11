# 内网部署指南

## 架构

```
用户 → SSO 网关 → home-agent (Next.js) → matador MySQL (只读)
                              ↓
                         Redis / LLM
```

## Docker Compose（内测）

```bash
cp .env.example .env
# 填写 ANALYTICS_MYSQL_PASSWORD、AUTH_TOKEN、ANALYTICS_MYSQL_TABLE_ALLOWLIST

docker compose up --build
```

## 生产 K8s 要点

仓库已提供清单：[`deploy/k8s/home-agent.yaml`](../deploy/k8s/home-agent.yaml)

```bash
# 先改 Secret 中的密码与 REDIS_URL，再应用
kubectl apply -f deploy/k8s/home-agent.yaml
kubectl -n home-agent rollout status deploy/home-agent
curl -s "$(kubectl -n home-agent get svc home-agent -o jsonpath='{.spec.clusterIP}')/api/health"
```

1. **Deployment** 2+ 副本，`REDIS_REQUIRED=1`
2. **Ingress** 仅内网；`trusted_header` 模式由网关注入用户头
3. **Secrets**：MySQL 密码、Redis URL
4. **Probes**：`GET /api/health`；生产严格模式下未就绪返回 **503**
5. **Resources**：每副本 512Mi–1Gi 内存

### API 一览（内网）

| 路径 | 说明 |
|------|------|
| `POST /api/agent` | 问数 SSE |
| `GET /api/history` | 当前用户查询历史 |
| `GET /api/audit` | 管理员审计查询 |
| `GET /api/health` | 就绪探针 |

## 环境矩阵

| 环境 | MySQL | LLM | 说明 |
|------|-------|-----|------|
| test | test.database3500.scsite.net:3500/matador | 内网 Ollama | 当前默认 |
| prepub | 按 DBA 分配 | 同上 | 需单独 allowlist 评审 |

## 发布流程

1. `pnpm typecheck && pnpm test && pnpm build`
2. 配置生产 `.env` / K8s Secret
3. 确认 `/api/health` → `ready: true`
4. 用典型问法验收（见 analyst-guide.md）
5. 观察 audit 日志与 MySQL 慢查询

## 回滚

保留上一版本镜像；Redis pending SQL TTL 30 分钟，回滚不影响已确认查询。
