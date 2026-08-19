import { NextResponse } from "next/server";
import { z } from "zod";

import {
  appendThreadMessage,
  deleteUserThread,
  ensureThread,
  getUserThread,
  listUserThreadsPage,
  shouldSkipDuplicateThreadMessage,
} from "@/lib/agent/thread-store";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";

const persistThreadSchema = z.object({
  threadId: z.string().trim().min(1).optional(),
  message: z
    .object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1),
      ts: z.number().optional(),
      sql: z.string().optional(),
    })
    .optional(),
});

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

export async function GET(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  if (id) {
    const thread = await getUserThread(id, user.userId);
    if (!thread) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      thread: {
        threadId: thread.threadId,
        title: thread.title,
        messages: thread.messages,
        messageCount: thread.messages.length,
        createdAt: new Date(thread.createdAt).toISOString(),
        updatedAt: new Date(thread.updatedAt).toISOString(),
      },
    });
  }

  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const q = url.searchParams.get("q")?.trim() || undefined;
  const result = await listUserThreadsPage({
    userId: user.userId,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    q,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = persistThreadSchema.parse(await request.json());
    const thread = await ensureThread(body.threadId, user.userId);

    if (body.message) {
      const existing = await getUserThread(thread.threadId, user.userId);
      const messages = existing?.messages ?? [];
      if (!shouldSkipDuplicateThreadMessage(messages, body.message)) {
        await appendThreadMessage(thread.threadId, user.userId, {
          role: body.message.role,
          content: body.message.content,
          ts: body.message.ts ?? Date.now(),
          sql: body.message.sql,
        });
      }
    }

    const saved = await getUserThread(thread.threadId, user.userId);
    return NextResponse.json({
      threadId: thread.threadId,
      title: saved?.title ?? thread.title,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Failed to persist thread" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const removed = await deleteUserThread(id, user.userId);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
