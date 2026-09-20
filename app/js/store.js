// Single source of truth. Toolbox, panel, layer control and canvas all read
// from here, so a selection made in one place is the selection everywhere.
//
// It is also where the icon is changed: a change is an action below, which
// records an undo step, changes the document and tells whoever is listening.
// Nothing here draws, and nothing here talks to the server.

import * as history from './history.js';
import { LAYER_NAME, LINE_STYLE, PACK_NAME, SMOOTHING_LEVEL } from './defaults.js';
import { MAX_LAYERS, newDocument, newLayer, newLine, validate } from './document.js';
import { insertPoint, isDrawable, pointsWhenClosed, removePoint, translate } from './geometry.js';
import { applyPalette, newPack, tidyPalette } from './pack.js';
import { STOCK_PALETTE } from './stock-palette.js';

const listeners = new Set();

const emptySketch = () => ({ hidden: false, dimmed: true, image: null, marks: [] });

export const store = {
  /** The icon: `{ version, name, size, layers }`, layers bottom first. */
  doc: newDocument(),
  /**
   * The drawing guide: a pasted picture and marker lines, under the icon. It
   * is the tab's, not the icon's — it is never in a saved file.
   */
  sketch: emptySketch(),
  activeLayerId: null,
  /** The id of the selected line, or null. */
  selection: null,
  /** 'select' | 'straight' | 'quadratic' | 'catmull' | 'freehand' | 'marker' */
  tool: 'select',
  /** What the next line drawn will wear. */
  style: { ...LINE_STYLE },
  /** Which of the two colours the picker and the palette are setting. */
  target: 'stroke',
  smoothing: SMOOTHING_LEVEL,
  /** The name the icon has in its pack, once it has one, and whether it has unsaved changes. */
  file: { name: null, dirty: false },
  /**
   * The pack being worked in: its name, the palette its icons share, and the
   * icons it holds as `{ name, lastModified }`. `paletteDirty` says the palette
   * has been edited and the pack's files have not caught up with it yet.
   */
  pack: { ...newPack(PACK_NAME, STOCK_PALETTE), icons: [], paletteDirty: false },
};

store.activeLayerId = store.doc.layers[0].id;

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(reason = 'change') {
  for (const listener of listeners) listener(reason);
}

// --- undo ----------------------------------------------------------------------

/* The picture is the one heavy thing here, and it is never edited in place, so
   every copy shares the one string rather than carrying its own. */
const copySketch = (sketch) => ({ ...sketch, marks: [...sketch.marks] });

history.init({
  take: () => ({
    doc: JSON.parse(JSON.stringify(store.doc)),
    sketch: copySketch(store.sketch),
    activeLayerId: store.activeLayerId,
    selection: store.selection,
  }),
  restore(state) {
    store.doc = state.doc;
    store.sketch = state.sketch;
    store.activeLayerId = state.activeLayerId;
    store.selection = state.selection;
    // The palette is the pack's, not the icon's, so it is not unwound with the
    // icon — and an icon brought back from before a palette edit has to be
    // given the colours the palette holds now.
    applyPalette(store.doc, store.pack.palette);
    keepThingsPointingAtSomething();
    store.file.dirty = true;
    emit('doc');
  },
  onChange: () => emit('history'),
});

export const undo = () => history.undo();
export const redo = () => history.redo();
/** The drag or slider pull is over: what follows is a new step. */
export const settle = () => history.settle();

/** After anything that can remove a layer or a line out from under the selection. */
function keepThingsPointingAtSomething() {
  if (!layerById(store.activeLayerId)) store.activeLayerId = store.doc.layers.at(-1).id;
  if (store.selection && !find(store.selection)) store.selection = null;
}

function changed() {
  store.file.dirty = true;
  emit('doc');
}

// --- reading --------------------------------------------------------------------

export const layerById = (id) => store.doc.layers.find((layer) => layer.id === id) ?? null;
export const activeLayer = () => layerById(store.activeLayerId);

/** A line and the layer it is on, or null. */
export function find(id) {
  for (const layer of store.doc.layers) {
    const line = layer.lines.find((candidate) => candidate.id === id);
    if (line) return { line, layer };
  }
  return null;
}

export const selectedLine = () => (store.selection ? find(store.selection)?.line ?? null : null);

/** The style on show in the panel: the selected line's, or the next line's. */
export const currentStyle = () => selectedLine() ?? store.style;

