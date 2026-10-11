# Truecaller Lookup API — Render deployment

This project contains the complete API wrapper and web UI. It runs API Anything inside a Docker container with Chromium and imports the Truecaller session from a private Render environment variable at startup.

## Deploy

1. Create a new **Web Service** on Render from this project or upload the repository contents to GitHub.
2. Select **Docker** runtime. `render.yaml` is included for Blueprint deployment.
3. Add these environment variables in Render’s private Environment settings:
   - `TRUECALLER_API_KEY`: a long random API key for your callers.
   - `TRUECALLER_COOKIES_JSON`: a Cookie-Editor/Playwright JSON export containing your own Truecaller cookies.
   - `API_ANYTHING_HOME=/tmp/api-anything`.
4. Deploy. The service health check is `GET /health`.
5. Use the service URL in the browser UI or call `GET /api/search?number=...` with the `x-api-key` header.

## API example

```sh
curl --get 'https://YOUR-RENDER-SERVICE.onrender.com/api/search' \\
  -H 'x-api-key: YOUR_TRUECALLER_API_KEY' \\
  --data-urlencode 'number=+919123731945'
```

For compatibility with your requested format, the service also accepts:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/key=YOUR_TRUECALLER_API_KEY/num=919123731945
```

The header-based form is safer because URLs are commonly stored in browser history, proxy logs,
analytics, and server access logs. Use the path form only when a client cannot send headers.

## Authentication and security

The real cookie export is intentionally **not included** in this zip. Put it only into Render’s encrypted/private environment settings. Never commit it to GitHub, put it in the frontend, or share it in chat.

The startup script accepts either of these formats:

```json
[
  {"name":"tc_user","value":"...","domain":".truecaller.com","path":"/","secure":true}
]
```

or the browser-export wrapper format:

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

For the wrapper format, the script uses only the `cookies` map and supplies the Truecaller domain/path defaults. `localStorage` and `sessionStorage` are ignored by API Anything’s cookie importer.

Truecaller sessions can expire, and Render instances may restart. The container re-imports `TRUECALLER_COOKIES_JSON` on every startup. If Truecaller rejects the session, export a fresh session from your own browser and replace the Render secret.

This is a session-backed wrapper, not an official Truecaller API. Use only for authorized lookups, follow Truecaller’s terms and rate limits, and protect the API key.
