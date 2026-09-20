// The canvas: renders the icon from the store, and turns what the pointer does
// into intents — select this, move that bend, add this line. It calls store
// actions and never talks to the API.
//
// The icon is painted with the same attributes it is written to a file with,
// so the canvas cannot disagree with what is saved. Everything else drawn here
// — grid, live area, handles, the line being drawn — is the editor's, sized
// from the zoom so that it is the same on screen however close the canvas is.

import * as geo from './geometry.js';
import * as actions from './store.js';
import { store, subscribe } from './store.js';
import { paintOf, toSvg } from './document.js';
import { CANVAS_PADDING, GRID_STEP } from './defaults.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const stage = document.getElementById('stage');
const svg = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const preview = document.getElementById('preview');
const gridPath = svg.querySelector('#pixel-grid .canvas__grid');

const groups = {
  board: document.getElementById('layer-board'),
  sketch: document.getElementById('layer-sketch'),
  stacks: document.getElementById('layer-stacks'),
  guides: document.getElementById('layer-guides'),
  draft: document.getElementById('layer-draft'),
  edit: document.getElementById('layer-edit'),
};

/* Sizes that are the same on screen at any zoom, in screen pixels. */
const HANDLE_RADIUS = 4.5;
const HIT_WIDTH = 12;
const CLOSE_REACH = 9;       // how near the first point a click closes the line
const CLICK_SLOP = 4;        // further than this between down and up is a drag
const DOUBLE_PRESS_MS = 350;
const MIN_SCALE = 2;
const MAX_SCALE = 160;
const GRID_FROM_SCALE = 7;   // closer than this the pixel grid is just grey
const PREVIEW_SIZES = [16, 24, 48];
const MARKER_WIDTH = 0.45;

/** Screen = canvas × scale + offset. */
const view = { x: 0, y: 0, scale: 20, fitted: true };

/** The line being drawn, until it is finished: `{ kind, points, pointer }`. */
let draft = null;

/** What the pointer is in the middle of, between down and up. */
let gesture = null;

/** Fingers down, by pointer id — two of them pinch. A pen is never one of these. */
const touches = new Map();
let pinch = null;

/** The last press on a bend, which a second one soon after turns into a double-click. */
let lastPress = null;

let spaceHeld = false;
let handlers = {};

const GRID_KEY = 'iconbench:grid';

/** Whether the pixel grid is drawn. The browser remembers, as it does the pack panel's fold. */
let gridShown = readGridShown();

