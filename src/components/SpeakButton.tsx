"use client";

const PITCH: Record<string, number> = {
  puck: 1.2,
  kore: 0.95,
  zephyr: 1.05,
  charon: 0.8,
};

/** A browser reading of the line. It is not the filmed TTS voice. */
export function speakPreview(text: string, voiceId: string, pitch?: number, rate?: number): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const line = text.trim();
  if (!line) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.pitch = pitch ?? PITCH[voiceId.toLowerCase()] ?? 1;
  utterance.rate = rate ?? 1;
  const voices = window.speechSynthesis.getVoices();
  const english = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  if (english) utterance.voice = english;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function SpeakButton({ text, voiceId, label = "Hear a preview", pitch, rate }: { text: string; voiceId: string; label?: string; pitch?: number; rate?: number }) {
  return (
    <button
      type="button"
      title="A browser preview, not the filmed voice"
      disabled={!text.trim()}
      onClick={() => speakPreview(text, voiceId, pitch, rate)}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] text-fg-2 hover:bg-hover disabled:opacity-40"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6 4l14 8-14 8z" />
      </svg>
      {label}
    </button>
  );
}
