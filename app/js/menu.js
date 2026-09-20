// The File menu, beside the logo: everything that is about files rather than
// about the drawing. It only opens, shuts and says which item was chosen —
// what each one does is main.js's business.

const button = document.getElementById('file-menu-button');
const list = document.getElementById('file-menu');

const items = () => [...list.querySelectorAll('.menu__item:not([hidden])')];

function open() {
  // Fixed, and placed here: the header does not scroll, and would clip it.
  const box = button.getBoundingClientRect();
  list.style.left = `${box.left}px`;
  list.style.top = `${box.bottom + 4}px`;
  list.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  items()[0]?.focus();
}

function close({ refocus = false } = {}) {
  if (list.hidden) return;
  list.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (refocus) button.focus();
}

/** @param onChoose hears the `data-action` of the item chosen */
export function initMenu(onChoose) {
  button.addEventListener('click', () => (list.hidden ? open() : close()));

  list.addEventListener('click', (event) => {
    const item = event.target.closest('.menu__item');
    if (!item) return;
    close();
    onChoose(item.dataset.action);
  });

  // Up and down walk the items, Esc gives the button back its focus.
  list.addEventListener('keydown', (event) => {
    const all = items();
    const at = all.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close({ refocus: true });
    }
  });

  // A press anywhere else shuts it, as does the window losing the pointer's attention.
  document.addEventListener('pointerdown', (event) => {
    if (!list.hidden && !list.contains(event.target) && !button.contains(event.target)) close();
  });
  window.addEventListener('blur', () => close());
  window.addEventListener('resize', () => close());
}
