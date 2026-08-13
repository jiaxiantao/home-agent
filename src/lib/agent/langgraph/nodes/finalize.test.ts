import { afterEach, describe, expect, it } from "vitest";

import { streamSynthesizeAnswerAfterQuery } from "@/lib/agent/langgraph/nodes/finalize";

describe("streamSynthesizeAnswerAfterQuery", () => {
  const originalLlmDisabled = process.env.LLM_DISABLED;

  afterEach(() => {
    if (originalLlmDisabled === undefined) {
      delete process.env.LLM_DISABLED;
    } else {
      process.env.LLM_DISABLED = originalLlmDisabled;
    }
  });

  it("streams a fallback answer when LLM is disabled", async () => {
    process.env.LLM_DISABLED = "1";

    const deltas: string[] = [];
    let doneText = "";

    for await (const event of streamSynthesizeAnswerAfterQuery({
      message: "查询车牌号为皖JV066M的车辆信息",
      summary: "接口返回 1 条记录。",
      prior: [
        {
          tool: "call_backend_api",
          args: { plate: "皖JV066M" },
          output: "ok",
          data: {
            status: "success",
            endpointId: "queryRecordPageInfo",
            appCode: "crazyracing-kartrider",
            message: "ok",
            table: {
              columns: ["id", "plate_number"],
              rows: [{ id: "sF4Y588y6i", plate_number: "皖JV066M" }],
            },
          },
        },
      ],
    })) {
      if (event.kind === "delta") {
        deltas.push(event.text);
      } else {
        doneText = event.text;
      }
    }

    expect(deltas.length).toBeGreaterThan(0);
    expect(doneText).toContain("皖JV066M");
    expect(doneText).toContain("sF4Y588y6i");
  });
});
