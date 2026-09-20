# Design System

The icon is the subject; everything else is chrome. This page records the tokens
the chrome is built from and the page elements built out of them.
[`app/css/tokens.css`](app/css/tokens.css) is the source of truth,
[`app/css/layout.css`](app/css/layout.css) is where the elements below are drawn,
and [`app/css/canvas.css`](app/css/canvas.css) holds what the editor draws on the
stage that is not the icon.

The system is [domain-map](https://github.com/alekseigurba/domain-map)'s, cut down
to the set this page uses, so the two tools read as one family: the same face,
the same sage chrome, the same chip. Where this page says nothing, domain-map's
`design-system.md` is the answer.

## Type

| Token | Family |
| --- | --- |
| `--font-heading` | `"Poppins"` — the page title |
| `--font-text` | `"Poppins"` — everything else |

Poppins is the only face bundled, self-hosted from [`app/fonts/`](app/fonts/) and
declared in [`app/css/fonts.css`](app/css/fonts.css). It has no variable cut, so it
ships as static weights; the page uses 400 and 600.

| Token | Size | Used for |
| --- | --- | --- |
| `--fs-200` | 13px | panels, chips, fields, the layer control, footer |
| `--fs-300` | 14px | available |
| `--fs-400` | 16px | body default, stage buttons |
| `--fs-500` | 22px | header title |

Chrome runs on the smallest step, aliased `--fs-xs`, with `--fs-m` for the title.
Weights are 400 / 600 (`--fw-regular`, `--fw-semibold`); line heights 1.2 / 1.5
(`--lh-s`, `--lh-m`).

Section, panel and dialog headings are uppercase, semibold, tracked out, in
`--ink-soft` — a label for the group below, not a voice of its own.

## Color

The raw scales are declared as `--r-*`, and only the steps in use: brand 200 and
400, haze 200 and 500, sage 200–600, charcoal 300–600, ember, orange, red 100 and
400, focused, neutral-white. Everything else names what a color does here.

| Token | Raw | Where |
| --- | --- | --- |
| `--paper` | neutral-white | the artboard, the preview, controls sitting on chrome |
| `--stage` | haze-200 | the desk the artboard lies on — a shade off white, so the artboard's edge reads |
| `--chrome` | sage-200 | header, footer, pack panel, toolbox, details panel |
| `--chrome-hover` | sage-400 | hovered rows and buttons |
| `--line` / `--line-strong` | sage-500 / sage-600 | dividers, button borders |
| `--ink` / `--ink-soft` | charcoal-400 / charcoal-300 | text, secondary text |
| `--ink-invert` | neutral-white | text on a filled control |
| `--selection` | focused-400 | the tool in hand, the selected line's outline and bends, the color being set |
| `--selected-row` | brand-200 | the open icon's row in the pack panel |
| `--danger` | red-100 | a delete button's hover |
| `--grid` | charcoal-400 at 10% | the pixel grid |
| `--live-area` | ember-400 | the 20×20 live area and the two centre lines |
| `--marker` | orange-400 | marker lines on the sketch layer |

Unsaved work is the one thing in the header worth interrupting for, so the icon's
chip goes orange-400 on white while there is any. A typed value that is not yet a
color, or a name that cannot be a file, turns its field's border red-400 rather
than throwing the text away.

### The palette

Thirty-two inks, `--c1` … `--c32`, laid out the way the swatch grid shows them:
eight across and four down. **A column is a family**, and reads downwards the way
it is used: a color to draw lines in, then three tints of it to fill with —
medium, light, lightest.

| | grey | orange | green | teal | blue | purple | red | ochre |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| line | 1 `#282828` | 2 `#c4561e` | 3 `#527a42` | 4 `#2a7f78` | 5 `#2f6690` | 6 `#6b4fa0` | 7 `#b3362d` | 8 `#a5790f` |
| medium | 9 `#686868` | 10 `#d68962` | 11 `#86a27b` | 12 `#6aa5a1` | 13 `#6d94b1` | 14 `#9784bd` | 15 `#ca726c` | 16 `#c0a157` |
| light | 17 `#c9c9c9` | 18 `#edccbc` | 19 `#cbd7c6` | 20 `#bfd9d7` | 21 `#c1d1de` | 22 `#d3cae3` | 23 `#e8c3c0` | 24 `#e4d7b7` |
| lightest | 25 `#ececec` | 26 `#f6e6dd` | 27 `#e5ebe3` | 28 `#dfeceb` | 29 `#e0e8ee` | 30 `#e9e5f1` | 31 `#f4e1e0` | 32 `#f2ebdb` |

The line colors are muted, to sit together, and every one is dark enough to hold
as a 0.75 line on paper — the ochre is the faintest, at 3.9 to 1. Grey, burnt
orange and domain-map's brand green come first; the other five carry on round the
wheel from the green. The tints are 30, 70 and 85% of the way to white, which is
how domain-map's brand scale steps: the green column *is* its brand 400, 300, 200
and 100, and the grey keeps its charcoals. Eight line colors is more than any one
set of minimal icons should wear; it is what lets each set pick its own two or
three and find their fills under them.

There is no pure white or black. domain-map shows icons on colored ovals, where a
white fill would be a white patch rather than a knock-out; either is one typed hex
in the picker, as a line's own color.

A swatch is kept in a file by its number, counted across the rows, so column *k*
is swatches *k*, *k*+8, *k*+16 and *k*+24.

This is the *stock* palette. A pack carries its own copy in its `pack.json`, which
**Edit palette** changes and **Reset to defaults** puts back to these.

A new line is drawn in swatch 1, the grey that heads the first column — the ink
of the chrome, and of domain-map's own icons — and is 0.75 wide. A fill switched
on for the first time is the *light* tint in the column the line's color is in, so
the two belong together without being chosen; a line in a color of its own takes
the grey column's. [`app/js/defaults.js`](app/js/defaults.js) is where all of it
is set.

### How a color is worn

A line wears each of its two colors in one of two ways, and the panel says which:

- **As a swatch** — pressed in the palette. The line keeps the swatch's
  number, shown after the hex as `#282828 · 1`, and follows the palette from
  then on: edit swatch 1 and every line wearing it changes, in every icon of the
  pack.
- **As a color of its own** — made with the picker or typed as a hex. It carries
  no number and follows nothing.

An icon file always holds the hex, since a file has to draw without a palette to
ask; the swatch number rides beside it as `data-stroke-swatch` / `data-fill-swatch`.

## Spacing, radius, icon sizes

Spacing is `--space-025` … `--space-100` (4, 8, 12, 16px); the four gaps the layout
uses, `--gap-1` … `--gap-4`, are aliases onto them. Radii are `--radius-s|m|l`
(4/8/12px) and icon boxes `--icon-s|m|l` (16/24/32px).

## Icons

Button icons are plain `.svg` files under [`app/icons/`](app/icons/). Each
`[data-icon]` placeholder in the markup is *replaced* by the fetched `<svg>`
([`app/js/icons.js`](app/js/icons.js)), not merely pointed at it: only a node that
is part of the page can take its stroke from the button's own `currentColor`,
which is what makes hover, `aria-pressed` and the filled tool-in-hand state reach
the drawing. They are drawn on a 16px box, unfilled, 1.4 stroke, round caps and
joins; a solid dot or square marks a bend or a control.

The tool icons each show what their tool makes: a zigzag through two corners, an
arc under its control point, a curve through three points, a pencil over a
squiggle, a marker, a picture.

## The page

A three-row grid — header, main, footer — pinned to the viewport (`100dvh`);
nothing scrolls but the panels. `main` is four columns: the pack panel (200px,
collapsible to a `--rail-w` 28px rail), the toolbox (`--toolbox-w` 44px, never
folded), the stage, and the details panel (`--panel-w` 250px). The stage is
`--stage`; everything else is `--chrome`.

### Header

Brand on the left — the logo at `--icon-m` beside the one heading on the page —
and straight after it the **File** menu, the one place for everything that is
about files rather than about the drawing. Its list is `position: fixed` and
placed in script, because the header does not scroll and would clip it. Above
the rule it is about the icon: **New icon**, **Save**, **Save as…**, then
**Save to…** and **Load from…**, which move one icon out of and into the library
by hand. Below it, the pack: **New pack…**, **Open pack…**, **Rename pack…**,
**Delete pack…**, **Preview pack…**, **Save pack to…** and **Load pack from…**.

On the right, a chip naming what is open as `pack / icon` with its state in small
capitals — *new*, *saved*, *unsaved* — which saves when pressed and fills orange
while there is unsaved work. Then undo and redo, one drawing mirrored.

### Pack panel

The frame is domain-map's hierarchy panel: a `panel__head` with the pack's name
as its uppercase title and, at the far end, the controls that act on the whole
pack — **Preview pack** and **New icon**; the list; `panel__actions` holding
**Open pack…**; and a `panel__foot` with the collapse toggle. Buttons here keep
their label first and icon last, the other way round from the details panel.

Each row is a 20px drawing of the icon on paper, then its name: the list doubles
as a contact sheet. The open icon's row is `--selected-row` and semibold, and says
*unsaved* at its far end while it is; an icon that has never been saved is in the
list too, with a dashed box where its drawing will be. A row's delete button lies
over its end and shows only when the row is pointed at — deleting is rare, and
final.

Collapsed, the panel keeps its actions as icons and loses everything else. The
browser remembers which way it was left.

### Toolbox

A rail of `.btn--icon` squares, one to a row, fixed on the left of the stage. The
tool in hand is *filled* `--selection`, not merely outlined: down a column of
identical squares a border alone does not say which one you are on. A rule splits
the tools that draw the icon — select, straight line, quadratic Bézier,
Catmull-Rom curve, free-hand — from the two that work on the sketch: the marker,
and the sketch picture.

### Details panel

Three sections, headed like domain-map's accordion but never folded — there are
only three, and all of them are wanted at once.

**Spline** opens with one line of `--ink-soft` saying what the panel is about: the
selected line (*Catmull-Rom curve, open, 4 bends.*) or, with nothing selected,
that this is what the next line will wear. Then **Smoothing** (only with the
free-hand tool in hand), **Width**, **Color**, **Opacity**, and **Closed** (only
with a line selected). **Fill** is **Filled**, **Color** and **Opacity**. Every
control sits beside its label on one row, and the controls share a width so they
line up down the panel. A slider shows its value beside it in tabular figures.

The two **Color** controls are `.ink` chips: a swatch of the color, its hex, and
its swatch number if it wears one; *none* is paper with a red stroke through it.
Pressing one points the third section at it, and the pressed one is outlined in
`--selection`. That section — **Line color** or **Fill color** — is the pack's
palette and, under it, a picker. The palette comes first because a swatch is what
is reached for most, and is what keeps a pack recolorable: one grid, eight
across, a family to a column, with what each row is for — line color, medium,
light or lightest fill — on every swatch's tooltip. The picker is always open (a saturation and
brightness area, a hue strip, a hex field, each keeping the others in step); a
drag over it recolors the line as it goes and is one step to undo.

