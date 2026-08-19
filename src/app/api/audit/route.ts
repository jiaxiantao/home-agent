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
  const startTime = url.searchParams.get("startTime") ?? undefined;
  const endTime = url.searchParams.get("endTime") ?? undefined;
  const threadId = url.searchParams.get("threadId") ?? undefined;
  const outcome = url.searchParams.get("outcome") ?? undefined;
  const format = url.searchParams.get("format") ?? "json";

  const records = await listAuditRecords({
    limit,
    event,
    userId,
    startTime,
    endTime,
    threadId,
    outcome,
  });

  if (format === "csv") {
    const headers = ["ts", "event", "userId", "userName", "sql", "outcome", "runId", "threadId"];
    const csvRows = [
      headers.join(","),
      ...records.map((r) =>
        headers
          .map((h) => {
            const v = (r as Record<string, unknown>)[h];
            const s = v == null ? "" : String(v);
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(","),
      ),
    ];
    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({
    records,
    count: records.length,
  });
}
