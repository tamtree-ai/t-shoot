import { fitFrame } from "@/lib/stick/frame";

/** Largest 9:16 rectangle that fits inside a box. AI clips stay this shape. */
export function fit916(width: number, height: number): { width: number; height: number } {
  return fitFrame(width, height, "9:16");
}

export { fitFrame };
