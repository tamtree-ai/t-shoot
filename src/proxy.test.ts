import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

function hit(path: string, cookie?: string) {
  const headers = cookie ? { cookie: `tshoot_session=${cookie}` } : undefined;
  return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { headers }));
}

const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/review/abc", "/review/abc/file/1", "/r/tok", "/c/tok", "/sign-in", "/sign-in/use", "/api/health", "/api/v1/shows"])("lets %s through signed out", (path) => {
    expect(passes(hit(path))).toBe(true);
  });

  it.each(["/", "/studio", "/studio/clients/1", "/settings", "/p/1/script", "/reviewer", "/rx"])("sends %s to sign-in when signed out", (path) => {
    const res = hit(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/sign-in");
  });

  it("answers an API call with 401, not a redirect", async () => {
    const res = hit("/api/media/x");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in first." });
  });

  it("lets a request with a session cookie through (getCurrentMember checks it)", () => {
    expect(passes(hit("/studio", "anything"))).toBe(true);
  });

  it("lets everything through in local sign-in mode", () => {
    vi.stubEnv("TAMTREE_ADAPTER", "local");
    vi.stubEnv("TAMSHOOT_AUTH", "local");
    expect(passes(hit("/studio"))).toBe(true);
  });
});
