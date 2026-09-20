# Changelog

What changed in each release, newest first. A release is a version in
`package.json` and a git tag of the same name. A release with more to say than
fits here has a page of its own under [docs/releases/](docs/releases/), and the
plan for what comes next is [docs/releases/BACKLOG.md](docs/releases/BACKLOG.md).

## Unreleased

## 1.0.0 — 2026-09-20

The first release: everything in the backlog, built on domain-map's tokens,
chrome, layer control, color picker and file store. Full notes, and why each
thing became what it did: [docs/releases/1.0.0.md](docs/releases/1.0.0.md).

### Added

- **A 24×24 canvas**, zoomed to fill the stage, with a pixel grid, the two centre
  lines, and a dashed **live area** that leaves 20×20 for the artwork. The icon
  is shown beside it at 16, 24 and 48 pixels as you draw, which is the only
  honest test of whether it reads.
- **Three kinds of line**: a straight line with bends, a quadratic Bézier —
  clicks take turns, an anchor and then the control that bends the run to the
  next one — and a Catmull-Rom curve through every click. Click the first point
  to close a line, double-click or Enter to finish it open. Points land on half
  pixels, which keeps a 1px or 2px line crisp; Alt places one freely.
- **Free-hand**, for a pencil, a finger or the mouse. The stroke becomes an
  ordinary line when you let go, with bends to drag like any other: straight
  through every sample with **no smoothing**, or a Catmull-Rom curve through
  fewer and fewer of them at **min**, **normal** and **max**. A stroke let go
  where it began is a closed shape. Two fingers pan and zoom, so a pencil only
  ever draws.
- **Editing**: drag a line to move it, drag a bend to reshape it, Shift+click the
  line to add a bend — a quadratic is split exactly, so it does not move under
  the pointer — and double-click a bend to remove it. Arrows nudge, `]` and `[`
  restack, and everything is undone with Ctrl+Z and redone with Ctrl+Shift+Z. A
  drag or a slider pull is one step.
- **Line and fill**, in the panel on the right: width, line color and opacity,
  closed or open, and fill color and opacity, per line. With nothing selected it
  sets what the next line will wear. Under them a color picker that is always
  open, and the palette.
- **A 32-color palette**: domain-map's 24, with two columns of blacks and greys —
  white among them — in front. A color pressed in the palette is worn *as a
  swatch* and follows the palette from then on; one made with the picker is the
  line's own.
- **Layers**, in domain-map's control in the bottom left corner: pick the one
  being drawn on, dim it, hide it, add, rename and delete. Only the layer being
  drawn on answers the pointer. A hidden layer is saved, and left out of the
  picture the file shows.
- **A sketch layer** under the icon: paste a picture with Ctrl+V and draw on it
  with the marker, then dim, hide or clear it. It survives a refresh, and it is
  never saved with the icon — it is not part of the document at all.
- **Icon packs.** An icon lives in a pack: a folder of icons and the one palette
  they share. The panel on the left lists the pack's icons, each with its
  drawing, to pick one for the canvas; **Preview pack** shows the whole pack on
  one sheet. **Edit palette** changes a swatch and every line wearing it, in
  every icon of the pack — the open icon as you drag, the rest of the pack's
  files when the editor is shut.
- **A File menu** beside the logo. **Save** and **Save as…** keep the icon in the
  open pack; **Save to…** writes it anywhere, and **Load from…** brings an
  iconbench SVG in from anywhere and adds it to the pack, wearing its palette —
  any other SVG goes on the sketch layer, to draw over. **Save pack to…** and
  **Load pack from…** carry a whole pack, palette and icons, as one file.
- **Icons are saved as plain SVGs** you can use as they stand. What iconbench
  needs to open one again — layers, bends, swatches — rides in `data-*`
  attributes nothing else reads.
- **A library on disk or in a volume.** `npm start` keeps it in `storage/`;
  `docker compose up` keeps it in the `iconbench-data` volume. No database, no
  accounts, no dependencies. A stored SVG carrying script is refused, and every
  stored file is served as a picture that can do nothing else.
- **Unsaved work survives a refresh**, and the page asks before a tab with
  unsaved work is closed.
