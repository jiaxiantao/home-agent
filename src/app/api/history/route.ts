import { NextResponse } from "next/server";

import {
  deleteServerHistory,
  listServerHistory,
} from "@/lib/history/server-history";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";

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
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const entries = await listServerHistory(user.userId, limit);

  return NextResponse.json({ entries });
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

  const removed = await deleteServerHistory(user.userId, id);

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
