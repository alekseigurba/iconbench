// The page's one way to reach stored files: get, put, delete and list objects
// by key. It mirrors the server's API exactly, and the server's API is
// deliberately plain, so the store behind it can become S3 or anything else
// that can do the same four things without this file changing.
//
// On top of that, the library as the page thinks of it: packs, each a folder of
// icons with a pack.json beside them.

const API = 'api/files';
const PACKS_PREFIX = 'packs/';
const PACK_FILE = 'pack.json';

const url = (key) => `${API}/${key.split('/').map(encodeURIComponent).join('/')}`;

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
  return response.json();
}

export async function deleteFile(key) {
  const response = await fetch(url(key), { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw await complain(response);
}

/** Everything stored under `prefix`, as `{ key, size, lastModified }`. */
export async function listFiles(prefix) {
  const response = await fetch(`${API}?prefix=${encodeURIComponent(prefix)}`, { cache: 'no-store' });
  if (!response.ok) throw await complain(response);
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
