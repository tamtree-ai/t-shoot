import { expect, test, type Page } from "@playwright/test";

/** The project id behind a library card's link. */
async function projectId(page: Page, title: RegExp): Promise<string> {
  const href = (await page.getByRole("link", { name: title }).first().getAttribute("href")) ?? "";
  const id = href.match(/\/p\/([0-9a-f-]{36})/)?.[1];
  expect(id, `a /p/<id> link for ${title}`).toBeTruthy();
  return id!;
}

/**
 * The first run, as the README promises it: signed in, a finished sample to watch, and
 * "Your first video" made for real (Kokoro + StickStage) on the first Approve.
 */
test("standalone: a finished sample plays, and Approve makes your first video", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Local mode: anyone on this computer can use it/)).toBeVisible();
  await expect(page.getByText(/Standalone · Kokoro/)).toBeVisible();

  // The finished demo renders once at first start; give it time on a cold machine.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: /Not being sarcastic/ }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 5 * 60_000, intervals: [5_000] });

  await page.goto(`/p/${await projectId(page, /Not being sarcastic/)}/review`);
  await expect.poll(() => page.locator("video").first().evaluate((v: HTMLVideoElement) => v.duration), { timeout: 30_000 }).toBeGreaterThan(1);

  await page.goto("/");
  await page.goto(`/p/${await projectId(page, /Your first video/)}/script`);
  const approve = page.getByRole("button", { name: /^Approve/ });
  await expect(approve).toContainText("Free");
  await approve.click();
  await expect(page.getByText(/Version 1 is ready/)).toBeVisible({ timeout: 8 * 60_000 });
});

/** What a chatbot sends back: the draft shape the prompt asks for, wrapped in chat prose. */
const CHATBOT_REPLY = `Sure! Here's your skit:

\`\`\`json
${JSON.stringify({
  title: "Reply all",
  template: "exchange",
  description: "Some emails should stay drafts.",
  hashtags: ["stickfigure", "office"],
  scenes: [
    {
      lines: [
        { who: "milo", text: "I just hit reply all.", expression: "worried" },
        { who: "june", text: "On the CEO's email?", expression: "deadpan" },
        { who: "milo", text: "It was a thumbs up.", expression: "neutral" },
        { who: "june", text: "That's not so bad.", expression: "neutral" },
        { who: "milo", text: "With my lunch order.", expression: "worried" },
        { who: "june", text: "What did you order?", expression: "neutral" },
        { who: "milo", text: "Extra pickles. All caps.", expression: "worried" },
        { who: "june", text: "Bold choice.", expression: "deadpan" },
        { who: "milo", text: "He replied.", expression: "surprised" },
        { who: "june", text: "Fired?", expression: "neutral" },
        { who: "milo", text: "He wants pickles too.", expression: "smug" },
        { who: "june", text: "Promotion by sandwich.", expression: "deadpan", slam: "PICKLES" },
      ],
    },
  ],
})}
\`\`\`

Let me know if you want changes!`;

test("standalone: a chatbot's pasted reply becomes a checked skit, with no model and no key", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel(/what.*skit about/i).fill("Hitting reply all by accident");
  await page.getByRole("group", { name: "Cast" }).getByRole("button", { name: "June" }).click();
  await page.getByRole("button", { name: /write the skit/i }).click();

  await expect(page.getByRole("heading", { name: "Write it with any chatbot" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show the prompt" }).click();
  await expect(page.locator("pre")).toContainText("comedy skit");
  await page.getByLabel(/the chatbot.s reply/i).fill("this is not json");
  await page.getByRole("button", { name: "Use this reply" }).click();
  await expect(page.getByText(/That reply couldn.t be used/)).toBeVisible();

  await page.getByLabel(/the chatbot.s reply/i).fill(CHATBOT_REPLY);
  await page.getByRole("button", { name: "Use this reply" }).click();
  await expect(page.getByRole("list", { name: "Beats" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Beat 1: line")).toHaveValue("I just hit reply all.");
  await expect(page.getByRole("button", { name: /^Approve/ })).toBeEnabled();
});
