import { describe, expect, it } from "vitest";

import {
  analyticsSchemaCatalog,
  formatSchemaCatalogForPrompt,
} from "@/lib/analytics/schema-catalog";

describe("schema-catalog", () => {
  it("documents matador.car sale_price on car table not car_extra", () => {
    const matadorCar = analyticsSchemaCatalog.find(
      (item) => item.database === "matador" && item.name === "car",
    );
    expect(matadorCar?.columns.some((col) => col.name === "sale_price")).toBe(true);
    expect(matadorCar?.notes?.some((note) => /car_extra/.test(note))).toBe(true);

    const carExtra = analyticsSchemaCatalog.find(
      (item) => item.database === "matador" && item.name === "car_extra",
    );
    expect(carExtra?.columns.some((col) => col.name === "sale_price")).toBe(false);
  });

  it("includes matador car tables when question mentions sale price", () => {
    const prompt = formatSchemaCatalogForPrompt(
      undefined,
      "按售价区间统计正式车源数量分布",
    );
    expect(prompt).toContain("matador");
    expect(prompt).toContain("sale_price");
    expect(prompt).toMatch(/不在 car_extra|不在 car_extra 取价/);
  });
});
