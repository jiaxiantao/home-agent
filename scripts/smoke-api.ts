/**
 * API smoke checks — run against a live server:
 *   pnpm dev   # terminal 1
 *   pnpm smoke # terminal 2
 */

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Check = {
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  assert: (status: number, body: unknown) => void;
};

const checks: Check[] = [
  {
    name: "health",
    path: "/api/health",
    assert: (status, body) => {
      if (status !== 200) {
        throw new Error(`expected 200, got ${status}`);
      }

      const data = body as {
        ok?: boolean;
        db?: { connected?: boolean; ok?: boolean };
        analyticsMysql?: { configured?: boolean; ok?: boolean };
        llm?: { configured?: boolean };
      };

      if (typeof data.ok !== "boolean") {
        throw new Error("missing ok flag");
      }

      if (!data.db?.connected || !data.db?.ok) {
        throw new Error(
          `database unhealthy (connected=${String(data.db?.connected)}, ok=${String(data.db?.ok)})`,
        );
      }

      if (data.analyticsMysql?.configured && !data.analyticsMysql.ok) {
        console.warn(
          "[smoke] analyticsMysql configured but not reachable (VPN/intranet required)",
        );
      }
    },
  },
  {
    name: "notes-search",
    path: "/api/notes/search?q=架构&limit=3",
    assert: (status, body) => {
      if (status !== 200) {
        throw new Error(`expected 200, got ${status}`);
      }

      const data = body as { results?: unknown[]; engine?: string };

      if (!Array.isArray(data.results)) {
        throw new Error("missing results array");
      }

      if (!data.engine) {
        throw new Error("missing engine");
      }
    },
  },
  {
    name: "agent-sse",
    path: "/api/agent",
    method: "POST",
    body: { message: "smoke: 现在几点？" },
    assert: (status) => {
      if (status !== 200) {
        throw new Error(`expected 200, got ${status}`);
      }
    },
  },
];

async function runCheck(check: Check) {
  const response = await fetch(`${base}${check.path}`, {
    method: check.method ?? "GET",
    headers: check.body ? { "Content-Type": "application/json" } : undefined,
    body: check.body ? JSON.stringify(check.body) : undefined,
  });

  if (check.name === "agent-sse") {
    const text = await response.text();
    if (!text.includes("event:")) {
      throw new Error("agent response missing SSE events");
    }
    if (!text.includes('"type":"answer"')) {
      throw new Error("agent response missing answer event");
    }
    if (!text.includes('"type":"done"')) {
      throw new Error("agent response missing done event");
    }
    check.assert(response.status, text);
    return;
  }

  const body = (await response.json()) as unknown;
  check.assert(response.status, body);
}

async function main() {
  console.log(`Smoke base: ${base}`);

  for (const check of checks) {
    process.stdout.write(`  ${check.name} ... `);
    await runCheck(check);
    console.log("ok");
  }

  console.log("All smoke checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
