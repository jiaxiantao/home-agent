import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createDfcApiEndpoint,
  deleteDfcApiEndpoint,
  ensureDfcApiCatalogFromDatabase,
  getDfcApiEndpointRecord,
  listDfcApiAppSummaries,
  listDfcApiEndpointsPage,
  updateDfcApiEndpoint,
} from "@/lib/analytics/dfc-api-endpoints";
import { listDfcAppServiceOptions } from "@/lib/analytics/dfc-app-registry";
import { loadDfcApiEnv } from "@/lib/config/load-project-env";
import { inferDefaultTestParams } from "@/lib/analytics/dfc-api-default-params";
import { HTTP_METHODS } from "@/lib/analytics/http-methods";
import { normalizePartialTestConfig } from "@/lib/analytics/dfc-api-test-config";
import {
  deserializeDfcApiEndpoint,
  serializeDfcApiEndpoint,
} from "@/lib/analytics/dfc-api-endpoint-serialize";
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

const paramsSchema = z.record(z.string(), z.unknown());

const endpointSchema = z.object({
  id: z.string().min(1).max(512),
  appCode: z.string().min(1).max(64),
  repo: z.string().optional(),
  entity: z.string().optional(),
  title: z.string().min(1).max(256),
  description: z.string().optional(),
  kind: z.literal("http"),
  readOnly: z.boolean().optional(),
  preferOverSql: z.boolean().optional(),
  http: z
    .object({
      method: z.enum(HTTP_METHODS),
      path: z.string().min(1),
      queryParams: z.record(z.string(), z.string()).optional(),
      bodyTemplate: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  dubbo: z
    .object({
      interfaceName: z.string(),
      method: z.string(),
      paramHints: z.string().optional(),
    })
    .optional(),
  keywords: z.array(z.string()).optional(),
  methodName: z.string().optional(),
  className: z.string().optional(),
  sqlFallback: z
    .object({
      database: z.string(),
      table: z.string(),
      hint: z.string(),
    })
    .optional(),
  baseUrlEnvKey: z.string().optional(),
  matchPatterns: z.array(z.string()).optional(),
});

function buildEndpointFromBody(body: z.infer<typeof endpointSchema>) {
  return deserializeDfcApiEndpoint({
    id: body.id,
    appCode: body.appCode,
    repo: body.repo ?? body.appCode,
    entity: body.entity ?? "general",
    title: body.title,
    description: body.description ?? "",
    kind: body.kind,
    readOnly: body.readOnly !== false,
    preferOverSql: body.preferOverSql ?? false,
    http: body.http,
    dubbo: body.dubbo
      ? {
          interfaceName: body.dubbo.interfaceName,
          method: body.dubbo.method,
          paramHints: body.dubbo.paramHints ?? "",
        }
      : undefined,
    keywords: body.keywords ?? [],
    methodName: body.methodName,
    className: body.className,
    sqlFallback: body.sqlFallback ?? {
      database: "*",
      table: "*",
      hint: "manual",
    },
    baseUrlEnvKey: body.baseUrlEnvKey ?? "DFC_API_GATEWAY_BASE_URL",
    matchPatterns: body.matchPatterns ?? [],
  });
}

export async function GET(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  if (id) {
    await ensureDfcApiCatalogFromDatabase();
    const record = await getDfcApiEndpointRecord(id);
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      endpoint: record,
      canManage: canManageApis(user.userId),
    });
  }

  const kind = "http" as const;

  const appCodeFilter = url.searchParams.get("appCode")?.trim() ?? "";

  loadDfcApiEnv();

  const result = await listDfcApiEndpointsPage({
    page: Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
    pageSize:
      Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20,
    q: url.searchParams.get("q")?.trim() ?? "",
    kind,
    appCode: appCodeFilter,
  });

  const apps = await listDfcApiAppSummaries();
  const registryApps = listDfcAppServiceOptions(apps.map((item) => item.appCode));

  return NextResponse.json({
    endpoints: result.items,
    apps,
    registryApps,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    catalogSize: result.catalogSize,
    storage: result.storage,
    canManage: canManageApis(user.userId),
  });
}

const testConfigSchema = z.object({
  params: paramsSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  cookies: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageApis(user.userId)) {
    return NextResponse.json({ error: "仅管理员可新增接口" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        endpoint: endpointSchema,
        defaultTestParams: paramsSchema.optional(),
        defaultTestConfig: testConfigSchema.optional(),
        enabled: z.boolean().optional(),
      })
      .parse(await request.json());

    const endpoint = buildEndpointFromBody({
      ...body.endpoint,
      kind: "http",
    });
    const defaultTestConfig =
      normalizePartialTestConfig(body.defaultTestConfig) ??
      (body.defaultTestParams
        ? normalizePartialTestConfig({
            params: body.defaultTestParams as Record<string, unknown>,
          })
        : undefined);
    const record = await createDfcApiEndpoint({
      endpoint,
      defaultTestParams: defaultTestConfig?.params ?? body.defaultTestParams,
      defaultTestConfig,
      enabled: body.enabled,
      createdBy: user.userId,
    });
    return NextResponse.json({ endpoint: record });
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

export async function PATCH(request: Request) {
  const user = resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageApis(user.userId)) {
    return NextResponse.json({ error: "仅管理员可编辑接口" }, { status: 403 });
  }

  try {
    const body = z
      .object({
        id: z.string().min(1),
        title: z.string().min(1).max(256).optional(),
        description: z.string().optional(),
        readOnly: z.boolean().optional(),
        enabled: z.boolean().optional(),
        defaultTestParams: paramsSchema.optional(),
        defaultTestConfig: testConfigSchema.optional(),
        endpoint: endpointSchema.partial().optional(),
      })
      .parse(await request.json());

    const current = await getDfcApiEndpointRecord(body.id);
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let endpoint = current.endpoint;
    if (body.endpoint) {
      const serialized = serializeDfcApiEndpoint(endpoint);
      endpoint = deserializeDfcApiEndpoint({
        ...serialized,
        ...body.endpoint,
        id: body.id,
        matchPatterns:
          body.endpoint.matchPatterns ??
          serialized.matchPatterns,
        dubbo: body.endpoint.dubbo
          ? {
              interfaceName: body.endpoint.dubbo.interfaceName ?? serialized.dubbo?.interfaceName ?? "",
              method: body.endpoint.dubbo.method ?? serialized.dubbo?.method ?? "",
              paramHints: body.endpoint.dubbo.paramHints ?? serialized.dubbo?.paramHints ?? "",
            }
          : serialized.dubbo,
      });
    }

    const record = await updateDfcApiEndpoint(body.id, {
      title: body.title,
      description: body.description,
      readOnly: body.readOnly,
      enabled: body.enabled,
      defaultTestParams: body.defaultTestParams as Record<string, unknown> | undefined,
      defaultTestConfig: normalizePartialTestConfig(body.defaultTestConfig),
      endpoint,
    });
    return NextResponse.json({ endpoint: record });
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
  if (!canManageApis(user.userId)) {
    return NextResponse.json({ error: "仅管理员可删除接口" }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const removed = await deleteDfcApiEndpoint(id);
    if (!removed) {
      return NextResponse.json(
        { error: "未找到接口，或内置/导入接口不可删除（可停用）" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 },
    );
  }
}
