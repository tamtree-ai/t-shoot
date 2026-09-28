import "server-only";

import { lookup } from "node:dns/promises";

import { assertPublicUrl, isPrivateAddress } from "@/lib/topics";

/** Read a public article or a YouTube title. Redirects are not followed. */
export async function readPublicLink(raw: string): Promise<{ url: string; heading: string; text: string }> {
  const url = assertPublicUrl(raw);
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("That link stays on a private network.");

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!oembed.ok) throw new Error("That video didn't answer.");
    const json = (await oembed.json()) as { title?: string; author_name?: string };
    const heading = json.title?.trim() || "Video";
    const text = `${heading}. ${json.author_name ?? ""}`.trim();
    return { url: url.href, heading, text };
  }

  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  if (response.status >= 300 && response.status < 400) throw new Error("That link redirects. Paste the final address.");
  if (!response.ok) throw new Error("That page didn't answer.");
  const html = (await response.text()).slice(0, 200_000);
  const heading = decode(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "");
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  if (text.length < 40 && !heading) throw new Error("That page didn't have enough text to read.");
  return { url: url.href, heading, text: text || heading };
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
