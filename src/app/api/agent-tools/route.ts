import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createManagedHttpTool,
  deleteManagedTool,
  listManagedToolsPage,
  updateManagedTool,
} from "@/lib/agent/managed-tools";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import { resolveUserRole } from "@/lib/security/rbac";

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

const httpSchema = z.object({
  method: z.enum(["GET", "POST"]),
  url: z.string().min(1).max(500),
  queryTemplate: z.record(z.string(), z.unknown()).optional(),
  bodyTemplate: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.unknown()).optional(),
});

const argsSchema = z.record(z.string(), z.string());

export async function GET(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kindRaw = url.searchParams.get("kind")?.trim() ?? "all";
  const kind =
    kindRaw === "builtin" || kindRaw === "http" || kindRaw === "disabled"
      ? kindRaw
      : "all";

  const result = await listManagedToolsPage({
    page: Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
    pageSize:
      Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20,
    q: url.searchParams.get("q")?.trim() ?? "",
    kind,
  });

  return NextResponse.json({
    tools: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    canManage: canManageTools(user.userId),
  });
}

export async function POST(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTools(user.userId)) {
    return NextResponse.json({ error: "仅管理员可新增工具" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        name: z.string().min(1).max(48),
        label: z.string().min(1).max(80),
        description: z.string().min(1).max(1000),
        args: argsSchema.optional(),
        http: httpSchema,
        enabled: z.boolean().optional(),
      })
      .parse(await request.json());

    const tool = await createManagedHttpTool({
      ...body,
      createdBy: user.userId,
    });
    return NextResponse.json({ tool });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTools(user.userId)) {
    return NextResponse.json({ error: "仅管理员可编辑工具" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        id: z.string().min(1),
        label: z.string().min(1).max(80).optional(),
        description: z.string().min(1).max(1000).optional(),
        args: argsSchema.optional(),
        enabled: z.boolean().optional(),
        http: httpSchema.nullable().optional(),
      })
      .parse(await request.json());

    const tool = await updateManagedTool(body.id, {
      label: body.label,
      description: body.description,
      args: body.args,
      enabled: body.enabled,
      http: body.http ?? undefined,
    });
    if (!tool) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ tool });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTools(user.userId)) {
    return NextResponse.json({ error: "仅管理员可删除工具" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const removed = await deleteManagedTool(id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 },
    );
  }
}
