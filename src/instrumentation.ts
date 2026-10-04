import { assertAuthMode } from "@/lib/standalone";

/** Runs once before the server takes requests: refuse an unsafe sign-in mode up front. */
export function register(): void {
  assertAuthMode();
}
