# ALIGN — Weekly Training

A single-file, no-build workout app that automatically rotates your weekly
program so training doesn't get monotonous, while keeping four things
constant every week:

- **Posture** — scapular/upper-back and thoracic work
- **Core** — deep abdominal and anti-rotation strength
- **ACL-safe knee training** — built for a post-ACL left knee: controlled
  tempo, pain-free range only, no pivoting or deep unsupported flexion
- **Endurance** — steady-state and interval cardio over max-effort lifting

Resistance work stays in an 8–15 rep hypertrophy range (no 1–5 rep max
work), so there's still real muscle-building stimulus without turning into
a pure strength/powerlifting block.

## How the rotation works

Each day of the week has a fixed *focus* (e.g. Tuesday is always
"Knee-Safe Legs + Intervals"), but the actual exercises are drawn from a
pool for that focus using the current [ISO week number](https://en.wikipedia.org/wiki/ISO_week_date)
as a seed. That means:

- The exercise selection changes automatically every week — no manual
  reprogramming.
- It's deterministic: reloading the page mid-week shows the same workout.
- Every 4th week is flagged as a **deload week** (lighter load, same
  movements) to keep the ACL-safe knee day and overall volume sustainable.
- A "Shuffle this day" button lets you reroll a specific day's picks on
  demand if you want more variety within the same week.

## Usage

No build step or dependencies — just open `index.html` in a browser.
Completion checkboxes persist locally via `localStorage`, scoped per
week/day, so progress resets naturally each new week.

This app is intentionally kept separate from `public/` (the commodities
morning-brief site) so it isn't touched by the daily brief workflow.
