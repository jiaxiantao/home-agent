import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createTeamTemplateCategory,
  deleteTeamTemplateCategory,
  listTeamTemplateCategories,
  updateTeamTemplateCategory,
} from "@/lib/history/team-template-categories";
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

function canManageCategories(userId: string) {
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

  const categories = await listTeamTemplateCategories();
  return NextResponse.json({
    categories,
    canManage: canManageCategories(user.userId),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function POST(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageCategories(user.userId)) {
    return NextResponse.json({ error: "仅管理员可管理分类" }, { status: 403 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const category = await createTeamTemplateCategory(body);
    return NextResponse.json({ category });
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

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40).optional(),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export async function PATCH(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageCategories(user.userId)) {
    return NextResponse.json({ error: "仅管理员可管理分类" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const category = await updateTeamTemplateCategory(body.id, {
      name: body.name,
      description: body.description,
      sortOrder: body.sortOrder,
    });

    if (!category) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ category });
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

  if (!canManageCategories(user.userId)) {
    return NextResponse.json({ error: "仅管理员可管理分类" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const removed = await deleteTeamTemplateCategory(id);

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