export function countLines() {
  return store.doc.layers.reduce((sum, layer) => sum + layer.lines.length, 0);
}

// --- the document as a whole ------------------------------------------------------

/**
 * A new icon, or one just opened: nothing selected, nothing to undo. It takes
 * the pack's palette as it arrives, so an icon brought in from elsewhere, or
 * one whose file is older than the last palette edit, wears what the rest do.
 */
export function setDocument(doc, fileName = null) {
  applyPalette(doc, store.pack.palette);
  store.doc = doc;
  store.activeLayerId = doc.layers.at(-1).id;
  store.selection = null;
  store.file = { name: fileName, dirty: false };
  history.clear();
  emit('doc');
}

export function markSaved(fileName) {
  store.doc.name = fileName;
  store.file = { name: fileName, dirty: false };
  emit('file');
}

/** The icon's file has gone from the pack: what is on the canvas is unsaved work again. */
export function forgetFile() {
  store.file = { name: null, dirty: true };
  emit('file');
}

// --- the pack ----------------------------------------------------------------------------

/** Another pack is open: `pack` is `{ name, palette }`, `icons` what it holds. */
export function setPack(pack, icons = []) {
  store.pack = { ...newPack(pack.name, pack.palette), icons, paletteDirty: false };
  // The pen is loaded from the palette too, or the first line drawn in a pack
  // would wear the last pack's colour under this one's swatch number.
  store.style = wearing(store.style);
  emit('pack');
}

/** The pack's list of icons, as the store now has it. */
export function setPackIcons(icons) {
  store.pack = { ...store.pack, icons };
  emit('pack');
}

/** A style with its swatches looked up in the palette as it stands. */
function wearing(style) {
  const { palette } = store.pack;
  return {
    ...style,
    stroke: style.strokeSwatch ? palette[style.strokeSwatch - 1] : style.stroke,
    fill: style.fill && style.fillSwatch ? palette[style.fillSwatch - 1] : style.fill,
  };
}

/**
 * Edit the pack's palette. Every line wearing a changed swatch follows at once
 * in the icon that is open; the rest of the pack's files are brought up to date
 * when the palette editor is shut, which is what `paletteDirty` is for. Not an
 * undo step: the palette is the pack's, and outlives the icon's history.
 */
export function setPalette(colors) {
  const palette = tidyPalette(colors, STOCK_PALETTE);
  if (palette.join() === store.pack.palette.join()) return;
  store.pack = { ...store.pack, palette, paletteDirty: true };
  store.style = wearing(store.style);
  // The open icon is not marked unsaved by this: its file is recoloured along
  // with the rest of the pack's, so the two stay as far apart as they were.
  applyPalette(store.doc, palette);
  emit('pack');
  emit('doc');
}

export function setPaletteColor(index, color) {
  setPalette(store.pack.palette.map((held, i) => (i === index ? color : held)));
}

/** The pack's files have caught up with its palette. */
export function markPaletteApplied() {
  store.pack = { ...store.pack, paletteDirty: false };
}

// --- tools and selection ------------------------------------------------------------

export function setTool(tool) {
  if (store.tool === tool) return;
  store.tool = tool;
  // A drawing tool starts from the style of the next line, not of whatever
  // happened to be selected when it was picked up.
  if (tool !== 'select') store.selection = null;
  emit('tool');
}

export function select(id) {
  if (store.selection === id) return;
  store.selection = id;
  emit('selection');
}

export function setTarget(target) {
  if (store.target === target) return;
  store.target = target;
  emit('target');
}

export function setSmoothing(level) {
  store.smoothing = level;
  emit('tool');
}

// --- lines ------------------------------------------------------------------------

/**
 * A finished line goes on the layer being worked on, and is selected, so the
 * panel is already about it: width, colour and fill can be set without a trip
 * back to the select tool. Drawing on a hidden layer shows it — a line nobody
 * can see has not really been drawn.
 */
export function addLine(kind, points, closed = false) {
  const layer = activeLayer();
  history.record('Draw a line');
  const line = newLine(kind, points, { ...store.style }, closed);
  layer.lines.push(line);
  layer.hidden = false;
  store.selection = line.id;
  changed();
  return line;
}

/**
 * Change the look of the selected line, and of the next one drawn: what was
 * last chosen is what the pen holds. `key` names a slider pull or a colour
 * drag, so that the whole of it is one undo step.
 */
