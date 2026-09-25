#!/usr/bin/env bash
# Re-vendor the generated Tamtree /v1 types from the product repo at a given ref.
# Usage: pnpm tamtree:vendor <ref>      e.g. origin/main after engine-api merges (Track W1)
set -euo pipefail
ref="${1:?usage: vendor-tamtree-types.sh <git ref in ~/sites/tamtree>}"
repo="${TAMTREE_REPO:-$HOME/sites/tamtree}"
sha="$(git -C "$repo" rev-parse --short "$ref")"
out="$(dirname "$0")/../src/lib/tamtree/v1.d.ts"
{
  echo "// VENDORED from checkolo/tamtree clients/typescript/index.d.ts"
  echo "// @ $ref $sha ($(date +%F))."
  echo "// Do not edit. Re-vendor with \`pnpm tamtree:vendor <ref>\`."
  echo
  git -C "$repo" show "$sha:clients/typescript/index.d.ts"
} > "$out"
echo "vendored $ref ($sha) → $out"
