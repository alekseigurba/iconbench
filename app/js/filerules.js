// What the library will keep, and how it hands it back. The Node server asks
// these questions of every write, and so does the service worker that stands in
// for it where there is no server — they live here, with no DOM and no Node in
// them, so that the two cannot come to disagree about what an icon is.

import { looksExecutable, safeName } from './document.js';

/** The one folder the API writes to: a folder per pack inside it. */
export const PACKS_PREFIX = 'packs/';

/** A pack's palette, kept beside its icons. */
export const PACK_FILE = 'pack.json';

/** An icon is a few kilobytes. This is only about not holding junk in memory. */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * A stored SVG opened in a tab of its own is a document on the page's origin.
 * It is only ever a drawing, so it is served as one that can do nothing.
 */
export const DRAWING_ONLY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * On every answer that comes out of the browser's own storage rather than a
 * server's folder, so the page can tell which library it has and say so.
 */
export const LIBRARY_HEADER = 'Iconbench-Library';
export const IN_BROWSER = 'browser';

/**
 * What is wrong with a key someone wants to write or delete, or null. The
 * library is `packs/<pack>/<icon>.svg` with a `pack.json` beside the icons,
 * every name of it the way `safeName` names things — so that is all the API
 * will touch, and whatever else ends up in the folder is left be.
 */
export function keyProblem(key) {
  if (!key.startsWith(PACKS_PREFIX)) return `Icons are kept in packs, under ${PACKS_PREFIX}.`;
  const parts = key.slice(PACKS_PREFIX.length).split('/');
  if (parts.length !== 2) return 'An icon is kept in a pack: packs/<pack>/<icon>.svg.';
  const [pack, file] = parts;
  if (safeName(pack) !== pack) return 'A pack is named in lower case letters, digits and dashes.';
  if (file === PACK_FILE) return null;
  if (!file.endsWith('.svg')) return 'An icon is an .svg file.';
  if (safeName(file) !== file.slice(0, -'.svg'.length)) {
    return 'An icon is named in lower case letters, digits and dashes.';
  }
  return null;
}

/** What is wrong with what someone wants to keep at a key, or null. */
export function bodyProblem(key, text) {
  if (key.endsWith(`/${PACK_FILE}`)) {
    try {
      JSON.parse(text);
      return null;
    } catch {
      return 'A pack.json has to be JSON.';
    }
  }
  return looksExecutable(text) ? 'That SVG carries script, so it was not saved.' : null;
}

/** What someone who asked for too much is told. */
export const tooBig = () => `An icon must be under ${MAX_BODY_BYTES / 1024} KB.`;
