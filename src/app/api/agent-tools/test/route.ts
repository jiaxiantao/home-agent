import { NextResponse } from "next/server";
import { z } from "zod";

import {
  testAgentTool,
  testAgentToolsBatch,
  testAgentToolsBatchStream,
  type ToolTestResult,
} from "@/lib/agent/tool-test";
import { runDfcApiTestWithRequestSso } from "@/lib/analytics/dfc-api-test-sso";
import { ensureDfcApiCatalogFromDatabase } from "@/lib/analytics/dfc-api-endpoints";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import { resolveUserRole } from "@/lib/security/rbac";
import { encodeSseEvent, SSE_PAD_COMMENT } from "@/lib/sse";

function resolveUser(request: Request) {
  const user = resolveAuthUserFromHeaders(request.headers);

  if (isAuthEnabled() && !user) {
    return null;
  }

  return (
    user ?? {
      userId: "dev",
      userName: "Development",
      authMode: "disabled" as const,
    }
  );
}

function canManageTools(userId: string) {
  if (!isAuthEnabled()) {
    return true;
  }
  return resolveUserRole(userId) === "admin";
}

const argsSchema = z.record(z.string(), z.unknown());

const testBodySchema = z.object({
  name: z.string().min(1).optional(),
  names: z.array(z.string().min(1)).optional(),
  args: argsSchema.optional(),
  argsByName: z.record(z.string(), argsSchema).optional(),
  allowExecuteSql: z.boolean().optional(),
  stream: z.boolean().optional(),
});

const API_CATALOG_TOOL_NAMES = new Set([
  "call_backend_api",
  "route_api",
  "search_api",
]);

async function ensureApiCatalogForToolTests(names: string[]) {
  if (!names.some((name) => API_CATALOG_TOOL_NAMES.has(name.trim()))) {
    return;
  }
  await ensureDfcApiCatalogFromDatabase();
}

function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function createBatchTestSseStream(
  request: Request,
  names: string[],
  options: {
    args?: Record<string, unknown>;
    argsByName?: Record<string, Record<string, unknown>>;
    allowExecuteSql?: boolean;
  },
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
      };

      try {
        controller.enqueue(encoder.encode(SSE_PAD_COMMENT));
        send("start", { total: names.length, names });

        const results: ToolTestResult[] = [];

        await runDfcApiTestWithRequestSso(request, async () => {
          for await (const item of testAgentToolsBatchStream(names, options)) {
            if (item.type === "testing") {
              send("testing", { name: item.name });
            } else {
              results.push(item.result);
              send("result", { result: item.result });
            }
          }
        });

        send("done", {
          total: names.length,
          passed: results.filter((entry) => entry.ok).length,
          failed: results.filter((entry) => !entry.ok).length,
        });
      } catch (error) {
        send("error", {
          error: error instanceof Error ? error.message : "Test failed",
        });
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTools(user.userId)) {
    return NextResponse.json({ error: "仅管理员可测试工具" }, { status: 403 });
  }

  try {
    const body = testBodySchema.parse(await request.json());

    const names =
      body.names?.length && body.names.length > 0
        ? body.names
        : body.name
          ? [body.name]
          : [];

    if (!names.length) {
      return NextResponse.json({ error: "请提供 name 或 names" }, { status: 400 });
    }

    await ensureApiCatalogForToolTests(names);

    const batchMode = names.length > 1;
    const allowExecuteSql = body.allowExecuteSql ?? (batchMode ? true : false);

    if (names.length === 1) {
      const result = await runDfcApiTestWithRequestSso(request, () =>
        testAgentTool(names[0], body.args, {
          allowExecuteSql,
        }),
      );
      return NextResponse.json({ result });
    }

    if (body.stream) {
      return sseResponse(
        createBatchTestSseStream(request, names, {
          args: body.args,
          argsByName: body.argsByName,
          allowExecuteSql,
        }),
      );
    }

    const batch = await runDfcApiTestWithRequestSso(request, () =>
      testAgentToolsBatch(names, {
        args: body.args,
        argsByName: body.argsByName,
        allowExecuteSql,
      }),
    );
    return NextResponse.json(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test failed" },
      { status: 400 },
    );
  }
}
