#!/usr/bin/env bash
# Re-vendor the private `stickstage` package (OD-10: a vendored tarball) from a StickStage checkout.
# Usage: pnpm stickstage:vendor [ref]     builds the package at the checkout's current HEAD;
#        the ref is only recorded (check it out in the StickStage repo first).
set -euo pipefail
repo="${STICKSTAGE_REPO:-$HOME/sites/tamtree_stickstage/repo}"
here="$(cd "$(dirname "$0")/.." && pwd)"
ref="${1:-HEAD}"
sha="$(git -C "$repo" rev-parse --short "$ref")"
if [ -n "$(git -C "$repo" status --porcelain)" ]; then
  echo "StickStage checkout is dirty; commit first so the vendored tarball has a real sha." >&2
  exit 1
fi
pnpm -C "$repo" lib:build >/dev/null
rm -f "$here"/vendor/stickstage-*.tgz
mkdir -p "$here/vendor"
tgz="$(cd "$repo/packages/stickstage" && pnpm pack --pack-destination "$here/vendor" | tail -1)"
version="$(cd "$here" && node --input-type=module -e "import('$repo/packages/stickstage/dist/data.js').then(m => console.log(m.catalog.version))")"
printf 'stickstage %s @ %s (%s)\ncatalog %s\n' "$(basename "$tgz")" "$sha" "$(date +%F)" "$version" > "$here/vendor/STICKSTAGE"
echo "vendored $(basename "$tgz") @ $sha, catalog $version"
