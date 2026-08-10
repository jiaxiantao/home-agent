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
        analyticsMysql?: { configured?: boolean; ok?: boolean };
        llm?: { configured?: boolean };
      };

      if (typeof data.ok !== "boolean") {
        throw new Error("missing ok flag");
      }

      if (data.analyticsMysql?.configured && !data.analyticsMysql.ok) {
        console.warn(
          "[smoke] analyticsMysql configured but not reachable (VPN/intranet required)",
        );
      }
    },
  },
  {
    name: "agent-sse",
    path: "/api/agent",
    method: "POST",
    body: { message: "大风车正式车源一共有多少辆？" },
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
    if (!text.includes('"type":"awaiting_input"')) {
      throw new Error("agent response missing awaiting_input event");
    }
    if (!text.includes('"type":"a2ui"')) {
      throw new Error("agent response missing a2ui event");
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
