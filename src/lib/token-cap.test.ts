import { describe, expect, it } from "vitest";

import { humanToolLink, tokenSpendAllowed } from "./token-cap";

describe("tokenSpendAllowed", () => {
  it("resets the spend on a new day and refuses past the cap", () => {
    expect(tokenSpendAllowed({ spentUsd: "0.900000", spentOn: "2026-09-27", today: "2026-09-28", capUsd: "1.000000", costUsd: "0.020000" }).ok).toBe(true);
    const over = tokenSpendAllowed({ spentUsd: "0.990000", spentOn: "2026-09-28", today: "2026-09-28", capUsd: "1.000000", costUsd: "0.020000" });
    expect(over.ok).toBe(false);
  });
});

describe("humanToolLink", () => {
  it("sends approve and send back to a person", () => {
    expect(humanToolLink("approve", "p1")).toBe("/p/p1/script");
    expect(humanToolLink("send_post", "p1")).toBe("/p/p1/export");
    expect(humanToolLink("write_script", "p1")).toBeNull();
  });
});
