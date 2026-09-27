/** Largest 9:16 rectangle that fits inside a box. */
export function fit916(width: number, height: number): { width: number; height: number } {
  if (width < 8 || height < 8) return { width: 0, height: 0 };
  const byHeight = height * (9 / 16);
  if (byHeight <= width) return { width: Math.floor(byHeight), height: Math.floor(height) };
  return { width: Math.floor(width), height: Math.floor(width * (16 / 9)) };
}
