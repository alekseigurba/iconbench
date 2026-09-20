// Wiring. Each part of the page reads the store and says what was asked for;
// this file is where the asking is answered — and the only one that both
// changes the store and talks to the server, so that saving, opening and
// recolouring a pack each happen in one place.

import * as actions from './store.js';
import { store, subscribe } from './store.js';
import * as history from './history.js';
import * as canvas from './canvas.js';
import * as files from './files.js';
import { initDetails } from './details.js';
import { initLayers } from './layers.js';
import { initMenu } from './menu.js';
import { initPackPanel } from './packpanel.js';
import { askLibrary } from './library.js';
import { loadIcons } from './icons.js';
import { CANVAS_PADDING, GRID_STEP, ICON_NAME, PACK_NAME } from './defaults.js';
import { fromSvg, isIconbenchFile, newDocument, safeName, toSvg } from './document.js';
import { packFromBundle, packFromJson, packToBundle, packToJson, recolourSvg } from './pack.js';
import { STOCK_PALETTE } from './stock-palette.js';

const PACK_KEY = 'iconbench:pack';

/** The longest side a sketch picture is kept at: it is a guide, not artwork. */
const SKETCH_PIXELS = 1024;

const HINTS = {
  select: 'Click a line to select it, drag it to move it. Drag a bend to reshape, Shift+click the line to add one, double-click one to remove it. Drag the open stage to pan.',
  straight: 'Click to place corners. Click the first point to close the line, double-click or Enter to finish it, Esc to give it up. Alt places off the grid.',
  quadratic: 'Click an anchor, then its control, then the next anchor, and so on. Click the first point to close, double-click or Enter to finish, Esc to give it up.',
  catmull: 'Click the points the curve should run through. Click the first point to close, double-click or Enter to finish, Esc to give it up.',
  freehand: 'Draw with a pencil, a finger or the mouse: the stroke becomes a line when you let go. Smoothing is set in the panel. Two fingers pan and zoom.',
  marker: "Draw on this icon's sketch: a guide to draw over, never saved with the icon. Ctrl+V pastes a picture there.",
};

const TOOL_KEYS = { v: 'select', l: 'straight', q: 'quadratic', c: 'catmull', f: 'freehand', m: 'marker' };

const $ = (id) => document.getElementById(id);

// --- the status line -------------------------------------------------------------

let statusTimer = null;

/** Said in the footer, and cleared again: it is news, not a label. */
function say(text, { error = false } = {}) {
  const status = $('status');
  status.textContent = text;
  status.dataset.error = String(error);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.textContent = ''; }, error ? 6000 : 2500);
}

/** Run something that talks to the server, and say so if it fails rather than failing silently. */
async function attempt(work) {
  try {
    return await work();
  } catch (error) {
    console.error(error);
    say(error.message, { error: true });
    return undefined;
  }
}

/** Leaving the icon on the canvas: fine if it is saved, asked about if not. */
function okToLeave() {
  if (!store.file.dirty) return true;
  return window.confirm(`"${store.file.name ?? store.doc.name}" has changes that are not saved. Discard them?`);
}

// --- packs ------------------------------------------------------------------------

/** Whether the open pack has a pack.json in the store yet. A pack nobody has saved into is only a name. */
let packIsKept = false;

async function keepPackFile() {
  await files.writePackFile(store.pack.name, packToJson(store.pack));
  packIsKept = true;
}

async function refreshIcons() {
  actions.setPackIcons(await files.listIcons(store.pack.name));
}

/** Open a pack by name, with a fresh icon on the canvas. One that is not in the store yet opens empty, on the stock palette. */
async function openPack(name) {
  const found = (await files.listPacks()).find((pack) => pack.name === name);
  const text = found ? await files.readPackFile(name) : null;
  packIsKept = text !== null;
  actions.setPack(packFromJson(text ?? '', name, STOCK_PALETTE), found?.icons ?? []);
  actions.setDocument(newDocument());
  rememberPack(name);
}

/** The pack to open next time the page does. */
function rememberPack(name) {
  try {
    localStorage.setItem(PACK_KEY, name);
  } catch {
    // Storage switched off: the pack still opens, it just is not remembered.
  }
}

const packTiles = (packs) => packs.map((pack) => ({
  name: pack.name,
  thumbs: pack.icons.slice(0, 4).map((icon) => files.iconUrl(pack.name, icon.name, icon.lastModified)),
  caption: `${pack.icons.length} icon${pack.icons.length === 1 ? '' : 's'}`,
}));

