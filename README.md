# t-shoot

Brief a short video, approve the script, then watch it get made and refine it.
[Tamtree](https://github.com/checkolo/tamtree) does the work behind it. The repo is
[tamtree-ai/t-shoot](https://github.com/tamtree-ai/t-shoot).

**Status: Track F (frontend first).** t-shoot runs against an in-memory **mock Tamtree**
(`TAMTREE_ADAPTER=mock`). It gets wired to a real Tamtree once engine-api (A1–A6 + D1) merges.
The plan is in `~/sites/agent-orchestrator/changes/2026-09-25-short-video-studio/` (start with
`handover.md`, then `07-frontend-first.md`).

## Run it

```bash
cp .env.example .env.local
pnpm install
pnpm db:up && pnpm db:migrate
pnpm dev
```

The mock's behaviour is set in `.env.local`:
- `TAMSHOOT_MOCK_SCENARIO`: `happy`, `three-hearts` (the canvas state: scene 6 fails once),
  `slow`, `refusal` or `over-limit`
- `TAMSHOOT_MOCK_SPEED`: `10` makes the mock ten times faster

## Layout

```
src/lib/tamtree/        the seam: adapter interface, vendored /v1 types, stage-flow contract, mock
src/db/                 t-shoot's own schema (Drizzle, Postgres :5433)
src/app/                Next.js App Router
tests/contract/         the adapter contract suite (mock now, live at Track W1)
```
