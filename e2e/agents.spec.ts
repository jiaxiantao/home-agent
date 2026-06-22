import { expect, test } from "@playwright/test";

test.describe("Agents page", () => {
  test("loads orchestration workspace", async ({ page }) => {
    await page.goto("/agents");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /AI Agent/,
    );
    await expect(page.getByRole("button", { name: "运行 Agent 循环" })).toBeVisible();
    await expect(page.getByRole("button", { name: "架构笔记" })).toBeVisible();
  });

  test("prefills task from query string", async ({ page }) => {
    await page.goto("/agents?q=" + encodeURIComponent("计算 1+1"));

    await expect(page.locator("textarea").first()).toHaveValue(/计算 1\+1/);
  });

  test("runs agent loop and shows final answer", async ({ page }) => {
    await page.goto("/agents?q=" + encodeURIComponent("现在几点？"));

    await page.getByRole("button", { name: "运行 Agent 循环" }).click();
    await expect(page.getByText("最终回答")).toBeVisible({ timeout: 30_000 });
  });
});
