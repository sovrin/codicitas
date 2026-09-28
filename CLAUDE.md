# codicitas

A developer journal for the terminal, installed as `codi`. Ink 7 and React 19 on Node 23+, entries in
`node:sqlite`, tests with `node:test`.

## Commands

```bash
npm start              # run from source (tsx)
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint
npm run format:check   # oxfmt --check; `npm run format` writes
npm test               # node --test, test/**/*.test.ts(x)
npm run build          # esbuild -> dist/codi.js
```

CI runs build, typecheck, lint, format:check, test and `node dist/codi.js --version`, on Node 24 and 26. A change is done when all of them pass. `npm run record` re-records the demo and needs Docker.

## Layers

Dependencies point one way: `views -> components -> hooks -> services`, with `modules` beside
services. `#/` is the alias for `src/`.

| Layer         | Is                                                                   | May import                                                     |
| ------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `services/`   | Logic and storage: the journal reducer, entry syntax, store, standup | `utils`, `const`, `modules` (see below)                        |
| `modules/`    | Jira and GitHub behind the `Module` interface in `module.ts`         | `services`, `utils`, `const`                                   |
| `hooks/`      | Ties services and modules to React state; no rendering               | `services`, `modules`, `utils`, `const`                        |
| `components/` | Pieces that draw; no I/O of their own                                | `hooks`, `services`, `utils`                                   |
| `views/`      | One page each (journal, search, standup, settings, ...)              | `components`, `hooks`, `services`, `modules`, `utils`, `const` |
| `utils/`      | Pure helpers (text, time)                                            | nothing from the layers above                                  |

- `services/` and `modules/` lean on each other at one seam: `modules/` import service types, and
  `services/settings.ts` reads the module definitions and defaults. Keep it to that; the rest of
  `services/` only takes types from `modules/`.
- `services/` never imports React, or `ink` except the `Key` type in `input.ts`.
- `components/App.tsx` is the one shell that routes to views. No other component imports a view.
- `import/no-cycle` is an error in lint; a cycle is never the fix.
- A new Jira or GitHub feature goes into a module, not into a view.

## Rules that are easy to break

- **The entry syntax** is `/tag !priority >due @time`, in any order, each at most once, at the start;
  from the first word that is none of them on, the rest is text. It lives in `services/journal.ts`
  (`splitTag`, `splitPriority`, `splitDue`, `splitTime`, `splitPrefixes`, `prepare`); due words resolve
  in `utils/time.ts`. Change the parser and the README syntax table together.
- **The text of an entry is the truth.** Mentions are an index rebuilt from it (`store.ts`); never
  store something that cannot be derived from the text and the fields.
- **Migrations are append-only.** Add a step to `MIGRATIONS` in `store.ts`; never edit a shipped one.
- **State, entries and rows are copied in memory, never mutated**: the reducer returns a new state, and
  a change to an entry goes to the store (`update`, by its id), from which the day is read again.
- **What is in backticks is code**, and never a reference, a mention or a title. Look for references
  only through `services/references.ts` (`topicMatches`, `mentionsIn`, `topicsIn`, `firstReference`,
  `firstPerson`, `references`), which leave code out; never match `TOPIC` or a person against the raw text.
  `annotate` in `titles.ts` marks where the code is, so it is drawn as code across wrapped rows.
- **The terminal is asked once, before the first frame.** `tui.ts` asks for its background colour
  (`services/tint.ts`) while stdin is raw and before Ink reads it, so no answer arrives as a key; any
  new question to the terminal belongs there, with a reply every terminal gives after it. The answer
  goes to `App` as a prop and reaches what draws through `TintContext`, never a module's own state,
  so a screen test can give one.
- **Keys and settings shown in the README** (`Keys` view, settings) must match the code.

## Style

Enforced by oxfmt and oxlint, so run `npm run format` rather than arguing with it: four spaces, single
quotes, no bracket spacing, `import type` for types, no `any`, `node:` protocol for builtins.

By hand: arrow-function `const` exports; doc comments are prose sentences that say why, not what;
`strictNullChecks` is off, so do not rely on the compiler to catch a missing value.

## Tests

`test/` mirrors `src/`. The store is tested against a temp directory, never the real data folder. Time
is fixed with a constant `TODAY`, never the clock. Screens are tested through `ink-testing-library`,
with ANSI stripped, in `test/components/app.test.tsx`.

## Agents

`.claude/agents/`: `architect` reviews a change against the layers above, `tester` writes tests without
touching `src/`, `tui-verifier` runs the real app in tmux and reads the screen.
