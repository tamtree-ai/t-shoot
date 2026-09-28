import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function previewSurface(page: Page) {
  return page.getByRole("complementary", { name: "Preview and approve" }).locator("svg, canvas").first();
}

async function openReview(page: Page) {
  await page.goto("/projects/new");
  await page.getByRole("link", { name: "Stick-figure skit" }).click();
  await expect(page.getByRole("img", { name: "Cast on the set" })).toBeVisible();
  await page.getByLabel(/what.*skit about/i).fill("These fries are my whole personality");
  await page.getByRole("button", { name: /write the skit/i }).click();
  await expect(page.getByRole("list", { name: "Beats" })).toBeVisible();
  await expect(previewSurface(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("The preview didn’t paint.")).toHaveCount(0);
}

test("a prop picked from the line shows on the next line by that speaker", async ({ page }) => {
  await openReview(page);
  await page.getByLabel("Beat 2: speaker").getByRole("button", { name: "Milo" }).click();
  await page.getByRole("button", { name: "Play video" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Pause video" }).click();
  const chip = page.getByRole("button", { name: /Beat 1: prop/ });
  const before = await previewSurface(page).screenshot();
  await chip.click();
  const search = page.getByRole("combobox", { name: "Search props" });
  await search.fill("chips");
  const fries = page.getByRole("option", { name: /Fries, food/i });
  const name = (await fries.count()) > 0 ? "Fries" : "Cup";
  if ((await fries.count()) === 0) await search.fill("coffee");
  await search.press("Enter");
  await expect(chip).toContainText(name);
  await expect(page.getByRole("button", { name: /Beat 2: prop/ })).toContainText(`${name} · from 01`);
  await page.waitForTimeout(500);
  await expect.poll(async () => previewSurface(page).screenshot(), { timeout: 8_000 }).not.toEqual(before);
});

test("the prop picker works from the keyboard", async ({ page }) => {
  await openReview(page);
  const chip = page.getByRole("button", { name: /Beat 1: prop/ });
  await chip.focus();
  await page.keyboard.press("Enter");
  const search = page.getByRole("combobox", { name: "Search props" });
  await expect(search).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(chip).not.toContainText("+ Prop");
  await expect(search).toBeHidden();
});

test("a missing prop names the closest ones", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: /Beat 1: prop/ }).click();
  await page.getByRole("combobox", { name: "Search props" }).fill("kebab");
  await expect(page.getByText(/No prop called kebab\. Closest/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Hold a sign instead" })).toBeVisible();
});

test("the prop picker is a bottom sheet on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReview(page);
  await page.getByRole("button", { name: /Beat 1: prop/ }).click();
  const dialog = page.getByRole("dialog", { name: /Beat 1: props/ });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThan(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
  expect(await axe(page)).toEqual([]);
});
