// The server as a library: static files for the app, and a file API over the
// icon library. `scripts/serve.mjs` is the CLI over this. It is domain-map's
// server with the database and the sign-in taken out: iconbench is one person's
// drawing board, run on their own machine, and its library is a folder.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// What may be kept is not the server's alone to say: the service worker that
// stands in for it on a host with no server asks the same questions.
import { DRAWING_ONLY_POLICY, MAX_BODY_BYTES, bodyProblem, keyProblem, tooBig } from '../app/js/filerules.js';
import { fileStore } from './file-store.mjs';

/** A path inside the repo, wherever it has been checked out. */
const packagePath = (path) => fileURLToPath(new URL(path, import.meta.url));

const API_PREFIX = '/api/files';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const contentType = (path) => MIME_TYPES[extname(path)] ?? 'application/octet-stream';

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

/** The body as one buffer, or null once it has grown past what we will hold. */
function readBody(request) {
  return new Promise((resolve_, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        resolve_(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve_(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/**
 * An http.Server that has not been listened on yet. Every option has a default,
 * so `createIconbenchServer().listen(8010)` serves the app.
 *
 * @param {object}   [options]
 * @param {string}   [options.root]       The app's static files. Defaults to the repo's own.
 * @param {string}   [options.storageDir] Where the library is kept. Defaults to `$STORAGE_DIR`,
 *                                        then to `storage` under the working directory.
 * @param {object}   [options.store]      A `{ read, write, remove, list }` of your own.
 * @param {object}   [options.env]        Read instead of `process.env`.
 */
export function createIconbenchServer(options = {}) {
  const env = options.env ?? process.env;
  const root = options.root ? resolve(options.root) : packagePath('../app');
  const storageDir = resolve(options.storageDir ?? env.STORAGE_DIR ?? 'storage');
  const store = options.store ?? fileStore(storageDir);

  async function handleFiles(request, response, url) {
    const key = decodeURIComponent(url.pathname.slice(API_PREFIX.length).replace(/^\//, ''));

    if (request.method === 'GET' && key === '') {
      sendJson(response, 200, { objects: await store.list(url.searchParams.get('prefix') ?? '') });
      return;
    }

    if (request.method === 'GET') {
      const object = await store.read(key);
      if (!object) return sendJson(response, 404, { error: `No object at ${key}.` });
      response.writeHead(200, {
        'Content-Type': contentType(key),
        'Last-Modified': new Date(object.lastModified).toUTCString(),
        'Cache-Control': 'no-store',
        'Content-Security-Policy': DRAWING_ONLY_POLICY,
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(object.body);
      return;
    }

    if (request.method === 'PUT') {
      const problem = keyProblem(key);
      if (problem) return sendJson(response, 400, { error: problem });
      const body = await readBody(request);
      if (body === null) return sendJson(response, 413, { error: tooBig() });
      const unfit = bodyProblem(key, body.toString('utf8'));
      if (unfit) return sendJson(response, 400, { error: unfit });
      sendJson(response, 200, await store.write(key, body));
      return;
    }

    if (request.method === 'DELETE') {
      const problem = keyProblem(key);
      if (problem) return sendJson(response, 400, { error: problem });
      if (!(await store.remove(key))) return sendJson(response, 404, { error: `No object at ${key}.` });
      response.writeHead(204).end();
      return;
    }

    response.writeHead(405, { Allow: 'GET, PUT, DELETE' });
    response.end();
  }

  async function handleStatic(request, response, url) {
    const path = decodeURIComponent(url.pathname).endsWith('/')
      ? `${url.pathname}index.html`
      : url.pathname;

    const filePath = resolve(join(root, decodeURIComponent(path)));
    if (filePath === root || filePath.startsWith(root + sep)) {
      try {
        const body = await readFile(filePath);
        // No build step means no hashed file names, so nothing may be cached
        // blind: the browser asks each time and is told when nothing changed.
        response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-cache' });
        response.end(body);
        return;
      } catch {
        // Not there: fall through to the 404.
      }
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
      } else if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
        await handleFiles(request, response, url);
      } else {
        await handleStatic(request, response, url);
      }
    } catch (error) {
      console.error(error);
      sendJson(response, 400, { error: error.message });
    }
  });

  // What the server settled on, for a CLI that wants to print it or a test that
  // wants to assert on it.
  server.config = { root, storageDir };
  return server;
}
