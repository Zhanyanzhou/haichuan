#!/bin/sh
set -eu

if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
fi

cd /workspace/client
if command -v chromium-browser >/dev/null 2>&1; then
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium-browser)"
else
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"
fi
export PLAYWRIGHT_WORKERS="${PLAYWRIGHT_WORKERS:-1}"
unset VITE_PUBLIC_SITE_ORIGIN
PLAYWRIGHT_PORT=5186 ./node_modules/.bin/playwright test --config playwright.seo.config.ts "$@"
VITE_PUBLIC_SITE_ORIGIN=http://127.0.0.1:5187 PLAYWRIGHT_PORT=5187 \
  ./node_modules/.bin/playwright test --config playwright.seo.config.ts "$@"


