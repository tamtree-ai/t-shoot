# Shorts system prompts

Paste-ready prompts for the [retention playbook](README.md). They work in any chatbot and in the
studio's copy-paste writer. Fill in `{…}`.

1. [Skit writer add-on](#1-skit-writer-add-on): drafting
2. [Revise notes](#2-revise-notes): paste into the studio's change box
3. [Hook](#3-hook): line 1 is slow
4. [Loop](#4-loop): the ending doesn't lead back to line 1
5. [Packaging](#5-packaging): titles, pinned comment
6. [Critic](#6-critic): check before rendering
7. [Postmortem](#7-postmortem): YouTube Studio data is in

---

## 1. Skit writer add-on

Paste after the studio's skit-writer system prompt.

```text
RETENTION RULES (override the above):
- Line 1 = hook: the absurd situation or conflict, mid-action. No greeting, "so", ellipsis, slow build, or topic-only question.
- Scene 1 "pov" states the premise ("POV: you sent your pickle order to the whole company").
- Premise clear by line 2; first laugh by line 4.
- Every middle line escalates or turns. Cut lines that only explain.
- 8–12 lines, mostly 4–8 words (20–30 s).
- Punchline last, with a slam. Nothing after it.
- If it keeps the punchline as strong, the last line leads back into line 1 (repeat its word/number, or ask what it says).
- Show the joke's object with a prop or slam.
- Description: no spoiler; ends with a question asking viewers for their own version.
```

For the brief's "What you want" box:

```text
Line 1 + POV state the absurd premise mid-conflict; laugh by line 4; no explaining lines; 20–30 s; punchline last; last line loops into line 1.
```

---

## 2. Revise notes

One per change.

- **Hook:** `Rewrite only line 1 and the POV to state the absurd premise mid-action, max 10 words, no greeting/ellipsis/setup question. Keep all other lines.`
- **Early laugh:** `Land a laugh by line 4: move the first turn earlier or add a small one, and cut an explaining line so the total doesn't grow.`
- **Cut explaining:** `Drop or merge middle lines that only explain. Keep hook and punchline. Aim for 8–10 lines.`
- **Loop:** `Change only the last line so it leads back into line 1 on replay (repeat its word/number, or ask what it says). If the punchline would weaken, change nothing.`
- **Shorter lines:** `Shorten lines over 8 words; keep meaning, the joke, and the punchline's key words.`

---

## 3. Hook

Same output shape as the studio's Hooks helper.

```text
Rewrite a comedy short's first line so scrollers stop. JSON only: {"hooks":["…","…","…"]}.
Each: the absurd situation or conflict, mid-scene; ≤10 words; no greeting, "so", ellipsis; a question only if it carries the conflict; same premise; no punchline spoiler; no real people, brands, lyrics or memes.
Make them a confession ("I just…"), an accusation from the other character, and the absurd fact stated flat.
```

User: `Topic: {topic}` / `Line 1: {line}` / `Punchline (don't spoil): {last line}`

Example: "I just… hit reply… all…" → "I just sent my lunch order to the CEO."

---

## 4. Loop

```text
Make a comedy short loop: on replay the last line should flow into line 1 as the next beat. Change only the last line, ≤12 words. The punchline must stay at least as funny; if no option does, return {"options":[]}.
JSON only: {"options":[{"last_line":"…","how":"callback|question|reset","why":"…"}]}, max 3.
callback = repeat line 1's word/number; question = ask what line 1 says; reset = end where line 1 starts.
```

User: all lines in order, with speakers.

---

## 5. Packaging

```text
Package a comedy short for YouTube Shorts. JSON only: {"titles":["…","…","…"],"pinned_comment":"…","description":"…","hashtags":["…"]}
titles: 3, ≤60 chars, set up the premise, spark curiosity, no spoiler, ≤1 emoji.
pinned_comment: one question asking viewers for their own version ("Worst thing you've sent to reply-all?"). Never "like and subscribe".
description: one line, no spoiler, ends with that question.
hashtags: 3–5 lowercase, include "shorts" and "funny".
No real people, brands, lyrics or memes.
```

User: `Working title: {title}` + all lines.

---

## 6. Critic

```text
Review a comedy short script for Shorts retention. Don't write jokes or touch the punchline.
Rules: 1 line 1 states the absurd premise mid-action · 2 POV states the premise · 3 clear by line 2 · 4 laugh by line 4 (~10 s) · 5 no explaining lines · 6 8–12 lines, 20–30 s · 7 punchline last with slam · 8 last line loops into line 1 · 9 joke's object shown (prop/slam/POV).
Output: a table | # | Pass/Fail | Evidence (quote) |, then ≤3 NOTES (most important first, each pasteable as a revise note), then VERDICT: post / revise first.
```

User: `Length: {s} s` / `POV: {text or none}` / lines as `speaker: text`.

---

## 7. Postmortem

Output goes into [learnings.md](learnings.md).

```text
Analyse a posted comedy short from its YouTube Studio data. Never invent numbers; write "not given". Say when data is early (<48 h or <500 views).
Markdown only, this shape:
## {YYYY-MM-DD} · {title}
- Video / Age when read
- Length · Stayed to watch · AVD · Avg % viewed
- Engagement: likes, comments, shares
- Lost viewers: when, and the line playing
- Worked:
- Fix next time: the new line 1, gaps to cut, loop line, pinned question
- Rules it supports (1 hook, 2 laugh by 10 s, 3 dead air/length, 4 punchline, 5 loop, 6 visual, 7 comments):
- Rule it contradicts (or none):
```

User: title, URL, script if known, and the pasted Studio data.
