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
const apiAnythingCli = process.env.API_ANYTHING_CLI || '/opt/api-anything/dist/cli.js';
const apiAnythingCwd = process.env.API_ANYTHING_CWD || '/opt/api-anything';
const apiKey = process.env.TRUECALLER_API_KEY || '';
const port = Number(process.env.PORT || 8787);

if (!apiKey) {
  console.warn('TRUECALLER_API_KEY is not set — /health will work, /api/search will return 503 until you set it in Railway Variables.');
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


function cleanAddress(value) {
  if (typeof value !== 'string') return value ?? '';
  // Remove trailing " ⸱ HH:MM" or " · HH:MM" style local-time suffixes from Truecaller
  return value
    .replace(/\s*[⸱·•]\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\s*$/u, '')
    .replace(/\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\s*$/i, '')
    .trim();
}

function toPublicNumber(e164OrDigits) {
  const digits = String(e164OrDigits ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits;
}

function formatLookupResponse(result, e164Number) {
  const mobile = toPublicNumber(e164Number);
  const items = Array.isArray(result?.data) ? result.data : [];
  const hasName = items.some((item) => item && (item.name || item.email || item.profileImage));
  const success = Boolean(result?.ok) && items.length > 0 && hasName;

  if (!success) {
    return {
      status: 'failed',
      number: mobile,
      total: 0,
      records: [],
      developer: 'Pusparghya',
      error: 'Not found',
    };
  }

  const records = items.map((item, index) => {
    const addressRaw = item.address || item.businessTag || '';
    return {
      record_no: index + 1,
      mobile,
      name: item.name || '',
      profileImage: item.profileImage || '',
      address: cleanAddress(addressRaw),
      email: item.email || '',
    };
  });

  return {
    status: 'success',
    number: mobile,
    total: records.length,
    records,
    developer: 'Pusparghya',
  };
}

async function waitForPace() {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastCallAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

class LookupProviderError extends Error {
  constructor(message, statusCode, help) {
    super(message);
    this.name = 'LookupProviderError';
    this.statusCode = statusCode;
    this.help = help;
  }
}

function parseCliResult(output) {
  const lines = String(output ?? '').trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      const result = JSON.parse(line);
      if (result && typeof result === 'object' && !Array.isArray(result)) return result;
    } catch {
      // Ignore CLI progress lines and keep looking for its JSON result.
    }
  }
  return undefined;
}

function providerFailure(result) {
  switch (result?.class) {
    case 'auth':
      return new LookupProviderError(
        'Truecaller rejected the saved session.',
        502,
        'The site owner must refresh TRUECALLER_COOKIES_JSON in Railway Variables, then redeploy.',
      );
    case 'blocked':
      return new LookupProviderError(
        'Truecaller is challenging automated lookups.',
        503,
        'Wait before retrying; the site owner may need to clear a verification challenge through an authorized session.',
      );
    case 'rate':
      return new LookupProviderError(
        'Truecaller is rate-limiting lookups.',
        429,
        'Wait a few minutes before trying again.',
      );
    case 'input':
      return new LookupProviderError('No profile was returned for this number.', 404, 'Check the number and try again.');
    case 'drift':
      return new LookupProviderError(
        'Truecaller changed its search response and automatic repair did not succeed.',
        502,
        'The site owner needs to refresh the Truecaller search recipe in API-Anything.',
      );
    default:
      return new LookupProviderError(
        'The Truecaller lookup provider could not complete the request.',
        502,
        'The site owner should inspect the deployment logs and session configuration.',
      );
  }
}

async function runApiAnything(args, timeout = 90_000) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [apiAnythingCli, ...args],
      {
        cwd: apiAnythingCwd,
        env: { ...process.env, API_ANYTHING_HOME: apiAnythingHome },
        timeout,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const result = parseCliResult(stdout);
    if (result) return result;
  } catch (error) {
    // API-Anything writes its structured failure to stdout and exits non-zero.
    const result = parseCliResult(error?.stdout);
    if (result) return result;
  }
  throw providerFailure({ class: 'error' });
}

function runLookup(number) {
  // Recover the serial queue after any rejected lookup so future searches can still run.
  callQueue = callQueue.catch(() => {}).then(async () => {
    await waitForPace();
    const args = ['call', 'truecaller', 'search', `number=${number}`];
    let result = await runApiAnything(args);

    // A drifted read recipe can be repaired safely; follow API-Anything's own suggested next step once.
    if (!result.ok && result.class === 'drift') {
      console.warn('[lookup] Truecaller search recipe drifted; attempting one read-only repair.');
      await waitForPace();
      const healed = await runApiAnything(['heal', 'truecaller', 'search'], 150_000);
      result = healed.ok ? (await waitForPace(), await runApiAnything(args)) : healed;
    }

    if (!result.ok) {
      console.warn(`[lookup] API-Anything lookup failed (${result.class || 'unknown'}).`);
      throw providerFailure(result);
    }
    return enrichResult(result);
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
  // Strip leading slash so join() does not ignore publicDir on absolute paths
  const relative = requested.replace(/^\/+/, '');
  const file = normalize(join(publicDir, relative));
  if (!file.startsWith(publicDir)) return json(res, 404, { error: 'Not found' });
  try {
    const content = await readFile(file);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.json': 'application/json; charset=utf-8',
      '.woff2': 'font/woff2',
      '.txt': 'text/plain; charset=utf-8',
    };
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': ['.html', '.css', '.js'].includes(extname(file).toLowerCase())
        ? 'no-store, no-cache, must-revalidate'
        : 'public, max-age=3600',
    });
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
    if (!apiKey) return json(res, 503, { ok: false, error: 'Server misconfigured: TRUECALLER_API_KEY is not set in environment variables.' });
    if (suppliedKey !== apiKey) return json(res, 401, { ok: false, error: 'Missing or invalid API key.' });
    try {
      const input = legacy ? legacy : req.method === 'POST' ? await body(req) : Object.fromEntries(url.searchParams);
      const number = normalizeIndianNumber(input.number);
      const result = await runLookup(number);
      const formatted = formatLookupResponse(result, number);
      return json(res, formatted.status === 'success' ? 200 : 404, formatted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lookup failed.';
      const statusCode = error instanceof LookupProviderError ? error.statusCode : 400;
      return json(res, statusCode, {
        status: 'failed',
        number: '',
        total: 0,
        records: [],
        developer: 'Pusparghya',
        error: message,
        ...(error instanceof LookupProviderError ? { help: error.help } : {}),
      });
    }
  }
  return serveStatic(req, res, url.pathname);
});

server.listen(port, '0.0.0.0', () => console.log(`Truecaller API listening on http://0.0.0.0:${port}`));
