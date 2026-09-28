# How the studio is wired

This page is for the person who runs the machines. The screens in the earlier pages are the whole product a maker sees. Under them, three programs pass one skit along. If any of the three is down, the buttons still render and then fail, or they return a sample.

Read it from the top the first time you connect a machine. After that, use the tables.

## The three programs

| Program | What it owns | Where it listens, in development |
| --- | --- | --- |
| This studio, t-shoot | The project: brief, script, review links, export, the price shown on a button | http://localhost:3007 |
| Tamtree | The work: writing the script, calling the voice service, storing the run, the cost, the files | API http://localhost:8000, web app http://localhost:5173 |
| Stick Stage | The picture: checking the script, timing, mouths, drawing the MP4, captions, post text | http://127.0.0.1:8787 |

t-shoot never draws a frame and never calls a voice vendor itself. Tamtree never draws a frame. Stick Stage never calls a language model and never calls a voice vendor. That split is why a key for one of them is useless in the others.

A skit crosses them twice.

**Write the skit** runs the Tamtree flow `stick-script`. Tamtree asks the workspace’s chat model for a draft. Stick Stage checks that draft against the catalog. t-shoot stores the lines. You edit them in the browser. Those edits are checked again in the browser, with the same Stick Stage library the server uses, and they do not start a run.

**Approve** runs the Tamtree flow `stick-produce`. Tamtree records one voice file per spoken line, through OpenRouter. It then hands Stick Stage the script, the audio, and the timings. Stick Stage draws the film and returns an MP4, an SRT, a text file, and a small manifest. t-shoot stores those as a version. The render is CPU on the Stick Stage machine. Tamtree does not add a render charge. The price on Approve is the voices.

The same script, the same voices, and the same catalog are one job. A second Approve on an unchanged script does not enqueue another. A failed job can be approved again. A changed line is a new job and a new version.

## What has to be installed

On the machine that runs Stick Stage:

- Node 22 or newer, and pnpm.
- Rhubarb Lip Sync, so mouths follow the audio. Unzip a release into `tools/` inside the Stick Stage repo, or set `RHUBARB_PATH`, or put `rhubarb` on `PATH`. The first time macOS blocks the binary, clear quarantine: `xattr -dr com.apple.quarantine tools/Rhubarb-Lip-Sync-*`.
- If you only want a picture and you accept estimated mouths, set `STICKSTAGE_ALLOW_ESTIMATED_MOUTHS=1`. The service otherwise refuses to start without Rhubarb.

On the machine that runs this studio:

- Node, pnpm, and Docker, for the Postgres this studio keeps on port 5433. Tamtree’s own Postgres stays on 5432. Do not point one at the other.

Tamtree is a separate checkout. This page assumes it is already the dev stack you use, on the two addresses above. Restart commands for it are in the last section, because it loads plugins only at startup.

## 1. Start Stick Stage

From the Stick Stage repo (`~/sites/tamtree_stickstage/repo` on this machine):

```sh
pnpm install
scripts/start.sh
```

`start.sh` writes `STICKSTAGE_API_TOKEN` into `.env.local` the first time and reuses it after that. It listens on 127.0.0.1 port 8787. Logs go to `out/serve.log`. To use another port: `PORT=9000 scripts/start.sh`. Stop it with `scripts/stop.sh`.

Check it:

```sh
curl http://127.0.0.1:8787/healthz
```

Wait until `bundle` is `ready` and `ok` is true. The first start builds the Remotion project and may download Chrome Headless Shell. Give it a minute. `lipSync` should be `rhubarb`. If it says `estimated`, mouths are guessed.

A foreground run, when you are debugging:

```sh
pnpm serve --insecure-local
```

That has no token and answers only on localhost. Do not leave it that way on a machine anyone else can reach.

A smoke test renders the sample skit `fine` over HTTP into `out/smoke/`:

```sh
pnpm serve:smoke
```

## 2. Start this studio

From the t-shoot repo (`~/sites/tamshoot`):

```sh
cp .env.example .env.local   # only the first time
pnpm install
pnpm db:up && pnpm db:migrate
scripts/start.sh
```

