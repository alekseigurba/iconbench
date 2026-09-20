# CLAUDE.md

Working notes for Claude Code on this repo. The repo documents itself, so this
file holds only what the code and the docs do not say. Read the pointers first.

## Before anything else

- **Grill first.** In the TUI, every prompt from the owner starts with
  `/grill-me`, before any planning, reading or editing — by default, without
  being asked. Only skip it when the prompt itself says to. It is a TUI
  command: in a session where it is not installed (the VS Code extension, for
  one) say so and carry on, rather than acting as though it ran.

## Read first

- [README.md](README.md) — what iconbench is for, and how to run it.
- [design-system.md](design-system.md) — the tokens and chrome the stylesheets
  follow; `app/css/tokens.css` is the source of truth. A new page element or
  token is recorded there.
- [CHANGELOG.md](CHANGELOG.md) and [docs/releases/](docs/releases/) — what
  shipped, and what is planned. [BACKLOG.md](docs/releases/BACKLOG.md) is the
  owner's plan, in the owner's words.
- The sister repo, [domain-map](https://github.com/alekseigurba/domain-map) —
  usually checked out beside this one at `../domain-map`. The tokens, the chrome,
  the layer control, the colour picker and the file store all came from there,
  and the icons drawn here are for it. When the two could share an answer, take
  domain-map's.

## Architecture rules

- No build step, no framework, no bundler. `app/` is ES modules the browser
  loads as they are.
- No runtime dependencies at all. The server is Node's own `http` and `fs`; ask
  before adding one.
- `app/js/store.js` is the single source of truth. Every change to the icon is
  an action there; toolbox, panel, layer control and canvas read from it.
- `app/js/geometry.js`, `app/js/color.js`, `app/js/document.js` and
  `app/js/pack.js` are pure: no DOM, no store. Line maths, the file format and
  pack recolouring live there so they run headless under test — and so the
  server can import them.
- `app/js/canvas.js` renders and turns gestures into intents. It calls store
  actions and never talks to the API.
- `app/js/main.js` is the only module that both changes the store and talks to
  the server. Every other part of the page reads the store and says what was
  asked for through a callback.
- An icon file is a plain SVG that carries its own editing model in `data-*`
  attributes, so the library is a folder of usable icons rather than a folder
  of project files. A change to those attributes is a format version bump
  (`FORMAT_VERSION` in `document.js`; `PACK_VERSION` in `pack.js` for
  `pack.json` and pack files).
- A line's colour is always a hex, because a file has to draw without a palette
  to ask. A swatch number beside it (`strokeSwatch`, `fillSwatch`) says it is
  worn from the pack's palette and follows it; no number means the colour is
  the line's own. Anything that brings a document in — open, load, undo — runs
  `applyPalette` over it, so the two never disagree.
- The palette is the pack's, not the icon's: editing it is not an undo step,
  and the pack's files are rewritten when the palette editor is shut.
- Panels rebuilt on every store change are guarded by a signature of what they
  show (`drawnFrom`): the store says "doc" for every pixel of a drag, and a
  list rebuilt that often refetches every thumbnail that often.
- The sketch layer is not part of the document. It lives in `store.sketch` and
  the tab's session storage, which is what keeps it out of every saved file —
  do not "fix" that by moving it into the document.
- `scripts/server.mjs` is static files plus a file API over `STORAGE_DIR`:
  get, put, delete and list, nothing else. It writes only
  `packs/<pack>/<icon>.svg` and `packs/<pack>/pack.json`.

## Working agreements

- Never commit or push. Leave changes in the working tree; the owner reviews
  and commits.
- Run `npm test` before reporting a task done, and say plainly if anything
  fails. Tests are plain scripts with no runner; a new pure function gets
  checks in the matching test file, in the same `check('reads like a
  sentence', ...)` form.
- Every user-facing change gets an entry under `## Unreleased` in
  `CHANGELOG.md` in the same task, in the house voice. Internal refactors do
  not.
- `docs/releases/BACKLOG.md` is the owner's plan: plain bullets in the owner's
  words. When an item ships, write it up on the page for the release it lands
  in, in the voice of [1.0.0.md](docs/releases/1.0.0.md) — what it became and
  why — and remove the plan bullet. A known gap listed on a release page is
  removed when it is closed.
- A release is the `## Unreleased` entries moved under a heading for the
  version with the date, the same version in `package.json`, and a tag of the
  same name: `v1.0.0`. The owner cuts it; print the commands rather than run
  them.

## House voice

Comments, docs and changelog entries share one voice, and it is domain-map's.

- Full sentences of prose that say why, not what. A comment restating the code
  is noise; one that explains a choice, a trade-off, or a consequence that is
  not obvious earns its place.
- Concrete over abstract: "a pen held still sends dozens of samples", not
  "input is deduplicated".
- British spelling in comments and docs: colour, centre, behaviour. The words on
  the page itself say *color*, as domain-map's do. Em-dashes for asides.
- Names say what a thing is to the person drawing — line, bend, anchor, sketch,
  marker, swatch — not how it is built.
- A changelog entry leads with the thing in bold, then says what it means for
  someone drawing an icon.

## Environment

- The owner works from a Windows 11 desktop and a Mac interchangeably, so
  nothing may lean on either. Check which one this is before running a shell
  command: PowerShell or Git Bash on Windows, zsh on macOS.
- Keep everything portable: forward slashes in Node paths and in docs, paths
  built with `node:path` rather than by hand, no drive letters or home-folder
  paths written into the repo, and `npm` scripts that are plain `node …`
  joined by `&&` at most — no `rm`, `cp`, or env vars set inline, which one
  shell or the other does not have.
- File names are case-sensitive on neither machine by default, and are on the
  Docker image. Keep them lower case, and an import's case exactly the file's.
- Shortcuts are written as Ctrl in the docs and the page; the code takes Cmd
  on macOS as the same key (`event.ctrlKey || event.metaKey`).
- Node 22 or later. `npm start` serves `app/` on port 8010 and keeps the
  library in `storage/`, which is gitignored — so each machine has a library of
  its own. An icon moves between them with **Save to** and **Load from**, a
  whole pack with **Save pack to** and **Load pack from**, or `STORAGE_DIR` is
  pointed at a folder both machines share. `docker compose up --build` does the
  same with the library in the `iconbench-data` volume.
- The repo holds LF (`.gitattributes` says so), whatever `core.autocrlf` is set
  to on the machine. Keep whichever line ending a file already has when editing
  it, so a diff shows the change and nothing else.
- `tests/server.test.mjs` starts the real server on a free port against a
  throwaway folder. Nothing else is needed — no database, no Docker.
