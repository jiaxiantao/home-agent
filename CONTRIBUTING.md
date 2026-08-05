# Contributing

感谢你对 Home Agent 的关注！这是一个面向学习者的开源项目，欢迎 Issue、文档改进和小功能 PR。

## 开发环境

- Node.js 22（见 `.nvmrc`）
- pnpm 9
- Docker（用于本地 PostgreSQL）

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:setup
pnpm dev
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 本地开发 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest 单元测试 |
| `pnpm smoke` | API 冒烟（需先 `pnpm dev`） |
| `pnpm test:e2e` | Playwright E2E（需先 `pnpm build && pnpm start:ci`） |

CI 会在 push / PR 时自动跑 typecheck、lint、build、smoke、e2e。

## 提交规范

- 一个 PR 聚焦一件事（修 bug、补文档、加 tool 等）
- 代码改动请附带相关测试或说明为何不需要
- 不要提交 `.env` 或含密钥的文件
- commit message 用中文或英文均可，写清「为什么」

## 推荐阅读顺序（改 Agent 相关代码前）

1. `src/lib/agent/types.ts`
2. `src/lib/agent/run-loop.ts`
3. `src/lib/agent/planner.ts`
4. `src/app/api/agent/route.ts`
5. `src/hooks/use-agent-sse.ts`

扩展工具见 [docs/add-a-tool.md](./docs/add-a-tool.md)。演进规划见 [docs/roadmap.md](./docs/roadmap.md)，提交前可更新 [CHANGELOG.md](./CHANGELOG.md) 的 Unreleased 区块。

## 报告问题

- Bug：附上复现步骤、期望与实际行为、环境（Node 版本、是否启用 Ollama）
- 功能建议：说明学习场景与预期收益
