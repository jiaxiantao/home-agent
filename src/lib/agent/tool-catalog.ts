import type { AgentToolName } from "@/lib/agent/types";

export const agentToolCatalog: Array<{
  name: AgentToolName;
  label: string;
  description: string;
  args: Record<string, string>;
}> = [
  {
    name: "list_project_databases",
    label: "项目库登记",
    description: "大风车已知业务库说明 + 当前连接可访问的库",
    args: {},
  },
  {
    name: "list_databases",
    label: "列出数据库",
    description: "查询 MySQL 实例上当前账号可见的所有库",
    args: {},
  },
  {
    name: "list_tables",
    label: "列出表",
    description: "查询指定库中的表/视图，可按名称模糊匹配",
    args: {
      database: "string?",
      pattern: "string?",
      includeViews: "boolean?",
    },
  },
  {
    name: "describe_table",
    label: "表字段",
    description: "查看某张表的全部字段、类型、是否可空、键与注释",
    args: { database: "string?", table: "string" },
  },
  {
    name: "get_column",
    label: "字段详情",
    description: "查看单个字段的类型、默认值、键类型与注释",
    args: { database: "string?", table: "string", column: "string" },
  },
  {
    name: "list_indexes",
    label: "索引",
    description: "查看表的索引与索引列组成",
    args: { database: "string?", table: "string" },
  },
  {
    name: "list_foreign_keys",
    label: "外键",
    description: "查看库或表的外键引用关系",
    args: { database: "string?", table: "string?" },
  },
  {
    name: "show_create_table",
    label: "建表 DDL",
    description: "获取 SHOW CREATE TABLE 建表/视图语句",
    args: { database: "string?", table: "string" },
  },
  {
    name: "get_table_stats",
    label: "表统计",
    description: "行数估计、存储大小、引擎、更新时间等",
    args: { database: "string?", table: "string?" },
  },
  {
    name: "search_schema",
    label: "搜索元数据",
    description: "按关键词搜索表名/字段名/注释；参数名 keyword（可用 query 别名）；可跨业务库",
    args: {
      database: "string?",
      acrossDatabases: "boolean?",
      keyword: "string",
      query: "string?",
      scope: "all|tables|columns?",
      limit: "number?",
    },
  },
  {
    name: "route_question",
    label: "问题路由",
    description: "根据自然语言自动推断候选数据库与表，并跨库搜索元数据",
    args: { question: "string", query: "string?", limitPerTerm: "number?" },
  },
  {
    name: "route_api",
    label: "接口路由",
    description: "匹配大风车已有后端 HTTP/Dubbo 接口，优先于直查 SQL",
    args: { question: "string", endpointId: "string?" },
  },
  {
    name: "search_api",
    label: "搜索接口目录",
    description: "在全量接口库（约 1 万条）中按关键词/实体/应用搜索候选接口",
    args: {
      keyword: "string?",
      question: "string?",
      appCode: "string?",
      entity: "string?",
      readOnlyOnly: "boolean?",
      limit: "number?",
    },
  },
  {
    name: "call_backend_api",
    label: "调用后端接口",
    description: "按 api-catalog 调用只读 HTTP 接口（需 DFC_API_ENABLED）",
    args: {
      endpointId: "string",
      phone: "string?",
      recordId: "string?",
      shopCode: "string?",
      objCode: "string?",
    },
  },
  {
    name: "sample_table_rows",
    label: "样例行",
    description: "安全预览表的前 N 行（自动 LIMIT）",
    args: { database: "string?", table: "string", limit: "number?" },
  },
  {
    name: "list_schema",
    label: "业务表目录",
    description: "手写的大风车核心表业务说明（非实时元数据）",
    args: {},
  },
  {
    name: "propose_sql",
    label: "提出 SQL",
    description: "生成待确认的只读 MySQL 查询",
    args: { sql: "string", explanation: "string" },
  },
  {
    name: "execute_sql",
    label: "执行 SQL",
    description: "用户确认后执行只读查询（不可由规划器直接触发）",
    args: { sql: "string" },
  },
  {
    name: "build_chart",
    label: "生成图表",
    description: "根据查询结果生成 bar/line/pie 图表描述（仅当用户明确要求图表时）",
    args: { columns: "string[]", rows: "object[]", chartType: "bar|line|pie" },
  },
];