`scripts/start.sh` serves the site on port 3007 and starts the job worker. It prints `Ready: http://localhost:3007` and the adapter name. A page reload does not switch adapters. The process reads that choice when it starts.

Until step 5, the adapter is `mock`. The site works. Every new script is a sample. The header pill says **Tamtree not connected · mock**.

## 3. Two credentials in Tamtree

Open http://localhost:5173/credentials/new. Tamtree binds a flow to a credential by its id. The names below are the ones the flow files already use. An existing credential of the right type is fine. You will need both ids in step 4.

Stick Stage:

| Field | Value |
| --- | --- |
| Type | `stickstage_api` |
| Name | `stickstage` |
| Base URL | `http://127.0.0.1:8787` |
| Token | the `STICKSTAGE_API_TOKEN` line in the Stick Stage `.env.local`. Empty only if you started it with `--insecure-local` |
| Test URL | `http://127.0.0.1:8787/healthz` |

OpenRouter, for the voices:

| Field | Value |
| --- | --- |
| Type | `openrouter_api` |
| Name | `openrouter` |
| API key | your OpenRouter key |

`stick-produce` makes one text-to-speech call per spoken line, about a dozen on a normal skit. The script is written by the workspace’s default chat model, which is Tamtree’s setting, not a third credential on this page.

## 4. Two API keys in Tamtree

Open http://localhost:5173/settings/keys. You have to be the workspace owner.

The form has a name and a set of boxes, **What can this key do?** Three boxes start ticked: `run:flow`, `read:runs`, and `write:flows`. Change them for each key before you create it.

The runtime key, which this studio uses all day:

- Name: `studio-runtime`
- Tick: `run:flow`, `read:runs`, `read:assets`, `read:usage`
- Untick: `write:flows`, and everything else

The setup key, used once in the next step:

- Name: `studio-provision`
- Tick: `write:flows` only
- Untick: everything else

Do not tick `admin` on either key.

Each key is shown once, on the next screen. Copy it then. A lost key is revoked and minted again.

An API key cannot list credentials. Read the two ids from Tamtree’s database:

```sh
docker exec tamtree-dev-postgres-1 psql -U tamtree -d tamtree \
  -c "select id, name, type from credentials where type in ('stickstage_api','openrouter_api') order by name"
```

## 5. Publish the two flows

From the t-shoot repo, with the setup key and the two ids:

```sh
cd ~/sites/tamshoot
TAMTREE_BASE_URL=http://localhost:8000 \
TAMTREE_PROVISION_KEY=<setup key> \
TAMTREE_CREDENTIAL_IDS=stickstage=<stickstage_api id>,openrouter=<openrouter_api id> \
pnpm tamtree:provision
```

The flow files name their credentials `stickstage` and `openrouter`. The script swaps each name for the id you pass, and it refuses to publish if a name has no id. You can put `TAMTREE_CREDENTIAL_IDS=…` in `.env.local` and stop pasting it. The ids are not secret.

It creates `stick-script` and `stick-produce`, or replaces them if they already exist. The definitions live in the plugin checkout `~/sites/tamtree-plugins/stickstage-tamtree/stage-flows/`.

It ends with one line:

```
TAMTREE_FLOW_IDS=stick-script=<uuid>,stick-produce=<uuid>
```

Copy that line. Revoke the setup key after this. You do not need it again until the flows change.

If it fails:

| It says | What to do |
| --- | --- |
| `Top-level await is currently not supported with the "cjs" output format` | The t-shoot checkout is older than the fix. Pull, then run it again. |
| `unknown node type 'stickstage.…'` or `param '…' is not declared by manifest` | Tamtree loaded an old copy of the plugin. Restart the API and both workers, then run this step again. |
| `names credential stickstage but TAMTREE_CREDENTIAL_IDS has no id for it` | Add the missing id. The query is in step 4. |
| `flow definition is invalid` with nothing after it | The checkout is older than the fix that prints the detail. Pull, then run it again. |

Tamtree loads plugin code only when its processes start. `tamtree api --reload` watches the Tamtree repo, not `~/sites/tamtree-plugins/`. Pulling the plugin does nothing until you restart all three:

