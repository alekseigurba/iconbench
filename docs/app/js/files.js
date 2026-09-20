// The page's one way to reach stored files: get, put, delete and list objects
// by key. It mirrors the server's API exactly, and the server's API is
// deliberately plain, so the store behind it can become S3 or anything else
// that can do the same four things without this file changing.
//
// On top of that, the library as the page thinks of it: packs, each a folder of
// icons with a pack.json beside them.
//
// Where there is no server at all — GitHub Pages serves files and nothing else —
// the same four calls are answered by a service worker out of the browser's own
// storage (`sw.js`). Starting it is this file's business, since it is the one
// that finds nobody home; nothing else on the page changes.

import { IN_BROWSER, LIBRARY_HEADER, PACKS_PREFIX, PACK_FILE } from './filerules.js';

const API = 'api/files';
const WORKER = 'sw.js';
const RELOADED_KEY = 'iconbench:reloaded-for-library';

/** How long a worker is given to take the page over before something is said to be wrong. */
const TAKEOVER_MS = 5000;

const url = (key) => `${API}/${key.split('/').map(encodeURIComponent).join('/')}`;

// --- a library in the browser ----------------------------------------------------

let inBrowser = false;
let workerStarted = false;

/** Whether the library is this browser's own storage rather than a server's folder. Known once anything has been listed. */
export const libraryIsInBrowser = () => inBrowser;

/**
 * Whether the browser has agreed to keep the library until the site's data is
 * cleared by hand. Without that it may throw the lot away when short of disk.
 */
export async function libraryIsKeptForGood() {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Start the worker that stands in for the server, and wait until it answers for
 * this page. True once it does; false if that was tried already, so that a
 * listing which still fails is reported rather than tried for ever.
 */
async function startBrowserLibrary() {
  if (workerStarted) return false;
  workerStarted = true;

  const workers = navigator.serviceWorker;
  if (!workers) {
    throw new Error('There is no server here to keep a library, and this browser will not keep one itself.');
  }
  try {
    await workers.register(WORKER, { type: 'module' });
  } catch (error) {
    throw new Error(`There is no server here, and the library could not be started in this browser: ${error.message}`);
  }

  if (!workers.controller) {
    await new Promise((resolve) => {
      workers.addEventListener('controllerchange', resolve, { once: true });
      setTimeout(resolve, TAKEOVER_MS);
    });
  }
  if (workers.controller) {
    sessionStorage.removeItem(RELOADED_KEY);
    return true;
  }

  // A page reloaded with Shift held is one the browser keeps every worker away
  // from, for as long as it is open. An ordinary reload is the way out — once,
  // so that a browser which never lets the worker in is not reloaded for ever.
  if (!sessionStorage.getItem(RELOADED_KEY)) {
    sessionStorage.setItem(RELOADED_KEY, 'yes');
    window.location.reload();
    await new Promise(() => {}); // The page is going; nothing after this should run.
  }
  throw new Error('The library in this browser did not start. Reloading the page may help.');
}

let askedToKeep = false;

/**
 * Ask the browser to keep the library for good — after the first thing is
 * written to it, when there is something to lose and the question makes sense.
 * Firefox puts it to the person, and remembers a no for itself; Chrome answers
 * on its own, by how much the site is used, so a no today may be a yes next
 * week. Hence once a visit rather than once ever.
 */
async function askToKeepForGood() {
  if (askedToKeep) return;
  askedToKeep = true;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // No such storage, or none to ask: the library is kept as well as it was.
  }
}

// --- the four calls --------------------------------------------------------------

