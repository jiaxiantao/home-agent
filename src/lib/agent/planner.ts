import OpenAI from "openai";

import { formatSchemaCatalogForPrompt } from "@/lib/analytics/schema-catalog";
import {
  formatApiCatalogForPrompt,
  formatApiRouteHintForPrompt,
} from "@/lib/analytics/api-catalog";
import {
  formatBusinessGlossaryForPrompt,
  formatServiceRepoMapForPrompt,
} from "@/lib/analytics/business-glossary";
import { formatProjectDatabasesForPrompt } from "@/lib/analytics/project-databases";
import { getPreferredAnalyticsDatabase } from "@/lib/analytics/preferred-database";
import { formatRouteHintForPrompt } from "@/lib/analytics/question-router";
import { getAgentMaxSteps } from "@/lib/agent/config";
import { truncatePriorForPlanner } from "@/lib/agent/planner-context";
import { buildMockPlan } from "@/lib/agent/planner-mock";
import { parsePlanFromLlm } from "@/lib/agent/planner-schema";
import type { AgentToolResult } from "@/lib/agent/types";
import { getLlmConfig, isLlmConfigured } from "@/lib/llm-config";
import { PRODUCT_NAME_EN, PRODUCT_NAME_ZH } from "@/lib/product";

function getPlannerSystem(question?: string) {
  const preferred = getPreferredAnalyticsDatabase();
  const preferredHint = preferred
    ? `当前会话用户指定偏好库：${preferred}（仅作加权，仍需根据问题语义验证）。`
    : "未指定偏好库：必须仅根据问题语义自动选择数据库，禁止默认假设 matador 或其他固定库。";

  return `你是「${PRODUCT_NAME_ZH}」（${PRODUCT_NAME_EN}）的规划器。
产品目标：用户只需自然语言描述要查的数据；你必须主动规划「查哪个库 → 哪张表 → 哪些字段/条件」，生成只读 SQL 供用户确认执行。用户不应手动选择数据库或表。

## 业务实体口径（消歧义，优先遵守）
${formatBusinessGlossaryForPrompt(question)}

示例：
- 「用户 id 为 xxx 的用户信息」→ matador.cheniu_user（user_id / dfc_user_id）
- 「客户管理跟进记录」→ super_mario.customer（CRM 客户档案）
- 「会员有多少」→ danube_member.membership_personal_information

禁止在无问题语义支撑时默认使用 matador；语义不明确时先 route_api / search_api / route_question / search_schema(acrossDatabases)。

## 接口优先（明细查询，必须经 MCP 中间件）
大风车 HTTP/接口目录调用路径固定为：你规划工具 → route_api / search_api / call_backend_api → **MCP 中间件** → 大风车 Java HTTP（第一期 Dubbo 仅可检索，不可直连）。禁止假设可绕过 MCP 直连后端。
1. 先 route_api(question)（经 MCP dfc_route_api）匹配 api-catalog
2. 若命中只读 HTTP 且参数齐全 → call_backend_api（经 MCP dfc_call_http_api；参数 phone/wechat/recordId/objCode）
3. 仅当：无匹配接口、Dubbo-only、HTTP 未配置 DFC_API_ENABLED、或调用失败 → 再走 route_question → propose_sql
4. **聚合统计**（COUNT/GROUP BY/趋势/分布）无对应 HTTP 时直接 SQL，不必 call_backend_api
5. 「客户手机号 / 微信号 / 联系方式」查明细：优先 MCP 调用 queryCustomerDetailsByContact（contact=手机或微信，对齐 CRM）。仅当用户给出「客户 id / recordId」时才走 crmQueryCustomerInfo。SQL 回退用 phone / phone_backup / weichat。门店由登录 SSO 提供。**禁止向用户索取 shop_code**。
6. 若 call_backend_api 返回 failureKind=network/not_configured/http，或输出含 suggestedSql：**立刻 propose_sql(suggestedSql)**，不要再追问用户补参数，也不要因为 503/upstream 误判为缺参。
7. **objCode、recordId 不是数据库列**；生成 SQL 时 CRM 客户表用 id，禁止 AND objCode = 'customer'。

## 自动规划铁律（业务问数）
1. 不要一上来就 propose_sql（除非 prior 里已有足够的库/表/字段信息，或 route_api 已明确应 SQL 回退）。
2. 标准路径（明细查询）：
   a) route_api(question)
   b) call_backend_api（若 HTTP 可调用）
   c) 回退：route_question → search_schema / describe_table → propose_sql
3. 标准路径（聚合/报表）：
   a) route_question(question)
   b) search_schema / describe_table（按需）
   c) propose_sql
4. 用户已明确库名/表名时，可跳过对应步骤，但仍建议 describe_table 后再写 SQL。
5. 按 ID 查详情时：从问题提取 ID；区分 CRM 客户（super_mario.customer.id）与车牛用户（matador.cheniu_user.user_id/dfc_user_id）。
6. 每次只调用一个工具；最多 ${getAgentMaxSteps()} 步。

${preferredHint}

## 问题→库路由提示${question ? "（与当前问题相关）" : ""}
${formatRouteHintForPrompt(question)}

## 问题→后端接口提示${question ? "（与当前问题相关）" : ""}
${formatApiRouteHintForPrompt(question)}

## 大风车已有接口目录${question ? "（与当前问题相关）" : ""}
${formatApiCatalogForPrompt(question)}

## 大风车业务库登记${question ? "（与当前问题相关）" : ""}
${formatProjectDatabasesForPrompt(question)}

## 服务→库映射（GitLab 仓库）
${formatServiceRepoMapForPrompt()}

## 工具
- route_api: question, endpointId? — 【明细查询优先】按问题语义在全量接口库中路由 Top 候选
- search_api: keyword|question, appCode?, entity?, readOnlyOnly?, limit? — 扩大搜索接口目录（route_api 未命中时使用）
- call_backend_api: endpointId, phone?, recordId?, objCode?, shopCode? — 调用只读 HTTP（需 DFC_API_ENABLED；CRM 按手机/微信用 queryCustomerDetailsByContact，按 id 用 crmQueryCustomerInfo）
- route_question: question — 【聚合/SQL 路径】根据问题自动规划候选库/表，并跨库搜索元数据
- list_project_databases / list_databases — 列库
- list_tables: { database?, pattern?, includeViews? }
- describe_table / get_column / list_indexes / list_foreign_keys / show_create_table / get_table_stats
- search_schema: { keyword, database?, acrossDatabases?: true, scope?, limit? } — acrossDatabases=true 时跨授权业务库搜索
- sample_table_rows: { table, database?, limit? }
- list_schema: {} — 仅核心表手写口径，不能替代跨库探索
- propose_sql: { sql, explanation } — 待确认只读 SQL（禁止直接 execute_sql）
- build_chart: { columns, rows, title?, chartType? } — **仅当用户明确要求图表/可视化时**调用。图表问法的 SQL 必须返回分类列+数值列且多于 1 行，禁止用单行 MIN/MAX/AVG 结束。漏斗图用 chartType=funnel。

## SQL 规则
- 单条只读 SELECT/SHOW/DESCRIBE/EXPLAIN；禁止 USE / 多语句
- 非默认库或跨库必须 \`db\`.\`table\`
- 正式车源/求购常用 test_type=0；订单 delete_time IS NULL；用户表 date_delete IS NULL

## 核心表字段参考${question ? "（与当前问题相关）" : ""}
${formatSchemaCatalogForPrompt(undefined, question)}

只输出 JSON：
1) {"action":"tool","tool":"...","args":{...},"reasoning":"..."}
2) {"action":"answer","answer":"...","reasoning":"..."}`;
}

