// The file API, answered without a server. `scripts/server.mjs` answers
// `api/files` out of a folder; on a host that only serves files — GitHub Pages —
// the service worker answers the same requests with this, out of whatever store
// it is handed. It speaks the web's own Request and Response, which Node has
// too, so the tests put it through the very checks the real server gets.
//
// It is the server's handler over again on purpose, status for status: the page
// is not to know which of the two it is talking to, but for the one header that
// says so.

import {
  DRAWING_ONLY_POLICY, IN_BROWSER, LIBRARY_HEADER, MAX_BODY_BYTES, bodyProblem, keyProblem, tooBig,
} from './filerules.js';

const CONTENT_TYPES = {
  svg: 'image/svg+xml',
  json: 'application/json; charset=utf-8',
};

const contentType = (key) => CONTENT_TYPES[key.slice(key.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

const send = (status, body, headers = {}) => new Response(body, {
  status,
  headers: { [LIBRARY_HEADER]: IN_BROWSER, 'Cache-Control': 'no-store', ...headers },
});

const sendJson = (status, body) => send(status, JSON.stringify(body), { 'Content-Type': CONTENT_TYPES.json });

/**
 * The answer to a request under `apiPath` — the path of `api/files` as the
 * page sees it, which on Pages has the repo's name in front of it.
 *
 * @param {Request} request
 * @param {object}  store    A `{ read, write, remove, list }`, as the server's is.
 * @param {string}  apiPath
 * @returns {Promise<Response>}
 */
export async function answerFiles(request, store, apiPath) {
  try {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(apiPath.length).replace(/^\//, ''));

    if (request.method === 'GET' && key === '') {
      return sendJson(200, { objects: await store.list(url.searchParams.get('prefix') ?? '') });
    }

    if (request.method === 'GET') {
      const object = await store.read(key);
      if (!object) return sendJson(404, { error: `No object at ${key}.` });
      return send(200, object.body, {
        'Content-Type': contentType(key),
        'Last-Modified': new Date(object.lastModified).toUTCString(),
        'Content-Security-Policy': DRAWING_ONLY_POLICY,
        'X-Content-Type-Options': 'nosniff',
      });
    }

    if (request.method === 'PUT') {
      const problem = keyProblem(key);
      if (problem) return sendJson(400, { error: problem });
      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY_BYTES) return sendJson(413, { error: tooBig() });
      const unfit = bodyProblem(key, new TextDecoder().decode(body));
      if (unfit) return sendJson(400, { error: unfit });
      return sendJson(200, await store.write(key, body));
    }

    if (request.method === 'DELETE') {
      const problem = keyProblem(key);
      if (problem) return sendJson(400, { error: problem });
      if (!(await store.remove(key))) return sendJson(404, { error: `No object at ${key}.` });
      return send(204, null);
    }

    return send(405, null, { Allow: 'GET, PUT, DELETE' });
  } catch (error) {
    return sendJson(400, { error: error.message });
  }
}
