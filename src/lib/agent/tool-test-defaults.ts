/** 客户端可用的默认测试参数，不依赖 Node / DB / MCP。 */

export type ToolTestArgsHint = {
  args?: Record<string, string>;
  kind?: "builtin" | "http";
};

function sampleStringArg(typeHint: string) {
  const normalized = typeHint.toLowerCase();
  if (normalized.includes("number")) {
    return 1;
  }
  if (normalized.includes("boolean")) {
    return true;
  }
  if (normalized.includes("[]")) {
    return ["sample"];
  }
  return "test";
}

export function getDefaultTestArgs(
  toolName: string,
  tool?: ToolTestArgsHint | null,
): Record<string, unknown> {
  switch (toolName) {
    case "list_project_databases":
    case "list_databases":
    case "list_schema":
      return {};
    case "list_tables":
      return { database: "matador", pattern: "car" };
    case "describe_table":
      return { database: "matador", table: "car" };
    case "get_column":
      return { database: "matador", table: "car", column: "id" };
    case "list_indexes":
    case "show_create_table":
      return { database: "matador", table: "car" };
    case "list_foreign_keys":
      return { database: "matador" };
    case "get_table_stats":
      return { database: "matador", table: "car" };
    case "search_schema":
      return { keyword: "car", limit: 3 };
    case "route_question":
      return { question: "matador 库车辆相关表" };
    case "route_api":
      return { question: "查询客户手机号16612341112的客户信息" };
    case "search_api":
      return { keyword: "客户", limit: 3 };
    case "call_backend_api":
      return {
        endpointId:
          "super-mario:http:GET:/queryCustomerDetailsByContact:queryCustomerDetailsByContact",
        phone: "16612341112",
      };
    case "sample_table_rows":
      return { database: "matador", table: "car", limit: 1 };
    case "propose_sql":
      return { sql: "SELECT 1 AS ping", explanation: "工具连通性测试" };
    case "execute_sql":
      return { sql: "SELECT 1 AS ping" };
    case "build_chart":
      return {
        columns: ["category", "value"],
        rows: [
          { category: "A", value: 1 },
          { category: "B", value: 2 },
        ],
        chartType: "bar",
      };
    default: {
      if (tool?.kind === "http" && tool.args) {
        const args: Record<string, unknown> = {};
        for (const [key, typeHint] of Object.entries(tool.args)) {
          if (typeHint.endsWith("?")) {
            continue;
          }
          args[key] = sampleStringArg(typeHint);
        }
        return args;
      }
      return {};
    }
  }
}
