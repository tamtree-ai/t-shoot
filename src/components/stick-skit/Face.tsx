const INK: Record<string, string> = {
  milo: "#8eb6ff",
  june: "#ff8f6a",
  lila: "#f2c14e",
  theo: "#7ddeb0",
  moss: "#c4b8a8",
  dash: "#d2a6ff",
};

/** A tiny face for a catalog expression. The mouth and eyes carry the mood. */
export function Face({ expression, character, size = 28 }: { expression?: string; character?: string; size?: number }) {
  const mood = expression || "neutral";
  const fill = (character && INK[character]) || "#d0d0d6";
  const eye = mood === "deadpan" ? 1.2 : mood === "shocked" || mood === "crying" ? 2.4 : mood === "cringe" ? 1.1 : 1.7;
  const eyeY = mood === "sad" || mood === "crying" ? 11.5 : 10.5;
  const mouth = mouthPath(mood);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="15" fill={fill} />
      <circle cx="16" cy="16" r="14.2" fill="none" stroke="#1a0b05" strokeOpacity="0.35" />
      {mood === "angry" || mood === "annoyed" ? (
        <>
          <path d="M8 8.5 L13 11" stroke="#1a0b05" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 8.5 L19 11" stroke="#1a0b05" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : mood === "confused" || mood === "sarcastic" ? (
        <path d="M18.5 8.2 Q22 7 24.2 9.2" stroke="#1a0b05" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      ) : null}
      <ellipse cx="11.5" cy={eyeY} rx={eye} ry={mood === "deadpan" ? 0.7 : eye} fill="#1a0b05" />
      <ellipse cx="20.5" cy={eyeY} rx={eye} ry={mood === "deadpan" ? 0.7 : eye} fill="#1a0b05" />
      {mood === "crying" && <path d="M22.2 13.2 q1.2 3 0.2 5.2" stroke="#1a0b05" strokeWidth="1.1" fill="none" strokeLinecap="round" />}
      <path d={mouth} stroke="#1a0b05" strokeWidth="1.5" fill={mood === "shocked" ? "#1a0b05" : "none"} strokeLinecap="round" />
    </svg>
  );
}

function mouthPath(mood: string): string {
  switch (mood) {
    case "happy":
      return "M10 18.5 Q16 24 22 18.5";
    case "smug":
      return "M11 19 Q16 21 22 16.5";
    case "sarcastic":
      return "M10.5 19.5 Q16 18 22 19";
    case "annoyed":
    case "angry":
    case "sad":
    case "crying":
      return "M10.5 21 Q16 16.5 21.5 21";
    case "shocked":
      return "M13.2 18.2 h5.6 v4.2 h-5.6 z";
    case "cringe":
      return "M10 19.5 Q13 17.5 16 19.5 Q19 21.5 22 19";
    case "confused":
      return "M11 19.5 Q16 21.5 21 18.5";
    case "deadpan":
      return "M11 19.5 H21";
    default:
      return "M11 19 H21";
  }
}

export function faceInk(character?: string): string {
  return (character && INK[character]) || "#d0d0d6";
}
