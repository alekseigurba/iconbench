#!/usr/bin/env node
// The copy of the app that GitHub Pages serves. Pages can publish a branch's
// root or its docs/ folder and nothing else, so the app is copied into
// docs/app/ and committed there — byte for byte, since the app has no build
// step and the copy is not going to be where it gets one.
//
//   node scripts/build-pages.mjs [from] [to]
//
// It is run when a release is cut, not before: what Pages shows is the last
// release, and a day's work in app/ shows up once in a diff rather than twice.
import { cp, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** A path inside the repo, wherever it has been checked out. */
const packagePath = (path) => fileURLToPath(new URL(path, import.meta.url));

/** What a Mac or a Windows desktop leaves in a folder it has looked at. */
const LITTER = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/**
 * Make `to` a copy of `from` and of nothing else: the folder is emptied first,
 * so a file deleted from the app is deleted from the copy.
 */
export async function buildPages({ from = packagePath('../app'), to = packagePath('../docs/app') } = {}) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true, filter: (source) => !LITTER.has(basename(source)) });
  return { from: resolve(from), to: resolve(to) };
}

// Run as a script rather than imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { from, to } = await buildPages({ from: process.argv[2], to: process.argv[3] });
  console.log(`Copied ${from} to ${to}`);
}
