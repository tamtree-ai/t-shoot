import { readFileSync } from "node:fs";

import { SkitSchema, PremiseSchema } from "stickstage/schema";
import { catalog } from "stickstage/data";
import { describe, expect, it } from "vitest";

/** OD-10: the package is a vendored tarball. `vendor/STICKSTAGE` records what was vendored. */
describe("vendored stickstage", () => {
  it("is the build vendor/STICKSTAGE records", () => {
    const recorded = readFileSync(new URL("../../vendor/STICKSTAGE", import.meta.url), "utf8").match(/^catalog (\S+)$/m)?.[1];
    expect(catalog.version).toBe(recorded);
  });
  it("exposes the schemas and the catalog Tamshoot builds on", () => {
    expect(typeof SkitSchema.safeParse).toBe("function");
    expect(PremiseSchema.shape.cast).toBeDefined();
    expect(catalog.characters.map((c) => c.id)).toEqual(expect.arrayContaining(["milo", "june"]));
    expect(catalog.templates).toHaveLength(5);
  });
});
