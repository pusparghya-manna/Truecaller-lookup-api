import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const apiAnythingHome = process.env.API_ANYTHING_HOME || '/home/ubuntu/.api-anything-truecaller';
const apiKey = process.env.TRUECALLER_API_KEY;
const port = Number(process.env.PORT || 8787);

if (!apiKey) {
  console.error('TRUECALLER_API_KEY is required');
  process.exit(1);
}

let lastCallAt = 0;
let callQueue = Promise.resolve();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-api-key',
  });
  res.end(payload);
}

function normalizeIndianNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  throw new Error('Use a valid Indian mobile number: 10 digits or +91 followed by 10 digits.');
}

function legacyPathParams(pathname) {
  const match = pathname.match(/^\/api\/key=([^/]+)\/num=([^/]+)$/);
  if (!match) return undefined;
  return { key: decodeURIComponent(match[1]), number: decodeURIComponent(match[2]) };
}

function enrichResult(result) {
  if (!Array.isArray(result?.data)) return result;
  return {
    ...result,
    data: result.data.map((item) => {
      const out = { ...item };
      for (let i = 1; i <= 6; i++) {
        const label = out[`card${i}Label`];
        const value = out[`card${i}Value`];
        if (label && value) {
          if (label === 'Spam reports') out.spamReports = value;
          else if (label === 'Business tag') out.businessTag = value;
          else if (label === 'Address') out.address = value;
          else if (label === 'Email') out.email = value;
          else if (/^M\s*-\s*/.test(label)) {
            out.carrier = label;
            out.carrierNumber = value;
          }
        }
        delete out[`card${i}Label`];
        delete out[`card${i}Value`];
      }
      if (typeof out.vcard === 'string' && out.vcard.startsWith('data:text/vcard')) {
        try {
          const text = decodeURIComponent(out.vcard.split(',', 2)[1] || '');
          const fn = text.match(/^FN:(.+)$/m)?.[1]?.trim();
          const adr = text.match(/^ADR[^:]*:(.+)$/m)?.[1]?.split(';')[3]?.trim();
          const email = text.match(/^EMAIL:(.+)$/m)?.[1]?.trim();
          if (!out.name && fn) out.name = fn;
          if (!out.address && adr) out.address = adr;
          if (!out.email && email) out.email = email;
        } catch {
          // Keep the structured fields when a site returns a malformed vCard.
        }
        delete out.vcard;
      }
      return out;
    }),
  };
}

async function waitForPace() {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastCallAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

function runLookup(number) {
  callQueue = callQueue.then(async () => {
    await waitForPace();
    const { stdout } = await execFileAsync(
      'api-anything',
      ['call', 'truecaller', 'search', `number=${number}`],
      {
        cwd: '/home/ubuntu/api-anything',
        env: { ...process.env, API_ANYTHING_HOME: apiAnythingHome },
        timeout: 90_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const line = stdout.trim().split('\n').filter(Boolean).at(-1);
    return enrichResult(JSON.parse(line));
  });
  return callQueue;
}

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  if (data.length > 100_000) throw new Error('Request body is too large.');
  return data ? JSON.parse(data) : {};
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = normalize(join(publicDir, requested));
  if (!file.startsWith(publicDir)) return json(res, 404, { error: 'Not found' });
  try {
    const content = await readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key' });
    return res.end();
  }
  if (url.pathname === '/health') return json(res, 200, { ok: true, service: 'truecaller-api' });
  const legacy = legacyPathParams(url.pathname);
  if (url.pathname === '/api/search' || legacy) {
    const suppliedKey = req.headers['x-api-key'] || legacy?.key;
    if (suppliedKey !== apiKey) return json(res, 401, { ok: false, error: 'Missing or invalid API key.' });
    try {
      const input = legacy ? legacy : req.method === 'POST' ? await body(req) : Object.fromEntries(url.searchParams);
      const number = normalizeIndianNumber(input.number);
      const result = await runLookup(number);
      return json(res, result.ok ? 200 : 502, { ...result, number });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lookup failed.';
      return json(res, 400, { ok: false, error: message });
    }
  }
  return serveStatic(req, res, url.pathname);
});

server.listen(port, '0.0.0.0', () => console.log(`Truecaller API listening on http://0.0.0.0:${port}`));
