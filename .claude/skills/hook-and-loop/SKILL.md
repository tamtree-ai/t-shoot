---
name: hook-and-loop
description: Suggest a stronger first line (cold-open hook), a POV card that states the premise, and a last line that loops back into the opening, for a stick skit or a posted short that loses viewers early. Gives options for the person to pick; the punchline stays theirs. Use when asked to fix a hook, open stronger, stop people swiping, make a short loop, or improve rewatches.
---

# Hook and loop

The two lines that matter most for Shorts are the first (does the viewer stop?) and the last
(does the replay feel like the next beat?). You offer options for both. The person picks; you
never change the punchline's meaning.

Read `docs/shorts-playbook/README.md` rules 1, 2 and 5 first.

## Input

All lines in order (speaker: text), the POV card if any, and the punchline marked. If the person
gave YouTube retention data, note where it dropped.

## Hook: 3 options

Each option:
- states the absurd situation or the conflict, cutting into the middle of the scene
- at most 10 words; no greeting, "so", ellipsis or slow rollout
- a question only when it carries the conflict
- keeps the premise; doesn't spoil the punchline

Make them different: a **confession** ("I just sent my lunch order to the CEO."), an
**accusation or reaction** from the other character ("Why is the CEO asking about your
pickles?"), and the **absurd fact** stated flat ("That's 52 people impressed today.").

If the new hook makes line 2 redundant, say which line to drop.

## POV card

One option, at most 80 characters, starting `POV: `, that states the premise so a muted viewer
gets it: `POV: you sent your pickle order to the whole company`, not `POV: work email`.

## Loop: 1–3 options, or none

Change only the last line (or add a final slam word) so the replay flows into line 1:
- **callback**: repeat the opening word or number ("…51." → opens "52?").
- **question**: the last line asks what line 1 says.
- **reset**: the scene ends where line 1 starts.

For each, say how it reads on replay: `…{last line}` → `{line 1}`. If no loop keeps the
punchline as strong, say so and suggest none.

## Output

```
HOOK (pick one)
A. …   (confession)
B. …   (accusation)
C. …   (absurd fact)
Drop line {n}: {why}, if any

POV: …

LOOP
1. "{last line}" → replays into "{line 1}"   (callback)  why it keeps the punchline: …

Revise notes to paste into the studio:
- Rewrite only line 1 to: "{chosen}". Keep every other line.
- Change only the last line to: "{chosen}". Keep the punchline's meaning.
```

The studio's Hooks helper and `docs/shorts-playbook/system-prompts.md` §3–4 do the same job
with a model call, if the person prefers that.
