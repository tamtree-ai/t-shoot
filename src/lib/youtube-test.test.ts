import { afterEach, describe, expect, it } from "vitest";

import { youtubeTitleTest } from "./youtube-test";

describe("youtubeTitleTest", () => {
  const previous = process.env.YOUTUBE_TITLE_TEST;
  afterEach(() => {
    if (previous === undefined) delete process.env.YOUTUBE_TITLE_TEST;
    else process.env.YOUTUBE_TITLE_TEST = previous;
  });

  it("keeps the pairs as a manual choice", () => {
    delete process.env.YOUTUBE_TITLE_TEST;
    const status = youtubeTitleTest();
    expect(status.available).toBe(false);
    if (!status.available) expect(status.reason).toMatch(/manual|YouTube/i);
  });
});
