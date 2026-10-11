#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${API_ANYTHING_HOME:-/tmp/api-anything}"
mkdir -p "${API_ANYTHING_HOME:-/tmp/api-anything}/sites"
cp /app/site-spec/truecaller.json "${API_ANYTHING_HOME:-/tmp/api-anything}/sites/truecaller.json"

CLI="${API_ANYTHING_CLI:-/opt/api-anything/dist/cli.js}"

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
  node "$CLI" login truecaller --cookies "$cookie_file" || {
    echo "Warning: cookie login failed (continuing so /health can pass). Check TRUECALLER_COOKIES_JSON." >&2
  }
  rm -f "$cookie_file"
else
  echo "Warning: TRUECALLER_COOKIES_JSON is not set. Lookups will fail until you add cookies." >&2
fi

if [[ -z "${TRUECALLER_API_KEY:-}" ]]; then
  echo "Warning: TRUECALLER_API_KEY is not set. /health will work; /api/search will return 503 until you set it." >&2
fi

exec node /app/server.mjs