function readGridShown() {
  try {
    return localStorage.getItem(GRID_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

export const isGridShown = () => gridShown;

/**
 * Only the pixel grid comes and goes. The live area and the centre lines are
 * the brief — 20×20, and even about the middle — and stay; the icon bare of
 * everything is what the preview is for.
 */
export function setGridShown(shown) {
  gridShown = shown;
  try {
    localStorage.setItem(GRID_KEY, shown ? 'shown' : 'hidden');
  } catch {
    // Storage switched off: the grid still goes, it just is not remembered.
  }
  renderBoard();
}

const DRAWN_BY_CLICKS = ['straight', 'quadratic', 'catmull'];
const DRAWN_BY_HAND = ['freehand', 'marker'];

// --- small things -------------------------------------------------------------

function el(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  return node;
}

/** A length that is `pixels` on screen, in canvas units. */
const onScreen = (pixels) => pixels / view.scale;

function toCanvas(event) {
  const box = svg.getBoundingClientRect();
  return {
    x: (event.clientX - box.left - view.x) / view.scale,
    y: (event.clientY - box.top - view.y) / view.scale,
  };
}

/** Onto the half-pixel grid, unless Alt asks for the spot itself. */
function snapped(point, event) {
  const step = event?.altKey ? 0 : GRID_STEP;
  return { x: geo.snap(point.x, step), y: geo.snap(point.y, step) };
}

// --- the view --------------------------------------------------------------------

function applyView() {
  viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
  // A pattern's contents do not honour non-scaling-stroke everywhere, so the
  // grid's hairline is worked out here instead.
  gridPath.setAttribute('stroke-width', String(onScreen(1) * 2));
  render();
}

/** The artboard in the middle of the stage, with room round it for the chrome. */
export function fit() {
  const box = svg.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  const size = store.doc.size;
  view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (Math.min(box.width, box.height) * 0.72) / size));
  view.x = (box.width - size * view.scale) / 2;
  view.y = (box.height - size * view.scale) / 2;
  view.fitted = true;
  applyView();
}

/** Zoom by a factor, keeping whatever is under (cx, cy) on screen under it. */
function zoomAbout(factor, cx, cy) {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  view.x = cx - (cx - view.x) * ratio;
  view.y = cy - (cy - view.y) * ratio;
  view.scale = scale;
  view.fitted = false;
  applyView();
}

export function zoomBy(factor) {
  const box = svg.getBoundingClientRect();
  zoomAbout(factor, box.width / 2, box.height / 2);
}

// --- rendering ---------------------------------------------------------------------

function render() {
  renderBoard();
  renderSketch();
  renderLayers();
  renderEdit();
  renderDraft();
}

function renderBoard() {
  const size = store.doc.size;
  const live = size - CANVAS_PADDING * 2;
  const board = [el('rect', { class: 'canvas__board', x: 0, y: 0, width: size, height: size })];
  if (gridShown && view.scale >= GRID_FROM_SCALE) {
    board.push(el('rect', { class: 'canvas__grid-fill', x: 0, y: 0, width: size, height: size, fill: 'url(#pixel-grid)' }));
  }
  groups.board.replaceChildren(...board);

  // Over the icon rather than under it, so a fill does not hide where the
  // artwork is meant to stop.
  groups.guides.replaceChildren(
    el('line', { class: 'canvas__centre', x1: size / 2, y1: 0, x2: size / 2, y2: size }),
    el('line', { class: 'canvas__centre', x1: 0, y1: size / 2, x2: size, y2: size / 2 }),
    el('rect', { class: 'canvas__live-area', x: CANVAS_PADDING, y: CANVAS_PADDING, width: live, height: live }),
  );
}

const markPath = (points) => geo.linePath({ kind: points.length > 2 ? 'catmull' : 'straight', points, closed: false });

function renderSketch() {
  const { sketch } = store;
  groups.sketch.setAttribute('display', sketch.hidden ? 'none' : 'inline');
  groups.sketch.dataset.dimmed = String(sketch.dimmed);

  const nodes = [];
  if (sketch.image) {
    const { href, x, y, width, height } = sketch.image;
    nodes.push(el('image', { href, x, y, width, height, preserveAspectRatio: 'xMidYMid meet' }));
  }
  for (const mark of sketch.marks) {
    nodes.push(el('path', { class: 'sketch__mark', d: markPath(mark.points), 'stroke-width': MARKER_WIDTH }));
  }
  groups.sketch.replaceChildren(...nodes);
}

function renderLayers() {
  const stacks = store.doc.layers.map((layer) => {
    const group = el('g', {
      class: 'layer',
      'data-active': layer.id === store.activeLayerId,
      'data-dimmed': Boolean(layer.dimmed),
      display: layer.hidden ? 'none' : null,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    for (const line of layer.lines) {
      const d = geo.linePath(line);
      group.append(
        el('path', { d, ...paintOf(line) }),
        el('path', {
          class: 'line__hit',
          d,
          'stroke-width': Math.max(line.width, onScreen(HIT_WIDTH)),
          'data-id': line.id,
          'data-filled': Boolean(line.fill),
        }),
      );
    }
    return group;
  });
  groups.stacks.replaceChildren(...stacks);
}

/** The selected line's outline and its bends: round on the line, square off it. */
function renderEdit() {
  const line = actions.selectedLine();
  if (!line) {
    groups.edit.replaceChildren();
    return;
  }

  const nodes = [el('path', { class: 'edit__outline', d: geo.linePath(line) })];
  const { points } = line;

  if (line.kind === 'quadratic') {
    points.forEach((control, i) => {
      if (!geo.isControl(line, i)) return;
      const to = points[i + 1] ?? points[0];
      nodes.push(
        el('line', { class: 'edit__arm', x1: points[i - 1].x, y1: points[i - 1].y, x2: control.x, y2: control.y }),
        el('line', { class: 'edit__arm', x1: control.x, y1: control.y, x2: to.x, y2: to.y }),
      );
    });
  }

  const r = onScreen(HANDLE_RADIUS);
  points.forEach((point, i) => {
    const held = gesture?.type === 'point' && gesture.index === i;
    const shared = { class: 'edit__handle', 'data-index': i, 'data-held': held };
    nodes.push(geo.isControl(line, i)
      ? el('rect', { ...shared, x: point.x - r * 0.85, y: point.y - r * 0.85, width: r * 1.7, height: r * 1.7 })
      : el('circle', { ...shared, cx: point.x, cy: point.y, r }));
  });
  groups.edit.replaceChildren(...nodes);
}

/** A quadratic that is still waiting for its next click, filled out to be drawn. */
function draftPoints() {
  const { kind, points, pointer } = draft;
  if (!pointer) return points;
  if (kind !== 'quadratic') return [...points, pointer];
  // Waiting for a control, the run to the pointer is straight; waiting for an
  // anchor, it already bends through the control just placed.
  return points.length % 2 === 1
    ? [...points, geo.midpoint(points.at(-1), pointer), pointer]
    : [...points, pointer];
}

function canClose() {
  return draft && DRAWN_BY_CLICKS.includes(draft.kind) && draft.points.length >= 3;
}

const nearFirst = (point) => canClose() && geo.distance(point, draft.points[0]) <= onScreen(CLOSE_REACH);

function renderDraft() {
  if (!draft) {
    groups.draft.replaceChildren();
    return;
  }

  const byHand = DRAWN_BY_HAND.includes(draft.kind);
  const kind = byHand ? 'straight' : draft.kind;
  const paint = draft.kind === 'marker'
    ? { class: 'draft__line sketch__mark', 'stroke-width': MARKER_WIDTH }
    : { class: 'draft__line', ...paintOf({ ...store.style, fill: null }) };
  const nodes = [el('path', { ...paint, d: geo.linePath({ kind, points: draftPoints(), closed: false }) })];

  if (!byHand) {
    const closes = draft.pointer && nearFirst(draft.pointer);
    draft.points.forEach((point, i) => {
      const first = i === 0 && closes;
      nodes.push(el('circle', {
        class: first ? 'draft__point draft__point--closes' : 'draft__point',
        cx: point.x,
        cy: point.y,
        r: onScreen(first ? HANDLE_RADIUS * 1.5 : geo.isControl(draft, i) ? 2 : 3),
      }));
    });
  }
  groups.draft.replaceChildren(...nodes);
}

/** The icon small, as it will be used. Written by the same code that saves it. */
function renderPreview() {
  const markup = toSvg(store.doc);
  preview.innerHTML = PREVIEW_SIZES
    .map((size) => markup.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`))
    .join('');
}

// --- drawing by clicks -----------------------------------------------------------------

function placePoint(position, event) {
  const point = snapped(position, event);
  if (!draft) {
    actions.select(null);
    draft = { kind: store.tool, points: [point], pointer: point };
    renderDraft();
    return;
  }

  if (nearFirst(position)) return finishDraft(true);
  // A second click on the spot just clicked — which is what a double-click is —
  // says the line is done.
  if (geo.distance(point, draft.points.at(-1)) === 0) return finishDraft(false);

  draft.points.push(point);
  draft.pointer = point;
  renderDraft();
}

export const hasDraft = () => draft !== null;

/** Keep the line being drawn, if there is enough of it to be one. */
export function finishDraft(closed = false) {
  if (!draft) return;
  const { kind } = draft;
  let { points } = draft;
  draft = null;

  if (kind === 'quadratic') {
    // Closed, the run home needs a control, and a click not yet made cannot
    // have placed it; open, a control placed with no anchor after it goes.
    if (closed && points.length % 2 === 1) points = [...points, geo.midpoint(points.at(-1), points[0])];
    if (!closed && points.length % 2 === 0) points = points.slice(0, -1);
  }

  if (geo.isDrawable({ kind, points, closed })) actions.addLine(kind, points, closed);
  else handlers.onStatus?.('Too short to be a line');
  renderDraft();
}

export function cancelDraft() {
  if (!draft) return;
  draft = null;
  renderDraft();
}

/** Backspace while drawing: the last click, taken back. */
export function dropLastPoint() {
  if (!draft) return;
  draft.points.pop();
  if (draft.points.length === 0) draft = null;
  renderDraft();
}

// --- drawing by hand ----------------------------------------------------------------------

function strokeSamples(event) {
  // A pencil reports faster than the page is painted; the samples in between
  // are the difference between a curve and a row of flats.
  const events = event.getCoalescedEvents?.() ?? [];
  return (events.length > 0 ? events : [event]).map(toCanvas);
}

function finishStroke() {
  const { kind, points } = draft;
  draft = null;
  renderDraft();

  if (kind === 'marker') {
    const mark = geo.strokeToLine(points, 'min');
    if (mark) actions.addMark(mark.points);
    return;
  }
  const line = geo.strokeToLine(points, store.smoothing);
  if (line && geo.isDrawable(line)) actions.addLine(line.kind, line.points, line.closed);
}

// --- the pointer ----------------------------------------------------------------------------

function startPan(event) {
  gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false };
  svg.dataset.panning = 'true';
}

function startPinch() {
  // Whatever one finger had begun, two fingers did not mean.
  if (gesture?.type === 'stroke') draft = null;
  gesture = null;
  renderDraft();
  const [a, b] = [...touches.values()];
  pinch = {
    distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    view: { ...view },
  };
}

function movePinch() {
  const [a, b] = [...touches.values()];
  const box = svg.getBoundingClientRect();
  const centre = { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top };
  const began = { x: pinch.centre.x - box.left, y: pinch.centre.y - box.top };
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
    pinch.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance)));
  // What was under the fingers when they landed stays under them.
  view.x = centre.x - ((began.x - pinch.view.x) / pinch.view.scale) * scale;
  view.y = centre.y - ((began.y - pinch.view.y) / pinch.view.scale) * scale;
  view.scale = scale;
  view.fitted = false;
  applyView();
}

function onPointerDown(event) {
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) return startPinch();
    if (touches.size > 2) return;
  }

  svg.setPointerCapture(event.pointerId);
  const position = toCanvas(event);

  if (event.button === 1 || (event.button === 0 && spaceHeld)) return startPan(event);
  if (event.button !== 0) return;

  const { tool } = store;

  if (DRAWN_BY_HAND.includes(tool)) {
    actions.select(null);
    draft = { kind: tool, points: [position], pointer: null };
    gesture = { type: 'stroke' };
    return;
  }

  if (DRAWN_BY_CLICKS.includes(tool)) {
    gesture = { type: 'click', startX: event.clientX, startY: event.clientY };
    return;
  }

  // The select tool: a bend, then a line, then the open stage.
  const handle = event.target.closest?.('.edit__handle');
  const selected = actions.selectedLine();
  if (handle && selected) {
    const index = Number(handle.dataset.index);
    if (isSecondPress(selected.id, index, event)) return removeBend(selected.id, index);
    gesture = { type: 'point', id: selected.id, index, origin: selected.points };
    // Marked in place rather than redrawn: a handle swapped for a new one
    // mid-press is a handle the browser no longer counts the press against.
    handle.dataset.held = 'true';
    return;
  }

  const hit = event.target.closest?.('.line__hit');
  if (hit) {
    const id = hit.dataset.id;
    if (event.shiftKey && id === store.selection) {
      const spot = geo.nearestOnLine(selected, position.x, position.y);
      const index = actions.addBend(id, spot.segment, spot.t);
      if (index !== null) {
        gesture = { type: 'point', id, index, origin: actions.selectedLine().points };
        renderEdit();
      }
      return;
    }
    actions.select(id);
    gesture = { type: 'line', id, start: position, origin: actions.selectedLine().points };
    return;
  }

  startPan(event);
}

function onPointerMove(event) {
  if (touches.has(event.pointerId)) {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch) return movePinch();
  }

  const position = toCanvas(event);
  handlers.onPointer?.(position);

  if (!gesture) {
    if (draft && DRAWN_BY_CLICKS.includes(draft.kind)) {
      draft.pointer = nearFirst(position) ? draft.points[0] : snapped(position, event);
      renderDraft();
    }
    return;
  }

  if (gesture.type === 'pan') {
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) > CLICK_SLOP) gesture.moved = true;
    if (!gesture.moved) return;
    view.x = gesture.viewX + dx;
    view.y = gesture.viewY + dy;
    view.fitted = false;
    applyView();
  } else if (gesture.type === 'stroke') {
    draft.points.push(...strokeSamples(event));
    renderDraft();
  } else if (gesture.type === 'point') {
    const point = snapped(position, event);
    const points = gesture.origin.map((p, i) => (i === gesture.index ? point : p));
    actions.setPoints(gesture.id, points, 'Move a bend', 'drag');
  } else if (gesture.type === 'line') {
    // The whole line moves by a snapped amount, so points that were on the grid
    // stay on it, and ones that were not keep their places between its lines.
    const by = snapped({ x: position.x - gesture.start.x, y: position.y - gesture.start.y }, event);
    if (by.x === 0 && by.y === 0 && !gesture.moved) return;
    gesture.moved = true;
    actions.setPoints(gesture.id, geo.translate(gesture.origin, by.x, by.y), 'Move a line', 'drag');
  }
}

function onPointerUp(event) {
  touches.delete(event.pointerId);
  if (pinch) {
    if (touches.size < 2) pinch = null;
    return;
  }

  const ended = gesture;
  gesture = null;
  if (!ended) return;

  if (ended.type === 'pan') {
    svg.dataset.panning = spaceHeld ? 'ready' : 'false';
    // A press on the open stage that went nowhere is a click on nothing.
    if (!ended.moved && store.tool === 'select' && !spaceHeld && event.button === 0) actions.select(null);
  } else if (ended.type === 'click') {
    const travelled = Math.hypot(event.clientX - ended.startX, event.clientY - ended.startY);
    if (travelled <= CLICK_SLOP && event.type === 'pointerup') placePoint(toCanvas(event), event);
  } else if (ended.type === 'stroke') {
    if (event.type === 'pointerup') finishStroke();
    else cancelDraft();
  } else {
    actions.settle();
    renderEdit();
  }
}

/**
 * Is this the second press of a double-click on one bend? Counted here rather
 * than left to `dblclick`: the pointer is captured by the canvas while a bend is
 * held, so the browser's own double-click lands on the canvas and cannot say
 * which bend it was.
 */
function isSecondPress(id, index, event) {
  const first = lastPress;
  lastPress = { id, index, time: event.timeStamp, x: event.clientX, y: event.clientY };
  if (!first || first.id !== id || first.index !== index) return false;
  const again = event.timeStamp - first.time <= DOUBLE_PRESS_MS
    && Math.hypot(event.clientX - first.x, event.clientY - first.y) <= CLICK_SLOP;
  if (again) lastPress = null;
  return again;
}

function removeBend(id, index) {
  if (!actions.removeBend(id, index)) handlers.onStatus?.('A line needs the bends it has left');
}

function onWheel(event) {
  event.preventDefault();
  const box = svg.getBoundingClientRect();
  // A pinch on a trackpad arrives as a wheel with Ctrl held, in finer steps.
  const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
  zoomAbout(factor, event.clientX - box.left, event.clientY - box.top);
}

// --- setting up --------------------------------------------------------------------------------

/**
 * @param callbacks.onPointer hears where the pointer is, in canvas pixels
 * @param callbacks.onStatus  hears what to say on the status line
 */
export function initCanvas(callbacks = {}) {
  handlers = callbacks;

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('pointerleave', () => handlers.onPointer?.(null));
  svg.addEventListener('wheel', onWheel, { passive: false });
  // A long press with a pencil or a finger is not a request for a menu.
  svg.addEventListener('contextmenu', (event) => event.preventDefault());

  // Space turns any tool into the hand for as long as it is held.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return;
    event.preventDefault();
    spaceHeld = true;
    svg.dataset.panning = 'ready';
  });
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return;
    spaceHeld = false;
    if (gesture?.type !== 'pan') svg.dataset.panning = 'false';
  });

  // The stage changes size when the window does; an artboard nobody has moved
  // stays in the middle of it.
  new ResizeObserver(() => { if (view.fitted) fit(); }).observe(stage);

  subscribe((reason) => {
    if (reason === 'tool') {
      cancelDraft();
      svg.dataset.tool = store.tool;
    }
    if (reason === 'history' || reason === 'file' || reason === 'target' || reason === 'style') return;
    render();
    if (reason === 'doc') renderPreview();
  });

  svg.dataset.tool = store.tool;
  fit();
  renderPreview();
}

export const isTyping = (target) =>
  target instanceof HTMLElement
  && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  && target.type !== 'range' && target.type !== 'checkbox';
