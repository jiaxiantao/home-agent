import { NextResponse } from "next/server";

import { listAuditRecords } from "@/lib/security/audit-store";
import { resolveAuthUserFromHeaders } from "@/lib/security/auth";
import { isAuthEnabled } from "@/lib/security/auth-config";
import { resolveUserRole } from "@/lib/security/rbac";

export async function GET(request: Request) {
  const user = resolveAuthUserFromHeaders(request.headers);

  if (isAuthEnabled() && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authUser = user ?? {
    userId: "dev",
    userName: "Development",
    authMode: "disabled" as const,
  };

  if (resolveUserRole(authUser.userId) !== "admin" && isAuthEnabled()) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const event = url.searchParams.get("event") ?? undefined;
  const userId = url.searchParams.get("userId") ?? undefined;

  const records = await listAuditRecords({
    limit,
    event: event ?? undefined,
    userId: userId ?? undefined,
  });

  return NextResponse.json({
    records,
    count: records.length,
  });
}
