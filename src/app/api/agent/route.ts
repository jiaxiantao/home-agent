import { z } from "zod";

import { runAgentLoop } from "@/lib/agent/run-loop";

const agentSchema = z.object({
  message: z.string().min(1, "message is required"),
});

export async function POST(request: Request) {
  try {
    const body = agentSchema.parse(await request.json());
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          for await (const trace of runAgentLoop(body.message, {
            signal: request.signal,
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
