import { NextResponse } from "next/server";

import { consumeMagicLink } from "@/services/workspace";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    await consumeMagicLink(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "That link didn't work.";
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(message)}`, request.url));
  }
  return NextResponse.redirect(new URL("/", request.url));
}
