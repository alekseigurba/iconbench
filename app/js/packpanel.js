// The pack panel, on the left: the pack that is open and every icon in it, to
// pick one for the canvas. It reads the store and says what was asked for —
// open this, delete that — and leaves the asking of the server to main.js.

import { store, subscribe } from './store.js';
import { iconUrl } from './files.js';
import { loadIcons } from './icons.js';

const main = document.querySelector('.main');
const title = document.getElementById('pack-title');
const list = document.getElementById('icon-list');
const toggle = document.getElementById('toggle-pack');

const COLLAPSED_KEY = 'iconbench:pack-panel';

let handlers = {};

/**
 * @param callbacks.onOpen   hears the name of the icon pressed
 * @param callbacks.onDelete hears the name of the icon whose × was pressed
 */
export function initPackPanel(callbacks) {
  handlers = callbacks;

  // The browser remembers whether the panel was folded away, so the page
  // reopens the way it was left.
  setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true');
  toggle.addEventListener('click', () => setCollapsed(main.dataset.pack !== 'collapsed'));

  subscribe((reason) => {
    if (['pack', 'doc', 'file'].includes(reason)) render();
  });
  render();
}

function setCollapsed(collapsed) {
  main.dataset.pack = collapsed ? 'collapsed' : 'open';
  toggle.setAttribute('aria-pressed', String(!collapsed));
  toggle.title = collapsed ? 'Show the pack panel' : 'Collapse the pack panel';
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // Storage switched off: the panel still folds, it just does not remember.
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row({ name, lastModified, unsaved }) {
  const open = unsaved || name === store.file.name;
  const wrap = element('div', 'tree__row');

  const item = element('button', 'tree__item');
  item.type = 'button';
  item.setAttribute('aria-selected', String(open));

  // An icon that has never been saved has no file to show a picture of.
  if (unsaved) {
    item.append(element('span', 'tree__thumb tree__thumb--none'));
  } else {
    const thumb = element('img', 'tree__thumb');
    thumb.src = iconUrl(store.pack.name, name, lastModified);
    thumb.alt = '';
    thumb.loading = 'lazy';
    item.append(thumb);
  }

  item.append(element('span', 'tree__label', name));
  if (open && store.file.dirty) item.append(element('span', 'tree__lead', 'unsaved'));
  if (!open) item.addEventListener('click', () => handlers.onOpen?.(name));
  wrap.append(item);

  if (!unsaved) {
    const remove = element('button', 'btn btn--chip btn--chip-icon tree__remove');
    remove.type = 'button';
    remove.title = `Delete ${name} from the pack`;
    remove.setAttribute('aria-label', `Delete ${name}`);
    const drawing = element('span', 'icon');
    drawing.dataset.icon = 'icons/clear.svg';
    drawing.setAttribute('aria-hidden', 'true');
    remove.append(drawing);
    remove.addEventListener('click', () => handlers.onDelete?.(name));
    wrap.append(remove);
  }
  return wrap;
}

/** What the list was last drawn from, so it is only redrawn when that changes. */
let drawnFrom = '';

function render() {
  const { pack, file, doc } = store;

  // The store says "doc" for every pixel a bend is dragged, and a list rebuilt
  // that often fetches every thumbnail that often. Only what the rows actually
  // show is worth redrawing for.
  const showing = JSON.stringify([pack.name, pack.icons, file.name, file.dirty, file.name ? null : doc.name]);
  if (showing === drawnFrom) return;
  drawnFrom = showing;

  title.textContent = pack.name;
  title.title = `Pack: ${pack.name}`;

  const rows = pack.icons.map((icon) => row(icon));
  // The icon on the canvas is always in the list, even before it has a file.
  if (!file.name) rows.unshift(row({ name: doc.name, unsaved: true }));
  list.replaceChildren(...rows);
  loadIcons(list);
}
