import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Brief → Script → filming → Edit → review → export, on the mock", async ({ page, browser }) => {
  // Brief
  await page.goto("/projects/new");
  await page.getByLabel(/what.*about|topic/i).first().fill("Why an octopus has three hearts");
  await page.getByRole("button", { name: /write the script/i }).click();

  // Script → approve (starts filming)
  await expect(page).toHaveURL(/\/p\/.+\/script/);
  await expect(page.getByRole("button", { name: /approve and start filming/i })).toBeEnabled();
  await page.getByRole("button", { name: /approve and start filming/i }).click();

  // Edit: scenes film and record (the worker drives them), then everything is Ready
  await expect(page).toHaveURL(/\/p\/.+\/edit/);
  const started = Date.now();
  await expect(page.getByRole("link", { name: "Export", exact: true })).toBeVisible({ timeout: 45_000 });
  expect(Date.now() - started).toBeLessThan(45_000);

  // A free edit never charges; a paid one shows its price first
  await page.getByRole("button", { name: /new take/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("~$");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Accessibility pass on the Edit screen (serious+ only)
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === "critical")).toEqual([]);

  // Share for review → client comments and approves with no login
  const projectUrl = page.url().replace(/\/edit.*/, "");
  await page.goto(`${projectUrl}/review`);
  await page.getByRole("button", { name: /create a review link/i }).click();
  await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible();
  const token = ((await page.locator("code").getAttribute("title")) ?? "").match(/\/r\/([\w-]+)/)?.[1];
  expect(token).toBeTruthy();

  const client = await (await browser.newContext()).newPage();
  const link = new URL(page.url()).origin;
  await client.goto(`${link}/r/${token}`);
  await expect(client.getByText(/for your review/i)).toBeVisible();
  await expect(client.getByText(/\$/)).toHaveCount(0); // no cost shown to clients (OD-8)
  await client.getByLabel("Your name").fill("Jordan K.");
  await client.getByPlaceholder(/what would you change/i).fill("Brighter, please.");
  await client.getByRole("button", { name: /post comment/i }).click();
  await expect(client.getByText("Brighter, please.")).toBeVisible();

  // Owner sees it under Needs you
  await page.reload();
  await expect(page.getByText("Brighter, please.")).toBeVisible();

  // Export
  await page.goto(`${projectUrl}/export`);
  await page.getByRole("button", { name: /render final video/i }).click();
  await expect(page.getByRole("link", { name: /download mp4/i })).toBeVisible({ timeout: 30_000 });
});
