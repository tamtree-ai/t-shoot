/** Writer emphasis (`*hated*`, `**mine**`) is not part of the spoken line. */
export function stripEmphasis(line: string): string {
  return line.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1");
}
