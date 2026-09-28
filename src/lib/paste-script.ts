/**
 * Turn a pasted script into beats. No model, no spend. Handles the shapes people
 * actually paste: `Name: line`, `[0–5 sec]` markers, stage directions in brackets,
 * and `*emphasis*`.
 */

export type PastedBeat = {
  speaker: string | null;
  line: string;
  marker: string | null;
};

export type PastedScript = {
  beats: PastedBeat[];
  speakers: string[];
};

const TIME = /^\[([^[\]]*(?:\d|sec|min)[^[\]]*)\]\s*[—–:-]?\s*(.*)$/i;
const SPEAKER = /^([A-Za-z][\w .'"-]{0,40}?):\s+(.+)$/;
const ONLY_DIRECTION = /^\[[^[\]]+\]$/;
const QUOTES = /^["“](.*)["”]$/;

function cleanLine(raw: string): string {
  let line = raw.trim();
  const quoted = line.match(QUOTES);
  if (quoted) line = quoted[1]!.trim();
  return line.replace(/\s+/g, " ");
}

/** A bracket note that is a stage direction, not a time marker. */
function direction(line: string): boolean {
  if (!ONLY_DIRECTION.test(line)) return false;
  return !TIME.test(line);
}

export function parsePastedScript(raw: string): PastedScript {
  const beats: PastedBeat[] = [];
  let held = true;

  function push(beat: PastedBeat) {
    if (!beat.line.trim() && !beat.speaker) return;
    beats.push(beat);
    held = true;
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      held = false;
      continue;
    }
    if (direction(line)) continue;

    const timed = line.match(TIME);
    if (timed) {
      const rest = cleanLine(timed[2] ?? "");
      const spoken = rest.match(SPEAKER);
      push({
        speaker: spoken ? spoken[1]!.trim() : null,
        line: spoken ? cleanLine(spoken[2]!) : rest,
        marker: timed[1]!.trim(),
      });
      continue;
    }

    const spoken = line.match(SPEAKER);
    if (spoken) {
      const open = held ? beats.at(-1) : undefined;
      if (open?.marker && !open.speaker) {
        open.speaker = spoken[1]!.trim();
        open.line = cleanLine(spoken[2]!);
        continue;
      }
      push({ speaker: spoken[1]!.trim(), line: cleanLine(spoken[2]!), marker: null });
      continue;
    }

    const current = held ? beats.at(-1) : undefined;
    if (current?.line) {
      current.line = `${current.line} ${cleanLine(line)}`;
      continue;
    }
    push({ speaker: null, line: cleanLine(line), marker: null });
  }

  const speakers: string[] = [];
  for (const beat of beats) {
    if (beat.speaker && !speakers.includes(beat.speaker)) speakers.push(beat.speaker);
  }
  return { beats: beats.filter((b) => b.line.trim()), speakers };
}

/** AI clips: one scene per paragraph, or per time marker. */
export function clipsFromPaste(raw: string): { narration: string; visual_prompt: string }[] {
  const parsed = parsePastedScript(raw);
  if (parsed.beats.length === 0) return [];
  return parsed.beats.map((b) => {
    const narration = b.speaker ? `${b.speaker}: ${b.line}` : b.line;
    const visual = narration.length > 140 ? `${narration.slice(0, 137)}…` : narration;
    return { narration, visual_prompt: `A shot that shows: ${visual}` };
  });
}
