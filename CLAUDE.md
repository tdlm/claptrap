# Claptrap

A personal macOS menu bar app (Electron + TypeScript + React, built with electron-vite)
that screenshots the active display on an interval, has an AI vision model describe what
the user is doing, and writes a daily Markdown log to `~/Notes/`.

## Keep the build prompt current (required)

`docs/PROMPT.md` is the canonical prompt for rebuilding this app from scratch, and
`docs/PROMPT_CHANGELOG.md` logs every revision. Whenever the user changes requirements
(features, behavior, look and feel, naming, defaults):

1. Update `docs/PROMPT.md` so it describes the app as it should now be built, and bump
   its revision number and date.
2. Add a new entry at the top of `docs/PROMPT_CHANGELOG.md`: what the user asked (quote
   it briefly) and what changed in the prompt.

Runtime AI prompts live in `src/main/ai/prompts.ts`. Changes there are product changes,
so log them the same way.

## Git conventions

See [AGENTS.md](AGENTS.md): Conventional Commits, no tickets, no attribution trailers.

## Layout

- `src/main/`: app lifecycle (`index.ts`), capture loop and summaries (`engine.ts`),
  screenshots and the frontmost window (`capture.ts`), notes and journal (`notes.ts`),
  settings and Keychain-encrypted keys (`settings.ts`), pending batch tracking
  (`batches.ts`), permissions, tray, windows, IPC.
- `src/main/ai/`: `provider.ts` (provider interface and selection), `anthropic.ts`
  (official `@anthropic-ai/sdk`), `gateway.ts` (AI SDK + `@ai-sdk/gateway`), `models.ts`
  (per-model API quirks), `prompts.ts`.
- `src/preload/`: `window.claptrap` bridge (built as CJS for the sandbox).
- `src/renderer/`: React UI (Settings, Permissions); `mock.ts` lets it run in a plain
  browser for UI work.
- `src/shared/`: types and Claptrap's voice lines. All lines are original; never quote
  the games.
- `scripts/gen-icons.mjs`: generates `resources/tray*Template.png` and `build/icon.png`.

## Commands

Use the Makefile (`make` lists everything): `make setup`, `make dev`, `make typecheck`,
`make build`, `make app` (build, sign, install to /Applications, launch), `make cert`
(one-time stable signing certificate), `make reset-permissions`, `make status`.
`make dist` re-signs with "Claptrap Dev" when that certificate exists, otherwise ad-hoc.
