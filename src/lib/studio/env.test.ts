import { describe, expect, it } from "vitest";

import { assertAuthMode } from "@/lib/standalone";
import { assertStudioEnv, studioEnv, studioSecret } from "./env";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const HEX = "a".repeat(64);
const publicEnv = env({ NODE_ENV: "production", STUDIO_PUBLIC: "1", STUDIO_SECRET: HEX, APP_URL: "https://studio.example.com" });

describe("studioEnv", () => {
  it("has defaults when nothing is set", () => {
    expect(studioEnv(env({}))).toEqual({ appUrl: null, secret: null, dataDir: ".studio-data", blob: "local", isPublic: false });
  });

  it("reads a hex or base64 key of 32 bytes", () => {
    expect(studioEnv(env({ STUDIO_SECRET: HEX })).secret?.length).toBe(32);
    expect(studioEnv(env({ STUDIO_SECRET: Buffer.alloc(32, 7).toString("base64") })).secret?.length).toBe(32);
  });

  it("refuses a key of the wrong length", () => {
    expect(() => studioEnv(env({ STUDIO_SECRET: "short" }))).toThrow(/32 bytes/);
  });

  it("trims a trailing slash from APP_URL and refuses a non-URL", () => {
    expect(studioEnv(env({ APP_URL: "https://x.test/" })).appUrl).toBe("https://x.test");
    expect(() => studioEnv(env({ APP_URL: "x.test" }))).toThrow(/not a URL/);
  });

  it("refuses a blob store that isn't built", () => {
    expect(() => studioEnv(env({ STUDIO_BLOB: "s3" }))).toThrow(/not built/);
    expect(() => studioEnv(env({ STUDIO_BLOB: "ftp" }))).toThrow(/not a store/);
  });

  it("studioSecret explains how to make a key", () => {
    expect(() => studioSecret(env({}))).toThrow(/openssl rand -hex 32/);
  });
});

describe("assertStudioEnv", () => {
  it("allows a private setup with nothing set", () => {
    expect(() => assertStudioEnv(env({}))).not.toThrow();
  });

  it("allows a complete public setup", () => {
    expect(() => assertStudioEnv(publicEnv)).not.toThrow();
  });

  it.each([
    ["no secret", { STUDIO_SECRET: "" }, /STUDIO_SECRET/],
    ["no APP_URL", { APP_URL: "" }, /APP_URL/],
    ["plain http", { APP_URL: "http://studio.example.com" }, /https/],
    ["a dev server", { NODE_ENV: "development" }, /production build/],
    ["sign-in links on the page", { TAMSHOOT_SHOW_MAGIC_LINK: "1" }, /anyone could sign in/],
  ])("refuses public review with %s", (_label, patch, message) => {
    expect(() => assertStudioEnv(env({ ...publicEnv, ...patch }))).toThrow(message);
  });
});

describe("assertAuthMode with public review", () => {
  it("refuses local sign-in when review links are public", () => {
    expect(() => assertAuthMode(env({ TAMTREE_ADAPTER: "local", TAMSHOOT_AUTH: "local", STUDIO_PUBLIC: "1" }))).toThrow(/STUDIO_PUBLIC=1/);
  });

  it("still allows local sign-in in private standalone mode", () => {
    expect(() => assertAuthMode(env({ TAMTREE_ADAPTER: "local", TAMSHOOT_AUTH: "local" }))).not.toThrow();
  });
});
