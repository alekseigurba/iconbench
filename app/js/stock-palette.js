// The stock palette: the stylesheet's 32 inks, --c1 … --c32. tokens.css is the
// source of truth for every colour on the page, these included, so they are
// read from it rather than written down a second time. A pack starts with a
// copy of them, and "Reset to defaults" in the palette editor puts them back.

import { PALETTE_SIZE } from './defaults.js';
import { readHex } from './color.js';

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const STOCK_PALETTE = Object.freeze(
  Array.from({ length: PALETTE_SIZE }, (_, i) => readHex(cssVar(`--c${i + 1}`)) ?? '#000000'),
);
