# DFC API MCP 中间件

独立进程的大风车接口 MCP 服务。产品固定链路：

**LLM 规划 → Agent 工具（route_api / search_api / call_backend_api）→ MCP Client → MCP Server → 大风车 HTTP**

禁止默认跳过 MCP 直连后端。第一期仅 **只读 HTTP** 可真实转发，**Dubbo 仅元数据**（call 返回 skipped）。

## 链路

```
LLM / 规则规划器
  → route_api | search_api | call_backend_api
  → MCP Client（默认 **in-process** InMemory；可选 stdio 子进程）
  → dfc-api-mcp Server
  → 门面（catalog + callBackendApi + SSO）
  → 大风车 HTTP（测试 *.dasouche.net）
```

Agent 默认 `DFC_MCP_TRANSPORT=inprocess`，与请求同进程，保证侧栏 `_security_token` 经 ALS/`sso` 参数进入 HTTP。Cursor 等外部宿主用 `DFC_MCP_TRANSPORT=stdio` + `pnpm mcp:dfc-api`。

工具结果前缀 `[via MCP 中间件]` 表示已走过协议；若出现 `[via 本地门面·已绕过 MCP]` 说明开了排障回退，生产不应出现。

## 启动

Agent 进程会按需拉起 MCP 子进程；也可单独启动供 Cursor 使用：

```bash
pnpm mcp:dfc-api
```

```json
{
  "mcpServers": {
    "dfc-api": {
      "command": "pnpm",
      "args": ["mcp:dfc-api"],
      "cwd": "/absolute/path/to/dfc-data-agent"
    }
  }
}
```

## MCP 工具

| 工具 | 说明 |
|------|------|
| `dfc_catalog_stats` | 目录统计 |
| `dfc_search_apis` | 关键词搜索（含 Dubbo 元数据） |
| `dfc_route_api` | 按问题路由候选 + 抽参 |
| `dfc_get_api` | 按 endpointId 查详情 |
| `dfc_call_http_api` | 调用只读 HTTP；Dubbo → `skipped` |

`dfc_call_http_api` 可传 `_sso: { token, tokenHeader?, cookieHeader?, serviceChain? }`，以及可选 `query` / `body` 透传。

## Agent 环境变量

- `DFC_MCP_ENABLED` — 默认 **开启**；设 `0` 关闭（需同时 `DFC_MCP_FALLBACK_LOCAL=1` 才允许本地门面）
- `DFC_MCP_FALLBACK_LOCAL` — 默认 **关闭**（禁止跳过中间件）；仅排障设 `1`
- `DFC_MCP_COMMAND` / `DFC_MCP_ARGS` — 子进程启动命令
- `DFC_MCP_TIMEOUT_MS` — 单次 tool 超时

仍需 `DFC_API_ENABLED=1` 与测试环境 `DFC_API_*_BASE_URL`（须 `*.dasouche.net`，CRM 与前端一致：`http://super-mario.stable.dasouche.net`）才能真正打到 Java HTTP。线上域名为 `*.souche.com`，勿与测试混用。

客户 recordId 详情优先 MCP 工具 → `GET /v1/customerAction/crmQueryCustomerInfo.json`。

## 后续（不在本期）

- Dubbo 泛化调用 / HTTP 网关转发
- Streamable HTTP 远端 MCP（当前为 stdio）