- `uv run tamtree api --reload`
- `uv run tamtree worker`
- `uv run tamtree worker --namespace tamtree-system`

The workers run the nodes. Restarting only the API lets publish succeed while every run still fails.

## 6. Point this studio at Tamtree

In `~/sites/tamshoot/.env.local`:

```sh
TAMTREE_ADAPTER=live
TAMTREE_BASE_URL=http://localhost:8000
TAMTREE_API_KEY=<runtime key>
TAMTREE_FLOW_IDS=stick-script=<uuid>,stick-produce=<uuid>
```

Restart. A browser reload is not enough, because the adapter is chosen at startup.

```sh
cd ~/sites/tamshoot
scripts/stop.sh && scripts/start.sh
```

## 7. Prove the whole path

1. Open http://localhost:3007. The pill is green and says **Tamtree connected**.
2. **New short**, **Stick-figure skit**, a one-sentence topic, Exchange, two characters, **Write the skit**.
3. You should get lines about that topic, not a canned group-chat sample. A live run id looks like `01a0e…`. A mock run costs exactly $0.004 and its id looks like `run_…`.
4. Fix nothing, or fix a line, and press **Approve**. The status goes through “Waiting to start…” and “Voicing the lines and drawing the video…”.
5. **Version 1 is ready.** Download the MP4 from Export and play it. Mouths move. Captions match the lines you approved.

Projects written while the adapter was mock keep that sample as their saved draft. Switching adapters does not rewrite them. On one of those, use **Ask for a change** with a note like “rewrite the whole skit from the brief”, or start a new project.

If the pill is green and a new skit is still the sample, a Next process from before the restart is still the one on the port. `start.sh` will say it left an existing dev server alone. Stop that process and run `scripts/start.sh` again.

If the pill is amber, click it. The popup names the gap:

| Popup | Fix |
| --- | --- |
| needs TAMTREE_BASE_URL and TAMTREE_API_KEY | A line is missing in `.env.local`. Step 6. |
| TAMTREE_FLOW_IDS has no id for … | Run step 5 again and copy the printed line. |
| rejected TAMTREE_API_KEY (401) | The key is wrong or revoked. Mint another runtime key. |
| lacks a scope (403) | The runtime key is missing one of the four scopes. Mint it again. |
| not reachable at … | Tamtree is not running, or the base URL is wrong. |

If runs start and then fail, check the two credentials and that Stick Stage is up. `invalid input for query argument $1: 'stickstage' (invalid UUID …)` means the flows were published before the ids were substituted. Run step 5 again with `TAMTREE_CREDENTIAL_IDS`.

## What Stick Stage accepts

You do not call these by hand during a normal skit. They are here so a failed job is readable, and so a person can render without the studio.

Every path except `/healthz` needs `Authorization: Bearer <STICKSTAGE_API_TOKEN>`. Errors are JSON: `error.code`, `error.message`, and sometimes `error.diagnostics`. The diagnostic codes are stable. `voice-stale` and `unknown-pose` mean the same thing next month.

`GET /healthz` needs no token. It reports `ok`, the queue, `catalogVersion`, `bundle` (`building`, `ready`, or `failed`), `lipSync` (`rhubarb` or `estimated`), and whether auth is on.

`GET /catalog` is the characters, sets, templates, and the content version. t-shoot ships the same catalog inside the `stickstage` package. A project is pinned to the version it was written against. If the running service disagrees, validate answers `409` with `catalog-mismatch` before it stages anything. Vendor the package again (`pnpm stickstage:vendor` in t-shoot) so the app and the service match, then restart.

`POST /validate` takes JSON, either `{ "premise": … }` or `{ "skit": … }`. Optional `catalog_version`. A 200 returns the staged skit, the exact lines to voice, an estimated duration, warnings, and the check. `lines[].text` is what the voice service must say, and what the voice file must repeat word for word. `422 invalid-skit` means the draft itself is wrong. The diagnostics say which field.

