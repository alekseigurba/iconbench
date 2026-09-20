# iconbench
A minimalistic SVG icon authoring tool. Fast, simple, and zero bullshit—no ads, no accounts, no fees.

Solid lines, fills and layers on a 24×24 canvas, kept in packs that share one
palette. It was made to draw the icons for
[domain-map](https://github.com/alekseigurba/domain-map), and borrows that tool's
look, its layer control, its color picker and its file store. Pure HTML and
JavaScript: no build step, no framework, no dependencies.

## Run it

With Node 22 or later:

```bash
npm start
```

Then open <http://localhost:8010>. The library is kept in `storage/` beside the
checkout.

Or with Docker, which keeps the library in the `iconbench-data` volume:

```bash
docker compose up --build
```

To keep it in a folder you can see instead, swap the volume in
[docker-compose.yml](docker-compose.yml) for a bind mount, or point `STORAGE_DIR`
anywhere you like — a folder in a git repo, say, which is also the simplest way
to have one library on two machines.

## Draw

The canvas is a 24×24 artboard, the size Material, Lucide, Feather, Tabler,
Heroicons and Remix draw on, zoomed to fill the stage. The dashed square is the
**live area**: 20×20 for the artwork, with 2px clear all round. The icon is shown
top right at 16, 24 and 48 pixels as you go.

| Tool | Key | What it draws |
| --- | --- | --- |
| Select | V | Nothing: click a line to select it, drag it to move it, drag a bend to reshape it |
| Straight line | L | A line with a corner at every click |
| Quadratic Bézier | Q | Clicks take turns: an anchor, then the control that bends the run to the next anchor |
| Catmull-Rom curve | C | A smooth curve through every click |
| Free-hand | F | Whatever you draw, with a pencil, a finger or the mouse. It becomes a line with bends when you let go — straight through every sample with no smoothing, or a Catmull-Rom curve through fewer and fewer of them at *min*, *normal* and *max* |
| Marker | M | A guide line on the sketch layer |

While drawing by clicks: click the first point to close the line, double-click or
press Enter to finish it open, Backspace takes back the last click, Esc gives the
line up. Points land on half pixels; hold Alt to place one freely. A new line is
0.75 wide, which on a 24px canvas is a fine one; the scale runs to 4.

With a line selected: Shift+click it to add a bend, double-click a bend to remove
it, arrows nudge it (Shift for a whole pixel), `]` and `[` bring it to the front
or send it to the back of its layer (Ctrl for one step), Delete deletes it.
Ctrl+Z undoes and Ctrl+Shift+Z redoes. On macOS, Cmd is Ctrl.

Scroll to zoom, drag the open stage to pan (or hold Space, with any tool), `0` to
fit, `G` to hide the pixel grid and show it again. On a tablet, two fingers pan
and zoom, and a pencil only ever draws.

### Line and fill

The panel on the right sets how the selected line looks — or, with nothing
selected, how the next one will: width, line color and opacity, whether it is
closed, and its fill color and opacity. Press the line's or the fill's color chip
to point the palette and the picker below at it.

The palette is eight columns, and **each column is a family**: a color to draw
lines in at the top — grey, burnt orange, green, teal, blue, purple, red, ochre —
and under it three tints of it to fill with: medium, light, lightest. A new line
wears the grey, and a fill switched on for the first time is the light tint in
the line's own column.

A color pressed in the palette is *worn as a swatch*: the line keeps the swatch's
number and follows the palette from then on. A color made with the picker, under
the palette, is the line's own.

### Layers

The control in the bottom left corner lists the icon's layers, topmost first. The
box picks the layer you are drawing on — the only one that answers the pointer —
and the other two dim it and hide it. A hidden layer is saved, but left out of
the picture the file shows. Double-click a name to rename it, and use the arrows
in the control's head to move the layer being drawn on up or down the pile.

### The sketch

Under the icon's layers lies the sketch: a guide to draw over. Paste a picture
onto it with Ctrl+V (or the picture button in the toolbox), and draw on it with
the marker. It can be dimmed, hidden and cleared.

Every icon has a sketch of its own: it leaves the canvas with its icon and comes
back with it. It is **never saved with the icon** — sketches are kept by the
browser tab, so they survive a refresh and go when the tab is closed.

## Packs

An icon lives in a **pack**: a folder of icons that share one palette. The panel
on the left lists the pack's icons — press one to open it — and **Preview pack**
shows them all on one sheet, the only way to see whether they belong together.

**Edit palette** changes a swatch of the pack's palette, and with it every line
wearing that swatch, in every icon of the pack: the open icon as you drag, and the
rest of the pack's files when you shut the editor.

The **File** menu, beside the logo:

| | |
| --- | --- |
| New icon · Save · Save as… | The icon on the canvas, in the open pack |
| Save to… | Write the icon to a file anywhere |
| Load from… | Bring an iconbench SVG in from anywhere: it joins the pack, wearing its palette. Any other SVG goes on the sketch layer, to draw over |
| New pack… · Open pack… · Preview pack… | |
| Rename pack… · Delete pack… | The open pack. Renaming keeps everything in it; deleting takes every icon with it, and cannot be undone |
| Save pack to… · Load pack from… | A whole pack, palette and icons, as one `.iconpack.json` — for carrying it to another machine |

## What is in a file

An icon is saved as a plain SVG you can use as it stands:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" data-iconbench="1">
  <g data-layer="Layer 1">
    <path d="M 4 12 Q 12 2 20 12" stroke="#282828" stroke-width="0.75" fill="none" data-kind="quadratic" data-points="4,12 12,2 20,12" data-stroke-swatch="1"/>
  </g>
</svg>
```

The `data-*` attributes are what lets iconbench open it again with its layers,
its bends and its swatches; nothing else reads them. On disk a library is just:

```
storage/packs/<pack>/pack.json      the pack's palette
storage/packs/<pack>/<icon>.svg
```

## Working on it

```bash
npm test
```

Plain scripts, no runner: the line maths, the file format, the packs, and the
real server over a throwaway folder. [CLAUDE.md](CLAUDE.md) has the architecture
rules, [design-system.md](design-system.md) the tokens and the chrome, and
[docs/releases/BACKLOG.md](docs/releases/BACKLOG.md) the plan.
