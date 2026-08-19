import { NextResponse } from "next/server";

import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import {
  listDashboardCards,
  pinDashboardCard,
  unpinDashboardCard,
  updateDashboardCard,
  type PinCardInput,
} from "@/lib/dashboard/store";

function resolveUser(request: Request) {
  const user = resolveAuthUserFromHeaders(request.headers);
  if (isAuthEnabled() && !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user: user ?? { userId: "dev", userName: "Development", authMode: "disabled" as const } };
}

export async function GET(request: Request) {
  const auth = resolveUser(request);
  if ("error" in auth && auth.error) return auth.error;

  const cards = await listDashboardCards(auth.user!.userId);
  return NextResponse.json({ cards, count: cards.length });
}

export async function POST(request: Request) {
  const auth = resolveUser(request);
  if ("error" in auth && auth.error) return auth.error;

  const body = (await request.json()) as PinCardInput;
  if (!body.title || !body.question) {
    return NextResponse.json({ error: "title and question required" }, { status: 400 });
  }

  const id = await pinDashboardCard({ ...body, userId: auth.user!.userId });
  return NextResponse.json({ id });
}

export async function PATCH(request: Request) {
  const auth = resolveUser(request);
  if ("error" in auth && auth.error) return auth.error;

  const body = (await request.json()) as { id: string; title?: string; sortOrder?: number; shared?: boolean };
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await updateDashboardCard(body.id, auth.user!.userId, body);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const auth = resolveUser(request);
  if ("error" in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await unpinDashboardCard(id, auth.user!.userId);
  return NextResponse.json({ deleted: true });
}
