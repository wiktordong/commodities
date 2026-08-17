# ALIGN Training

A weekly workout program that reshuffles its own exercises every week, so
training doesn't go stale without anyone replanning it. Installable to a
phone home screen and fully usable offline.

## What it trains

Built for a lean, athletic build — visible muscle without mass — around four
things that appear every single week:

- **Posture** — scapular and thoracic work, high frequency
- **Core** — weighted toward anti-rotation and anti-extension
- **ACL-safe knee work** — for a post-ACL left knee: pain-free range only, no
  pivoting, no deep unsupported flexion. Split across a strength day and a
  balance/proprioception day, with hamstring work (curls, Nordics) since
  hamstring strength is protective for a repaired ACL.
- **Endurance** — steady-state and intervals, all low-impact

Four of the seven days are real lifting sessions (back, chest, shoulders and
arms, plus posterior chain). Resistance work sits in the 8–15 rep hypertrophy
range rather than 1–5 rep max work.

## How the rotation works

Each weekday has a fixed **job** — Monday is always back, Wednesday always
chest. What changes is the **selection**: exercises are drawn from pools using
the ISO week number as the seed.

- Deterministic, so reloading mid-session gives the same workout, not a new one
- Changes automatically every Monday
- Every 4th week is flagged as a **deload**
- **Shuffle** rerolls a single day on demand

Pools are organised by movement **role**, not by muscle — `CHEST_PRESS`,
`CHEST_INCLINE`, `CHEST_FLY`, `TRICEPS` rather than one flat `PUSH` list. Each
day draws one exercise per role, which is what stops a session coming back as
four bench-press variations in a row. `build()` additionally skips any movement
already drawn that day, because some movements legitimately sit in two pools
(face pulls are both a back and a posture exercise).

## Files

- `index.html` — the whole app. No build step, no dependencies.
- `manifest.webmanifest`, `sw.js`, `icon-*.png` — PWA shell for offline install
- The published Artifact version is the same page minus the `<head>`, which
  that platform supplies itself

## Installing on a phone

Once deployed, open the URL in Safari (iOS) or Chrome (Android) and choose
**Add to Home Screen**. It then launches fullscreen with no browser chrome and
works with no signal — the service worker caches the whole shell on first load.

## Deploying

This directory sits inside `public/`, which the daily-brief workflow uploads to
GitHub Pages wholesale, so it deploys at `<pages-url>/workout/` with no extra
configuration. The brief generator only writes `index.html`, `archive.html` and
`briefs/`, so it never touches this folder.

It only goes live once this branch is merged into the repository's default
branch, since that's where the Pages workflow runs.

## Data

Progress is stored in the browser's `localStorage`, keyed per week and day. It
is therefore **per-device** and does not sync between phone and laptop; cross-
device sync would need a backend.

## Health note

Programming here is general fitness guidance, not medical or physiotherapy
advice. For a post-surgical knee in particular, clear load progressions with a
physio, and stop anything that feels sharp or unstable.
