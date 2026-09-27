/** A project title as a person should read it. Stored titles sometimes still carry markdown. */
export function displayTitle(title: string): string {
  let text = title.trim();
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/```$/g, "");
  text = text.replace(/^#{1,6}\s+/, "");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\s+/g, " ").trim();
  return text || "Untitled";
}
