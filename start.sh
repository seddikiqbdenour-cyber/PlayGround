#!/usr/bin/env bash
# Build the static site when needed and serve it in the foreground.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
DIST_DIR="$PROJECT_DIR/dist"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DEPLOYMENT_OUTPUT="$WEB_DIR/deployment-output.json"
STAMP="$WEB_DIR/start-dependencies.sha256"

timed() {
  local label="$1"
  shift
  local start end rc
  start="${EPOCHREALTIME//[!0-9]/}"
  if "$@"; then rc=0; else rc=$?; fi
  end="${EPOCHREALTIME//[!0-9]/}"
  printf '[timing] %s: %d ms\n' "$label" "$(((end - start) / 1000))"
  return "$rc"
}

timed "prepare metadata directory" mkdir -p "$WEB_DIR"
timed "prepare build directory" mkdir -p "$DIST_DIR"

if [[ -f package-lock.json ]]; then
  lock_hash="$(sha256sum package.json package-lock.json | sha256sum | cut -d' ' -f1)"
  if [[ ! -d node_modules/vite ]] || [[ ! -f "$STAMP" ]] || [[ "$(cat "$STAMP" 2>/dev/null || true)" != "$lock_hash" ]]; then
    timed "npm ci" npm ci --no-audit --no-fund
    printf '%s' "$lock_hash" > "$STAMP"
  else
    echo "[timing] npm ci: skipped (dependencies unchanged)"
  fi
else
  if [[ ! -d node_modules/vite ]]; then
    timed "npm install" npm install --no-audit --no-fund
  else
    echo "[timing] npm install: skipped (dependencies present)"
  fi
fi

needs_build=false
if [[ ! -f "$DIST_DIR/index.html" ]]; then
  needs_build=true
elif find index.html vite.config.js package.json package-lock.json src -type f -newer "$DIST_DIR/index.html" -print -quit 2>/dev/null | grep -q .; then
  needs_build=true
fi

if [[ "$needs_build" == true ]]; then
  timed "vite build" npm run build
else
  echo "[timing] vite build: skipped (output up to date)"
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "Build finished without dist/index.html." >&2
  exit 1
fi

timed "write deployment metadata" node -e '
  const fs = require("node:fs")
  const [output, project, directory] = process.argv.slice(1)
  fs.writeFileSync(output, JSON.stringify({ project, directory }) + "\n")
' "$DEPLOYMENT_OUTPUT" "$PROJECT_DIR" "$DIST_DIR"

echo "Serving $DIST_DIR on http://0.0.0.0:$PORT"
timed "preview server" ./node_modules/.bin/vite preview --host 0.0.0.0 --port "$PORT" --strictPort
