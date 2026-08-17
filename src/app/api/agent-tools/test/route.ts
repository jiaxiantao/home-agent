import { NextResponse } from "next/server";
import { z } from "zod";

import { testAgentTool, testAgentToolsBatch } from "@/lib/agent/tool-test";
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

const argsSchema = z.record(z.string(), z.unknown());

export async function POST(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageTools(user.userId)) {
    return NextResponse.json({ error: "仅管理员可测试工具" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        names: z.array(z.string().min(1)).optional(),
        args: argsSchema.optional(),
        argsByName: z.record(z.string(), argsSchema).optional(),
        allowExecuteSql: z.boolean().optional(),
      })
      .parse(await request.json());

    const names =
      body.names?.length && body.names.length > 0
        ? body.names
        : body.name
          ? [body.name]
          : [];

    if (!names.length) {
      return NextResponse.json({ error: "请提供 name 或 names" }, { status: 400 });
    }

    if (names.length === 1) {
      const result = await testAgentTool(names[0], body.args, {
        allowExecuteSql: body.allowExecuteSql,
      });
      return NextResponse.json({ result });
    }

    const batch = await testAgentToolsBatch(names, {
      args: body.args,
      argsByName: body.argsByName,
      allowExecuteSql: body.allowExecuteSql,
    });
    return NextResponse.json(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test failed" },
      { status: 400 },
    );
  }
}
