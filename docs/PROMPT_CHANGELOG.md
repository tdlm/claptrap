# Build Prompt Changelog

Every change to Claptrap's requirements, newest first. The current full prompt lives in
[PROMPT.md](PROMPT.md). Each entry records what was asked and what changed in the prompt,
so any revision can be reconstructed.

## Rev 9 — 2026-11-07 — Encrypted spool, retries and a regular-request fallback

- Asked: "I'd rather not lose captures. I want this thing to be robust and recover from
  lost sends." Chose: keep screenshots encrypted on disk until logged (over memory only),
  and fall back to regular requests after 3 hours (over never, or after 1 hour).
- Changed: screenshots are spooled encrypted with `safeStorage` from capture until their
  entry is written (replacing "screenshots never touch disk"); failed, cancelled,
  expired, refused or unparseable results are resent, up to 3 sends per capture; a batch
  out for 3 hours has its remaining captures sent as regular requests and is cancelled;
  the queue is rebuilt from the spool at launch, so quit no longer flushes; batches from
  before the spool are dropped after 24 hours; the "Capture & send now" menu label now
  shows its ampersand. README privacy section updated to match.

## Rev 8 — 2026-11-07 — Slow batches no longer block the log; Gateway captures parse

- Reported: "Sometimes Claptrap stops sending logs and then I open the window and it says
  Queued 1 and Thinking of 94." Two causes: (1) only the oldest batch was polled, and
  Gateway batches can stay pending for hours, so everything queued behind one; (2) the
  capture prompt never listed the categories, so on the Gateway path the model made up
  ones like "education", and zod rejected those replies silently. No entries had been
  logged since 11-05.
- Asked: "make the fix and unblock it".
- Changed: poll every in-flight batch and commit each as soon as it finishes, inserting
  lines into the note in time order; cancel and drop batches only after 24 hours; recaps
  and summaries stop waiting on a batch after 3 hours; the capture prompt (`prompts.ts`)
  lists the categories, and unknown ones map to `other`; every skipped result is logged
  with its reason; the menu and settings window show the oldest batch's age and the last
  status-check error.

## Rev 7 — 2026-10-07 — Makefile + stable signing

- Reported: after rebuilding and moving the app to /Applications, it "can't see
  anything" (the new ad-hoc signature invalidated the old Screen Recording grant).
- Asked: "add a Makefile and build these things into the make process so I can easily do
  these things".
- Added: a Makefile (setup/dev/build/dist/install/app/cert/reset-permissions/status/…),
  `scripts/make-cert.sh` for a self-signed "Claptrap Dev" code signing certificate, and
  automatic signing with it when present.

## Rev 6 — 2026-10-07 — Cost reductions

- Asked (after a cost estimate of ~$7–14/month): "Do 1 — I just changed the model to
  Sonnet 5.5. Please default it to that. Do 2 — for sure. Not 3. Not 4. Not 5 (for
  now). Do 6 but give me an option for this in Settings and default it to batch at once
  every 5 minutes, but give me options: every 30 seconds, every 5 minutes, every 30
  minutes, every hour."
- Changed:
  - Day summary model defaults to Sonnet 5.5 (was Opus 5.5). Hourly recaps now use the
    cheap capture model.
  - Thinking turned off for captures, where the model allows it.
  - Captures go through batch APIs at half price, with a Settings option for how often to
    send (30s / 5m default / 30m / 1h). Summaries wait for outstanding batches.
- Declined: lower screenshot resolution, longer capture interval, spending caps.

## Rev 5 — 2026-10-07 — Dev-mode permission hint

- Reported: "I don't see Claptrap in the list of apps" (Screen Recording, during `npm run dev`).
- Cause: unpackaged dev builds run `Electron.app`, and macOS credits the launching app.
- Changed: the permissions window explains this in dev mode, and is taller so it doesn't
  scroll. Packaging builds the `.icns` locally and reuses the installed Electron, so
  `npm run dist` needs no extra downloads.

## Rev 4 — 2026-10-07 — Renamed Marcus → Claptrap

- Asked: "let's rename this thing to claptrap (I'll handle the renaming of the folder)".
- Changed: app name, product name, bundle ID (`com.scottweaver.claptrap`), menu text,
  window titles, the preload bridge (`window.claptrap`), note markers
  (`<!-- claptrap:day-summary:… -->`), and the "Marcus says" section became
  "Claptrap says". The folder rename is left to the user.

## Rev 3 — 2026-10-07 — Personality + reproducible docs

- Asked: "I want it to have personality… keep docs on the prompt we used to actually
  build out the thing and any revisions to that prompt as we go so it's reproducible."
- Added: personality in UI copy throughout (original lines only), an opt-in in-character
  "Claptrap mode" section in day summaries (default on) while the log stays
  professional, and these two docs.
- Noted: personal tool only, will not be distributed.

## Rev 2 — 2026-10-07 — Borderlands 2 Claptrap aesthetic

- Asked: "I want it to look like Borderlands 2 Claptrap aesthetic."
- Added: the Look & feel section (cel-shaded comic style, palette, Bangers font, bolted
  plates, robot eye with moods, original artwork only, no game assets).

## Rev 1 — 2026-10-07 — Initial spec

Original request (paraphrased into the prompt): a Mac app, possibly Electron, called
Marcus that takes screenshots on an interval, feeds them through an AI model (AI Gateway
or Claude) to work out exactly what the user is doing, and logs it to a folder
(default `~/Notes/`). The model should be switchable. If Accessibility access is
needed, a modal should make granting and checking it quick (a button to jump to the
right pane, a green checkmark when granted). It should run in the menu bar (menu bar
only is fine).

Decisions from the Q&A:

| Question | Answer |
|---|---|
| Stack | Electron + TypeScript |
| Providers | Vercel AI Gateway + Anthropic API direct |
| Output | Daily log + hourly and daily summaries |
| Privacy | Pause submenu in the menu bar, app exclusion list, skip when idle/locked/unchanged, delete screenshots after analysis |

Assumed (not objected to): capture only the display with the active window; ad-hoc
signing unless an Apple Development certificate is available (none was found on the
machine).
