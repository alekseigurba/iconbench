# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-icons-saved-as-plain-svg.md
│   └── 0002-swatches-follow-the-pack-palette.md
├── app/
└── scripts/
```

(The ADR names above are examples of the kind of decision that belongs there; neither file exists yet.)

A multi-context repo would instead have a `CONTEXT-MAP.md` at the root pointing at one `CONTEXT.md` per context, each with its own `docs/adr/`, and a root `docs/adr/` for system-wide decisions.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

Until `CONTEXT.md` exists, the vocabulary is the one `CLAUDE.md`'s "House voice" names — line, bend, anchor, control, sketch, marker, swatch, pack — and `design-system.md` spells out.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
