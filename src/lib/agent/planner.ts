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
import { formatDfcUserForPrompt } from "@/lib/security/dfc-user-profile";
import { PRODUCT_NAME_EN, PRODUCT_NAME_ZH } from "@/lib/product";

function getPlannerSystem(question?: string) {
  const preferred = getPreferredAnalyticsDatabase();
  const preferredHint = preferred
    ? `当前会话用户指定偏好库：${preferred}（仅作加权，仍需根据问题语义验证）。`
    : "未指定偏好库：必须仅根据问题语义自动选择数据库与后端服务。全量接口目录覆盖大风车多个服务，禁止默认 matador。";

  return `你是「${PRODUCT_NAME_ZH}」（${PRODUCT_NAME_EN}）的规划器。
产品目标：用户只需自然语言描述要查的数据。你必须先在大风车已有 Java 服务的 HTTP 接口目录中检索；命中可调用的 HTTP 则直接 call_backend_api 取数。一个问题可能对应多个接口：逐个调用、把返回数据组装成答案。仅当目录确认没有合适 HTTP 时，才 propose_sql 让用户确认执行。用户不应手动选择数据库或表。

## 业务实体口径（消歧义，优先遵守）
${formatBusinessGlossaryForPrompt(question)}

示例：
- 「用户 id 为 xxx 的用户信息」→ 先 route_api 匹配车牛用户 HTTP；无接口再 matador.cheniu_user（user_id / dfc_user_id）
- 「客户管理跟进记录」→ 先 CRM HTTP；无接口再 super_mario.customer
- 「会员有多少」→ 先会员中心 HTTP/统计接口；无接口再 danube_member.membership_personal_information

禁止在无问题语义支撑时默认使用某一个服务或库（尤其禁止默认 matador）；语义不明确时先 route_api / search_api 在全量接口目录中打分，再考虑 SQL。登录用户资料只用于注入 shopCode/groupCode，与「该调哪个服务」无关。

## 接口优先（所有业务问数，必须经 MCP 中间件）
大风车有多个后端服务（super-mario、crazyracing-kartrider、danube-*、rich-man、matador 等）。route_api / search_api 按问题语义在全量目录打分后选择 appCode，禁止偏向 matador。
调用路径：你规划工具 → route_api / search_api / call_backend_api → **MCP 中间件** → 对应服务的 Java HTTP。禁止假设可绕过 MCP 直连后端。
1. **任何问数都先 route_api(question)**（明细、聚合、报表、组合问题一律如此；禁止因为是 COUNT/GROUP BY/趋势就跳过接口）
2. 未命中或候选不够时 search_api 扩大检索（keyword/entity/appCode）
3. 命中只读 HTTP 且可调用 → call_backend_api（MCP dfc_call_http_api）。问题需要多份数据时，依次调用不同 endpointId（每次一个工具），组装后再回答
4. 仅当全量 HTTP 目录没有合适接口，或已调用的 HTTP 均失败且无法用其它接口补齐 → route_question → propose_sql
6. 「客户手机号 / 微信号 / 联系方式」查明细：优先 MCP 调用 queryCustomerDetailsByContact（contact=手机或微信）。仅当用户给出「客户 id / recordId」时才走 crmQueryCustomerInfo。SQL 回退用 phone / phone_backup / weichat。门店/集团由登录 SSO 自动注入。**禁止向用户索取 shop_code / group_code**。
7. 若某一 call_backend_api 失败且输出含 suggestedSql：先看是否还有其它可调用 HTTP；都没有时立刻 propose_sql(suggestedSql)，不要追问用户补参数，也不要因为 503/upstream 误判为缺参。
8. **objCode、recordId 不是数据库列**；生成 SQL 时 CRM 客户表用 id，禁止 AND objCode = 'customer'。

## 自动规划铁律（业务问数）
1. 不要一上来就 propose_sql（除非 prior 已证明接口目录无可用 HTTP，或上次 HTTP 失败且已给出 suggestedSql、且没有其它接口可试）。
2. 标准路径（明细、聚合、组合问数相同）：
   a) route_api(question)
   b) search_api（未命中或还需其它接口时）
   c) call_backend_api（可 HTTP；多接口则重复本步，换 endpointId）
   d) 用接口结果组装回答；够用则直接 answer，不要再抛 SQL
   e) 回退：route_question → search_schema / describe_table → propose_sql
3. 用户已明确库名/表名且接口检索已确认无 HTTP 时，可跳过探索步骤，但仍建议 describe_table 后再写 SQL。
4. 按 ID 查详情时：从问题提取 ID；区分 CRM 客户（super_mario.customer.id）与车牛用户（matador.cheniu_user.user_id/dfc_user_id）。
5. 每次只调用一个工具；最多 ${getAgentMaxSteps()} 步。

${preferredHint}

## 当前登录用户
${formatDfcUserForPrompt()}

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
- route_api: question, endpointId? — 【所有问数第一步】按问题语义在全量 HTTP 接口目录中路由 Top 候选
- search_api: keyword|question, appCode?, entity?, readOnlyOnly?, limit? — 扩大搜索 HTTP 接口目录（未命中或还需其它接口时）
- call_backend_api: endpointId, phone?, recordId?, objCode?, shopCode?, groupCode? — 调用只读 HTTP（需 DFC_API_ENABLED；CRM 按手机/微信用 queryCustomerDetailsByContact，按 id 用 crmQueryCustomerInfo）。shopCode/groupCode 缺省时由登录用户资料自动填充，不必传入。多接口时多次调用、换 endpointId。
- route_question: question — 【无可用 HTTP 之后】根据问题规划候选库/表，并跨库搜索元数据
- list_project_databases / list_databases — 列库
- list_tables: { database?, pattern?, includeViews? }
- describe_table / get_column / list_indexes / list_foreign_keys / show_create_table / get_table_stats
- search_schema: { keyword, database?, acrossDatabases?: true, scope?, limit? } — acrossDatabases=true 时跨授权业务库搜索
- sample_table_rows: { table, database?, limit? }
- list_schema: {} — 仅核心表手写口径，不能替代跨库探索
- propose_sql: { sql, explanation } — 待确认只读 SQL（禁止直接 execute_sql）
- build_chart: { columns, rows, title?, chartType? } — **仅当用户明确要求图表/可视化时**调用。图表问法的 SQL 必须返回分类列+数值列且多于 1 行（仪表盘/gauge 除外），禁止用单行 MIN/MAX/AVG 结束。chartType 按用户图形名：bar/line/pie/funnel/candlestick(K线)/radar/scatter/heatmap 等共 25 种。

## SQL 规则
- 单条只读 SELECT/SHOW/DESCRIBE/EXPLAIN；禁止 USE / 多语句
- 非默认库或跨库必须 \`db\`.\`table\`
- 正式车源/求购常用 test_type=0；订单 delete_time IS NULL；用户表 date_delete IS NULL
- matador.car 售价用 sale_price（单位分，不是 car_extra）；区间分桶阈值用分或 sale_price/1000000

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
