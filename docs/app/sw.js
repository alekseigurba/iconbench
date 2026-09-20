// The server, for a host that has none. GitHub Pages serves files and nothing
// else, so there the page registers this worker (`files.js` does, when its
// first listing finds nobody home) and it answers `api/files` out of the
// browser's own storage. Served by `npm start` it is never registered: it sits
// in the folder and does nothing.
//
// It answers the library and only the library. Everything else goes to the
// network untouched — the app has no hashed file names, so a copy of it kept
// here would be a stale one sooner or later.

import { answerFiles } from './js/fileapi.js';
import { browserFileStore } from './js/browser-file-store.js';

const store = browserFileStore();

/** `api/files` as the page asks for it: under the repo's name on Pages, under whatever folder this is served from. */
const apiPath = new URL('api/files', self.registration.scope).pathname;

// Take over at once, the page that registered it included: that page is waiting
// on its first listing, and there is no older worker whose work could be cut short.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/**
 * Whether a real server answers at this address after all, asked once each
 * time the worker is started. A worker outlives the visit that registered it —
 * so an address first served as plain files, and later by `npm start`, would
 * find this in front of the real library, quietly keeping icons in the browser
 * that were meant for the folder on disk. If somebody is home, it steps aside
 * for good.
 */
let serverIsThere = null;
function lookForServer() {
  serverIsThere ??= fetch(`${apiPath}?prefix=packs/`, { cache: 'no-store' })
    .then((response) => response.ok && (response.headers.get('Content-Type') ?? '').includes('json'))
    .catch(() => false) // Offline. The library here is still good.
    .then((there) => {
      if (there) self.registration.unregister();
      return there;
    });
  return serverIsThere;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== apiPath && !url.pathname.startsWith(`${apiPath}/`)) return;

  event.respondWith(lookForServer().then((there) => (
    there ? fetch(event.request) : answerFiles(event.request, store, apiPath)
  )));
});
