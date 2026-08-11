import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createTeamTemplate,
  deleteTeamTemplate,
  listTeamTemplates,
} from "@/lib/history/team-templates";
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

function canManageTemplates(userId: string) {
  if (!isAuthEnabled()) {
    return true;
  }

  return resolveUserRole(userId) === "admin";
}

export async function GET(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await listTeamTemplates();
  return NextResponse.json({
    templates,
    canManage: canManageTemplates(user.userId),
  });
}

const createSchema = z.object({
  label: z.string().min(1).max(40),
  prompt: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageTemplates(user.userId)) {
    return NextResponse.json(
      { error: "仅管理员可发布团队模板" },
      { status: 403 },
    );
  }

  try {
    const body = createSchema.parse(await request.json());
    const template = await createTeamTemplate({
      label: body.label,
      prompt: body.prompt,
      createdBy: user.userId,
    });
    return NextResponse.json({ template });
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

export async function DELETE(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageTemplates(user.userId)) {
    return NextResponse.json(
      { error: "仅管理员可删除团队模板" },
      { status: 403 },
    );
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (id.startsWith("tpl_builtin_")) {
    return NextResponse.json(
      { error: "内置模板不可删除" },
      { status: 400 },
    );
  }

  const removed = await deleteTeamTemplate(id);

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
