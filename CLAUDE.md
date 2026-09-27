@AGENTS.md

# CLAUDE.md — t-shoot

**t-shoot** is the app. Non-technical people (Dilhan's team and their clients,
invite-only) use it to go from a topic to a captioned 1080×1920 short. **Tamtree is the invisible
engine.** t-shoot owns the *document* (projects, scenes, script, the TimelineV1 draft, reviews,
versions), and Tamtree owns the *work* (runs, assets, cost, traces).

## Where the plan lives

In the planning repo, `~/sites/agent-orchestrator/changes/2026-09-25-short-video-studio/`:

| File | Read it for |
|---|---|
| `handover.md` | **start here**: where things stand, open decisions, next actions, tests not yet run |
| `07-frontend-first.md` | **the build order**: Track F (this repo, on a mock) and Track W (wiring), the adapter seam, the stage-flow contract, the mock |
| `03-experience.md` | the screens, the free and paid edit table, status wording, design rules |
| `06-final-review.md` | why the design is what it is, and the known risks |
| `02-architecture.md` | data model, run engine, the engine-api dependency |

The design is on the Claude Design canvas <https://claude.ai/artifact/MHJFLxXuw8DLUshAuhDDcJ>,
row 3 ("Final"). Each artboard is real HTML/CSS: copy its exact values (sizes, colours, copy)
rather than approximating them.

Progress is recorded in **that subproject's `handover.md`**. This repo has no handover file of
its own.

## Rules that are easy to break

- **The UI never imports `@/lib/tamtree`.** The path is UI → server (route handlers / server
  actions) → services → `TamtreeAdapter`. The mock sits at the Tamtree boundary, so that
  wiring later means adding `LiveTamtreeAdapter`, not rewriting screens.
- **Every paid action shows its price before the click and needs a confirmation.** Nothing paid
  starts on a keystroke or on blur. Editing narration marks the scene *voice out of date*; it
  does not re-record.
- **Money** is `numeric(12,6)` in the DB and a decimal string in transit, never a float you add
  up. The single source of cost is `RunOut.total_cost_usd`. Stage-flow outputs never carry
  cost.
- **The stage-flow contract** (`src/lib/tamtree/stage-flows.ts`) is mirrored in
  07-frontend-first §2. Change both together. The plugin implements it.
- **`src/lib/tamtree/v1.d.ts` is vendored.** Never edit it. Re-vendor it with
  `pnpm tamtree:vendor <ref>`. D1 types in `types.ts` are hand-written and provisional.
- **Status is a dot plus a word, never a chip.** Green means Ready and nothing else. The only
  looping animation is the filming dot. Aspect, resolution and FPS are fixed (TimelineV1 is
  frozen at 1080×1920 @ 30fps), so never offer controls for them.
- **The contract suite** (`tests/contract/adapter.contract.ts`) asserts only what `/v1`
  guarantees. It must stay valid for the live adapter.
- **Git:** no `Co-Authored-By` or "Generated with" footers.

## Commands

```
pnpm db:up          # Postgres on :5433 (the Tamtree dev stack holds :5432)
pnpm db:generate    # drizzle migration from src/db/schema.ts
pnpm db:migrate
pnpm dev
pnpm typecheck && pnpm lint      # cheap static checks, once per batch
pnpm test                        # vitest: contract suite + unit tests (slow gate: ask first)
```

## Test execution policy (mirrors the planning repo's CLAUDE.md; keep the two in step)

1. **Defer by default.** Implement every change in a batch first. After each change, append the
   narrowest proving command to the session's deferred-test ledger
   (`<scratchpad>/pending-tests.md`) instead of running it.
2. **Cheap static checks** (`pnpm typecheck`, `pnpm lint`) run once per batch, at the end.
3. **Slow gates** (`pnpm test`, `pnpm build`, Playwright) are **asked for** at the end of the
   work (narrow / full / nothing yet), never started unprompted.
4. **Stop early only for risky changes:** DB schema and migrations, the adapter interface or the
   stage-flow contract, shared types, auth, and renames of public symbols. For those, ask to run
   the relevant tests before building on them.
5. **Never lose a deferred test.** Copy any outstanding commands into the subproject's
   `handover.md` under "Tests not yet run" before ending. Commits made with tests deferred say
   `tests deferred: see handover`.
6. **User-triggered runs are exempt.** When asked, run it.

**Checkpoints:** work in batches of about 2–3 tasks (07 §4 phases), then stop and ask
**Proceed** or **Stop & hand over**.
