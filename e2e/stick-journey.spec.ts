import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Serious and critical axe violations on the page as it stands. */
async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/**
 * K5: the whole stick-skit journey on the mock. Brief → skit → edit a line → Approve → Ready →
 * client link (the MP4 plays) → comment → Turn into a change → revise.
 */
test("stick skit: brief to a client's comment, and back to a revise", async ({ page, browser }) => {
  test.setTimeout(90_000);

  // Brief
  await page.goto("/projects/new");
  await page.getByRole("link", { name: "Stick-figure skit" }).click();
  await page.getByLabel(/what.*skit about/i).fill("The group chat that only wakes up for memes");
  await page.getByRole("group", { name: "Cast" }).getByRole("button", { name: "June" }).click();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: /write the skit/i }).click();

  // The skit: edit a line, re-checked in the browser, saved
  await expect(page.getByRole("list", { name: "Beats" })).toBeVisible();
  await page.getByLabel("Beat 2: line").fill("We saw it. We chose peace.");
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Approve → Ready
  await page.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByText("Version 1 is ready")).toBeVisible({ timeout: 30_000 });

  // Share for review
  await page.getByRole("paragraph").filter({ hasText: "is ready" }).getByRole("link", { name: "Review" }).click();
  await page.getByRole("button", { name: /create a review link/i }).click();
  await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible();
  const token = ((await page.locator("code").getAttribute("title")) ?? "").match(/\/r\/([\w-]+)/)?.[1];
  expect(token).toBeTruthy();
  expect(await axe(page)).toEqual([]);

  // The client, with no login: the real MP4 plays, and seeks by byte range
  const client = await (await browser.newContext()).newPage();
  await client.goto(`/r/${token}`);
  await expect(client.getByText(/for your review/i)).toBeVisible();
  await expect(client.getByText(/\$/)).toHaveCount(0); // no cost shown to clients (OD-8)
  await expect.poll(() => client.locator("video").evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(1);
  const ranged = await client.request.get(`/r/${token}/video`, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-type"]).toBe("video/mp4");
  expect(await axe(client)).toEqual([]);

  await client.getByLabel("Your name").fill("Jordan K.");
  await client.getByPlaceholder(/what would you change/i).fill("June should sound more tired.");
  await client.getByRole("button", { name: /post comment/i }).click();
  await expect(client.getByText("June should sound more tired.")).toBeVisible();

  // The owner turns it into a change: a revise of the skit, with the comment as the note
  await page.reload();
  await page.getByRole("link", { name: "Turn into a change" }).click();
  await expect(page).toHaveURL(/\/script\?change=/);
  await expect(page.getByLabel("Ask for a change")).toHaveValue(/June should sound more tired/);
  await page.getByRole("button", { name: "Rewrite" }).click();
  await expect(page.getByText("Changed by your note")).toBeVisible();
  await expect(page.getByText(/changed the skit since/i)).toBeVisible();

  // The comment is resolved by that revise
  await page.goto(page.url().replace(/\/script.*/, "/review"));
  await expect(page.getByRole("link", { name: "Turn into a change" })).toHaveCount(0);
  await expect(page.getByText(/1 turned into changes?/)).toBeVisible();

  // Export: the made version downloads as it is
  await page.goto(page.url().replace(/\/review.*/, "/export"));
  await expect(page.getByRole("link", { name: "Download MP4" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
