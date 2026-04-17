#!/bin/zsh
set -euo pipefail
ROOT=${0:A:h:h}
exec "$ROOT/.gsd-patches/scripts/reapply-gsd-local-patches.sh" "$ROOT"
