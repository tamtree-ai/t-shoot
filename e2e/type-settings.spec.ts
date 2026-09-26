import { expect, test, type Page } from "@playwright/test";

/**
 * T3: a workspace default visibly constrains a new brief, and a video's limit can never
 * be raised past the workspace cap. Restores whatever the settings were before.
 */
async function readSettings(page: Page) {
  const section = page.getByRole("region", { name: "AI clips" });
  const selects = section.getByRole("combobox");
  return {
    voice: await selects.nth(0).inputValue(),
    look: await selects.nth(1).inputValue(),
    length: (await section.getByRole("group", { name: "Longest video" }).locator('[aria-pressed="true"]').innerText()).trim(),
    cap: await section.getByRole("textbox").inputValue(),
  };
}

async function writeSettings(page: Page, s: { voice: string; look: string; length: string; cap: string }) {
  const section = page.getByRole("region", { name: "AI clips" });
  const selects = section.getByRole("combobox");
  await section.getByRole("group", { name: "Longest video" }).getByRole("button", { name: s.length, exact: true }).click();
  await selects.nth(0).selectOption(s.voice);
  await selects.nth(1).selectOption(s.look);
  await section.getByRole("textbox").fill(s.cap);
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByRole("status")).toContainText("Saved");
}

test("workspace defaults preset and bound a new AI clips brief", async ({ page }) => {
  await page.goto("/settings");
  const before = await readSettings(page);
  try {
    await writeSettings(page, { voice: "kore", look: before.look, length: "30s", cap: "3.00" });

    await page.goto("/projects/new?type=ai_clips");
    const lengths = page.getByRole("group", { name: "Length" }).getByRole("button");
    await expect(lengths).toHaveCount(1);
    await expect(lengths).toHaveText("30s");
    await expect(page.getByRole("group", { name: "Voice" }).getByRole("button", { name: /^Kore/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("$3.00")).toBeVisible();

    await page.getByLabel(/what.*about/i).fill("A limit above the cap is refused");
    await page.getByRole("button", { name: "change" }).click();
    await page.getByLabel(/limit for this video/i).fill("4.00");
    await page.getByRole("button", { name: /write the script/i }).click();
    await expect(page.getByText("This workspace caps a video at $3.00.")).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/new/);
  } finally {
    await page.goto("/settings");
    await writeSettings(page, before);
  }
});
