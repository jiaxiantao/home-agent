import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createFavorite,
  deleteFavorite,
  listFavorites,
  listFavoritesPage,
} from "@/lib/history/favorites";
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
  const hasPagination =
    url.searchParams.has("page") || url.searchParams.has("pageSize");

  if (!hasPagination) {
    const favorites = await listFavorites(user.userId);
    return NextResponse.json({
      favorites,
      total: favorites.length,
    });
  }

  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
  const pageSize =
    Number.parseInt(url.searchParams.get("pageSize") ?? "10", 10) || 10;
  const result = await listFavoritesPage(user.userId, { page, pageSize });

  return NextResponse.json({
    favorites: result.items,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
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

  try {
    const body = createSchema.parse(await request.json());
    const favorite = await createFavorite({
      userId: user.userId,
      label: body.label,
      prompt: body.prompt,
    });
    return NextResponse.json({ favorite });
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

  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const removed = await deleteFavorite(user.userId, id);

  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