At the foot, **Edit palette** — which stays when nothing is selected, since the
palette belongs to the pack — and **Delete line**, furthest down because it is the
most final.

### Dialogs

Native `<dialog>`s, so the page behind is inert, Esc shuts them, and focus goes
back to what opened them. A dialog carries no padding of its own, so a click whose
target is the dialog itself can only have landed on the backdrop, and shuts it.
The one button that does what the dialog is for is `.btn--primary`, filled
`--selection`.

**The library** is centred: a sheet of tiles — a 48px drawing and a name, or for a
pack its first four icons as a small sheet and a count — and, when there is
something to name, a field under it with the suffix beside it. It asks every
question the library has: which pack to open, what to call a new one, what to
save this icon as. Pressing a tile answers, or fills the name field when there is
one. As the **pack preview** it is the same sheet given the room to show a whole
pack at once, and pressing an icon opens it.

**The palette editor** sits in the bottom right corner, 20px in, over a scrim
light enough to watch the icon change color behind it: one narrow column standing
over the details panel, so it keeps off the canvas. The swatches, pressed to
choose the one being edited; a caption that says what editing it will change; the
picker; **Reset to defaults** and **Done**. It opens on the swatch the line in
hand wears.

### Stage chrome

As little as possible, and all of it in the corners: the **preview** top right —
the icon at 16, 24 and 48px on paper, with no grid to flatter it; the zoom stack
bottom right, headed — a step apart — by the **#** switch that hides the pixel
grid and goes quiet with it; the **layer control** bottom left.

