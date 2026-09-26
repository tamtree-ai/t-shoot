import { describe, expect, it } from "vitest";

import { failureNotice } from "@/lib/run-state";
import { versionMedia } from "./versions";

describe("versionMedia", () => {
  it("reads a stick version as a rendered video", () => {
    const payload = { skit: {}, voices: {}, catalog_version: "c1", render: { mp4: "a1", srt: "a2", txt: "a3", manifest: "a4" }, duration_s: 21.5, mp4_digest: "x" };
    expect(versionMedia({ kind: "stick_skit", payload })).toEqual({ kind: "video", mp4AssetId: "a1", durationS: 21.5 });
  });

  it("reads an ai_clips version as a timeline", () => {
    const payload = { version: 1, duration_s: 30, scenes: [] };
    expect(versionMedia({ kind: "ai_clips", payload })).toMatchObject({ kind: "timeline", durationS: 30 });
  });
});

describe("failureNotice for stick-produce", () => {
  it("asks for a change, not a retry, when the skit or catalog is refused", () => {
    expect(failureNotice({ error: { code: "catalog_mismatch", message: "" } }).action).toBe("ask-for-change");
    expect(failureNotice({ error: { code: "invalid_skit", message: "" } }).action).toBe("ask-for-change");
  });
});
