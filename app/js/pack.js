// Icon packs. A pack is a folder of icons and the one palette they share, kept
// beside them as pack.json. A line wears either a swatch of that palette or a
// colour of its own; editing a swatch is how a whole pack is recoloured, and
// this is the code that carries the new colour into every line wearing it.
//
// Pure: no DOM, no store, no server — so it runs headless under test.

import { PALETTE_SIZE } from './defaults.js';
import { readHex } from './color.js';
import { fromSvg, isIconbenchFile, looksExecutable, safeName, toSvg } from './document.js';

/** Bumped when pack.json or a pack file changes shape. */
export const PACK_VERSION = 1;

/**
 * A palette fit to keep: exactly PALETTE_SIZE hexes. A short or damaged one is
 * filled from `fallback`, swatch for swatch, rather than refused — a pack whose
 * palette file was edited by hand should still open.
 */
export function tidyPalette(colors, fallback) {
  return Array.from({ length: PALETTE_SIZE }, (_, i) =>
    readHex(colors?.[i]) ?? readHex(fallback?.[i]) ?? '#000000');
}

export function newPack(name, palette) {
  return { version: PACK_VERSION, name, palette: tidyPalette(palette) };
}

/** pack.json as text, and back. */
export const packToJson = (pack) => `${JSON.stringify({
  version: PACK_VERSION,
  name: pack.name,
  palette: pack.palette,
}, null, 2)}\n`;

export function packFromJson(text, name, fallbackPalette) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: treated as a pack that has no palette of its own yet.
  }
  if (parsed?.version > PACK_VERSION) throw new Error(`That pack was saved by a newer iconbench (format ${parsed.version}).`);
  return newPack(name, tidyPalette(parsed?.palette, fallbackPalette));
}

// --- recolouring ------------------------------------------------------------------

/**
 * Give every line that wears a swatch the colour the palette now holds for it.
 * Lines with a colour of their own are left alone: they were taken off the
 * palette on purpose. Changes the document in place, and says whether anything
 * in it moved.
 */
export function applyPalette(doc, palette) {
  let changed = false;
  for (const layer of doc.layers) {
    for (const line of layer.lines) {
      const stroke = line.strokeSwatch ? palette[line.strokeSwatch - 1] : null;
      if (stroke && stroke !== line.stroke) {
        line.stroke = stroke;
        changed = true;
      }
      const fill = line.fill && line.fillSwatch ? palette[line.fillSwatch - 1] : null;
      if (fill && fill !== line.fill) {
        line.fill = fill;
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * One icon file, recoloured. Answers with the new text, or null when the file
 * wears none of what changed — so a pack is rewritten only where it has to be.
 */
export function recolourSvg(text, palette, name) {
  const doc = fromSvg(text, name);
  return applyPalette(doc, palette) ? toSvg(doc) : null;
}

// --- a pack as one file -------------------------------------------------------------

/**
 * A whole pack as one JSON file: what "Save pack to" writes and "Load pack
 * from" reads, for carrying a pack between machines. The icons are in it as the
 * SVGs they are, so the file can be read by eye and an icon fished out of it.
 */
export function packToBundle(pack, icons) {
  return `${JSON.stringify({
    iconbenchPack: PACK_VERSION,
    name: pack.name,
    palette: pack.palette,
    icons: Object.fromEntries([...icons].sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2)}\n`;
}

/**
 * What a pack file holds: `{ pack, icons }`, icons as `[name, svg]` pairs. It
 * throws, in words fit for the status line, on a file that is not a pack; an
 * icon in it that cannot be kept is left out and named in `skipped`.
 */
export function packFromBundle(text, fallbackPalette) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not an iconbench pack: it is not JSON.');
  }
  if (!parsed?.iconbenchPack) throw new Error('That file is not an iconbench pack.');
  if (parsed.iconbenchPack > PACK_VERSION) {
    throw new Error(`That pack was saved by a newer iconbench (format ${parsed.iconbenchPack}).`);
  }
  const name = safeName(parsed.name);
  if (!name) throw new Error('That pack has no name that can be used.');

  const pack = newPack(name, tidyPalette(parsed.palette, fallbackPalette));
  const icons = [];
  const skipped = [];
  for (const [key, svg] of Object.entries(parsed.icons ?? {})) {
    const iconName = safeName(key);
    if (iconName && typeof svg === 'string' && isIconbenchFile(svg) && !looksExecutable(svg)) icons.push([iconName, svg]);
    else skipped.push(key);
  }
  return { pack, icons, skipped };
}
