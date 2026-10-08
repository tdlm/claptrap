# Claptrap

A hyperactive menu bar robot that watches what you do and writes it down.

Every 30 seconds or so, Claptrap screenshots your active display. A vision model
(through Vercel AI Gateway or the Anthropic API) works out what you're doing, and
Claptrap appends it to a daily Markdown note in `~/Notes/`. It also writes hourly
recaps and an end-of-day summary.

Screenshots are sent in batches (every 5 minutes by default; adjustable in Settings →
Brain → Budget), which costs half as much as live calls. New log lines show up once a
batch comes back, usually a few minutes later.

## Setup

Everything runs through `make` (type `make` to see all commands):

```bash
make setup
make dev
```

`make setup` installs the npm packages and fetches the Electron binary.

On first launch, Claptrap opens its permissions window and then Settings → **Brain**,
where you paste an API key for your provider.

### Install the real app

```bash
make cert
make app
make reset-permissions
```

- `make cert` (once): creates a self-signed "Claptrap Dev" code signing certificate in
  your login keychain. macOS asks for your password to trust it. Without it, builds are
  ad-hoc signed, and macOS forgets Claptrap's permissions after every rebuild.
- `make app`: builds, signs, quits the running copy (queued screenshots are sent
  first), replaces `/Applications/Claptrap.app`, and launches it.
- `make reset-permissions`: clears stale grants. Run it once after switching to the
  certificate, or after every rebuild if you're ad-hoc signed. Then grant access again in
  Claptrap's permissions window.

`make status` shows how the installed app is signed and whether it's running.

## Permissions

| Permission | Why | Required |
|---|---|---|
| Screen Recording | Taking the screenshots | Yes |
| Accessibility | Window titles and browser URLs, for more specific notes | No |
| Automation (browsers) | Reading the current tab's URL; macOS asks per browser on first use | No |

Gotchas:

- **Screen Recording needs a relaunch** after you grant it. The permissions window
  shows a Relaunch button when that's the case.
- **In `npm run dev`**, macOS gives the permission to whatever launched Electron
  (your terminal, or "Electron"), not to "Claptrap". Grant it there for development.
- **Ad-hoc signed builds lose their grants on every rebuild**, because macOS ties
  permissions to the code signature. `make cert` fixes this for good. Otherwise, run
  `make reset-permissions` after each rebuild and grant access again.
- Recent macOS versions sometimes ask you to re-confirm screen recording access.
  That's the OS, not Claptrap.

## Notes format

`~/Notes/2026-10-07.md`:

```markdown
# Wednesday, October 7, 2026

<!-- claptrap:day-summary:start -->
## Day Summary

Spent most of the day on the auth refactor…

### Highlights
- …

### Time spent
- ~2h 15m: auth refactor (coding)

### Claptrap says
MINION! What a day! …
<!-- claptrap:day-summary:end -->

## Log

- **10:42** Editing auth.ts, fixing token refresh — retry logic for 401s · _Visual Studio Code_
- **10:51** Reviewing PR #482 'Fix token refresh' on GitHub · _Google Chrome_

> **10:00–11:00 recap:** Worked through the token refresh bug and opened a PR for review.
```

The day summary is inserted between the comment markers, so feel free to edit the rest
of the file. A structured copy of every entry, used for the summaries, lives in
`~/Library/Application Support/Claptrap/journal/`.

## Privacy

- Screenshots are kept in memory only, until they're sent in the next batch (every 5 minutes
  by default), then scrubbed. They're never written to disk.
- Nothing is captured while you're idle, the screen is locked, Claptrap is napping
  (menu bar → Pause), or an excluded app is in front (1Password, Passwords, Keychain
  Access and Messages by default).
- Screenshots are sent to the AI provider you pick. Choose accordingly.

## Changing what gets built

The full build prompt is in [docs/PROMPT.md](docs/PROMPT.md), with its history in
[docs/PROMPT_CHANGELOG.md](docs/PROMPT_CHANGELOG.md).
