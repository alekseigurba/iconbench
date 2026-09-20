// Undo and redo. domain-map records the inverse of each step, because its map
// is large and its steps are small; an icon is a few dozen lines, so here a step
// is simply the icon as it stood before the change. Whoever sets the stack up
// says how to take a copy and how to put one back.

const done = [];
const undone = [];
const MAX_STEPS = 100;

let take = () => null;
let restore = () => {};
let onChange = () => {};

/** The gesture the last step belongs to, while that gesture is still going. */
let openKey = null;

/**
 * @param handlers.take     answers with a copy of everything undo puts back
 * @param handlers.restore  puts such a copy back
 * @param handlers.onChange hears that the stack has moved
 */
export function init(handlers) {
  take = handlers.take;
  restore = handlers.restore;
  onChange = handlers.onChange ?? onChange;
}

/**
 * Record the state as it stands, before it is changed.
 * @param label what the step is about to do, for the status line
 * @param key   names a gesture made of many small changes — a drag, a slider
 *              being pulled. Only the first of them is recorded, so the whole
 *              gesture is one step to undo. `settle` ends it.
 */
export function record(label, key = null) {
  if (key && key === openKey) return;
  openKey = key;
  done.push({ label, state: take() });
  if (done.length > MAX_STEPS) done.shift();
  undone.length = 0;
  onChange();
}

/** The gesture is over: the next change is a step of its own, even under the same key. */
export function settle() {
  openKey = null;
}

export const canUndo = () => done.length > 0;
export const canRedo = () => undone.length > 0;

/** Undo the most recent step. Returns its label, or null if there was nothing. */
export function undo() {
  return move(done, undone);
}

export function redo() {
  return move(undone, done);
}

function move(from, to) {
  const step = from.pop();
  if (!step) return null;
  openKey = null;
  to.push({ label: step.label, state: take() });
  restore(step.state);
  onChange();
  return step.label;
}

export function clear() {
  done.length = 0;
  undone.length = 0;
  openKey = null;
  onChange();
}