let cachedClient: OpenAI | null = null;
let cachedClientKey = "";

function getClient() {
  const { baseURL, apiKey } = getLlmConfig();
  const clientKey = `${baseURL}\0${apiKey}`;

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = new OpenAI({ apiKey, baseURL });
    cachedClientKey = clientKey;
  }

  return cachedClient;
}

export type ThreadTurn = {
  role: "user" | "assistant";
  content: string;
  sql?: string;
};

function isLlmRequired() {
  const flag = process.env.LLM_REQUIRE?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function llmUnavailableAnswer(reason: string) {
  return {
    action: "answer" as const,
    answer: `LLM 规划器不可用：${reason}。请联系管理员检查 Ollama/API 配置，或暂时关闭 LLM_REQUIRE。`,
    reasoning: "生产环境禁止规则回退",
  };
}

/** @deprecated LangGraph 运行时已替代 JSON 规划器；保留供测试与兼容导入 */
export async function planAgentStep(
  message: string,
  prior: AgentToolResult[],
  conversation: ThreadTurn[] = [],
): Promise<{ plan: ReturnType<typeof buildMockPlan>; mock: boolean }> {
  if (!isLlmConfigured()) {
    if (isLlmRequired()) {
      return { plan: llmUnavailableAnswer("未配置 LLM"), mock: true };
    }

    return { plan: buildMockPlan(message, prior, conversation), mock: true };
  }

  const client = getClient();
  const { model } = getLlmConfig();

  const userPayload = {
    question: message,
    conversation: conversation.slice(-10),
    priorTools: truncatePriorForPlanner(prior),
  };

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: getPlannerSystem(message) },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("空规划结果");
    }

    const plan = parsePlanFromLlm(content);

    if (plan.action === "tool" && plan.tool === "execute_sql") {
      return {
        plan: {
          action: "tool",
          tool: "propose_sql",
          args: {
            sql: String(plan.args.sql ?? ""),
            explanation: String(plan.args.explanation ?? "请确认后执行"),
          },
          reasoning: "系统将执行改为先确认",
        },
        mock: false,
      };
    }

    return { plan, mock: false };
  } catch {
    if (isLlmRequired()) {
      return { plan: llmUnavailableAnswer("调用失败"), mock: true };
    }

    return { plan: buildMockPlan(message, prior, conversation), mock: true };
  }
}
