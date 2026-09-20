# CLAUDE.md

Working notes for Claude Code on this repo. The repo documents itself, so this
file holds only what the code and the docs do not say. Read the pointers first.

## Before anything else

- **Grill first, every time.** Every prompt from the owner that asks for work
  starts with the `grilling` skill (`/mattpocock-skills:grilling`; the owner
  calls it `/grill-me`) before any planning or editing — by default, without
  being asked, in the terminal and in VS Code alike. Read what the questions
  need first, so they are about this repo and not generic. Only skip it when
  the prompt itself says to, or when it is a bare command with nothing in it to
  decide (a slash command, "run the tests", "print the commit commands"). If
  the skill is not installed in a session, say so, and ask the hard questions
  by hand instead of carrying on without them.
- **Ask in the question prompt.** Grilling questions — and any other decision
  put to the owner — go through the interactive question prompt (the
  `AskUserQuestion` tool), automatically, never as a wall of text in the reply
  to be answered by typing. One round at a time, the recommended answer first
  and marked so, each option saying what it costs. A prompt holds four
  questions, so a longer round is several prompts back to back. Facts the
  answers depend on go in a short line of text before the prompt.

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
- `app/js/geometry.js`, `app/js/color.js`, `app/js/document.js`,
  `app/js/pack.js`, `app/js/filerules.js` and `app/js/fileapi.js` are pure: no
  DOM, no store. Line maths, the file format, pack recolouring and what the
  library will keep live there so they run headless under test — and so the
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
- The sketch layer is not part of the document, which is what keeps it out of
  every saved file — do not "fix" that by moving it into the document or into
  the library. Each icon has its own: `store.sketch` is the one for the icon on
  the canvas, the rest wait on a shelf in `store.js` keyed `pack/icon`, and
  both live in the tab's session storage and nowhere else. That was the owner's
  call, over a sidecar file: a sketch does not outlive its tab.
- The palette is 32 swatches in one grid, eight across, and a column is a
  family: a line colour, then its medium, light and lightest fills
  (`PALETTE_ROWS`, `firstFillSwatch` in `defaults.js`). A file keeps a swatch by
  its number, counted across the rows, so changing what a number means recolours
  saved icons — the stock palette was replaced once, in 1.1, while the library
  was still empty, and that is not a thing to do again lightly.
- When the owner asks for a *suggestion*, print it and ask; do not build it in.
  1.1's first cut added a second palette block because "suggest a palette" was
  read as "add one".
- `scripts/server.mjs` is static files plus a file API over `STORAGE_DIR`:
  get, put, delete and list, nothing else. It writes only
  `packs/<pack>/<icon>.svg` and `packs/<pack>/pack.json`. Anything bigger — a
  pack renamed, a pack deleted — is done by the page out of those four calls
  (`files.js`), copying before deleting, so the store stays something S3 could
  stand in for.
- On a host with no server — GitHub Pages — a service worker stands in for it:
  `app/sw.js` answers the same four calls out of IndexedDB
  (`browser-file-store.js`) through `fileapi.js`, the server's handler over
  again. What may be kept is asked of `filerules.js` by both, and
  `tests/library-checks.mjs` is run against both, so a change to what the API
  does is made in both and checked once. `files.js` starts the worker when its
  first listing is a 404, and only then; served by `npm start` it is never
  registered. The worker keeps the library and nothing else — the app's own
  files are never cached by it.
- `docs/app/` is a byte-for-byte copy of `app/`, made by `npm run build:pages`
  for Pages to serve. Never edit it by hand, and do not rebuild it as part of a
  task: it is rebuilt when a release is cut, so the site shows the last release
  and a change to `app/` is reviewed once. That was the owner's call, over an
  Actions workflow. Anything Pages needs goes in `app/` itself, so the copy
  stays a copy.

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
  version with the date, the same version in `package.json`, `npm run
  build:pages` so that `docs/app/` is the app being released, and a tag of the
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

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo, one file per ticket. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, named for their roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
