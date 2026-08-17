import { NextResponse } from "next/server";
import { z } from "zod";

import {
  previewDfcApiEndpointRequest,
  testDfcApiEndpoint,
  testDfcApiEndpointsBatch,
} from "@/lib/analytics/api-endpoint-test";
import { runDfcApiTestWithRequestSso } from "@/lib/analytics/dfc-api-test-sso";
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

function canManageApis(userId: string) {
  if (!isAuthEnabled()) {
    return true;
  }
  return resolveUserRole(userId) === "admin";
}

const paramsSchema = z.object({
  phone: z.string().optional(),
  wechat: z.string().optional(),
  recordId: z.string().optional(),
  shopCode: z.string().optional(),
  groupCode: z.string().optional(),
  orgCode: z.string().optional(),
  departmentCode: z.string().optional(),
  objCode: z.string().optional(),
  plate: z.string().optional(),
});

const headersSchema = z.record(z.string(), z.string());

export async function GET(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageApis(user.userId)) {
    return NextResponse.json({ error: "仅管理员可测试接口" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const endpointId = url.searchParams.get("endpointId")?.trim();
    if (!endpointId) {
      return NextResponse.json({ error: "请提供 endpointId" }, { status: 400 });
    }

    let params: z.infer<typeof paramsSchema> | undefined;
    const paramsRaw = url.searchParams.get("params");
    if (paramsRaw) {
      params = paramsSchema.parse(JSON.parse(paramsRaw));
    }

    const preview = await runDfcApiTestWithRequestSso(request, () =>
      previewDfcApiEndpointRequest(endpointId, { params }),
    );
    if (!preview) {
      return NextResponse.json({ error: "接口不存在" }, { status: 404 });
    }

    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageApis(user.userId)) {
    return NextResponse.json({ error: "仅管理员可测试接口" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        endpointId: z.string().min(1).optional(),
        endpointIds: z.array(z.string().min(1)).optional(),
        params: paramsSchema.optional(),
        paramsByEndpoint: z.record(z.string(), paramsSchema).optional(),
        headers: headersSchema.optional(),
        query: headersSchema.optional(),
        body: z.record(z.string(), z.unknown()).optional(),
        cookies: headersSchema.optional(),
      })
      .parse(await request.json());

    const endpointIds =
      body.endpointIds?.length && body.endpointIds.length > 0
        ? body.endpointIds
        : body.endpointId
          ? [body.endpointId]
          : [];

    if (!endpointIds.length) {
      return NextResponse.json(
        { error: "请提供 endpointId 或 endpointIds" },
        { status: 400 },
      );
    }

    if (endpointIds.length === 1) {
      const result = await runDfcApiTestWithRequestSso(request, () =>
        testDfcApiEndpoint(endpointIds[0], {
          params: body.params,
          headers: body.headers,
          query: body.query,
          body: body.body,
          cookies: body.cookies,
        }),
      );
      return NextResponse.json({ result });
    }

    const batch = await runDfcApiTestWithRequestSso(request, () =>
      testDfcApiEndpointsBatch(endpointIds, {
        params: body.params,
        paramsByEndpoint: body.paramsByEndpoint,
      }),
    );
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