The layer control is domain-map's: one row per layer, topmost first, reading
`name · drawing on · dim · eye`, the row being drawn on tinted `--selection`. Here
the layers are the icon's own, so its head carries **up**, **down**, **add** and
**delete** — all four acting on the layer being drawn on — and a name is
double-clicked to rename it in place. Under a rule at the foot of the pile
lies the **Sketch** row — `clear · dim · eye` — because the sketch is a guide to
draw over and not one of the icon's layers. It is this icon's sketch: another
icon on the canvas brings its own.

The cursor carries the tool: an arrow to pick things up, a crosshair to draw,
grab and grabbing while panning.

### The canvas

A 24×24 artboard on `--paper`, zoomed to fill the stage: the unit is the icon's
pixel, however many screen pixels it is drawn across. On it, the pixel grid in
`--grid` (dropped when zoomed too far out to be more than grey, or when switched
off), and over the
icon — so a fill does not hide them — the **live area**, a dashed `--live-area`
square 2px in on every side that leaves 20×20 for the artwork, and the two centre
lines at a quarter of its strength.

The icon itself is painted with the same attributes it is written to a file with.
A selected line is outlined in a `--selection` hairline with its bends on it:
round for a point on the line, square for a quadratic's control, with dashed arms
from a control to the anchors it pulls on. Hairlines and handles are sized from
the zoom, so they are the same on screen however close the canvas is. A dimmed
layer is drawn at 25%, the dimmed sketch at 35%.

### Footer

13px `--ink-soft`: on the left, one line on what the tool in hand does and the
keys that go with it; on the right, where the pointer is in canvas pixels, the
icon's counts, and a status line that clears itself after a couple of seconds.
The numbers run on tabular figures so they do not jitter as they change.

Where there is no server and the library is the browser's own — on GitHub Pages —
the row ends with a note, `.footer__note`: *Library kept in this browser*. It is
last so that it stays put in the corner while the rest comes and goes, and wears
a dotted underline in `--line-strong` and a help cursor, because the rest of what
there is to say is in its title. Served by `npm start` it is not there at all.

## Documents

An icon is saved as the SVG it is — 24×24, `fill="none"`, round caps and joins —
so the library is a folder of icons any page can use, not a folder of project
files. What the editor needs to open one again rides in `data-*` attributes: each
layer's name on its `<g>`, each line's kind, points and swatches on its `<path>`.
A hidden layer is written `display="none"`. The sketch is never written at all:
each icon's is kept by the browser tab, and goes when the tab does.

A pack is a folder, `packs/<pack>/`, of icons with a `pack.json` beside them
holding the palette. Names are lower case, digits and dashes, the way icon sets
name theirs.
