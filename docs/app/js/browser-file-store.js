// The file store, kept by the browser: `scripts/file-store.mjs` over again with
// IndexedDB where that has a folder. Same four calls, same shapes — a key is a
// path, an object is bytes, a listing is `{ key, size, lastModified }` — so the
// handler over it cannot tell the difference, and neither can the page.
//
// One database, one table, a row per file, keyed by the file's key. There are
// no folders to make or to clear away: a pack is there for as long as a key
// starts with its name, which is all a pack ever was.

const DATABASE = 'iconbench-library';
const TABLE = 'files';

/** What a request found, as a promise. */
const found = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/**
 * A change, once it is really kept. A request can succeed and its transaction
 * still fail — a full disk is found out at the end — and "Saved" must not be
 * said before then.
 */
const kept = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error('The browser did not keep the change.'));
});

function open() {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(TABLE, { keyPath: 'key' });
  return found(request);
}

/** A `{ read, write, remove, list }` over this browser's storage for the site. */
export function browserFileStore() {
  // Opened once and kept: the worker is stopped when idle and started afresh,
  // and that is the only closing a database here needs.
  let database = null;
  const opened = () => (database ??= open());

  // A transaction lives only until the browser next has nothing to do, so one
  // is begun at the moment it is used and never handed across an await.
  const reading = (db) => db.transaction(TABLE, 'readonly').objectStore(TABLE);

  const listing = ({ key, size, lastModified }) => ({ key, size, lastModified });

  return {
    async read(key) {
      const row = await found(reading(await opened()).get(key));
      return row ? { body: row.body, lastModified: row.lastModified } : null;
    },

    async write(key, body) {
      const row = { key, body, size: body.byteLength, lastModified: new Date().toISOString() };
      const change = (await opened()).transaction(TABLE, 'readwrite');
      change.objectStore(TABLE).put(row);
      await kept(change);
      return listing(row);
    },

    async remove(key) {
      const db = await opened();
      if ((await found(reading(db).count(key))) === 0) return false;
      const change = db.transaction(TABLE, 'readwrite');
      change.objectStore(TABLE).delete(key);
      await kept(change);
      return true;
    },

    async list(prefix = '') {
      // Every key from the prefix up to the last one that could start with it.
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      const rows = await found(reading(await opened()).getAll(range));
      // In the order the folder on disk lists them, so a pack reads the same in both.
      return rows.map(listing).sort((a, b) => a.key.localeCompare(b.key));
    },
  };
}
