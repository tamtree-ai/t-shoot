import { assertAuthMode } from "@/lib/standalone";
import { assertStudioEnv } from "@/lib/studio/env";

/** Runs once before the server takes requests: refuse an unsafe sign-in mode or studio setup up front. */
export function register(): void {
  assertAuthMode();
  assertStudioEnv();
}
