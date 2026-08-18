import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  dfcMcpCallHttpApi,
  dfcMcpCatalogStats,
  dfcMcpGetApi,
  dfcMcpRouteApi,
  dfcMcpSearchApis,
  formatDfcMcpCallOutput,
  formatDfcMcpRouteOutput,
  formatDfcMcpSearchOutput,
} from "@/lib/mcp/dfc-api/facade";

const ssoSchema = z
  .object({
    token: z.string(),
    tokenHeader: z.string().optional(),
    cookieHeader: z.string().optional(),
    serviceChain: z.string().optional(),
  })
  .optional();

function jsonContent(data: unknown, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** 注册大风车 API MCP 工具（stdio / 测试可复用） */
export function createDfcApiMcpServer() {
  const server = new McpServer({
    name: "dfc-api-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "dfc_catalog_stats",
    {
      title: "DFC catalog stats",
      description: "返回大风车 HTTP 接口目录统计（http/readOnly 等）",
    },
    async () => {
      const result = dfcMcpCatalogStats();
      return jsonContent(
        result,
        `catalogSize=${result.catalogSize} stats=${JSON.stringify(result.stats)}`,
      );
    },
  );

  server.registerTool(
    "dfc_search_apis",
    {
      title: "Search DFC APIs",
      description:
        "按关键词/问题搜索大风车 HTTP 接口目录。只读 HTTP 可经 dfc_call_http_api 调用。",
      inputSchema: {
        question: z.string().optional(),
        keyword: z.string().optional(),
        appCode: z.string().optional(),
        entity: z.string().optional(),
        kind: z.enum(["http"]).optional(),
        readOnlyOnly: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args) => {
      const result = dfcMcpSearchApis(args);
      return jsonContent(result, formatDfcMcpSearchOutput(result));
    },
  );

  server.registerTool(
    "dfc_route_api",
    {
      title: "Route DFC API",
      description: "按自然语言问题路由 Top 候选接口并提取 phone/recordId 等参数",
      inputSchema: {
        question: z.string(),
        endpointId: z.string().optional(),
      },
    },
    async (args) => {
      const result = dfcMcpRouteApi(args);
      return jsonContent(result, formatDfcMcpRouteOutput(result));
    },
  );

  server.registerTool(
    "dfc_get_api",
    {
      title: "Get DFC API",
      description: "按 endpointId 返回 HTTP 接口详情（path / sqlFallback）",
      inputSchema: {
        endpointId: z.string(),
      },
    },
    async (args) => {
      const result = dfcMcpGetApi(args.endpointId);
      const text = result.endpoint
        ? JSON.stringify(result.endpoint, null, 2)
        : `未找到 endpointId：${args.endpointId}`;
      return jsonContent(result, text);
    },
  );

  server.registerTool(
    "dfc_call_http_api",
    {
      title: "Call DFC HTTP API",
      description:
        "调用只读 HTTP 接口并转发 SSO。可选 query/body 透传。",
      inputSchema: {
        endpointId: z.string(),
        question: z.string().optional(),
        phone: z.string().optional(),
        recordId: z.string().optional(),
        shopCode: z.string().optional(),
        groupCode: z.string().optional(),
        objCode: z.string().optional(),
        plate: z.string().optional(),
        query: z.record(z.string(), z.string()).optional(),
        body: z.record(z.string(), z.unknown()).optional(),
        sso: ssoSchema,
        _sso: ssoSchema,
      },
    },
    async (args) => {
      const result = await dfcMcpCallHttpApi({
        ...args,
        sso: args.sso ?? args._sso,
      });
      const text = formatDfcMcpCallOutput(result.endpointId, result.appCode, result);
      // eslint-disable-next-line no-console -- MCP server operational log (no token)
      console.error(
        `[dfc-api-mcp] call endpointId=${result.endpointId} app=${result.appCode} status=${result.status}`,
      );
      return jsonContent(result, text);
    },
  );

  return server;
}
