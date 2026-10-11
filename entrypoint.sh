#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${API_ANYTHING_HOME:-/tmp/api-anything}"
mkdir -p "${API_ANYTHING_HOME:-/tmp/api-anything}/sites"
cp /app/site-spec/truecaller.json "${API_ANYTHING_HOME:-/tmp/api-anything}/sites/truecaller.json"

if [[ -n "${TRUECALLER_COOKIES_JSON:-}" ]]; then
  cookie_file=/tmp/truecaller-cookies.json
  printf '%s' "$TRUECALLER_COOKIES_JSON" | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const cookies = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.cookies)
          ? parsed.cookies
          : Object.entries(parsed.cookies || {}).map(([name, value]) => ({
              name, value, domain: ".truecaller.com", path: "/", secure: true
            }));
      process.stdout.write(JSON.stringify(cookies));
    });
  ' > "$cookie_file"
  api-anything login truecaller --cookies "$cookie_file"
  rm -f "$cookie_file"
fi

: "${TRUECALLER_API_KEY:?Set TRUECALLER_API_KEY in Render environment variables}"
exec node /app/server.mjs
