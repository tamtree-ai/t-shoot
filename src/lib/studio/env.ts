/**
 * Studio Review settings (plan §5.3, §4.6). No imports, like `standalone.ts`: the server, the
 * worker and `instrumentation.ts` all read it.
 */

export type StudioEnv = {
  /** Public base URL for links in emails and "Copy link"; null builds them from the request. */
  appUrl: string | null;
  /** 32-byte key for AES-256-GCM (share tokens, passcodes); null until set. */
  secret: Buffer | null;
  dataDir: string;
  blob: "local" | "s3";
  /** Review links are reachable from the internet. */
  isPublic: boolean;
};

function parseSecret(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== 32) {
    throw new Error("STUDIO_SECRET must be 32 bytes, as 64 hex characters or base64. Make one with: openssl rand -hex 32");
  }
  return key;
}

export function studioEnv(env: NodeJS.ProcessEnv = process.env): StudioEnv {
  const blob = env.STUDIO_BLOB?.trim() || "local";
  if (blob !== "local" && blob !== "s3") throw new Error(`STUDIO_BLOB=${blob} is not a store t-shoot knows. Use local.`);
  if (blob === "s3") throw new Error("STUDIO_BLOB=s3 is not built yet. Use local.");
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, "") || null;
  if (appUrl && !/^https?:\/\/[^/]+/.test(appUrl)) throw new Error(`APP_URL=${appUrl} is not a URL. Use e.g. https://studio.example.com`);
  return {
    appUrl,
    secret: env.STUDIO_SECRET?.trim() ? parseSecret(env.STUDIO_SECRET) : null,
    dataDir: env.STUDIO_DATA_DIR?.trim() || ".studio-data",
    blob,
    isPublic: env.STUDIO_PUBLIC === "1",
  };
}

/** The key, or a clear error at the first place that needs it. */
export function studioSecret(env: NodeJS.ProcessEnv = process.env): Buffer {
  const { secret } = studioEnv(env);
  if (!secret) throw new Error("STUDIO_SECRET is not set. Make one with: openssl rand -hex 32, and add it to .env.local.");
  return secret;
}

/** At boot: a malformed value fails now, and public review links need https and a key. */
export function assertStudioEnv(env: NodeJS.ProcessEnv = process.env): void {
  const parsed = studioEnv(env);
  if (!parsed.isPublic) return;
  // Outside production, or with TAMSHOOT_SHOW_MAGIC_LINK, the sign-in page shows the link to whoever typed the email.
  if (env.NODE_ENV !== "production") throw new Error("STUDIO_PUBLIC=1 needs a production build (pnpm build && pnpm start): a dev server shows sign-in links on the page.");
  if (env.TAMSHOOT_SHOW_MAGIC_LINK === "1") throw new Error("STUDIO_PUBLIC=1 can't run with TAMSHOOT_SHOW_MAGIC_LINK=1: anyone could sign in as you. Remove it and set up mail.");
  if (!parsed.secret) throw new Error("STUDIO_PUBLIC=1 needs STUDIO_SECRET (openssl rand -hex 32).");
  if (!parsed.appUrl?.startsWith("https://")) throw new Error("STUDIO_PUBLIC=1 needs APP_URL set to the public https address of this server.");
  // Without mail the owner can't sign in (the link is only emailed), and no client hears about anything.
  if (!env.SMTP_HOST?.trim() && !env.MAIL_WEBHOOK_URL?.trim()) throw new Error("STUDIO_PUBLIC=1 needs mail: set SMTP_HOST (and SMTP_FROM), or MAIL_WEBHOOK_URL. Without it nobody can sign in.");
}
