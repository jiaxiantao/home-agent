import { NextResponse } from "next/server";
import { z } from "zod";

import {
  listTeamTemplateCategoryNames,
} from "@/lib/history/team-template-categories";
import {
  createTeamTemplate,
  deleteTeamTemplate,
  getTeamTemplateById,
  listTeamTemplateCategoryTabs,
  listTeamTemplates,
  listTeamTemplatesPage,
  recordTeamTemplateUse,
  toggleTeamTemplateFavorite,
  updateTeamTemplate,
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

function resolveSort(request: Request) {
  const sort = new URL(request.url).searchParams.get("sort")?.trim();
  return sort === "popular" ? "popular" as const : "category" as const;
}

export async function GET(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view")?.trim();
  if (view === "categoryTabs") {
    const tabs = await listTeamTemplateCategoryTabs();
    return NextResponse.json({ tabs });
  }

  const templateId = url.searchParams.get("id")?.trim();

  if (templateId) {
    const template = await getTeamTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      template,
      canManage: canManageTemplates(user.userId),
    });
  }

  const sort = resolveSort(request);
  const hasPagination =
    url.searchParams.has("page") || url.searchParams.has("pageSize");

  if (!hasPagination) {
    const templates = await listTeamTemplates({
      sort,
      viewerUserId: user.userId,
    });
    const categories = await listTeamTemplateCategoryNames();

    return NextResponse.json({
      templates,
      total: templates.length,
      categories,
      canManage: canManageTemplates(user.userId),
    });
  }

  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
  const pageSize =
    Number.parseInt(url.searchParams.get("pageSize") ?? "10", 10) || 10;
  const q = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";

  const result = await listTeamTemplatesPage({
    sort,
    page,
    pageSize,
    q,
    category,
    viewerUserId: user.userId,
  });

  return NextResponse.json({
    templates: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    categories: result.categories,
    canManage: canManageTemplates(user.userId),
  });
}

const createSchema = z.object({
  label: z.string().min(1).max(40),
  prompt: z.string().min(1).max(2000),
  category: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = z
      .object({
        action: z.enum(["use", "favorite"]).optional(),
        id: z.string().min(1).optional(),
        label: z.string().min(1).max(40).optional(),
        prompt: z.string().min(1).max(2000).optional(),
        category: z.string().max(40).optional(),
      })
      .parse(await request.json());

    if (body.action === "use") {
      if (!body.id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      await recordTeamTemplateUse(body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "favorite") {
      if (!body.id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
      }
      const result = await toggleTeamTemplateFavorite(user.userId, body.id);
      return NextResponse.json(result);
    }

    if (!canManageTemplates(user.userId)) {
      return NextResponse.json(
        { error: "仅管理员可发布团队模板" },
        { status: 403 },
      );
    }

    const payload = createSchema.parse(body);
    const template = await createTeamTemplate({
      label: payload.label,
      prompt: payload.prompt,
      category: payload.category,
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

const patchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(40).optional(),
  prompt: z.string().min(1).max(2000).optional(),
  category: z.string().max(40).optional(),
});

export async function PATCH(request: Request) {
  const user = resolveUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageTemplates(user.userId)) {
    return NextResponse.json(
      { error: "仅管理员可编辑团队模板" },
      { status: 403 },
    );
  }

  try {
    const body = patchSchema.parse(await request.json());
    const template = await updateTeamTemplate(body.id, {
      label: body.label,
      prompt: body.prompt,
      category: body.category,
    });

    if (!template) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
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

  const removed = await deleteTeamTemplate(id);

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
