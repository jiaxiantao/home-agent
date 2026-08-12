import { z } from "zod";

import { runDfcAgentLoop } from "@/lib/agent/langgraph";
import {
  resolveAnalyticsEnvId,
  runWithAnalyticsEnv,
} from "@/lib/analytics/mysql";
import { runWithPreferredAnalyticsDatabase } from "@/lib/analytics/preferred-database";
import { encodeSseEvent } from "@/lib/sse";
import { getClientIp, resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import { auditFromContext, writeAudit } from "@/lib/security/audit-log";
import { checkAgentRateLimit } from "@/lib/security/rate-limit";
import { resolveSsoCredentialsFromRequest } from "@/lib/security/dfc-user-profile";
import { runWithSsoRequestContext } from "@/lib/security/sso-context";
import { runWithLlmProvider, parseLlmProvider } from "@/lib/llm-provider-context";

const agentSchema = z.object({
  message: z.string().default(""),
  threadId: z.string().optional(),
  llmProvider: z.string().optional(),
  resume: z
    .object({
      actionId: z.enum(["confirm_sql", "cancel_sql"]),
      payload: z
        .object({
          runId: z.string().optional(),
          sql: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const user = resolveAuthUserFromHeaders(request.headers);

    if (isAuthEnabled() && !user) {
      writeAudit({
        event: "auth.denied",
        clientIp: getClientIp(request.headers),
        outcome: "failure",
        error: "missing credentials",
      });
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUser = user ?? {
      userId: "dev",
      userName: "Development",
      authMode: "disabled" as const,
    };

    const rate = await checkAgentRateLimit(authUser.userId);

    if (!rate.allowed) {
      auditFromContext(
        {
          user: authUser,
          clientIp: getClientIp(request.headers),
          userAgent: request.headers.get("user-agent") ?? undefined,
        },
        {
          event: "rate_limit.exceeded",
          outcome: "failure",
          meta: { limit: rate.limit },
        },
      );
      return Response.json(
        { error: "Too many requests", limitPerMinute: rate.limit },
        { status: 429 },
      );
    }

    const body = agentSchema.parse(await request.json());

    if (!body.resume && !body.message.trim()) {
      return Response.json(
        { error: "Invalid agent payload", details: "message or resume is required" },
        { status: 400 },
      );
    }

    let analyticsEnv: string;

    try {
      analyticsEnv = resolveAnalyticsEnvId(undefined);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Invalid analytics env",
        },
        { status: 400 },
      );
    }

    const audit = {
      user: authUser,
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? undefined,
      threadId: body.threadId,
    };

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
        };

        try {
          const ssoCredentials = resolveSsoCredentialsFromRequest(request.headers);
          await runWithSsoRequestContext(ssoCredentials, async () => {
            await runWithLlmProvider(parseLlmProvider(body.llmProvider), async () => {
              await runWithAnalyticsEnv(analyticsEnv, async () => {
                await runWithPreferredAnalyticsDatabase(undefined, async () => {
                  for await (const trace of runDfcAgentLoop(
                    body.message.trim() || "(resume)",
                    {
                      signal: request.signal,
                      resume: body.resume,
                      audit,
                      threadId: body.threadId,
                    },
                  )) {
                    send(trace.type, trace);
                  }
                });
              });
            });
          });
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "Agent failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Analytics-Env": analyticsEnv,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid agent payload", details: error.flatten() },
        { status: 400 },
      );
    }

    return Response.json({ error: "Agent request failed" }, { status: 500 });
  }
}
