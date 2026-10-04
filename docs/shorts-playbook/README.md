# Shorts retention playbook

The rules every stick skit is checked against before it is posted. They come from YouTube
Studio's feedback on our own shorts (see [learnings.md](learnings.md)), not from general advice.
Three shorts is a small sample, so treat these as working rules: keep the ones the numbers
support and drop the ones they don't.

Used by the skills in `.claude/skills/` (`shorts-retention-review`, `hook-and-loop`,
`shorts-postmortem`) and by the paste-ready prompts in [system-prompts.md](system-prompts.md).

## What the numbers say

| Short | Length | Stayed to watch | Avg % viewed | Where it lost people |
| :-- | --: | --: | --: | :-- |
| Why Isn't Your Room Clean? | ~37 s | 43.6% | **82.7%** | small dip 0:03–0:08 while the setup played out |
| He Counts Everyone He Impresses | 48 s | 36.9% | 40.5% | 100% → 46% by 0:10; the turn came at ~0:25 |
| I Accidentally Hit Reply All | 32 s | 15.4% | 22.9% | gone by 0:07, during a slow "I just… hit reply… all…" opening |

The pattern: **the short that stated its absurd premise fastest kept people, and the ones that
explained their setup lost them before the joke turned.** Length mattered less than how
soon the viewer knew what was funny: the 37 s short beat the 32 s one by a long way.

## The rules

### 1. Hook: the premise in the first line (0–2 s)
- Line 1 states the absurd situation or the conflict. Start in the middle of it.
- No greetings, no "so…", no ellipses or trailing words, no slow build-up.
- A question works only if it carries the conflict ("Why is my lunch order in the CEO's inbox?"),
  not if it just opens a topic ("Why didn't you clean your room?").
- Scene 1 gets a **POV card** that states the premise in words, so a muted viewer gets it too.
  - Weak: `POV: work email`
  - Strong: `POV: you sent your pickle order to the whole company`

### 2. Premise clear by 3 s, first laugh by 10 s
- By the end of line 2 a viewer must know what the skit is about.
- Something funny must land by ~10 s: a small turn, a reaction, a sight gag. Do not save
  everything for the last line. "He Counts Everyone" lost half its viewers waiting 25 s for it.
- Then escalate every 2–3 lines. Each line raises the stakes or turns the situation; a line
  that only explains gets cut.

### 3. Pacing: no dead air
- Target **20–30 s**. Over 35 s only if retention on similar shorts says it holds.
- 8–12 lines, at most 12 words each; most lines 4–8 words.
- The only silence longer than about half a second is the beat right before the punchline and
  the reaction after it. A silent beat anywhere else needs a sight gag in it.
- YouTube flagged 2–3 s gaps (0:08–0:10 and 0:27–0:30 on "Reply All"). Check the timeline
  for any gap over 0.6 s and shorten it in staging (`pauseBeforeMs`, silent beats, holds).

### 4. Punchline, then out
- The punchline is the last spoken line. It gets the camera event and a slam word.
- After the reaction, end. No extra line explaining the joke, no wave goodbye.

### 5. Loop
- The last line or the last frame should lead straight back into line 1, so the replay feels
  like the next beat. This is what pushed "Room Clean" above 100% at the start.
- Ways to do it:
  - **Callback**: the last line repeats the opening word or number ("…51." → opens on "52?").
  - **Question answered by the opening**: the last line asks what line 1 says.
  - **Reset**: the situation ends exactly where it started, so line 1 happens again.
- Never at the cost of the punchline. If a loop line weakens the joke, keep the joke.

### 6. Visual punctuation
- One visual event per beat: a slam word, a punch-in, a sound effect, a prop. Not all at once.
- Show the thing the joke is about (the email, the tally, the messy room) as a prop or a slam
  word, so the screen tells the story without the audio.

### 7. Comments
- Every post goes out with **one pinned comment question** that asks viewers for their own
  version of the situation. Not "like and subscribe".
  - "What's the worst thing you've ever sent to reply-all?"
  - "What's the wildest excuse you've used to skip cleaning?"
- The description does not spoil the punchline.

## Pre-post checklist

- [ ] Line 1 states the absurd premise, no greeting, no ellipsis
- [ ] Scene 1 has a POV card that states the premise
- [ ] Premise clear by the end of line 2
- [ ] A laugh or turn lands by ~10 s
- [ ] Every middle line escalates; nothing only explains
- [ ] 20–30 s, 8–12 lines, no gap over 0.6 s except before the punchline
- [ ] Punchline last, with a slam and a reaction; nothing after it
- [ ] Ending loops back to line 1 (or a note says why not)
- [ ] Title sets up the premise and doesn't spoil the punchline
- [ ] Pinned comment question written
