#!/usr/bin/env bash
# Run the README's quickstart exactly as written: the fenced block between
# <!-- quickstart --> and <!-- /quickstart -->, one command per line, stopping at the first
# failure. The docs and the CI check cannot drift, because this is the only copy.
set -euo pipefail
readme="${1:-README.md}"
block="$(awk '/<!-- quickstart -->/{on=1; next} /<!-- \/quickstart -->/{on=0} on' "$readme" | sed '/^```/d')"
[ -n "$block" ] || { echo "No <!-- quickstart --> block in $readme" >&2; exit 1; }
echo "Quickstart from $readme:"
echo "$block" | sed 's/^/  $ /'
bash -euo pipefail -c "$block"
