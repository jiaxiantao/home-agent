# Home Agent

专注于 **AI Agent 前端编排** 的 Next.js 项目：规划器 → 工具调用 → SSE trace 流式输出。

## 能力

| 工具 | 说明 |
|------|------|
| `search_notes` | 检索知识库笔记（pg_trgm / 内存回退） |
| `calculate` | 安全数学表达式求值 |
| `current_time` | 返回服务器本地时间 |

- 页面：`/agents`（`/` 自动跳转）
- API：`POST /api/agent`（SSE trace）
- 可选：登录 admin 后通过 `PUT /api/intelligence/profile` 同步编排偏好

## 技术栈

- Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
- Prisma · PostgreSQL（`pg_trgm` 可选）
- OpenAI SDK（兼容 Ollama）

## 本地开发

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:setup
pnpm dev
```

打开 [http://localhost:3000/agents](http://localhost:3000/agents)。

### Ollama

```bash
ollama pull llama3.2
ollama serve
```

未配置 LLM 或设置 `LLM_DISABLED=1` 时使用规则规划器（适合 CI）。

### 冒烟与 E2E

```bash
pnpm db:setup
pnpm dev          # 终端 1
pnpm smoke        # 终端 2

pnpm build && pnpm start:ci   # 终端 1
pnpm test:e2e                 # 终端 2
```

## API

- `GET /api/health` — DB / LLM / pg_trgm 状态
- `POST /api/agent` — Agent 工具循环（SSE）
- `GET /api/notes/search?q=&limit=` — 笔记检索（供工具与调试）
- `GET/PUT /api/intelligence/profile` — 编排偏好（需 admin）
- `POST /api/auth/login` · `GET /api/auth/session` · `POST /api/auth/logout`

## Docker

```bash
docker compose up --build
```

## 仓库

https://github.com/jiaxiantao/home-agent
