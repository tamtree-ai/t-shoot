import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TamtreeError } from "@/lib/tamtree/adapter";
import { LiveTamtreeAdapter } from "@/lib/tamtree/live-adapter";

/** W1: how the live adapter maps /v1 onto the adapter contract, against a stand-in fetch. */
type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

function live(routes: Record<string, Route>, extra: Partial<ConstructorParameters<typeof LiveTamtreeAdapter>[0]> = {}) {
  const calls: { method: string; path: string; headers: Headers; body?: string }[] = [];
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    calls.push({ method, path: url.pathname + url.search, headers: new Headers(init.headers), body: init.body as string | undefined });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return Response.json({ error: { code: "not_found", message: `no route ${method} ${url.pathname}` } }, { status: 404 });
    return route(url, init);
  }) as typeof fetch;
  const a = new LiveTamtreeAdapter({ baseUrl: "http://tt.test/", apiKey: "k1", fetch: fetchImpl, pollMs: 1, ...extra });
  return { a, calls };
}

const event = (seq: number, name = "step_complete") => ({ seq, event: name, created_at: "", iteration: null, member: null, payload: {}, step_id: null });

describe("LiveTamtreeAdapter", () => {
  it("resolves a flow by name, sends the key and the Idempotency-Key", async () => {
    const { a, calls } = live({
      "GET /v1/flows": () => Response.json({ items: [{ id: "f-1", name: "stick-script" }], next_cursor: null }),
      "POST /v1/flows/f-1/run": () => Response.json({ run: { id: "r-1", status: "queued" } }, { status: 202 }),
    });
    const out = await a.triggerRun("stick-script", { mode: "draft", catalog_version: "c1", brief: { topic: "t", cast: [{ id: "a", character: "a" }] } } as never, { idempotencyKey: "idem-1", metadata: { p: "1" } });
    expect(out.run.id).toBe("r-1");
    const run = calls.at(-1)!;
    expect(run.headers.get("authorization")).toBe("Bearer k1");
    expect(run.headers.get("idempotency-key")).toBe("idem-1");
    expect(JSON.parse(run.body!)).toMatchObject({ input: { mode: "draft" }, metadata: { p: "1" } });
  });

  it("uses provisioned flow ids without listing flows, and names a missing flow", async () => {
    const { a, calls } = live(
      { "POST /v1/flows/f-9/run": () => Response.json({ run: { id: "r" } }), "GET /v1/flows": () => Response.json({ items: [], next_cursor: null }) },
      { flowIds: { "stick-produce": "f-9" } },
    );
    await a.triggerRun("stick-produce", {} as never, { idempotencyKey: "k" });
    expect(calls.map((c) => c.path)).toEqual(["/v1/flows/f-9/run"]);
    await expect(a.triggerRun("stick-script", {} as never, { idempotencyKey: "k" })).rejects.toMatchObject({ code: "flow_not_provisioned" });
  });

  it("maps the events page's cursor to next_after_seq", async () => {
    const { a, calls } = live({
      "GET /v1/runs/r/events": (url) =>
        url.searchParams.get("after_seq") === "0" ? Response.json({ items: [event(1), event(2)], next_cursor: "2" }) : Response.json({ items: [event(3)], next_cursor: null }),
    });
    expect((await a.listRunEvents("r", { limit: 2 })).next_after_seq).toBe(2);
    expect((await a.listRunEvents("r", { afterSeq: 2 })).next_after_seq).toBeNull();
    expect(calls[0].path).toBe("/v1/runs/r/events?after_seq=0&limit=2");
  });

  it("streams by polling events until the run is terminal, in seq order, from afterSeq", async () => {
    let polls = 0;
    const all = [event(1), event(2), event(3), event(4, "run_complete")];
    const { a } = live({
      "GET /v1/runs/r": () => Response.json({ id: "r", status: ++polls >= 3 ? "completed" : "running" }),
      "GET /v1/runs/r/events": (url) => {
        const after = Number(url.searchParams.get("after_seq"));
        const visible = all.slice(0, Math.min(polls + 1, 4));
        return Response.json({ items: visible.filter((e) => e.seq > after), next_cursor: null });
      },
    });
    const seen = [];
    for await (const e of a.streamRunEvents("r", { afterSeq: 1 })) seen.push(e.seq);
    expect(seen).toEqual([2, 3, 4]);
  });

  it("serves byte ranges from one whole download, cached by asset id", async () => {
    let downloads = 0;
    const { a } = live({
      "GET /v1/assets/a1/content": () => {
        downloads++;
        return new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { "content-type": "video/mp4" } });
      },
    });
    const part = await a.getAssetContent("a1", { start: 2, end: 4 });
    expect(part).toMatchObject({ mimeType: "video/mp4", size: 10, range: { start: 2, end: 4 } });
    expect([...new Uint8Array(await new Response(part.body).arrayBuffer())]).toEqual([2, 3, 4]);
    const whole = await a.getAssetContent("a1");
    expect(whole.range).toBeNull();
    expect((await new Response(whole.body).arrayBuffer()).byteLength).toBe(10);
    expect(downloads).toBe(1);
  });

  it("pages run assets and keeps the contract's fields", async () => {
    const asset = (id: string) => ({ id, name: `${id}.mp4`, mime_type: "video/mp4", size_bytes: 1, created_at: "", kind: "file", run_id: "r" });
    const { a } = live({
      "GET /v1/runs/r/assets": (url) => Response.json(url.searchParams.get("cursor") ? { items: [asset("b")], next_cursor: null } : { items: [asset("a")], next_cursor: "a" }),
    });
    expect(await a.listRunAssets("r")).toEqual([
      { id: "a", name: "a.mp4", mime_type: "video/mp4", size_bytes: 1, created_at: "" },
      { id: "b", name: "b.mp4", mime_type: "video/mp4", size_bytes: 1, created_at: "" },
    ]);
  });

  it("turns a /v1 error envelope into a TamtreeError", async () => {
    const { a } = live({ "POST /v1/runs/r/cancel": () => Response.json({ error: { code: "conflict", message: "run already finished" } }, { status: 409 }) });
    const err = await a.cancelRun("r").catch((e) => e);
    expect(err).toBeInstanceOf(TamtreeError);
    expect(err).toMatchObject({ status: 409, code: "conflict", message: "run already finished" });
  });
});
