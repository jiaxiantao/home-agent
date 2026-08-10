import { z } from "zod";

import { runAgentLoop } from "@/lib/agent/run-loop";
import { encodeSseEvent } from "@/lib/sse";

const agentSchema = z.object({
  message: z.string().default(""),
  threadId: z.string().optional(),
  resume: z
    .object({
      actionId: z.enum(["confirm_sql", "cancel_sql"]),
      payload: z
        .object({
          runId: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = agentSchema.parse(await request.json());

    if (!body.resume && !body.message.trim()) {
      return Response.json(
        { error: "Invalid agent payload", details: "message or resume is required" },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
        };

        try {
          for await (const trace of runAgentLoop(body.message.trim() || "(resume)", {
            signal: request.signal,
            resume: body.resume,
          })) {
            send(trace.type, trace);
          }
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
