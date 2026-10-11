# Truecaller Lookup API — Railway deployment

Docker-based Truecaller lookup API + simple web UI. Uses API Anything + Chromium inside the container and imports your Truecaller session from a private environment variable at startup.

## Deploy on Railway

1. Create a new project → **Deploy from GitHub** (this repo) or upload the files.
2. Railway must build with the included **Dockerfile** (Docker runtime). Do not use a plain Node.js start command.
3. In the service → **Variables**, add:

| Variable | Required | Description |
|----------|----------|-------------|
| `TRUECALLER_API_KEY` | Yes | Long random secret your clients send as `x-api-key` |
| `TRUECALLER_COOKIES_JSON` | Yes (for lookups) | Cookie-Editor / Playwright JSON export of your Truecaller session |
| `API_ANYTHING_HOME` | Optional | Default `/tmp/api-anything` |
| `API_ANYTHING_CLI` | Optional | Default `/opt/api-anything/dist/cli.js` |
| `API_ANYTHING_CWD` | Optional | Default `/opt/api-anything` |

4. Health check path: `/health` (already returns `{"ok":true}`).
5. After deploy, open the public URL. The server listens on Railway’s `$PORT`.

**Important:** The service will start and pass health checks even if the two secrets are missing. Lookups return 503/401 until you set them.

## API example

```sh
curl --get 'https://YOUR-SERVICE.up.railway.app/api/search' \
  -H 'x-api-key: YOUR_TRUECALLER_API_KEY' \
  --data-urlencode 'number=+919123731945'
```

Also accepts the path form:

```text
https://YOUR-SERVICE.up.railway.app/api/key=YOUR_TRUECALLER_API_KEY/num=919123731945
```

Prefer the header form (safer for logs/history).

## Cookie formats accepted

Array:

```json
[
  {"name":"tc_user","value":"...","domain":".truecaller.com","path":"/","secure":true}
]
```

Or browser-export wrapper (only the `cookies` object is used):

```json
{
  "cookies": {
    "tc_user": "...",
    "tc:searches": "..."
  },
  "localStorage": {},
  "sessionStorage": {}
}
```

Never commit real cookies or the API key. Put them only in Railway Variables (secrets).

Sessions expire. On every restart the container re-imports `TRUECALLER_COOKIES_JSON`. If lookups start failing, export a fresh session and update the variable.

This is a session-backed wrapper, not an official Truecaller API. Use only for authorized lookups and respect Truecaller’s terms and rate limits.
