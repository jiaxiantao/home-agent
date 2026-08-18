import { describe, expect, it } from "vitest";

import { httpMethodSortRank } from "@/lib/analytics/dfc-api-endpoint-sort";

describe("dfc-api-endpoint-sort", () => {
  it("ranks GET before POST", () => {
    expect(httpMethodSortRank("http", "GET")).toBeLessThan(
      httpMethodSortRank("http", "POST"),
    );
  });
});
