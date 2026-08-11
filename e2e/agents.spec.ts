import { expect, test } from "@playwright/test";

test.describe("Agents page", () => {
  test("loads orchestration workspace", async ({ page }) => {
    await page.goto("/agents");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /DFC Data Agent/,
    );
    await expect(page.getByRole("button", { name: "问数" })).toBeVisible();
    await expect(page.getByRole("button", { name: "查客户" })).toBeVisible();
  });

  test("prefills task from query string", async ({ page }) => {
    await page.goto("/agents?q=" + encodeURIComponent("大风车正式车源一共有多少辆？"));

    await expect(page.locator("textarea").first()).toHaveValue(/车源/);
  });

  test("runs agent loop and shows sql confirmation", async ({ page }) => {
    await page.goto("/agents?q=" + encodeURIComponent("大风车正式车源一共有多少辆？"));

    await page.getByRole("button", { name: "问数" }).click();
    await expect(page.getByText("确认执行 SQL", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });
});
