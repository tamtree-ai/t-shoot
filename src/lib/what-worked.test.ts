import { describe, expect, it } from "vitest";

import { whatWorked } from "./what-worked";

function rows(group: string, n: number, hold: number) {
  return Array.from({ length: n }, () => ({ group, hold }));
}

describe("whatWorked", () => {
  it("stays quiet until each group has eight posts", () => {
    expect(whatWorked([...rows("Exchange", 8, 40), ...rows("Me vs me", 7, 20)])).toBeNull();
  });

  it("names the group that holds longer and how many posts that rests on", () => {
    const result = whatWorked([...rows("Exchange", 8, 59), ...rows("Me vs me", 8, 50)]);
    expect(result?.sentence).toBe("Exchange holds 18% longer than Me vs me. Based on 16 posts.");
    expect(result?.basedOn).toBe(16);
  });
});
