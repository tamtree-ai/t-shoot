import "server-only";

import { type CurrentMember, getCurrentMember } from "@/lib/auth";

import { StudioError } from "./errors";

/** The signed-in owner or editor. Clients of the t-shoot workspace don't run the studio (reviewers are guests, not members). */
export async function studioMember(): Promise<CurrentMember> {
  const m = await getCurrentMember();
  if (m.role === "client") throw new StudioError("Studio Review is for the studio's owner and editors.");
  return m;
}

/** The request's origin, for links when APP_URL is not set. */
export async function requestOrigin(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
