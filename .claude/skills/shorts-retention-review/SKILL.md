---
name: shorts-retention-review
description: Check a stick skit's script (and its timing, when there is a skit.json) against the shorts retention playbook before it is rendered or posted. Scores the hook, POV card, first laugh by ~10 s, explaining lines, length, dead air, punchline placement, loop and pinned comment, then gives at most 3 paste-ready revise notes. Use when asked to review, check, critique or "make this short perform better", or before posting. Never rewrites the joke.
---

# Shorts retention review

You check a skit against `docs/shorts-playbook/README.md` (read it first, every time) and hand
back a verdict plus revise notes the owner can paste into the studio's change box. You do not
write the joke and you do not change a line yourself; the person decides.

## Inputs (any of these)

- Lines pasted by the person (speaker: text), with the POV card if there is one.
- A studio draft: the lines and `estimated_duration_s` from the script page.
- A `skit.json`: read `scenes[].pov`, the beats' `line`, `silent`, `durationMs`, `pauseBeforeMs`,
  `holdAfterMs`, `punchline`, slams and props, and `timing.gapMs` (the default gap between beats).

If you only have lines, estimate time at ~2.6 words per second plus ~0.3 s per line change.

## Steps

1. Read `docs/shorts-playbook/README.md` and the latest entries in `docs/shorts-playbook/learnings.md`.
2. Score each rule Pass / Fail with the evidence (quote the line, or give the time):
   1 hook · 2 POV states the premise · 3 clear by line 2 · 4 laugh by ~10 s · 5 no explaining
   lines · 6 length 20–30 s and 8–12 lines · 7 no gap over 0.6 s except around the punchline
   (skit.json only) · 8 punchline last with a slam · 9 loop · 10 the joke's object is shown
   · 11 a pinned comment question exists.
3. Pick **at most 3** fixes, the ones that move retention most. Order: hook, then first laugh,
   then dead air or length, then loop. Comments and visuals come last.
4. Write each fix as a revise note in the style of `docs/shorts-playbook/system-prompts.md` §2
   (one change per note, says what to keep). For a hook fix, also give 3 example hooks; for a
   loop fix, one example last line. Label examples as suggestions; the person picks.
5. For gaps in a `skit.json`, name the beat ids and the change (e.g. "`b4` `pauseBeforeMs`
   1800 → 400"). Staging changes go to StickStage's `skit-director` skill; don't edit spoken
   text there.

## Output

```
| # | Rule | Pass/Fail | Evidence |
…
NOTES (paste into the studio's change box, one at a time):
1. …
2. …
VERDICT: post / revise first
```

## Don'ts

- Don't pass a hook because it's "fine". Ask: would someone mid-scroll know the absurd premise
  from line 1 alone?
- Don't propose a loop that weakens the punchline. The punchline wins.
- Don't pad with generic advice ("post consistently", "use trending audio").
- Don't claim a short will perform; the playbook is based on a handful of shorts.
