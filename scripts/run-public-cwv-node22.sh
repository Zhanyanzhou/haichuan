#!/bin/sh
set -eu

if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
fi

if command -v chromium-browser >/dev/null 2>&1; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium-browser)"
else
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"
fi

cd /workspace/client
./node_modules/.bin/vite preview --host 127.0.0.1 --port 5188 >/tmp/haichuan-seo-preview.log 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
until wget -q -O /dev/null http://127.0.0.1:5188/; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    cat /tmp/haichuan-seo-preview.log
    exit 1
  fi
  sleep 1
done

mkdir -p /workspace/client/test-results
cd /workspace
node scripts/measure-public-cwv.mjs \
  --base-url http://127.0.0.1:5188 \
  --path /privacy \
  --output client/test-results/seo-cwv.json \
  --quiet


