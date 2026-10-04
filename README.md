# t-shoot

Brief a short video, approve the script, then watch it get made and refine it.
[Tamtree](https://github.com/checkolo/tamtree) does the work behind it. The repo is
[tamtree-ai/t-shoot](https://github.com/tamtree-ai/t-shoot).

**Status: Track F (frontend first).** t-shoot runs against an in-memory **mock Tamtree**
(`TAMTREE_ADAPTER=mock`). It gets wired to a real Tamtree once engine-api (A1–A6 + D1) merges.
The plan is in `~/sites/agent-orchestrator/changes/2026-09-25-short-video-studio/` (start with
`handover.md`, then `07-frontend-first.md`).

## Try it (standalone: no Tamtree, no account, no key)

You need Docker. Everything runs on your computer: [StickStage](https://github.com/tamtree-ai/stick-stage)
draws the video, [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) voices it, and
you write the lines, or paste a chatbot's reply, or point it at your own model.

> **Licences before you start.** StickStage renders with [Remotion](https://www.remotion.dev),
> which is free for individuals and companies of up to 3 people. Larger companies need a
> [Remotion company licence](https://www.remotion.dev/license).

<!-- quickstart -->
```bash
docker compose -f compose.standalone.yml up -d
```
<!-- /quickstart -->

Open <http://localhost:3007> (the first start takes a minute; `docker compose -f compose.standalone.yml logs -f`
shows it). Stop it with `docker compose -f compose.standalone.yml down`. You are already signed in (local mode: anyone on this computer can
use it). "Not being sarcastic" is a finished sample to watch; "Your first video" is a written
script: open it and press **Approve** to voice and render your own video. It is free: voiced and
rendered on this computer.

To write new skits with your own model (Ollama, LM Studio, OpenRouter, OpenAI or Anthropic):

```bash
LOCAL_LLM_BASE_URL=http://host.docker.internal:11434/v1 LOCAL_LLM_MODEL=qwen3:8b \
  docker compose -f compose.standalone.yml up -d
```

Without one, a new skit offers **Write it with any chatbot**: copy the prompt into ChatGPT, Claude
or Gemini and paste the reply back. Posting to platforms, AI clips and the text helpers need
Tamtree (the helpers also work with your own model); standalone mode hides what it can't do.
Downloads (MP4, SRT, caption) work. Images not published yet? Build them from source with a
StickStage checkout next to this one:
`STICKSTAGE_DIR=../stick-stage docker compose -f compose.standalone.yml -f compose.standalone.build.yml up -d --build`.

Models that write well enough (`pnpm eval:writer -- --local --limit=5`: the reply parsed, the
self-check passed and the scene plan held; this says nothing about how funny it is):

| Model | Where | Usable | Per call |
|---|---|---:|---:|
| `qwen3-coder:30b` | Ollama, Apple M-series | 8 / 8 | 7–25 s |

Without Docker for the app (contributors): `scripts/start.sh --standalone` runs Postgres in
Docker, `pnpm serve` from a sibling StickStage clone, and the app and worker natively.

## Run it (the team, with Tamtree or the mock)

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