`POST /render` is multipart. One part named `skit` (the JSON), one part named `voice` (voice.json), and one file part per line. The filename is the file named in that voice line, and it has to be WAV, MP3, or OGG. A 202 means the job is queued. A 422 means it was not queued. The codes:

| Code | Meaning |
| --- | --- |
| `voice-missing` | A spoken line has no audio. |
| `voice-stale` | The text in the voice file is not the line in the script. Re-voice after any wording change. |
| `audio-path` | The audio path is not `voice/<filename>.wav` (or mp3, or ogg). |
| `audio-missing` | No uploaded file with that filename. |
| `audio-format` | The file is not WAV, MP3, or OGG. A saved error page is a common cause. |

`GET /jobs/:id` is the status: `queued`, then `running`, then `succeeded`, `failed`, or `cancelled`. While it runs, `stage` moves `prep`, `compile`, `check`, `render`, `post`. On success, `outputs` has `mp4`, `srt`, `txt`, and `manifest`. Download one with `GET /jobs/:id/files/mp4` (or `srt`, `txt`, `manifest`).

`DELETE /jobs/:id` cancels a queued or running job and deletes its media.

One render at a time. They queue. State is on disk under `public/skits/_jobs/<id>/`. A restart re-queues a job that was interrupted. Finished jobs are deleted after 24 hours unless `STICKSTAGE_JOB_TTL_HOURS` says otherwise. The body limit on a render upload is 100 MB.

An 8.9 second skit is on the order of 14 seconds of render on an M-series Mac. A half-minute skit is on the order of a minute and a half in the amd64 container under emulation. Those are measurements from the service notes, not a promise.

The service speaks plain HTTP. Put TLS on the host in front of it. The Linux image is x86_64, because Rhubarb has no Linux arm64 build:

```sh
docker build --platform linux/amd64 -t stickstage-render .
docker run -p 8787:8787 -e STICKSTAGE_API_TOKEN=… stickstage-render
```

## Making a skit with no studio in front

Use this when you are changing Stick Stage itself, not when you are making a client’s video.

```sh
cd ~/sites/tamtree_stickstage/repo
pnpm dev                 # Remotion Studio, to look at a composition
pnpm new myskit --template=exchange
```

`pnpm new` writes a premise. Put the lines in it, run the same command again, then:

```sh
pnpm voice:say myskit    # macOS voices, for development only
pnpm direct myskit       # validate, prep, compile, self-check, contact sheet, out/myskit.mp4
```

Or one stage at a time: `pnpm compile myskit`, `pnpm check myskit`, `pnpm render myskit`. `pnpm batch --all` writes a post-ready mp4, srt, txt, and json per skit into `out/posts/`.

A worked example is `public/skits/fine/skit.json`. Templates you can pass to `pnpm new` include `exchange`, `interview`, `me-vs-me`, `pov-monologue`, and `text-slam`.

`voice:say` is a stand-in. Real audio comes from Tamtree as `public/skits/<id>/voice/<line>.wav` plus `voice.json`. If you change a line and do not replace the wav, the next render fails with `voice-stale`.

## When a maker says it broke

Sit with them on the screen they are on. The message is usually enough.

| They see | You check |
| --- | --- |
| The pill is not **Tamtree connected** | Steps 5 and 6, then a real restart. |
| “The brief is saved. Nothing else has been spent.” | The `stick-script` run in Tamtree. Then Stick Stage `/healthz`, then the OpenRouter credential is not required yet. Script writing does not use it. |
| Approve says the video wasn’t made | The `stick-produce` run. Voice failures are OpenRouter. `voice-stale` and `voice-missing` are Stick Stage rejecting the upload. `catalog-mismatch` is the pinned version. |
| Approve does nothing and stays grey | The check on the script has a problem. It is on the page, above the button. That is working as designed. |
| The film plays and the mouths do not match | `lipSync` on `/healthz`. Estimated mouths mean Rhubarb was skipped. |
| Download is a video of the wrong joke | They approved an older cut, or they are on the wrong version in the Export menu. |
| A review link opens and shows an old film | The link is pinned to the version it was created for. Share the latest. |

Do not ask a maker to read this page to finish a video. Send them to [Make your first skit](/guide/first-skit).
