/**
 * The StickStage render service, called directly by the local adapter (standalone plan §2).
 * The same endpoints the `stickstage` Tamtree plugin calls (StickStage docs/render-service.md):
 *   POST /write/prompt · POST /validate · POST /render · GET /jobs/:id/events (SSE)
 *   GET /jobs/:id/files/:name · DELETE /jobs/:id · GET /healthz
 */
export type StickStageOptions = { baseUrl: string; token?: string; fetch?: typeof fetch };

export type ServiceError = { code: string; message: string; diagnostics?: unknown[]; repair?: { prompt?: string }; expected?: unknown; got?: unknown };

/** A non-2xx answer, with the service's `error` body. */
export class StickStageHttpError extends Error {
  constructor(
    readonly status: number,
    readonly error: ServiceError,
  ) {
    super(error.message || `StickStage answered ${status}`);
    this.name = "StickStageHttpError";
  }
}

/** The service could not be reached at all. */
export class StickStageUnreachable extends Error {
  constructor(readonly baseUrl: string, cause: unknown) {
    super(`StickStage is not reachable at ${baseUrl}. Start it (docker compose, or pnpm serve in StickStage) and try again.`, { cause });
    this.name = "StickStageUnreachable";
  }
}

export type WritePrompt = { system: string; prompt: string; writer: string; catalogVersion: string };

export type ValidateResult = {
  ok: boolean;
  catalogVersion: string;
  skit: Record<string, unknown>;
  premise?: Record<string, unknown>;
  lines: { id: string; speaker: string; character: string; text: string; delivery?: string; narrator?: boolean; voice?: { provider?: string; voiceId?: string } }[];
  estimatedDurationSec: number;
  warnings: { code?: string; path?: string; message?: string }[];
  check: { ok: boolean; errors: number; warnings: number; findings: Record<string, unknown>[] };
};

export type JobOutput = { url: string; type: string; bytes: number; name: string };
export type Job = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  stage?: string;
  progress?: number;
  title?: string;
  durationSec?: number;
  error?: { code: string; message: string } | null;
  check?: { findings?: unknown[] };
  outputs?: Partial<Record<"mp4" | "srt" | "txt" | "manifest" | "cover" | "thumbnail" | "sheet", JobOutput>>;
};

export type VoicedLine = { id: string; speaker: string; text: string; wav: Uint8Array; durationMs?: number };

export class StickStageClient {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly opts: StickStageOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.f = opts.fetch ?? fetch;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {}), ...extra };
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.f(`${this.base}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) } });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new StickStageUnreachable(this.base, e);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: ServiceError } | null;
      throw new StickStageHttpError(res.status, body?.error ?? { code: `http-${res.status}`, message: `StickStage answered ${res.status} for ${path}` });
    }
    return res;
  }

  private async json<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.call(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, signal });
    return (await res.json()) as T;
  }

  writePrompt(body: { mode: "draft"; brief: unknown; catalog_version?: string } | { mode: "revise"; skit: unknown; note: string; catalog_version?: string }, signal?: AbortSignal): Promise<WritePrompt> {
    return this.json("/write/prompt", body, signal);
  }

  validate(body: Record<string, unknown>, signal?: AbortSignal): Promise<ValidateResult> {
    return this.json("/validate", body, signal);
  }

  /** One multipart upload of the skit and every voiced line, as `stickstage.render_submit` does. */
  async render(skit: unknown, lines: VoicedLine[], signal?: AbortSignal): Promise<Job> {
    const form = new FormData();
    const voice = {
      schemaVersion: 1,
      lines: lines.map((l) => ({ id: l.id, speaker: l.speaker, text: l.text, audio: `voice/${fileOf(l.id)}`, ...(l.durationMs ? { durationMs: l.durationMs } : {}) })),
    };
    form.append("skit", JSON.stringify(skit));
    form.append("voice", JSON.stringify(voice));
    form.append("options", JSON.stringify({ skipCheck: false, sheet: false }));
    for (const l of lines) form.append("audio", new Blob([l.wav as BlobPart], { type: "audio/wav" }), fileOf(l.id));
    const res = await this.call("/render", { method: "POST", body: form, signal });
    return (await res.json()) as Job;
  }

  /** The job's states until it ends: SSE from `/jobs/:id/events`. */
  async *events(jobId: string, signal?: AbortSignal): AsyncIterable<Job> {
    const res = await this.call(`/jobs/${encodeURIComponent(jobId)}/events`, { headers: { accept: "text/event-stream" }, signal });
    if (!res.body) return;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        try {
          yield JSON.parse(line.slice(5).trim()) as Job;
        } catch {
          /* a partial or comment line */
        }
      }
    }
  }

  async job(jobId: string): Promise<Job> {
    return (await (await this.call(`/jobs/${encodeURIComponent(jobId)}`)).json()) as Job;
  }

  async file(output: JobOutput, signal?: AbortSignal): Promise<Uint8Array> {
    const res = await this.call(output.url, { signal });
    return new Uint8Array(await res.arrayBuffer());
  }

  async cancel(jobId: string): Promise<void> {
    await this.call(`/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => undefined);
  }

  /** `/healthz` (no auth), or why it can't be read. */
  async health(timeoutMs = 3000): Promise<{ ok: true; body: { catalogVersion?: string; bundle?: string; lipSync?: string } } | { ok: false; problem: string }> {
    try {
      const res = await this.f(`${this.base}/healthz`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (!res.ok) return { ok: false, problem: `StickStage answered ${res.status} at ${this.base}/healthz.` };
      return { ok: true, body: (await res.json()) as { catalogVersion?: string; bundle?: string; lipSync?: string } };
    } catch {
      return { ok: false, problem: `StickStage is not reachable at ${this.base}.` };
    }
  }
}

/** What the service accepts in `voice/<file>`: letters, digits, `-`, `_`, `.`. */
const fileOf = (lineId: string) => `${lineId.replace(/[^A-Za-z0-9_.-]/g, "_")}.wav`;
