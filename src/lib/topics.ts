/**
 * Extractive topics from an article or a video title. The priced click is the
 * summarise run; this function is what the mock writer returns, and what tests check.
 */

export type TopicIdea = { title: string; line: string };

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

export function topicsFromArticle(text: string, heading = ""): TopicIdea[] {
  const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const bits = sentences(clean);
  const seed = heading.trim() || bits[0] || clean.slice(0, 80);
  const pool = [seed, ...bits].filter(Boolean);
  const ideas: TopicIdea[] = [];
  const seen = new Set<string>();
  for (const bit of pool) {
    const title = bit.replace(/[.!?]$/, "").slice(0, 80);
    const key = title.toLowerCase();
    if (seen.has(key) || title.length < 8) continue;
    seen.add(key);
    const line = bits.find((s) => s !== bit && s.length > title.length) ?? bit;
    ideas.push({ title, line: line.slice(0, 160) });
    if (ideas.length === 5) break;
  }
  return ideas;
}

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

export function isPrivateAddress(host: string): boolean {
  const ip = host.toLowerCase();
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return ipv4Private(ip);
}

function ipv4Private(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Refuse hosts that are not a public article or video page. */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That link isn't a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http or https link.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That link stays on a private network.");
  }
  if (isPrivateAddress(host)) throw new Error("That link stays on a private network.");
  return url;
}
