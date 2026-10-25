# t-shoot

**A studio for short-form video: brief a short, approve the script, then watch it get made and
refine it.** t-shoot turns a topic into a captioned 9:16 YouTube Short, TikTok or Reel (or a 16:9
widescreen video), with a review step for clients and a price shown before every paid action.

It is built on two other Tamtree projects:

- **[StickStage](https://github.com/tamtree-ai/stick-stage)**, the open-source stick figure
  comedy video generator, renders stick skits: cast, sets, props, lip-synced voices and captions.
- **[Tamtree](https://www.tamtree.io)**, an agent-first workflow orchestrator, does the work behind
  each step (writing, voicing, rendering) and records its runs, assets and cost. t-shoot never
  shows Tamtree to its users.

t-shoot owns the *document* (projects, scenes, script, the timeline draft, reviews, versions).
Tamtree owns the *work* (runs, assets, cost, traces).

## What it does

- **Brief to export in five steps:** Brief → Script → Edit → Review → Export.
- **Stick skits** from a premise, as a short (1080×1920) or widescreen (1920×1080) video, with a
  prop picker, a camera plan and workspace characters.
- **Client review** through share links, with comments and versions.
- **Shows and a library** for recurring series, and post hand-off without uploading for you.
- **Spend stays explicit.** Every paid action shows its price and asks for confirmation; editing
  narration marks a scene's voice out of date instead of re-recording it.

## Run it

Needs Node, pnpm and Docker (for Postgres on port 5433).

```bash
cp .env.example .env.local
pnpm install
pnpm db:up && pnpm db:migrate
pnpm dev
```

By default t-shoot runs against an in-memory **mock Tamtree** (`TAMTREE_ADAPTER=mock`), so no
Tamtree instance or API key is needed to try it. The mock's behaviour is set in `.env.local`:

- `TAMSHOOT_MOCK_SCENARIO`: `happy`, `three-hearts` (scene 6 fails once), `slow`, `refusal` or
  `over-limit`
- `TAMSHOOT_MOCK_SPEED`: `10` makes the mock ten times faster

To use a real Tamtree instance, set `TAMTREE_ADAPTER=live` with `TAMTREE_BASE_URL` and
`TAMTREE_API_KEY`, then run `pnpm tamtree:provision` to create the flows. See `.env.example`
for the key scopes.

## Test

```bash
pnpm typecheck && pnpm lint
pnpm test          # vitest: adapter contract suite and unit tests
pnpm test:e2e      # Playwright, against the mock
```

## Layout

```
src/lib/tamtree/        the seam: adapter interface, mock and live adapters, vendored /v1 types, stage-flow contract
src/db/                 t-shoot's own schema (Drizzle, Postgres :5433)
src/app/                Next.js App Router
tests/contract/         the adapter contract suite, valid for both the mock and the live adapter
vendor/                 the vendored StickStage package (`pnpm stickstage:vendor` refreshes it)
```

Coding agents: read [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) before changing code.

## Licence

[Apache-2.0](LICENSE).
