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

export function buildMockPlan(message: string, prior: AgentToolResult[]): AgentPlan {
  const normalized = message.trim();
  const wantsSearch = /笔记|检索|搜索|架构|性能|RAG|note/i.test(normalized);
  const wantsMath = /计算|等于|多少|\+|\-|\*|\//.test(normalized) && !/车源|订单|求购|分布|趋势/.test(normalized);
  const wantsTime = /几点|时间|现在几点|日期/.test(normalized) && !/近\s*\d+|本月|上周/.test(normalized);
  const mathMatch = normalized.match(/([\d.+\-*/()\s]+)/);

  const wantsAnalytics =
    /车源|订单|求购|线索|成交|分布|趋势|统计|多少辆|总量|operate_report|大风车|分析/.test(
      normalized,
    );

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

  if (wantsSearch && !hasTool(prior, "search_notes")) {
    return {
      action: "tool",
      tool: "search_notes",
      args: {
        query:
          normalized.replace(/^(请|帮我)?(搜索|检索|查找)/, "").trim() ||
          "前端架构",
      },
      reasoning: "问题涉及知识库，先检索笔记",
    };
  }

  if (wantsMath && !hasTool(prior, "calculate") && mathMatch?.[1]?.trim()) {
    return {
      action: "tool",
      tool: "calculate",
      args: { expression: mathMatch[1].trim() },
      reasoning: "问题包含算式，继续执行计算",
    };
  }

  if (wantsTime && !hasTool(prior, "current_time")) {
    return {
      action: "tool",
      tool: "current_time",
      args: {},
      reasoning: "用户提到时间，补充当前时刻",
    };
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
    answer: `（数据分析助手）已理解你的问题：「${message}」。可尝试问「车源总数」「各状态车源分布」「最近运营趋势」。本地未启用 LLM 时使用规则规划器。`,
    reasoning: "无匹配工具，直接回答",
  };
}
