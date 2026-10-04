---
name: shorts-postmortem
description: Turn YouTube Studio numbers or YouTube's AI feedback on a posted stick skit into a learnings entry, update the retention playbook when the evidence is strong enough, and give concrete fixes for the next skit. Use when the person pastes YouTube Studio analytics, retention data, "why isn't my short getting views" feedback, or asks what to learn from a posted short.
---

# Shorts postmortem

You turn a posted short's analytics into something the next skit can use: an entry in
`docs/shorts-playbook/learnings.md`, and a playbook change when the evidence supports it.

## Steps

1. Read `docs/shorts-playbook/README.md` and `docs/shorts-playbook/learnings.md`.
2. From what the person pasted, pull out (write "not given" for anything missing; never invent):
   title, URL, length, age when read, views / engaged views, stayed-to-watch %, average view
   duration, average % viewed, likes / comments / shares, where retention dropped and which line
   was playing, what YouTube said worked.
3. Flag noise honestly: a short under ~48 hours old, or under ~500 views, is an early read.
4. Write the entry in the shape of the existing entries (newest first, under the `---`). Map each
   problem to playbook rule numbers. "Fix next time" must be concrete: the actual new line 1,
   which gaps to cut and by how much, the loop line, the pinned question.
5. Compare with the earlier entries:
   - Three or more entries point the same way and the playbook doesn't say it yet → propose a new
     rule (show the diff) and add it if the person agrees.
   - The data contradicts a rule (e.g. a long, slow-opening short with high % viewed) → say so
     and propose weakening or dropping that rule.
   - Update the "What the numbers say" table in the README with the new short.
6. If the person wants to remake or follow up the short, hand over to `hook-and-loop` and
   `shorts-retention-review` with the fixes.

## Reading YouTube's feedback

YouTube's AI feedback mixes data with generic advice. Keep:
- numbers (stayed to watch, AVD, % viewed, retention at a timestamp)
- the specific line or timestamp where people left
- named comparisons with our other shorts

Treat as a suggestion, not evidence: generic tips ("add sound effects", "post consistently",
"wait for more data"). Record them under "Fix next time" only if they fit this short.

## Metrics, in order of importance for us

1. **Stayed to watch** (feed stop rate): the hook and the first frame. Below ~35% means line 1
   and the POV card are the problem.
2. **Retention at 0:03–0:10**: whether the premise is clear and a laugh lands early.
3. **Average % viewed**: overall pacing; above 100% at the start means replays (the loop works).
4. **Comments and shares**: the pinned question and how relatable the premise is.

Don't save the person's private analytics anywhere but `learnings.md` in this repo.
