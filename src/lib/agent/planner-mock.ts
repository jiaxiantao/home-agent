import type { AgentPlan, AgentToolResult } from "@/lib/agent/types";

function hasTool(prior: AgentToolResult[], tool: AgentToolResult["tool"]) {
  return prior.some((item) => item.tool === tool);
}

function lastToolData<T>(prior: AgentToolResult[], tool: AgentToolResult["tool"]) {
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    const item = prior[index];
    if (item?.tool === tool) {
      return item.data as T | undefined;
    }
  }

  return undefined;
}

function extractTableName(message: string) {
  const match =
    message.match(/表\s*[`'"]?([a-zA-Z0-9_]+)[`'"]?/i) ??
    message.match(/\b([a-zA-Z][a-zA-Z0-9_]{1,62})\b.*表/i);
  return match?.[1];
}

function extractColumnName(message: string) {
  const match =
    message.match(/字段\s*[`'"]?([a-zA-Z0-9_]+)[`'"]?/i) ??
    message.match(/列\s*[`'"]?([a-zA-Z0-9_]+)[`'"]?/i);
  return match?.[1];
}

export function buildMockPlan(
  message: string,
  prior: AgentToolResult[],
  _conversation: Array<{ role: string; content: string; sql?: string }> = [],
): AgentPlan {
  const normalized = message.trim();

  const wantsBusinessCatalog =
    /核心表|业务表|表目录|业务说明|手写目录/.test(normalized);

  const wantsProjectDatabases =
    /大风车.*(哪些|有什么|有哪些).*数据库|项目.*数据库|业务库/.test(normalized);

  const wantsDatabases =
    /有哪些库|列出.*数据库|show databases|数据库列表|实例.*库/.test(normalized);

  const wantsTables =
    /有哪些表[^和字段]|什么表|列出.+表|表列表|show tables/i.test(normalized);

  const wantsColumnDetail =
    /字段.*类型|什么类型|column type|get_column|单个字段/.test(normalized);

  const wantsDescribe =
    /表结构|字段|schema|目录|核心表|describe|columns|列信息/.test(normalized);

  const wantsIndexes = /索引|index/i.test(normalized);
  const wantsForeignKeys = /外键|foreign key/i.test(normalized);
  const wantsDdl = /建表|ddl|create table/i.test(normalized);
  const wantsStats = /表大小|行数|table stats|存储/i.test(normalized);
  const wantsSearch = /搜索|查找.*表|查找.*字段|包含.*字段/.test(normalized);
  const wantsSample = /样例|预览|sample|前几行/.test(normalized);

  const isSchemaQuestion =
    wantsBusinessCatalog ||
    wantsProjectDatabases ||
    wantsDatabases ||
    wantsTables ||
    wantsColumnDetail ||
    wantsDescribe ||
    wantsIndexes ||
    wantsForeignKeys ||
    wantsDdl ||
    wantsStats ||
    wantsSearch ||
    wantsSample;

  const wantsAnalytics =
    !isSchemaQuestion &&
    /车源|订单|求购|线索|成交|分布|趋势|统计|多少|总量|operate_report|分析|sql|查询/.test(
      normalized,
    );

  const tableName = extractTableName(normalized);
  const columnName = extractColumnName(normalized);

  if (wantsBusinessCatalog && !hasTool(prior, "list_schema")) {
    return {
      action: "tool",
      tool: "list_schema",
      args: {},
      reasoning: "用户需要了解业务表目录说明",
    };
  }

  if (wantsProjectDatabases && !hasTool(prior, "list_project_databases")) {
    return {
      action: "tool",
      tool: "list_project_databases",
      args: {},
      reasoning: "用户想了解大风车项目有哪些业务库",
    };
  }

  if (wantsDatabases && !hasTool(prior, "list_databases")) {
    return {
      action: "tool",
      tool: "list_databases",
      args: {},
      reasoning: "用户想查看 MySQL 可见的数据库列表",
    };
  }

  if (wantsTables && !hasTool(prior, "list_tables")) {
    return {
      action: "tool",
      tool: "list_tables",
      args: { pattern: tableName },
      reasoning: "用户想查看库中有哪些表",
    };
  }

  if (
    wantsColumnDetail &&
    tableName &&
    columnName &&
    !hasTool(prior, "get_column")
  ) {
    return {
      action: "tool",
      tool: "get_column",
      args: { table: tableName, column: columnName },
      reasoning: "用户询问具体字段类型",
    };
  }

  if (wantsIndexes && tableName && !hasTool(prior, "list_indexes")) {
    return {
      action: "tool",
      tool: "list_indexes",
      args: { table: tableName },
      reasoning: "用户想查看表索引",
    };
  }

  if (wantsForeignKeys && !hasTool(prior, "list_foreign_keys")) {
    return {
      action: "tool",
      tool: "list_foreign_keys",
      args: tableName ? { table: tableName } : {},
      reasoning: "用户想查看外键关系",
    };
  }

  if (wantsDdl && tableName && !hasTool(prior, "show_create_table")) {
    return {
      action: "tool",
      tool: "show_create_table",
      args: { table: tableName },
      reasoning: "用户想查看建表 DDL",
    };
  }

  if (wantsStats && !hasTool(prior, "get_table_stats")) {
    return {
      action: "tool",
      tool: "get_table_stats",
      args: tableName ? { table: tableName } : {},
      reasoning: "用户想查看表统计信息",
    };
  }

  if (wantsSearch && !hasTool(prior, "search_schema")) {
    const keyword = tableName ?? columnName ?? "car";
    return {
      action: "tool",
      tool: "search_schema",
      args: { keyword, scope: "all" },
      reasoning: "用户想搜索表或字段元数据",
    };
  }

  if (wantsSample && tableName && !hasTool(prior, "sample_table_rows")) {
    return {
      action: "tool",
      tool: "sample_table_rows",
      args: { table: tableName, limit: 5 },
      reasoning: "用户想预览表数据样例",
    };
  }

  if (
    (wantsDescribe || (tableName && /字段|列|结构/.test(normalized))) &&
    tableName &&
    !hasTool(prior, "describe_table")
  ) {
    return {
      action: "tool",
      tool: "describe_table",
      args: { table: tableName },
      reasoning: "用户需要查看表字段结构",
    };
  }

  if (wantsDescribe && !tableName && !hasTool(prior, "list_schema")) {
    return {
      action: "tool",
      tool: "list_schema",
      args: {},
      reasoning: "用户需要了解业务表目录",
    };
  }

  if (wantsAnalytics && !hasTool(prior, "propose_sql") && !hasTool(prior, "execute_sql")) {
    if (/分布|状态/.test(normalized) && /车源/.test(normalized)) {
      return {
        action: "tool",
        tool: "propose_sql",
        args: {
          sql: "SELECT car_status, COUNT(*) AS cnt FROM car WHERE test_type = 0 GROUP BY car_status ORDER BY cnt DESC LIMIT 50",
          explanation: "按车源状态统计正式车源数量分布",
        },
        reasoning: "演示模式：提出车源状态分布 SQL",
      };
    }

    if (/趋势|近\s*7|本月|日报|operate/.test(normalized)) {
      return {
        action: "tool",
        tool: "propose_sql",
        args: {
          sql: "SELECT report_date, car_new, buy_new, pv, uv FROM operate_report ORDER BY report_date DESC LIMIT 14",
          explanation: "查看最近运营日报中的新增车源/求购与流量",
        },
        reasoning: "演示模式：提出运营趋势 SQL",
      };
    }

    if (/订单/.test(normalized)) {
      return {
        action: "tool",
        tool: "propose_sql",
        args: {
          sql: "SELECT COUNT(*) AS order_count FROM main_order WHERE delete_time IS NULL",
          explanation: "统计未删除的主订单总量",
        },
        reasoning: "演示模式：提出订单总量 SQL",
      };
    }

    if (/求购|线索/.test(normalized)) {
      return {
        action: "tool",
        tool: "propose_sql",
        args: {
          sql: "SELECT COUNT(*) AS buy_count FROM buy_car WHERE test_type = 0",
          explanation: "统计正式求购线索总量",
        },
        reasoning: "演示模式：提出求购总量 SQL",
      };
    }

    return {
      action: "tool",
      tool: "propose_sql",
      args: {
        sql: "SELECT COUNT(*) AS car_count FROM car WHERE test_type = 0",
        explanation: "统计正式车源总量",
      },
      reasoning: "演示模式：提出车源总量 SQL",
    };
  }

  if (hasTool(prior, "execute_sql") && !hasTool(prior, "build_chart")) {
    const result = lastToolData<{
      columns: string[];
      rows: Record<string, unknown>[];
    }>(prior, "execute_sql");

    if (result && result.rows.length > 1) {
      return {
        action: "tool",
        tool: "build_chart",
        args: {
          columns: result.columns,
          rows: result.rows,
          title: "查询结果",
        },
        reasoning: "已有多行结果，尝试生成图表",
      };
    }
  }

  if (prior.length > 0) {
    const context = prior.map((item) => `${item.tool}: ${item.output}`).join("\n");
    return {
      action: "answer",
      answer: `（数据分析助手）已结合工具结果：\n${context}\n\n针对「${message}」的结论已基于上述查询；请核对 SQL 与业务口径。`,
      reasoning: "演示模式：已有工具输出，合成最终回答",
    };
  }

  return {
    action: "answer",
    answer: `（数据分析助手）已理解你的问题：「${message}」。可尝试问「有哪些数据库」「matador 有哪些表」「car 表有哪些字段」「车源总数」。本地未启用 LLM 时使用规则规划器。`,
    reasoning: "无匹配工具，直接回答",
  };
}