async function chooseAndOpenPack() {
  const packs = await files.listPacks();
  const name = await askLibrary({
    title: 'Open a pack',
    tiles: packTiles(packs),
    current: store.pack.name,
    empty: 'No packs yet. Save an icon, or make a new pack, to start one.',
  });
  if (!name || name === store.pack.name || !okToLeave()) return;
  await openPack(name);
  say(`Opened ${name}`);
}

async function makePack() {
  const packs = await files.listPacks();
  const name = await askLibrary({
    title: 'New pack',
    note: 'A pack is a folder of icons that share one palette. Naming one that is already here opens it.',
    tiles: packTiles(packs),
    current: store.pack.name,
    empty: 'No packs yet.',
    name: { label: 'Pack name', value: '', suffix: '', confirm: 'Create' },
  });
  if (!name || name === store.pack.name || !okToLeave()) return;
  await openPack(name);
  if (!packIsKept) await keepPackFile();
  say(`Opened ${name}`);
}

/**
 * Another name for the open pack. The icon on the canvas stays where it is,
 * unsaved changes and all: it is the folder that moves, not the work.
 */
async function renamePack() {
  const from = store.pack.name;
  const packs = await files.listPacks();
  const to = await askLibrary({
    title: `Rename ${from}`,
    note: 'The pack keeps its icons and its palette; only its name changes.',
    tiles: packTiles(packs),
    current: from,
    empty: 'No packs yet.',
    name: { label: 'New name', value: from, suffix: '', confirm: 'Rename' },
  });
  if (!to || to === from) return;
  if (packs.some((pack) => pack.name === to)) throw new Error(`There is already a pack called ${to}.`);

  // A pack nobody has saved into is only a name, and there is nothing to move.
  if (packIsKept) {
    await files.renamePack(from, to);
    await files.writePackFile(to, packToJson({ ...store.pack, name: to }));
  }
  actions.renamePack(to);
  rememberPack(to);
  await refreshIcons();
  say(`Renamed ${from} to ${to}`);
}

/** Delete the open pack and everything in it, then open whichever pack is next. */
async function deletePack() {
  const { name, icons } = store.pack;
  const holds = icons.length === 0 ? 'It has no icons in it.' : `Its ${icons.length} icon${icons.length === 1 ? '' : 's'} go with it.`;
  if (!window.confirm(`Delete the pack ${name}? ${holds} This cannot be undone.`)) return;

  await files.deletePack(name);
  actions.forgetPackSketches(name);
  // What is on the canvas went with the pack, so there is nothing to ask about.
  store.file.dirty = false;
  const next = (await files.listPacks())[0]?.name ?? PACK_NAME;
  await openPack(next);
  say(`Deleted ${name}`);
}

/**
 * The palette editor has been shut: bring the pack's files up to date with the
 * palette. Every icon is read, recoloured and written back only if it wears a
 * swatch that changed — the open icon's file among them, so what is saved and
 * what is on the canvas stay as far apart as they were before.
 */
async function applyPaletteToPack() {
  if (!store.pack.paletteDirty) return;
  const { name, palette } = store.pack;
  await keepPackFile();

  let rewritten = 0;
  for (const icon of await files.listIcons(name)) {
    try {
      const next = recolourSvg(await files.readIcon(name, icon.name), palette, icon.name);
      if (next) {
        await files.writeIcon(name, icon.name, next);
        rewritten += 1;
      }
    } catch (error) {
      // A file put in the folder by hand, that iconbench cannot read: left be.
      console.warn(`Not recoloured: ${icon.name}. ${error.message}`);
    }
  }
  actions.markPaletteApplied();
  await refreshIcons();
  say(rewritten > 0
    ? `Palette applied to ${rewritten} icon${rewritten === 1 ? '' : 's'} in ${name}`
    : 'Palette saved');
}

// --- icons ------------------------------------------------------------------------

function newIcon() {
  if (!okToLeave()) return;
  actions.setDocument(newDocument());
  canvas.fit();
}

async function openIcon(name) {
  if (!okToLeave()) return;
  const text = await files.readIcon(store.pack.name, name);
  if (text === null) {
    await refreshIcons();
    throw new Error(`${name} is no longer in the pack.`);
  }
  actions.setDocument(fromSvg(text, name), name);
  canvas.fit();
}

const iconTiles = () => store.pack.icons.map((icon) => ({
  name: icon.name,
  thumbs: [files.iconUrl(store.pack.name, icon.name, icon.lastModified)],
}));

/**
 * The whole pack on one sheet: the only way to see whether its icons belong
 * together — same weight, same size in the box, same colours. Pressing one
 * opens it.
 */