export function setStyle(change, key = null) {
  // A swatch is worn as the palette holds it now, whatever colour the caller
  // remembered it as.
  const { palette } = store.pack;
  const patch = { ...change };
  if (patch.strokeSwatch) patch.stroke = palette[patch.strokeSwatch - 1];
  if (patch.fill && patch.fillSwatch) patch.fill = palette[patch.fillSwatch - 1];

  Object.assign(store.style, patch);
  const line = selectedLine();
  if (!line) {
    emit('style');
    return;
  }
  history.record('Change the look of a line', key);
  Object.assign(line, patch);
  changed();
}

/**
 * The points of a line as a drag has them now. The canvas works each position
 * out from where the drag began, so that snapping to the grid does not add up
 * its own rounding; `key` makes the whole drag one step to undo.
 */
export function setPoints(id, points, label, key) {
  const found = find(id);
  if (!found) return;
  history.record(label, key);
  found.line.points = points;
  changed();
}

/** Every point of a line moved by the same amount — what the arrow keys do. */
export function nudgeLine(id, dx, dy) {
  const found = find(id);
  if (!found) return;
  history.record('Nudge a line', `nudge-${id}`);
  found.line.points = translate(found.line.points, dx, dy);
  changed();
}

/** A new bend on the selected line. Answers with the index it landed at. */
export function addBend(id, segment, t) {
  const found = find(id);
  const result = found && insertPoint(found.line, segment, t);
  if (!result) return null;
  history.record('Add a bend');
  found.line.points = result.points;
  changed();
  return result.index;
}

/** False when the line could not be drawn from what would be left. */
export function removeBend(id, index) {
  const found = find(id);
  const points = found && removePoint(found.line, index);
  if (!points) return false;
  history.record('Remove a bend');
  found.line.points = points;
  changed();
  return true;
}

/** Can this line be joined up? Two points make a line, but not a shape. */
export function canClose(line) {
  return isDrawable({ ...line, closed: true, points: pointsWhenClosed(line, true) });
}

export function setClosed(id, closed) {
  const found = find(id);
  if (!found || Boolean(found.line.closed) === closed) return;
  const points = pointsWhenClosed(found.line, closed);
  // Refused rather than kept: a line that cannot be drawn is left out of the
  // file when the icon is saved, which is no way to lose a line.
  if (!isDrawable({ ...found.line, closed, points })) return;
  history.record(closed ? 'Close a line' : 'Open a line');
  found.line.points = points;
  found.line.closed = closed;
  changed();
}

export function deleteLine(id) {
  const found = find(id);
  if (!found) return;
  history.record('Delete a line');
  found.layer.lines = found.layer.lines.filter((line) => line.id !== id);
  if (store.selection === id) store.selection = null;
  changed();
}

/** Restack a line within its layer: 'front', 'back', 'forward' or 'backward'. */
export function restackLine(id, where) {
  const found = find(id);
  if (!found) return;
  const { lines } = found.layer;
  const from = lines.indexOf(found.line);
  const to = { front: lines.length - 1, back: 0, forward: from + 1, backward: from - 1 }[where];
  if (to === undefined || to === from || to < 0 || to >= lines.length) return;
  history.record('Restack a line');
  lines.splice(from, 1);
  lines.splice(to, 0, found.line);
  changed();
}

// --- layers -------------------------------------------------------------------------

/** Picking a hidden layer shows it: it is about to be drawn on. */
export function setActiveLayer(id) {
  const layer = layerById(id);
  if (!layer) return;
  if (layer.hidden) {
    history.record('Show a layer');
    layer.hidden = false;
    store.file.dirty = true;
  }
  store.activeLayerId = id;
  // Only the layer being worked on answers the pointer, so a selection on
  // another layer would be one that could not be clicked back onto.
  if (store.selection && find(store.selection)?.layer.id !== id) store.selection = null;
  emit('doc');
}

export const canAddLayer = () => store.doc.layers.length < MAX_LAYERS;

export function addLayer() {
  if (!canAddLayer()) return;
  history.record('Add a layer');
  const taken = new Set(store.doc.layers.map((layer) => layer.name));
  let n = store.doc.layers.length + 1;
  while (taken.has(`${LAYER_NAME} ${n}`)) n++;
  const layer = newLayer(`${LAYER_NAME} ${n}`);
  // Above the one being worked on, which is where the next thing drawn belongs.
  const at = store.doc.layers.findIndex((candidate) => candidate.id === store.activeLayerId);
  store.doc.layers.splice(at + 1, 0, layer);
  store.activeLayerId = layer.id;
  store.selection = null;
  changed();
}

