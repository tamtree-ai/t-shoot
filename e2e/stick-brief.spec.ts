import { expect, test, type Page } from "@playwright/test";

/** K2: a stick-skit brief, picked from engine-drawn galleries, saves with its catalog pinned. K3: the skit is written from it. */
async function briefToSkit(page: Page) {
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
  await expect(page.getByRole("list", { name: "Beats" })).toBeVisible();
}

test("a stick-figure skit brief pins the catalog and writes the skit", async ({ page }) => {
  await briefToSkit(page);
  await expect(page.getByText(/^catalog c1-[0-9a-f]{16}$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve and make the video/i })).toBeEnabled();
});

test("K3: an edit re-checks in the browser, and a broken line blocks Approve", async ({ page }) => {
  await briefToSkit(page);
  const approve = page.getByRole("button", { name: /approve and make the video/i });
  const line2 = page.getByLabel("Beat 2: line");
  const saved = page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved)$/ });

  await line2.fill("We saw it. All of us.");
  await expect(saved).toHaveText("Saved");
  await expect(approve).toBeEnabled();

  await line2.fill("");
  await expect(approve).toBeDisabled();
  await expect(page.getByRole("region", { name: "Self-check" })).toContainText("Beat 2, line");
  await expect(page.getByText(/fix the problem the check found first/i)).toBeVisible();

  await line2.fill("Seen.");
  await expect(approve).toBeEnabled();
  await expect(saved).toHaveText("Saved");

  // The edit was saved, not only shown.
  await page.reload();
  await expect(page.getByLabel("Beat 2: line")).toHaveValue("Seen.");
});

test("K3: Ask for a change rewrites the skit and can be undone", async ({ page }) => {
  await briefToSkit(page);
  const lines = page.getByRole("list", { name: "Beats" }).getByRole("textbox", { name: /: line$/ });
  const before = await lines.last().inputValue();

  await page.getByLabel("Ask for a change").fill("Land the punchline harder");
  await page.getByRole("button", { name: "Rewrite" }).click();
  await expect(page.getByText("Changed by your note")).toBeVisible();
  await expect(lines.last()).not.toHaveValue(before);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Changed by your note")).toBeHidden();
  await expect(lines.last()).toHaveValue(before);
});