async function previewPack() {
  await refreshIcons();
  const { pack, file } = store;
  const name = await askLibrary({
    title: `${pack.name} — ${pack.icons.length} icon${pack.icons.length === 1 ? '' : 's'}`,
    note: 'As saved. Press an icon to open it.',
    tiles: iconTiles(),
    current: file.name,
    empty: 'No icons in this pack yet.',
    sheet: true,
  });
  if (name && name !== file.name) await openIcon(name);
}

async function writeIcon(name) {
  if (!packIsKept) await keepPackFile();
  await files.writeIcon(store.pack.name, name, toSvg(store.doc));
  actions.markSaved(name);
  await refreshIcons();
  say(`Saved ${name}.svg`);
}

async function saveAs() {
  const { pack, file, doc } = store;
  const name = await askLibrary({
    title: `Save to ${pack.name}`,
    tiles: iconTiles(),
    current: file.name,
    empty: 'No icons in this pack yet.',
    name: { label: 'Save as', value: file.name ?? (doc.name === ICON_NAME ? '' : doc.name), suffix: '.svg', confirm: 'Save' },
  });
  if (!name) return;
  const taken = pack.icons.some((icon) => icon.name === name);
  if (taken && name !== file.name && !window.confirm(`Replace ${name}.svg in ${pack.name}?`)) return;
  await writeIcon(name);
}

const save = () => (store.file.name ? writeIcon(store.file.name) : saveAs());

async function deleteIcon(name) {
  if (!window.confirm(`Delete ${name}.svg from ${store.pack.name}? This cannot be undone.`)) return;
  await files.deleteIcon(store.pack.name, name);
  // The icon on the canvas outlives its file: it is simply unsaved again, and
  // keeps the sketch it is being drawn over. Any other icon's sketch goes with it.
  if (name === store.file.name) actions.forgetFile();
  else actions.forgetSketch(name);
  await refreshIcons();
  say(`Deleted ${name}.svg`);
}

// --- to and from files outside the library ---------------------------------------------

/** Hand the person a file: through the save dialog where the browser has one, as a download where it does not. */
async function writeOutside(text, suggestedName, type, extension, description) {
  if (window.showSaveFilePicker) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName, types: [{ description, accept: { [type]: [extension] } }] });
    } catch (error) {
      if (error.name === 'AbortError') return false;
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return true;
}

async function saveTo() {
  const name = `${store.file.name ?? store.doc.name}.svg`;
  if (await writeOutside(toSvg(store.doc), name, 'image/svg+xml', '.svg', 'SVG icon')) say(`Wrote ${name}`);
}

