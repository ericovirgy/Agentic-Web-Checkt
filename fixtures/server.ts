/**
 * Static HTTP server for the fixture sites under `fixtures/sites/<site>/`.
 *
 * - Serves one site on 127.0.0.1 (random free port by default).
 * - Directory requests resolve to `index.html`; missing files are 404.
 * - `/challenge.html` is served with HTTP 403 so bot-wall detection (status + markers) can be tested.
 * - No dependencies; Node 20+; ESM.
 *
 * CLI: `node --import tsx fixtures/server.ts <site> [port]` prints the URL and serves until SIGINT.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITES_DIR = resolve(fileURLToPath(new URL('./sites/', import.meta.url)));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.ico': 'image/x-icon',
};

/** Paths (relative to the site root, with a leading slash) that are served with a non-200 status. */
const STATUS_OVERRIDES: Record<string, number> = {
  '/challenge.html': 403,
};

export interface FixtureServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface FixtureServerOptions {
  port?: number;
}

/** Names of the available fixture sites (directories under `fixtures/sites`). */
export function listFixtureSites(): string[] {
  return readdirSync(SITES_DIR)
    .filter((name) => !name.startsWith('.') && statSync(join(SITES_DIR, name)).isDirectory())
    .sort();
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handle(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  // Collapse leading slashes so '//x' is not parsed as a protocol-relative URL.
  const url = new URL((req.url ?? '/').replace(/^\/+/, '/'), 'http://127.0.0.1');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }

  // Normalise and refuse anything that escapes the site root.
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = resolve(root, '.' + sep + relative);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  let info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: pathname + '/' + url.search });
      res.end();
      return;
    }
    filePath = join(filePath, 'index.html');
    info = await stat(filePath).catch(() => null);
  }
  if (!info?.isFile()) {
    sendText(res, 404, 'Not Found');
    return;
  }

  const servedPath =
    '/' +
    filePath
      .slice(root.length + 1)
      .split(sep)
      .join('/');
  const status = STATUS_OVERRIDES[servedPath] ?? 200;
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  // Secret-shaped strings are generated at serve time so the repository never contains one.
  const html = type.startsWith('text/html') ? substituteFixtureSecrets(readFileSync(filePath, 'utf8')) : null;
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': html === null ? info.size : Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  if (html !== null) {
    res.end(html);
    return;
  }
  createReadStream(filePath).pipe(res);
}

const BEGIN = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const END = ['-----END', 'PRIVATE KEY-----'].join(' ');
const FIXTURE_SECRETS: Record<string, () => string> = {
  stripe: () => `${['sk', 'live'].join('_')}_51${'X'.repeat(24)}`,
  aws: () => `${'AKIA'}${'FIXTURE0'.repeat(2)}`,
  github: () => `${'ghp'}_${'f'.repeat(36)}`,
  privatekey: () => `${BEGIN}\n${'MIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAfixture'}\n${END}`,
};

export function substituteFixtureSecrets(html: string): string {
  return html.replace(/\{\{FIXTURE_SECRET:(\w+)\}\}/g, (_m, kind: string) => FIXTURE_SECRETS[kind]?.() ?? '');
}

/** Start serving `fixtures/sites/<site>` on 127.0.0.1. */
export async function startFixtureServer(
  site: string,
  opts: FixtureServerOptions = {},
): Promise<FixtureServer> {
  if (!/^[\w.-]+$/.test(site)) throw new Error(`Invalid fixture site name: ${site}`);
  const root = resolve(SITES_DIR, site);
  const rootInfo = await stat(root).catch(() => null);
  if (!rootInfo?.isDirectory()) {
    throw new Error(`Unknown fixture site "${site}". Available: ${listFixtureSites().join(', ')}`);
  }

  const server: Server = createServer((req, res) => {
    handle(root, req, res).catch((err: unknown) => {
      if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
      else res.destroy();
      console.error(err);
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture server did not bind to a TCP port');
  const port = address.port;

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.closeAllConnections?.();
        server.close((err) => (err ? reject(err) : resolveClose()));
      }),
  };
}

// ---- CLI -------------------------------------------------------------------

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  const [site, portArg] = process.argv.slice(2);
  if (!site) {
    console.error('Usage: node --import tsx fixtures/server.ts <site> [port]');
    console.error(`Sites: ${listFixtureSites().join(', ')}`);
    process.exit(2);
  }
  const port = portArg ? Number(portArg) : undefined;
  if (portArg && !Number.isInteger(port)) {
    console.error(`Invalid port: ${portArg}`);
    process.exit(2);
  }
  startFixtureServer(site, port === undefined ? {} : { port })
    .then((srv) => {
      console.log(`Serving fixture "${site}" at ${srv.url}`);
      const shutdown = () => {
        srv.close().finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(2);
    });
}
