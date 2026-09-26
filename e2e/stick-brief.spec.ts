import { expect, test } from "@playwright/test";

/** K2: a stick-skit brief, picked from engine-drawn galleries, saves with its catalog pinned and spends nothing. */
test("a stick-figure skit brief persists with a pinned catalog version", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByRole("link", { name: "Stick-figure skit" }).click();

  await page.getByLabel(/what.*skit about/i).fill("Replying “sounds good” to a message you didn’t read");
  const cast = page.getByRole("group", { name: "Cast" });
  await expect(cast.getByRole("button", { name: "Milo" })).toHaveAttribute("aria-pressed", "true");
  await cast.getByRole("button", { name: "June" }).click();
  await page.getByRole("group", { name: "Format" }).getByRole("button", { name: "Exchange" }).click();
  await page.getByRole("group", { name: "Set" }).getByRole("button", { name: "Cafe", exact: true }).click();

  await page.getByRole("button", { name: /write the skit/i }).click();

  await expect(page).toHaveURL(/\/p\/.+\/script/);
  await expect(page.getByRole("status")).toContainText("Nothing has been spent");
  await expect(page.getByText(/^c1-[0-9a-f]{16}$/)).toBeVisible();
  await expect(page.getByText("exchange")).toBeVisible();
});