export function renameLayer(id, name) {
  const layer = layerById(id);
  const wanted = String(name ?? '').trim().slice(0, 40);
  if (!layer || !wanted || wanted === layer.name) return;
  history.record('Rename a layer');
  layer.name = wanted;
  changed();
}

/** The last layer stays: an icon with nowhere to draw is not an icon. */
export function deleteLayer(id) {
  if (store.doc.layers.length <= 1 || !layerById(id)) return;
  history.record('Delete a layer');
  store.doc.layers = store.doc.layers.filter((layer) => layer.id !== id);
  keepThingsPointingAtSomething();
  changed();
}

/**
 * Hidden is part of the icon — a hidden layer is left out of the picture the
 * file shows — so it is saved and undone like any other change. Hiding the
 * layer being worked on moves the work to the nearest one still showing.
 */
export function toggleLayerHidden(id) {
  const layer = layerById(id);
  if (!layer) return;
  history.record(layer.hidden ? 'Show a layer' : 'Hide a layer');
  layer.hidden = !layer.hidden;
  if (layer.hidden && store.activeLayerId === id) {
    const showing = store.doc.layers.filter((candidate) => !candidate.hidden);
    if (showing.length > 0) store.activeLayerId = showing.at(-1).id;
  }
  if (store.selection && find(store.selection)?.layer.hidden) store.selection = null;
  changed();
}

/** Dimming is a way of looking at the canvas, not a property of the icon. */
export function toggleLayerDimmed(id) {
  const layer = layerById(id);
  if (!layer) return;
  layer.dimmed = !layer.dimmed;
  emit('view');
}

// --- the sketch -------------------------------------------------------------------

/** `image` is `{ href, x, y, width, height }` in canvas pixels, or null. */
export function setSketchImage(image) {
  history.record('Paste a sketch');
  store.sketch = { ...store.sketch, image, hidden: false };
  emit('sketch');
}

export function addMark(points) {
  history.record('Draw with the marker');
  store.sketch = { ...store.sketch, marks: [...store.sketch.marks, { points }], hidden: false };
  emit('sketch');
}

export function clearSketch() {
  if (!store.sketch.image && store.sketch.marks.length === 0) return;
  history.record('Clear the sketch');
  store.sketch = { ...store.sketch, image: null, marks: [] };
  emit('sketch');
}

export function toggleSketch(what) {
  store.sketch = { ...store.sketch, [what]: !store.sketch[what] };
  emit('sketch');
}

// --- surviving a refresh -------------------------------------------------------------

const SESSION_KEY = 'iconbench:tab';

/**
 * Unsaved work is kept in the tab's session storage, so a refresh does not lose
 * it; closing the tab still does, which is why the page asks before it goes.
 * A pasted picture can be bigger than the storage will take, and then the work
 * is kept without it rather than not at all.
 */
export function keep() {
  const state = {
    doc: store.doc,
    sketch: store.sketch,
    file: store.file,
    packName: store.pack.name,
    activeLayerId: store.activeLayerId,
    style: store.style,
    smoothing: store.smoothing,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...state, sketch: { ...store.sketch, image: null } }));
    } catch {
      // Storage is full or switched off: the work is still on the page.
    }
  }
}

/**
 * Take up what `keep` wrote, if it was written in the pack that is open now.
 * False when there was nothing, or nothing usable.
 */
export function takeUpKept() {
  try {
    const state = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    if (!state || state.packName !== store.pack.name || validate(state.doc)) return false;
    store.doc = state.doc;
    store.sketch = { ...emptySketch(), ...state.sketch };
    store.file = { name: state.file?.name ?? null, dirty: Boolean(state.file?.dirty) };
    store.style = { ...LINE_STYLE, ...state.style };
    store.smoothing = state.smoothing ?? SMOOTHING_LEVEL;
    store.activeLayerId = state.activeLayerId;
    applyPalette(store.doc, store.pack.palette);
    store.style = wearing(store.style);
    keepThingsPointingAtSomething();
    return true;
  } catch {
    return false;
  }
}
