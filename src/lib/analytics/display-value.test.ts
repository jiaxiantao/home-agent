import { describe, expect, it } from "vitest";

import {
  formatDisplayValue,
  formatRecordAsBulletList,
} from "@/lib/analytics/display-value";

describe("formatDisplayValue", () => {
  it("uses displayValue from car model JSON objects", () => {
    expect(
      formatDisplayValue({
        year: 2018,
        brandName: "奥迪",
        modelName: "2018款 奥迪Q5 典藏版 40 TFSI 进取型",
        displayValue: "奥迪Q5 2018款 典藏版 40 TFSI 进取型",
      }),
    ).toBe("奥迪Q5 2018款 典藏版 40 TFSI 进取型");
  });

  it("parses JSON strings", () => {
    expect(
      formatDisplayValue('{"displayValue":"测试车型"}'),
    ).toBe("测试车型");
  });

  it("joins brand and model when displayValue is absent", () => {
    expect(
      formatDisplayValue({
        brandName: "奥迪",
        modelName: "A4L",
      }),
    ).toBe("奥迪 A4L");
  });
});

describe("formatRecordAsBulletList", () => {
  it("skips empty fields and formats nested values", () => {
    const text = formatRecordAsBulletList(
      ["vin_number", "name", "plate_number", "mileage"],
      {
        vin_number: "TEST5566345677888",
        name: {
          displayValue: "奥迪Q5 2018款 典藏版 40 TFSI 进取型",
        },
        plate_number: null,
        mileage: 20000,
      },
    );

    expect(text).toContain("**vin_number**：TEST5566345677888");
    expect(text).toContain("**name**：奥迪Q5 2018款 典藏版 40 TFSI 进取型");
    expect(text).not.toContain("plate_number");
    expect(text).toContain("**mileage**：20000");
  });
});
