# Contributing

感谢你对 **DFC Data Agent**（大风车数据智能体）的关注！欢迎 Issue、文档改进和小功能 PR。

## 开发环境

- Node.js 22（见 `.nvmrc`）
- pnpm 9

```bash
pnpm install
cp .env.example .env
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