/** Ask for one file of a kind, through a hidden input. Answers with the File, or null. */
function pickFile(input) {
  return new Promise((resolve) => {
    input.value = '';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * An iconbench SVG from anywhere joins the pack and opens. Any other SVG has no
 * lines to edit, so it goes where a picture to draw over goes: on the sketch.
 */
async function loadFrom() {
  const file = await pickFile($('load-file'));
  if (!file) return;
  const text = await file.text();

  if (!isIconbenchFile(text)) {
    await putOnSketch(file);
    say('Not drawn in iconbench, so it is on the sketch layer to draw over');
    return;
  }
  if (!okToLeave()) return;

  const doc = fromSvg(text, file.name);
  const name = files.freeName(safeName(file.name) ?? 'icon', store.pack.icons.map((icon) => icon.name));
  actions.setDocument(doc, name);
  // Written as it now stands: wearing this pack's palette, not the one it came with.
  await writeIcon(name);
  canvas.fit();
  say(`Added to ${store.pack.name} as ${name}.svg`);
}

async function savePackTo() {
  const { pack } = store;
  const icons = [];
  for (const icon of await files.listIcons(pack.name)) {
    const svg = await files.readIcon(pack.name, icon.name);
    if (svg) icons.push([icon.name, svg]);
  }
  const name = `${pack.name}.iconpack.json`;
  if (await writeOutside(packToBundle(pack, icons), name, 'application/json', '.json', 'iconbench pack')) {
    say(`Wrote ${name}, with ${icons.length} icon${icons.length === 1 ? '' : 's'}`);
  }
}

async function loadPackFrom() {
  const file = await pickFile($('load-pack-file'));
  if (!file) return;
  const { pack, icons, skipped } = packFromBundle(await file.text(), STOCK_PALETTE);
  if (!okToLeave()) return;

  // Beside a pack of the same name rather than over it: loading adds to the library.
  const name = files.freeName(pack.name, (await files.listPacks()).map((held) => held.name));
  await files.writePackFile(name, packToJson({ ...pack, name }));
  for (const [iconName, svg] of icons) await files.writeIcon(name, iconName, svg);
  await openPack(name);
  say(skipped.length > 0
    ? `Added ${name}, without ${skipped.length} icon${skipped.length === 1 ? '' : 's'} that could not be kept`
    : `Added ${name}, with ${icons.length} icon${icons.length === 1 ? '' : 's'}`);
}

// --- the sketch picture ------------------------------------------------------------------

/**
 * A picture for the sketch layer, fitted to the live area. It is redrawn small
 * first: a guide does not need its megapixels, and the tab's storage has to
 * hold it across a refresh.
 */
async function putOnSketch(blob) {
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    // An SVG with no size of its own reports none; any square will do for a guide.
    const naturalWidth = image.naturalWidth || 512;
    const naturalHeight = image.naturalHeight || 512;

    const shrink = Math.min(1, SKETCH_PIXELS / Math.max(naturalWidth, naturalHeight));
    const bitmap = document.createElement('canvas');
    bitmap.width = Math.max(1, Math.round(naturalWidth * shrink));
    bitmap.height = Math.max(1, Math.round(naturalHeight * shrink));
    bitmap.getContext('2d').drawImage(image, 0, 0, bitmap.width, bitmap.height);

    const { size } = store.doc;
    const live = size - CANVAS_PADDING * 2;
    const scale = Math.min(live / naturalWidth, live / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    actions.setSketchImage({
      href: bitmap.toDataURL('image/png'),
      x: (size - width) / 2,
      y: (size - height) / 2,
      width,
      height,
    });
  } finally {
    URL.revokeObjectURL(source);
  }
}

// --- the chrome around the canvas -----------------------------------------------------------

function paintChrome() {
  const { file, doc, tool } = store;
  const name = file.name ?? doc.name;

  $('icon-name').textContent = `${store.pack.name} / ${name}`;
  $('icon-state').textContent = file.dirty ? 'unsaved' : file.name ? 'saved' : 'new';
  $('save-now').dataset.dirty = String(file.dirty);
  document.title = `${file.dirty ? '• ' : ''}${name} — iconbench`;

  $('undo').disabled = !history.canUndo();
  $('redo').disabled = !history.canRedo();

  for (const button of document.querySelectorAll('.tool')) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  }
  $('hint').textContent = HINTS[tool];

  const layers = doc.layers.length;
  const lines = actions.countLines();
  $('stats').textContent = `${layers} layer${layers === 1 ? '' : 's'} · ${lines} line${lines === 1 ? '' : 's'}`;
}

/** The pixel grid, on or off. The live area and the centre lines are the brief, and stay. */
function toggleGrid() {
  canvas.setGridShown(!canvas.isGridShown());
  paintGridToggle();
}

function paintGridToggle() {
  const shown = canvas.isGridShown();
  $('grid-toggle').setAttribute('aria-pressed', String(shown));
  $('grid-toggle').title = shown ? 'Hide the pixel grid (G)' : 'Show the pixel grid (G)';
}

function showPointer(position) {
  $('pointer-at').textContent = position ? `x ${position.x.toFixed(1)} · y ${position.y.toFixed(1)}` : '';
}

function undo() {
  const label = actions.undo();
  say(label ? `Undid: ${label.toLowerCase()}` : 'Nothing to undo');
}

function redo() {
  const label = actions.redo();
  say(label ? `Redid: ${label.toLowerCase()}` : 'Nothing to redo');
}

// --- the keyboard ------------------------------------------------------------------------------

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function onKeyDown(event) {
  // A dialog has the page to itself, and a field has its own keys — Esc aside.
  if (document.querySelector('dialog[open]')) return;
  const typing = canvas.isTyping(event.target);
  if (typing && event.key !== 'Escape') return;

  const command = event.ctrlKey || event.metaKey; // Cmd on macOS is the same key
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (command) {
    const chosen = {
      z: () => (event.shiftKey ? redo() : undo()),
      y: redo,
      s: () => attempt(event.shiftKey ? saveAs : save),
      o: () => attempt(chooseAndOpenPack),
      p: () => attempt(previewPack),
      n: () => (event.altKey ? newIcon() : null),
      '[': () => store.selection && actions.restackLine(store.selection, 'backward'),
      ']': () => store.selection && actions.restackLine(store.selection, 'forward'),
    }[key];
    // Ctrl+N alone is the browser's and cannot be taken; the rest are ours.
    if (!chosen || (key === 'n' && !event.altKey)) return;
    event.preventDefault();
    chosen();
    return;
  }
  if (event.altKey) return;

  if (key === 'Escape') {
    if (typing) event.target.blur();
    else if (canvas.hasDraft()) canvas.cancelDraft();
    else actions.select(null);
  } else if (key === 'Enter') {
    canvas.finishDraft(false);
  } else if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault();
    if (canvas.hasDraft()) canvas.dropLastPoint();
    else if (store.selection) actions.deleteLine(store.selection);
  } else if (ARROWS[key] && store.selection) {
    event.preventDefault();
    const step = event.shiftKey ? GRID_STEP * 2 : GRID_STEP;
    actions.nudgeLine(store.selection, ARROWS[key][0] * step, ARROWS[key][1] * step);
  } else if (key === ']' || key === '[') {
    if (store.selection) actions.restackLine(store.selection, key === ']' ? 'front' : 'back');
  } else if (key === 'g') {
    toggleGrid();
  } else if (key === '0') {
    canvas.fit();
  } else if (key === '+' || key === '=') {
    canvas.zoomBy(1.25);
  } else if (key === '-') {
    canvas.zoomBy(0.8);
  } else if (TOOL_KEYS[key] && !event.shiftKey) {
    actions.setTool(TOOL_KEYS[key]);
  }
}

// --- setting up ----------------------------------------------------------------------------------

async function start() {
  loadIcons(document);

  canvas.initCanvas({ onPointer: showPointer, onStatus: say });
  initDetails({ onPaletteEdited: () => attempt(applyPaletteToPack) });
  initLayers();
  initPackPanel({
    onOpen: (name) => attempt(() => openIcon(name)),
    onDelete: (name) => attempt(() => deleteIcon(name)),
  });

  initMenu((action) => attempt({
    new: newIcon,
    save,
    'save-as': saveAs,
    'save-to': saveTo,
    'load-from': loadFrom,
    'new-pack': makePack,
    'open-pack': chooseAndOpenPack,
    'rename-pack': renamePack,
    'delete-pack': deletePack,
    'preview-pack': previewPack,
    'save-pack-to': savePackTo,
    'load-pack-from': loadPackFrom,
  }[action]));

  $('save-now').addEventListener('click', () => attempt(save));
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('new-icon').addEventListener('click', newIcon);
  $('open-pack').addEventListener('click', () => attempt(chooseAndOpenPack));
  $('preview-pack').addEventListener('click', () => attempt(previewPack));
  $('zoom-in').addEventListener('click', () => canvas.zoomBy(1.25));
  $('zoom-out').addEventListener('click', () => canvas.zoomBy(0.8));
  $('zoom-fit').addEventListener('click', () => canvas.fit());
  $('grid-toggle').addEventListener('click', toggleGrid);
  paintGridToggle();

  for (const button of document.querySelectorAll('.tool')) {
    button.addEventListener('click', () => actions.setTool(button.dataset.tool));
  }

  $('sketch-image').addEventListener('click', async () => {
    const file = await pickFile($('sketch-file'));
    if (file) attempt(() => putOnSketch(file));
  });
  // A picture on the clipboard goes on the sketch, from wherever it was copied.
  window.addEventListener('paste', (event) => {
    if (canvas.isTyping(event.target)) return;
    const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    attempt(() => putOnSketch(item.getAsFile()));
  });

  window.addEventListener('keydown', onKeyDown);
  // Letting go of an arrow ends the nudge, so the next one is an undo step of its own.
  window.addEventListener('keyup', (event) => { if (ARROWS[event.key]) actions.settle(); });

  subscribe(paintChrome);

  // The pack worked in last, or the first there is, or the stock name for a
  // store with nothing in it yet.
  await attempt(async () => {
    const remembered = localStorage.getItem(PACK_KEY);
    const packs = await files.listPacks();
    const name = packs.find((pack) => pack.name === remembered)?.name ?? packs[0]?.name ?? remembered ?? PACK_NAME;
    await openPack(name);
  });
  if (actions.takeUpKept()) actions.emit('doc');

  // Unsaved work survives a refresh in the tab's storage; closing the tab still
  // loses it, which is why the page asks before it goes. Only kept from here
  // on: a keeper that started sooner would write the empty icon the page opens
  // with over the work it is about to take up.
  let keeping = null;
  subscribe(() => {
    clearTimeout(keeping);
    keeping = setTimeout(actions.keep, 300);
  });
  window.addEventListener('beforeunload', (event) => {
    actions.keep();
    if (store.file.dirty) event.preventDefault();
  });

  paintChrome();
  canvas.fit();
}

start();