/** What the server said went wrong, or something about why it could not say. */
async function complain(response) {
  const fallback = `The server answered ${response.status}.`;
  try {
    const body = await response.json();
    return new Error(body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

/** The object at `key`, or null when there is none. */
export async function getFile(key) {
  const response = await fetch(url(key), { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw await complain(response);
  return response;
}

export async function putFile(key, body, type = 'application/octet-stream') {
  const response = await fetch(url(key), {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body,
  });
  if (!response.ok) throw await complain(response);
  if (inBrowser) askToKeepForGood(); // Not waited on: the file is saved whatever the browser says.
  return response.json();
}

export async function deleteFile(key) {
  const response = await fetch(url(key), { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw await complain(response);
}

/** Everything stored under `prefix`, as `{ key, size, lastModified }`. */
export async function listFiles(prefix) {
  const ask = () => fetch(`${API}?prefix=${encodeURIComponent(prefix)}`, { cache: 'no-store' });
  let response = await ask();
  // The server answers a listing whatever is or is not in the library, so a 404
  // is a host with no server on it. The page lists before it does anything
  // else, which makes this the one place that has to notice.
  if (response.status === 404 && await startBrowserLibrary()) response = await ask();
  if (!response.ok) throw await complain(response);
  inBrowser = response.headers.get(LIBRARY_HEADER) === IN_BROWSER;
  return (await response.json()).objects ?? [];
}

// --- packs -------------------------------------------------------------------

const iconKey = (pack, name) => `${PACKS_PREFIX}${pack}/${name}.svg`;

/** Where the page points an <img> at an icon. `stamp` changes when the file does, so a saved icon is not shown stale. */
export const iconUrl = (pack, name, stamp = '') => `${url(iconKey(pack, name))}${stamp ? `?v=${encodeURIComponent(stamp)}` : ''}`;

/**
 * Every pack in the store, as `{ name, icons }`, with each pack's icons as
 * `{ name, lastModified }` in name order. One listing answers all of it, since
 * a pack is nothing but the folder its files are in.
 */
export async function listPacks() {
  const packs = new Map();
  for (const object of await listFiles(PACKS_PREFIX)) {
    const [pack, file, ...deeper] = object.key.slice(PACKS_PREFIX.length).split('/');
    if (!pack || !file || deeper.length > 0) continue;
    if (!packs.has(pack)) packs.set(pack, { name: pack, icons: [] });
    if (file.endsWith('.svg')) {
      packs.get(pack).icons.push({ name: file.slice(0, -'.svg'.length), lastModified: object.lastModified });
    }
  }
  return [...packs.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listIcons(pack) {
  return (await listPacks()).find((candidate) => candidate.name === pack)?.icons ?? [];
}

/** A pack's pack.json as text, or null for a pack that has none yet. */
export async function readPackFile(pack) {
  return (await getFile(`${PACKS_PREFIX}${pack}/${PACK_FILE}`))?.text() ?? null;
}

export const writePackFile = (pack, text) => putFile(`${PACKS_PREFIX}${pack}/${PACK_FILE}`, text, 'application/json');

/** An icon's SVG as text, or null when the pack has no such icon. */
export async function readIcon(pack, name) {
  return (await getFile(iconKey(pack, name)))?.text() ?? null;
}

export const writeIcon = (pack, name, svg) => putFile(iconKey(pack, name), svg, 'image/svg+xml');

export const deleteIcon = (pack, name) => deleteFile(iconKey(pack, name));

/**
 * The keys of a pack that are the library's own: its icons and its pack.json.
 * Anything else put in the folder by hand is left be, as the server leaves it —
 * it would refuse to write or delete it anyway, and a rename stopped halfway by
 * a stray notes.txt is worse than one that leaves the notes behind.
 */
async function packKeys(pack) {
  const prefix = `${PACKS_PREFIX}${pack}/`;
  return (await listFiles(prefix))
    .map((object) => object.key)
    .filter((key) => {
      const file = key.slice(prefix.length);
      return !file.includes('/') && (file === PACK_FILE || file.endsWith('.svg'));
    });
}

/**
 * Give a pack another name. The store can get, put, delete and list, and that
 * is all it is asked to do here: every file is copied under the new name first,
 * and only once all of them are there are the old ones taken away. A rename cut
 * short halfway leaves two packs, never half of one.
 */
export async function renamePack(from, to) {
  const keys = await packKeys(from);
  const moved = (key) => `${PACKS_PREFIX}${to}/${key.slice(`${PACKS_PREFIX}${from}/`.length)}`;
  for (const key of keys) {
    const response = await getFile(key);
    if (!response) continue;
    await putFile(moved(key), await response.blob(), response.headers.get('Content-Type') ?? undefined);
  }
  for (const key of keys) await deleteFile(key);
}

/** Take a pack away, file by file. The store drops the folder with the last of them. */
export async function deletePack(pack) {
  for (const key of await packKeys(pack)) await deleteFile(key);
}

/** A name nothing else has, so an icon brought in never overwrites one that is there. */
export function freeName(name, taken) {
  if (!taken.includes(name)) return name;
  for (let n = 2; n < 1000; n++) {
    if (!taken.includes(`${name}-${n}`)) return `${name}-${n}`;
  }
  return `${name}-${Date.now().toString(36)}`;
}
