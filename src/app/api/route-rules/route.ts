import { NextResponse } from "next/server";

import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import { resolveUserRole } from "@/lib/security/rbac";
import {
  listRouteRules,
  upsertRouteRule,
  deleteRouteRule,
  type RouteRuleInput,
} from "@/lib/analytics/route-rules-store";

function requireAdmin(request: Request) {
  const user = resolveAuthUserFromHeaders(request.headers);
  if (isAuthEnabled() && !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const authUser = user ?? { userId: "dev", userName: "Development", authMode: "disabled" as const };
  if (resolveUserRole(authUser.userId) !== "admin" && isAuthEnabled()) {
    return { error: NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 }) };
  }
  return { user: authUser };
}

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if ("error" in auth && auth.error) return auth.error;

  const rules = await listRouteRules();
  return NextResponse.json({ rules, count: rules.length });
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if ("error" in auth && auth.error) return auth.error;

  const body = (await request.json()) as RouteRuleInput;
  if (!body.pattern || !body.databases?.length) {
    return NextResponse.json(
      { error: "pattern and databases are required" },
      { status: 400 },
    );
  }

  try {
    const id = await upsertRouteRule(body);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save rule" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = requireAdmin(request);
  if ("error" in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteRouteRule(id);
  return NextResponse.json({ deleted: true });
}
