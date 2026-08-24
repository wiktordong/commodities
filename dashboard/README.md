# Desk Planner

The daily planner artifact (React, runs in the claude.ai artifact runtime against
`window.storage`). Paste `desk_planner.jsx` back into the artifact to update it.

## Storage keys

| Key | Holds |
| --- | --- |
| `planner:<YYYY-MM-DD>` | one day — meetings, tasks, blocks, day log |
| `planner:bands` | market bands shown on the session tape |
| `planner:notes` | the notebook: every note, independent of any day |
| `planner:index` | list of dates that hold something, so Look back opens instantly |

`window.storage` exposes only `get` and `set` — there is no way to list keys — so
the planner keeps `planner:index` itself. Every save adds its date to the index.
Days written before the index existed are picked up by a one-off sweep the first
time Look back is opened: it probes ~460 dates (400 back, 60 forward) in batches
of 24, then writes the index and never sweeps again. If the runtime ever grows a
`storage.list`, `loadHistory` uses it in preference to the sweep.

## Views

- **Day** — unchanged, plus a Notebook panel for quick capture against that date.
- **Notes** — the whole notebook: search, `#tag` filter, pin, edit, copy as markdown.
- **Look back** — every day on record, newest first, with its log, closed-out
  tasks and notes; searchable across all of it; `Open →` jumps to that day.

Notes are tagged by writing `#eua`, `#cbam`, `#client-name` in the body.
