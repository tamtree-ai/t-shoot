# syntax=docker/dockerfile:1
# t-shoot for standalone mode (no Tamtree): the Next.js app and the worker in one container,
# with Kokoro's weights baked in so the first Produce never waits on a download. Run it with
# compose.standalone.yml (Postgres + the StickStage render service + this).
#   docker build -t t-shoot .
FROM node:22-bookworm-slim

# ffmpeg/ffprobe: Studio Review's worker makes video proxies, posters and watermarks with them.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.17.0 && mkdir -p /data && chown node:node /data
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node vendor ./vendor
RUN pnpm install --frozen-lockfile

# Kokoro's q8 weights (~90 MB) into the image, and one line spoken to prove it runs here.
# Before the source copy, so a code change doesn't download them again.
ENV KOKORO_CACHE_DIR=/app/.kokoro
COPY --chown=node:node scripts/kokoro-fetch.mjs scripts/kokoro-fetch.mjs
RUN node scripts/kokoro-fetch.mjs

COPY --chown=node:node . .
# The pool is created at import; nothing connects during the build (every page is dynamic).
RUN NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgres://build@127.0.0.1/build pnpm build

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TAMTREE_ADAPTER=local \
    TAMSHOOT_AUTH=local \
    TAMSHOOT_LOCAL_DIR=/data/local \
    STUDIO_DATA_DIR=/data/studio \
    STICKSTAGE_URL=http://stickstage:8787 \
    PORT=3000
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["bash", "scripts/docker-entrypoint.sh"]
