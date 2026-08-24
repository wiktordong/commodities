import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Calendar, Plus, Check, Trash2, RefreshCw, Sparkles, ChevronLeft, ChevronRight,
  Clock, X, NotebookPen, ListChecks, Users, AlertCircle, Loader2, Settings2,
  Search, Star, History, BookOpen,
} from "lucide-react";

/* ------------------------------------------------------------------ tokens */
const C = {
  ink: "#11222B",
  ink2: "#2A3E49",
  slate: "#6B7F88",
  line: "#CBD3D0",
  lineSoft: "#DFE5E2",
  paper: "#E9ECE9",
  panel: "#FFFFFF",
  moss: "#4F6B3A",
  mossSoft: "#E6EDDD",
  signal: "#C4463A",
  amber: "#9C7420",
  amberSoft: "#F2EBD8",
  ice: "#2F5D78",
  iceSoft: "#E1EAF0",
};
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const PX_PER_MIN = 0.95;

/* how far the one-off history sweep looks, when the store has no key listing */
const SWEEP_BACK_DAYS = 400;
const SWEEP_FWD_DAYS = 60;
const SWEEP_CHUNK = 24;

/* default market bands — editable in Settings */
const DEFAULT_BANDS = [
  { id: "b1", label: "EEX primary auction window", start: "09:00", end: "11:00", color: C.amber, soft: C.amberSoft },
  { id: "b2", label: "ICE EUA continuous session", start: "08:00", end: "18:00", color: C.ice, soft: C.iceSoft },
  { id: "b3", label: "US open", start: "15:30", end: "16:30", color: C.signal, soft: "#F6E3E1" },
];

const BLOCK_KINDS = {
  deep: { label: "Deep work", color: C.ink, soft: "#DCE3E6" },
  client: { label: "Client / calls", color: C.moss, soft: C.mossSoft },
  market: { label: "Market", color: C.ice, soft: C.iceSoft },
  admin: { label: "Admin", color: C.slate, soft: "#E4E9EA" },
};

const LOG_FIELDS = [
  ["moved", "What moved in the market"],
  ["did", "What I actually did"],
  ["friction", "What got in the way"],
  ["tomorrow", "First thing tomorrow"],
];

/* ------------------------------------------------------------------ helpers */
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const emptyDay = () => ({
  meetings: [], tasks: [], blocks: [],
  log: { moved: "", did: "", friction: "", tomorrow: "" },
});

const hasContent = (d) =>
  !!d && (
    (d.meetings || []).length > 0 ||
    (d.tasks || []).length > 0 ||
    (d.blocks || []).length > 0 ||
    LOG_FIELDS.some(([k]) => (d.log?.[k] || "").trim())
  );

const longDate = (key) =>
  parseKey(key).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/* #hashtags in the body become the note's tags */
const parseTags = (s) =>
  Array.from(new Set((s.match(/#[\p{L}\d_-]+/gu) || []).map((t) => t.slice(1).toLowerCase())));

/* ------------------------------------------------------------------ storage */
/* window.storage only gives us get/set, so the planner keeps its own index of
   which dates hold something. Days written before the index existed are picked
   up by a one-off sweep the first time you open Look back. */
const KEY_INDEX = "planner:index";
const KEY_NOTES = "planner:notes";
const dayKey = (k) => `planner:${k}`;

async function sget(key) {
  try { const r = await window.storage.get(key); return r?.value ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function sset(key, value) { await window.storage.set(key, JSON.stringify(value)); }

async function readIndex() {
  const idx = await sget(KEY_INDEX);
  return idx && Array.isArray(idx.dates) ? idx : { dates: [], swept: false };
}

/* called after every day save, so the index stays current without a re-sweep */
async function rememberDate(key) {
  try {
    const idx = await readIndex();
    if (idx.dates.includes(key)) return;
    await sset(KEY_INDEX, { ...idx, dates: [key, ...idx.dates].sort().reverse() });
  } catch { /* index is a convenience — never block a save on it */ }
}

function sweepCandidates() {
  const out = [];
  const base = new Date();
  for (let i = -SWEEP_FWD_DAYS; i <= SWEEP_BACK_DAYS; i++) out.push(toKey(addDays(base, -i)));
  return out;
}

/* Returns every day that holds something, newest first. */
async function loadHistory(onProgress) {
  const idx = await readIndex();
  const sweeping = !idx.swept;
  const found = new Map();

  const read = async (keys) => {
    for (let i = 0; i < keys.length; i += SWEEP_CHUNK) {
      const slice = keys.slice(i, i + SWEEP_CHUNK);
      const rows = await Promise.all(slice.map(async (k) => [k, await sget(dayKey(k))]));
      rows.forEach(([k, day]) => { if (hasContent(day)) found.set(k, { ...emptyDay(), ...day }); });
      if (onProgress) onProgress(Math.min(1, (i + SWEEP_CHUNK) / keys.length), sweeping);
    }
  };

  if (idx.swept) {
    await read(idx.dates);
  } else {
    let keys = [];
    try {
      if (typeof window.storage?.list === "function") {
        const raw = await window.storage.list("planner:");
        const arr = Array.isArray(raw) ? raw : raw?.keys || raw?.items || [];
        keys = arr
          .map((k) => (typeof k === "string" ? k : k?.key || ""))
          .filter((k) => /^planner:\d{4}-\d{2}-\d{2}$/.test(k))
          .map((k) => k.slice("planner:".length));
      }
    } catch { /* no listing api — fall back to the date sweep */ }
    if (!keys.length) keys = sweepCandidates();
    await read(keys);
    try { await sset(KEY_INDEX, { dates: [...found.keys()].sort().reverse(), swept: true }); }
    catch { /* we still have the results in memory for this session */ }
  }

  return [...found.entries()]
    .map(([key, day]) => ({ key, day }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

/* ------------------------------------------------------------------ shared UI */
const Eyebrow = ({ children, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
    <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.slate }}>
      {children}
    </span>
    {right}
  </div>
);

const Panel = ({ children, style }) => (
  <section style={{ background: C.panel, border: `1px solid ${C.lineSoft}`, padding: 16, ...style }}>{children}</section>
);

const Btn = ({ children, onClick, tone = "quiet", disabled, title, style }) => {
  const tones = {
    quiet: { background: "transparent", color: C.ink2, border: `1px solid ${C.line}` },
    solid: { background: C.ink, color: "#fff", border: `1px solid ${C.ink}` },
    moss: { background: C.moss, color: "#fff", border: `1px solid ${C.moss}` },
  };
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
        padding: "6px 10px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
        display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 2, ...tones[tone], ...style,
      }}
    >{children}</button>
  );
};

const Field = ({ mono, style, ...rest }) => (
  <input
    {...rest}
    style={{
      fontFamily: mono ? MONO : SANS, fontSize: 13, padding: "7px 9px", width: "100%",
      border: `1px solid ${C.line}`, background: "#FCFDFC", color: C.ink, borderRadius: 2, outline: "none", ...style,
    }}
  />
);

const Area = ({ style, ...rest }) => (
  <textarea
    {...rest}
    style={{
      width: "100%", fontFamily: SANS, fontSize: 13, lineHeight: 1.55, padding: "8px 9px",
      border: `1px solid ${C.line}`, background: "#FCFDFC", color: C.ink, borderRadius: 2,
      resize: "vertical", outline: "none", boxSizing: "border-box", ...style,
    }}
  />
);

/* note bodies render with #tags picked out */
const NoteBody = ({ text }) => (
  <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
    {text.split(/(#[\p{L}\d_-]+)/gu).map((part, i) =>
      part.startsWith("#") && part.length > 1
        ? <span key={i} style={{ color: C.moss, fontFamily: MONO, fontSize: 12 }}>{part}</span>
        : <React.Fragment key={i}>{part}</React.Fragment>
    )}
  </div>
);

/* ------------------------------------------------------------------ app */
export default function DeskPlanner() {
  const [view, setView] = useState("day"); // day | notes | history
  const [dateKey, setDateKey] = useState(() => toKey(new Date()));
  const [day, setDay] = useState(emptyDay);
  const [bands, setBands] = useState(DEFAULT_BANDS);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());
  const [narrow, setNarrow] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // 'sync' | 'draft' | 'log'
  const [showBands, setShowBands] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const saveTimer = useRef(null);

  const today = toKey(new Date());
  const isToday = dateKey === today;
  const dateObj = parseKey(dateKey);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    const onResize = () => setNarrow(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => { clearInterval(t); window.removeEventListener("resize", onResize); };
  }, []);

  /* load day */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let loaded = emptyDay();
      try {
        const r = await window.storage.get(dayKey(dateKey));
        if (r?.value) loaded = { ...emptyDay(), ...JSON.parse(r.value) };
      } catch { /* no entry for this date yet */ }
      try {
        const b = await window.storage.get("planner:bands");
        if (b?.value && alive) setBands(JSON.parse(b.value));
      } catch { /* keep defaults */ }
      if (alive) { setDay(loaded); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [dateKey]);

  /* load the notebook once — it is not tied to a date */
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await sget(KEY_NOTES);
      if (alive && Array.isArray(stored)) setNotes(stored);
    })();
    return () => { alive = false; };
  }, []);

  /* debounced save */
  const persist = useCallback((next) => {
    setDay(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await window.storage.set(dayKey(dateKey), JSON.stringify(next));
        if (hasContent(next)) await rememberDate(dateKey);
      }
      catch { setNotice("Couldn't save that change. Try again in a moment."); }
      setSaving(false);
    }, 450);
  }, [dateKey]);

  const saveBands = async (next) => {
    setBands(next);
    try { await window.storage.set("planner:bands", JSON.stringify(next)); } catch { /* non-critical */ }
  };

  /* ---------------------------------------------------------------- notebook */
  const persistNotes = useCallback(async (next) => {
    setNotes(next);
    try { await sset(KEY_NOTES, next); }
    catch { setNotice("Couldn't save the notebook. Your note is still on screen — try again."); }
  }, []);

  const addNote = useCallback((body, stamp) => {
    const text = (body || "").trim();
    if (!text) return;
    const ts = new Date().toISOString();
    persistNotes([
      { id: uid(), body: text, tags: parseTags(text), pinned: false, date: stamp || toKey(new Date()), created: ts, updated: ts },
      ...notes,
    ]);
  }, [notes, persistNotes]);

  const updateNote = useCallback((id, body) => {
    const text = (body || "").trim();
    if (!text) return;
    persistNotes(notes.map((n) => (n.id === id ? { ...n, body: text, tags: parseTags(text), updated: new Date().toISOString() } : n)));
  }, [notes, persistNotes]);

  const dropNote = useCallback((id) => persistNotes(notes.filter((n) => n.id !== id)), [notes, persistNotes]);
  const pinNote = useCallback((id) => persistNotes(notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))), [notes, persistNotes]);

  /* ---------------------------------------------------------------- api */
  const callClaude = async (prompt, useCalendar) => {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    };
    if (useCalendar) {
      body.mcp_servers = [{ type: "url", url: "https://calendarmcp.googleapis.com/mcp/v1", name: "google-calendar" }];
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const tool = (data.content || []).filter((b) => b.type === "mcp_tool_result")
      .map((b) => b?.content?.[0]?.text || "").join("\n");
    return { text, tool };
  };

  const parseJson = (raw) => {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start === -1 || end === -1) throw new Error("no json");
    return JSON.parse(cleaned.slice(start, end + 1));
  };

  const syncCalendar = async () => {
    setBusy("sync"); setNotice(null);
    try {
      const { text } = await callClaude(
        `Look up my Google Calendar events for ${dateKey} (local time, Europe/Warsaw). ` +
        `Respond with ONLY a JSON array, no prose or markdown. Each item: ` +
        `{"title":string,"start":"HH:MM","end":"HH:MM","who":string}. ` +
        `"who" = other attendees' names or the organiser, "" if none. If there are no events, return [].`,
        true
      );
      const events = parseJson(text);
      const existing = new Set(day.meetings.map((m) => `${m.start}|${m.title.toLowerCase()}`));
      const fresh = events
        .filter((e) => e.start && e.title && !existing.has(`${e.start}|${e.title.toLowerCase()}`))
        .map((e) => ({ id: uid(), title: e.title, start: e.start, end: e.end || hhmm(mins(e.start) + 30), who: e.who || "", source: "calendar" }));
      if (!fresh.length) setNotice("Calendar is up to date — nothing new for this day.");
      persist({ ...day, meetings: [...day.meetings, ...fresh].sort((a, b) => mins(a.start) - mins(b.start)) });
    } catch {
      setNotice("Calendar didn't return anything usable. Check the Google Calendar connector is on, or add the meeting by hand below.");
    }
    setBusy(null);
  };

  const draftDay = async () => {
    setBusy("draft"); setNotice(null);
    try {
      const open = day.tasks.filter((t) => !t.done).map((t) => `- ${t.text}${t.must ? " [must]" : ""}`).join("\n") || "none";
      const busySlots = day.meetings.map((m) => `${m.start}-${m.end} ${m.title}`).join("; ") || "none";
      const { text } = await callClaude(
        `You are scheduling the working day of a sales & trading manager in environmental commodities (EU ETS, CBAM, biomethane, FuelEU Maritime) covering Polish and CEE clients. Date: ${dateKey}.\n` +
        `Fixed meetings: ${busySlots}\nOpen tasks:\n${open}\n\n` +
        `Build a realistic block plan between 07:30 and 18:00 Warsaw time that works around the meetings. ` +
        `Front-load client outreach into European market hours, protect one uninterrupted deep-work block, leave a short slot for the market open and one for the close. ` +
        `Do not overlap the fixed meetings. Respond with ONLY a JSON array, no prose: ` +
        `[{"title":string,"start":"HH:MM","end":"HH:MM","kind":"deep"|"client"|"market"|"admin"}]`
      );
      const blocks = parseJson(text)
        .filter((b) => b.start && b.end && b.title)
        .map((b) => ({ id: uid(), title: b.title, start: b.start, end: b.end, kind: BLOCK_KINDS[b.kind] ? b.kind : "admin" }));
      if (!blocks.length) throw new Error("empty");
      persist({ ...day, blocks });
    } catch {
      setNotice("Couldn't draft the plan. Add a task or two first, then try again.");
    }
    setBusy(null);
  };

  const tidyLog = async () => {
    setBusy("log"); setNotice(null);
    try {
      const done = day.tasks.filter((t) => t.done).map((t) => t.text).join("; ") || "none logged";
      const met = day.meetings.map((m) => `${m.title}${m.who ? ` (${m.who})` : ""}`).join("; ") || "none";
      const { text } = await callClaude(
        `Turn these rough end-of-day notes from a carbon and environmental commodities trader into a tight diary entry. ` +
        `Keep his own words and specifics where possible, fix only structure and grammar. No preamble, no headings, no markdown — just 3-6 sentences of plain prose in the first person.\n\n` +
        `Date: ${dateKey}\nMeetings: ${met}\nCompleted: ${done}\n` +
        `Market note: ${day.log.moved || "—"}\nWhat I did: ${day.log.did || "—"}\nFriction: ${day.log.friction || "—"}`
      );
      const clean = text.replace(/```/g, "").trim();
      if (!clean) throw new Error("empty");
      persist({ ...day, log: { ...day.log, did: clean } });
    } catch {
      setNotice("Couldn't tidy the entry. Your notes are untouched.");
    }
    setBusy(null);
  };

  /* ---------------------------------------------------------------- mutations */
  const addMeeting = (m) => persist({ ...day, meetings: [...day.meetings, { ...m, id: uid(), source: "manual" }].sort((a, b) => mins(a.start) - mins(b.start)) });
  const dropMeeting = (id) => persist({ ...day, meetings: day.meetings.filter((m) => m.id !== id) });
  const addBlock = (b) => persist({ ...day, blocks: [...day.blocks, { ...b, id: uid() }] });
  const dropBlock = (id) => persist({ ...day, blocks: day.blocks.filter((b) => b.id !== id) });
  const addTask = (text, must) => persist({ ...day, tasks: [...day.tasks, { id: uid(), text, must, done: false }] });
  const toggleTask = (id) => persist({ ...day, tasks: day.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });
  const dropTask = (id) => persist({ ...day, tasks: day.tasks.filter((t) => t.id !== id) });
  const setLog = (k, v) => persist({ ...day, log: { ...day.log, [k]: v } });

  const carryOver = async () => {
    const open = day.tasks.filter((t) => !t.done);
    if (!open.length) { setNotice("Nothing open to carry over."); return; }
    const nextKey = toKey(addDays(dateObj, 1));
    let target = emptyDay();
    try { const r = await window.storage.get(dayKey(nextKey)); if (r?.value) target = { ...emptyDay(), ...JSON.parse(r.value) }; } catch { /* new day */ }
    const merged = { ...target, tasks: [...target.tasks, ...open.map((t) => ({ ...t, id: uid() }))] };
    try {
      await window.storage.set(dayKey(nextKey), JSON.stringify(merged));
      await rememberDate(nextKey);
      persist({ ...day, tasks: day.tasks.filter((t) => t.done) });
      setNotice(`Moved ${open.length} open task${open.length > 1 ? "s" : ""} to ${nextKey}.`);
    } catch { setNotice("Couldn't move those tasks. Try again."); }
  };

  const openDay = (key) => { setDateKey(key); setView("day"); };

  /* ---------------------------------------------------------------- derived */
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMin >= DAY_START && nowMin <= DAY_END;
  const nextUp = useMemo(() => {
    if (!isToday) return day.meetings[0];
    return day.meetings.find((m) => mins(m.end) >= nowMin);
  }, [day.meetings, nowMin, isToday]);

  const notesToday = useMemo(() => notes.filter((n) => n.date === dateKey), [notes, dateKey]);

  const dayLabel = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const relative = dateKey === today ? "Today" : dateKey === toKey(addDays(new Date(), 1)) ? "Tomorrow"
    : dateKey === toKey(addDays(new Date(), -1)) ? "Yesterday" : null;

  const heading = view === "notes" ? "Notebook" : view === "history" ? "Look back" : dayLabel;
  const eyebrow = view === "notes" ? "Everything you've written down"
    : view === "history" ? "Every day you've logged"
    : "Desk day · Warsaw";

  /* ---------------------------------------------------------------- render */
  return (
    <div style={{ background: C.paper, color: C.ink, fontFamily: SANS, minHeight: "100%", padding: narrow ? 12 : 20 }}>
      {/* masthead */}
      <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: C.moss }}>
              {eyebrow}
            </div>
            <h1 style={{ fontFamily: MONO, fontSize: narrow ? 22 : 28, fontWeight: 600, letterSpacing: "-0.01em", margin: "4px 0 0" }}>
              {heading}
              {view === "day" && relative && <span style={{ color: C.slate, fontSize: 14, marginLeft: 10, letterSpacing: "0.1em" }}>{relative.toUpperCase()}</span>}
            </h1>
          </div>
          {view === "day" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Btn onClick={() => setDateKey(toKey(addDays(dateObj, -1)))} title="Previous day"><ChevronLeft size={13} /></Btn>
              <Btn onClick={() => setDateKey(today)} tone={isToday ? "solid" : "quiet"}>Today</Btn>
              <Btn onClick={() => setDateKey(toKey(addDays(new Date(), 1)))}>Tomorrow</Btn>
              <Btn onClick={() => setDateKey(toKey(addDays(dateObj, 1)))} title="Next day"><ChevronRight size={13} /></Btn>
              <div style={{ fontFamily: MONO, fontSize: 13, color: C.ink2, marginLeft: 4, minWidth: 46, textAlign: "right" }}>
                {pad(now.getHours())}:{pad(now.getMinutes())}
              </div>
            </div>
          )}
        </div>
        {view === "day" && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", fontFamily: MONO, fontSize: 11.5, color: C.slate }}>
            <span>{day.meetings.length} meeting{day.meetings.length === 1 ? "" : "s"}</span>
            <span>{day.tasks.filter((t) => !t.done).length} open · {day.tasks.filter((t) => t.done).length} done</span>
            {notesToday.length > 0 && <span>{notesToday.length} note{notesToday.length === 1 ? "" : "s"}</span>}
            {nextUp && <span style={{ color: C.signal }}>Next: {nextUp.start} {nextUp.title}</span>}
            {saving && <span>saving…</span>}
          </div>
        )}
      </header>

      {/* view switch */}
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Btn onClick={() => setView("day")} tone={view === "day" ? "solid" : "quiet"}><Calendar size={12} /> Day</Btn>
        <Btn onClick={() => setView("notes")} tone={view === "notes" ? "solid" : "quiet"}>
          <BookOpen size={12} /> Notes{notes.length ? ` · ${notes.length}` : ""}
        </Btn>
        <Btn onClick={() => setView("history")} tone={view === "history" ? "solid" : "quiet"}><History size={12} /> Look back</Btn>
      </nav>

      {notice && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FFF8E8", border: `1px solid ${C.amber}`, padding: "9px 12px", marginBottom: 14, fontSize: 13 }}>
          <AlertCircle size={15} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={14} /></button>
        </div>
      )}

      {view === "notes" && (
        <NotesView
          notes={notes}
          onAdd={addNote} onUpdate={updateNote} onDrop={dropNote} onPin={pinNote} onOpenDay={openDay}
        />
      )}

      {view === "history" && (
        <HistoryView notes={notes} today={today} onOpenDay={openDay} />
      )}

      {view === "day" && (loading ? (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.slate, padding: 40, textAlign: "center" }}>Opening the day…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.05fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          {/* -------------------------------------------------- timeline */}
          <Panel style={{ padding: 0 }}>
            <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <Eyebrow right={
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn onClick={() => setShowBands((s) => !s)} title="Edit market bands"><Settings2 size={12} /></Btn>
                  <Btn onClick={draftDay} tone="moss" disabled={busy === "draft"}>
                    {busy === "draft" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Draft the day
                  </Btn>
                </div>
              }>Session tape</Eyebrow>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontFamily: MONO, fontSize: 10, color: C.slate }}>
                {bands.map((b) => (
                  <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <i style={{ width: 8, height: 8, background: b.soft, border: `1px solid ${b.color}`, display: "inline-block" }} />
                    {b.label} {b.start}–{b.end}
                  </span>
                ))}
              </div>
            </div>

            {showBands && (
              <div style={{ padding: "12px 16px", background: "#F7F9F7", borderBottom: `1px solid ${C.lineSoft}` }}>
                {bands.map((b, i) => (
                  <div key={b.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <Field value={b.label} onChange={(e) => saveBands(bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <Field mono value={b.start} onChange={(e) => saveBands(bands.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} style={{ width: 74 }} />
                    <Field mono value={b.end} onChange={(e) => saveBands(bands.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} style={{ width: 74 }} />
                    <Btn onClick={() => saveBands(bands.filter((_, j) => j !== i))}><Trash2 size={12} /></Btn>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>
                  Times are yours to set — check them against your venue calendars before you rely on them.
                </div>
              </div>
            )}

            <Timeline
              day={day} bands={bands} showNow={showNow} nowMin={nowMin}
              onDropBlock={dropBlock} onDropMeeting={dropMeeting}
              onPickSlot={(m) => setPrefill(hhmm(Math.round(m / 15) * 15))}
            />

            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.lineSoft}` }}>
              <BlockAdder prefill={prefill} onAdd={(b) => { addBlock(b); setPrefill(null); }} />
            </div>
          </Panel>

          {/* -------------------------------------------------- right rail */}
          <div style={{ display: "grid", gap: 16 }}>
            <Panel>
              <Eyebrow right={
                <Btn onClick={syncCalendar} disabled={busy === "sync"}>
                  {busy === "sync" ? <Loader2 size={12} /> : <RefreshCw size={12} />} Pull from calendar
                </Btn>
              }><Users size={11} style={{ display: "inline", marginRight: 6, verticalAlign: -1 }} />Meetings</Eyebrow>

              {day.meetings.length === 0 && (
                <p style={{ fontSize: 13, color: C.slate, margin: "0 0 12px" }}>
                  Nothing booked yet. Pull from your calendar, or add one below.
                </p>
              )}
              {day.meetings.map((m) => {
                const past = isToday && mins(m.end) < nowMin;
                return (
                  <div key={m.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: `1px solid ${C.lineSoft}`, opacity: past ? 0.5 : 1 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink2, minWidth: 82 }}>{m.start}–{m.end}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.title}</div>
                      {m.who && <div style={{ fontSize: 12, color: C.slate }}>{m.who}</div>}
                    </div>
                    <button onClick={() => dropMeeting(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }} title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
              <MeetingAdder onAdd={addMeeting} />
            </Panel>

            <Panel>
              <Eyebrow right={<Btn onClick={carryOver} title="Move open tasks to tomorrow">Carry over →</Btn>}>
                <ListChecks size={11} style={{ display: "inline", marginRight: 6, verticalAlign: -1 }} />Tasks
              </Eyebrow>
              <TaskAdder onAdd={addTask} />
              {day.tasks.length === 0 && (
                <p style={{ fontSize: 13, color: C.slate, margin: "12px 0 0" }}>
                  Start with the two or three things that would make today count. Mark those as must-do.
                </p>
              )}
              <div style={{ marginTop: 10 }}>
                {[...day.tasks].sort((a, b) => (a.done - b.done) || (b.must - a.must)).map((t) => (
                  <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: `1px solid ${C.lineSoft}` }}>
                    <button onClick={() => toggleTask(t.id)} title={t.done ? "Reopen" : "Mark done"}
                      style={{
                        width: 17, height: 17, flexShrink: 0, marginTop: 1, cursor: "pointer", borderRadius: 2,
                        border: `1px solid ${t.done ? C.moss : C.line}`, background: t.done ? C.moss : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      }}>
                      {t.done && <Check size={11} color="#fff" />}
                    </button>
                    <span style={{ flex: 1, fontSize: 13.5, textDecoration: t.done ? "line-through" : "none", color: t.done ? C.slate : C.ink }}>
                      {t.must && !t.done && <b style={{ color: C.signal, fontFamily: MONO, fontSize: 10, marginRight: 6 }}>MUST</b>}
                      {t.text}
                    </span>
                    <button onClick={() => dropTask(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </Panel>

            {/* quick capture — files straight into the notebook, stamped with this day */}
            <Panel>
              <Eyebrow right={<Btn onClick={() => setView("notes")}>All notes →</Btn>}>
                <BookOpen size={11} style={{ display: "inline", marginRight: 6, verticalAlign: -1 }} />Notebook
              </Eyebrow>
              <NoteComposer
                placeholder="Something worth keeping — client intel, a level, a thought. #tag it to find it later."
                onSave={(t) => addNote(t, dateKey)}
                rows={2}
              />
              {notesToday.length === 0 ? (
                <p style={{ fontSize: 13, color: C.slate, margin: "12px 0 0" }}>
                  Nothing filed on this day yet. Notes you save here stay in the notebook — they don't disappear with the day.
                </p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {notesToday.map((n) => (
                    <div key={n.id} style={{ padding: "9px 0", borderTop: `1px solid ${C.lineSoft}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}><NoteBody text={n.body} /></div>
                      <button onClick={() => dropNote(n.id)} title="Delete note"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel>
              <Eyebrow right={
                <Btn onClick={tidyLog} disabled={busy === "log"}>
                  {busy === "log" ? <Loader2 size={12} /> : <Sparkles size={12} />} Tidy entry
                </Btn>
              }><NotebookPen size={11} style={{ display: "inline", marginRight: 6, verticalAlign: -1 }} />Day log</Eyebrow>
              {LOG_FIELDS.map(([k, label]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.slate }}>{label}</label>
                  <Area value={day.log[k]} onChange={(e) => setLog(k, e.target.value)} rows={k === "did" ? 4 : 2} style={{ marginTop: 5 }} />
                </div>
              ))}
            </Panel>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ notebook */
function NoteComposer({ onSave, placeholder, rows = 3, initial = "", onCancel, autoFocus }) {
  const [text, setText] = useState(initial);
  const submit = () => { if (!text.trim()) return; onSave(text); setText(""); };
  return (
    <div>
      <Area
        value={text} rows={rows} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <Btn onClick={submit} tone="moss" disabled={!text.trim()}><Plus size={12} /> Save note</Btn>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.slate }}>⌘/Ctrl + Enter</span>
      </div>
    </div>
  );
}

function NotesView({ notes, onAdd, onUpdate, onDrop, onPin, onOpenDay }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState(null);
  const [editing, setEditing] = useState(null);

  const tags = useMemo(() => {
    const counts = new Map();
    notes.forEach((n) => (n.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return notes
      .filter((n) => !tag || (n.tags || []).includes(tag))
      .filter((n) => !needle || n.body.toLowerCase().includes(needle) || (n.date || "").includes(needle))
      .sort((a, b) => (b.pinned - a.pinned) || String(b.updated || "").localeCompare(String(a.updated || "")));
  }, [notes, q, tag]);

  const copyAll = async () => {
    const md = shown.map((n) => `## ${n.date}\n\n${n.body}\n`).join("\n");
    try { await navigator.clipboard.writeText(md); } catch { /* clipboard blocked — nothing to undo */ }
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 880 }}>
      <Panel>
        <Eyebrow>New note</Eyebrow>
        <NoteComposer
          placeholder="Anything you want back later. Use #eua, #cbam, #client-name to file it."
          onSave={(t) => onAdd(t)}
        />
      </Panel>

      <Panel>
        <Eyebrow right={shown.length > 0 ? <Btn onClick={copyAll} title="Copy the notes below as markdown">Copy</Btn> : null}>
          {notes.length} note{notes.length === 1 ? "" : "s"} kept
          {shown.length !== notes.length ? ` · ${shown.length} shown` : ""}
        </Eyebrow>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <Search size={14} style={{ color: C.slate, flexShrink: 0 }} />
          <Field placeholder="Search your notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            {tag && <Btn onClick={() => setTag(null)} tone="solid"><X size={11} /> #{tag}</Btn>}
            {!tag && tags.slice(0, 14).map(([t, count]) => (
              <button key={t} onClick={() => setTag(t)}
                style={{
                  fontFamily: MONO, fontSize: 11, padding: "4px 8px", cursor: "pointer", borderRadius: 2,
                  border: `1px solid ${C.line}`, background: "transparent", color: C.moss,
                }}>#{t} <span style={{ color: C.slate }}>{count}</span></button>
            ))}
          </div>
        )}

        {notes.length === 0 && (
          <p style={{ fontSize: 13.5, color: C.slate, margin: "14px 0 0", lineHeight: 1.6 }}>
            Nothing in the notebook yet. This is the long-memory half of the planner — notes live here
            independently of any one day, so a level you wrote down in April is still one search away in December.
          </p>
        )}
        {notes.length > 0 && shown.length === 0 && (
          <p style={{ fontSize: 13, color: C.slate, margin: "14px 0 0" }}>Nothing matches that.</p>
        )}

        <div style={{ marginTop: 6 }}>
          {shown.map((n) => (
            <div key={n.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 5, flexWrap: "wrap" }}>
                <button onClick={() => onOpenDay(n.date)} title="Open that day"
                  style={{ fontFamily: MONO, fontSize: 11, color: C.ice, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  {longDate(n.date)}
                </button>
                {n.updated && n.updated !== n.created && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.slate }}>edited</span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => onPin(n.id)} title={n.pinned ? "Unpin" : "Pin to the top"}
                    style={{ background: "none", border: "none", cursor: "pointer", color: n.pinned ? C.amber : C.slate, padding: 0, display: "flex" }}>
                    <Star size={13} fill={n.pinned ? C.amber : "none"} />
                  </button>
                  <button onClick={() => setEditing(editing === n.id ? null : n.id)} title="Edit"
                    style={{ fontFamily: MONO, fontSize: 10.5, background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                    {editing === n.id ? "Close" : "Edit"}
                  </button>
                  <button onClick={() => onDrop(n.id)} title="Delete note"
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0, display: "flex" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {editing === n.id ? (
                <NoteComposer
                  initial={n.body} rows={4} autoFocus
                  onSave={(t) => { onUpdate(n.id, t); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : <NoteBody text={n.body} />}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ look back */
function HistoryView({ notes, today, onOpenDay }) {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [progress, setProgress] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const [days, setDays] = useState([]);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await loadHistory((p, isSweep) => {
          if (!alive) return;
          setProgress(p);
          if (isSweep) setSweeping(true);
        });
        if (alive) { setDays(rows); setState("ready"); }
      } catch { if (alive) setState("error"); }
    })();
    return () => { alive = false; };
  }, []);

  const notesByDate = useMemo(() => {
    const m = new Map();
    notes.forEach((n) => { if (!m.has(n.date)) m.set(n.date, []); m.get(n.date).push(n); });
    return m;
  }, [notes]);

  /* every date that holds a logged day OR a note, newest first */
  const rows = useMemo(() => {
    const keys = new Set(days.map((d) => d.key));
    notesByDate.forEach((_, k) => keys.add(k));
    const byKey = new Map(days.map((d) => [d.key, d.day]));
    return [...keys].sort().reverse().map((key) => ({ key, day: byKey.get(key) || emptyDay(), notes: notesByDate.get(key) || [] }));
  }, [days, notesByDate]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(({ key, day, notes: ns }) =>
      key.includes(needle) ||
      longDate(key).toLowerCase().includes(needle) ||
      LOG_FIELDS.some(([k]) => (day.log?.[k] || "").toLowerCase().includes(needle)) ||
      (day.tasks || []).some((t) => t.text.toLowerCase().includes(needle)) ||
      (day.meetings || []).some((m) => `${m.title} ${m.who || ""}`.toLowerCase().includes(needle)) ||
      (day.blocks || []).some((b) => b.title.toLowerCase().includes(needle)) ||
      ns.some((n) => n.body.toLowerCase().includes(needle))
    );
  }, [rows, q]);

  if (state === "loading") {
    return (
      <Panel>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.slate, padding: "30px 0", textAlign: "center" }}>
          Reading back through your days… {Math.round(progress * 100)}%
          {sweeping && (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.slate, maxWidth: 420, margin: "10px auto 0", lineHeight: 1.5 }}>
              First time only — the planner is building an index of the days you've already saved.
              After this it opens straight away.
            </div>
          )}
        </div>
      </Panel>
    );
  }

  if (state === "error") {
    return (
      <Panel>
        <p style={{ fontSize: 13.5, color: C.slate, margin: 0 }}>
          Couldn't read the history back. Switch to Day and back to try again.
        </p>
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 880 }}>
      <Panel>
        <Eyebrow>{rows.length} day{rows.length === 1 ? "" : "s"} on record{shown.length !== rows.length ? ` · ${shown.length} shown` : ""}</Eyebrow>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Search size={14} style={{ color: C.slate, flexShrink: 0 }} />
          <Field placeholder="Search logs, tasks, meetings, notes…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(20); }} />
        </div>
        {rows.length === 0 && (
          <p style={{ fontSize: 13.5, color: C.slate, margin: "14px 0 0", lineHeight: 1.6 }}>
            Nothing logged yet. Fill in a day log or save a note and it will show up here from then on.
          </p>
        )}
      </Panel>

      {shown.slice(0, limit).map(({ key, day, notes: ns }) => {
        const done = (day.tasks || []).filter((t) => t.done);
        const open = (day.tasks || []).filter((t) => !t.done);
        return (
          <Panel key={key}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <h3 style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, margin: 0 }}>{longDate(key)}</h3>
              {key === today && <span style={{ fontFamily: MONO, fontSize: 10, color: C.moss, letterSpacing: "0.1em" }}>TODAY</span>}
              <div style={{ marginLeft: "auto" }}><Btn onClick={() => onOpenDay(key)}>Open →</Btn></div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: MONO, fontSize: 11, color: C.slate, marginBottom: 10 }}>
              {(day.meetings || []).length > 0 && <span>{day.meetings.length} meeting{day.meetings.length === 1 ? "" : "s"}</span>}
              {done.length > 0 && <span>{done.length} done</span>}
              {open.length > 0 && <span>{open.length} left open</span>}
              {ns.length > 0 && <span>{ns.length} note{ns.length === 1 ? "" : "s"}</span>}
            </div>

            {LOG_FIELDS.filter(([k]) => (day.log?.[k] || "").trim()).map(([k, label]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.slate, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{day.log[k]}</div>
              </div>
            ))}

            {done.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.slate, marginBottom: 5 }}>Closed out</div>
                {done.map((t) => (
                  <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.ink2, marginBottom: 3 }}>
                    <Check size={12} style={{ color: C.moss, flexShrink: 0, marginTop: 3 }} />
                    <span>{t.text}</span>
                  </div>
                ))}
              </div>
            )}

            {ns.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: C.slate, marginBottom: 6 }}>Notes</div>
                {ns.map((n) => (
                  <div key={n.id} style={{ borderLeft: `2px solid ${C.mossSoft}`, paddingLeft: 10, marginBottom: 8 }}>
                    <NoteBody text={n.body} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        );
      })}

      {shown.length > limit && (
        <Btn onClick={() => setLimit((l) => l + 20)} style={{ justifySelf: "start" }}>
          Show {Math.min(20, shown.length - limit)} more
        </Btn>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ timeline */
function Timeline({ day, bands, showNow, nowMin, onDropBlock, onDropMeeting, onPickSlot }) {
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const y = (m) => (Math.max(DAY_START, Math.min(DAY_END, m)) - DAY_START) * PX_PER_MIN;
  const hours = [];
  for (let h = DAY_START; h <= DAY_END; h += 60) hours.push(h);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onPickSlot(DAY_START + (e.clientY - rect.top) / PX_PER_MIN);
  };

  return (
    <div style={{ display: "flex", padding: "12px 16px 16px" }}>
      <div style={{ width: 46, flexShrink: 0, position: "relative", height }}>
        {hours.map((h) => (
          <div key={h} style={{ position: "absolute", top: y(h) - 6, fontFamily: MONO, fontSize: 10.5, color: C.slate }}>{hhmm(h)}</div>
        ))}
      </div>

      <div onClick={handleClick} style={{ position: "relative", flex: 1, height, borderLeft: `1px solid ${C.line}`, cursor: "copy" }}>
        {/* market bands */}
        {bands.map((b) => (
          <div key={b.id} style={{
            position: "absolute", left: 0, right: 0, top: y(mins(b.start)), height: Math.max(2, y(mins(b.end)) - y(mins(b.start))),
            background: b.soft, borderTop: `1px solid ${b.color}33`, borderBottom: `1px solid ${b.color}33`,
          }} />
        ))}
        {/* hour rules */}
        {hours.map((h) => (
          <div key={h} style={{ position: "absolute", left: 0, right: 0, top: y(h), height: 1, background: C.lineSoft }} />
        ))}

        {/* work blocks */}
        {day.blocks.map((b) => {
          const kind = BLOCK_KINDS[b.kind] || BLOCK_KINDS.admin;
          const top = y(mins(b.start));
          const h = Math.max(16, y(mins(b.end)) - top);
          return (
            <div key={b.id} onClick={(e) => e.stopPropagation()} style={{
              position: "absolute", left: 6, right: "42%", top, height: h, background: kind.soft,
              borderLeft: `3px solid ${kind.color}`, padding: "3px 6px", overflow: "hidden", cursor: "default",
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.25 }}>{b.title}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.slate }}>{b.start}–{b.end}</div>
              <button onClick={() => onDropBlock(b.id)} style={{ position: "absolute", top: 2, right: 2, background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2 }}>
                <X size={11} />
              </button>
            </div>
          );
        })}

        {/* meetings */}
        {day.meetings.map((m) => {
          const top = y(mins(m.start));
          const h = Math.max(18, y(mins(m.end)) - top);
          return (
            <div key={m.id} onClick={(e) => e.stopPropagation()} style={{
              position: "absolute", left: "60%", right: 6, top, height: h, background: C.ink,
              color: "#F4F7F5", padding: "3px 7px", overflow: "hidden",
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.25 }}>{m.title}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.7 }}>{m.start}–{m.end}{m.who ? ` · ${m.who}` : ""}</div>
              <button onClick={() => onDropMeeting(m.id)} style={{ position: "absolute", top: 2, right: 2, background: "none", border: "none", cursor: "pointer", color: "#9FB1AC", padding: 2 }}>
                <X size={11} />
              </button>
            </div>
          );
        })}

        {/* live marker */}
        {showNow && (
          <div style={{ position: "absolute", left: -6, right: 0, top: y(nowMin), height: 0, zIndex: 5 }}>
            <div style={{ height: 2, background: C.signal }} />
            <div style={{
              position: "absolute", left: -44, top: -8, fontFamily: MONO, fontSize: 10, color: "#fff",
              background: C.signal, padding: "1px 4px",
            }}>{hhmm(nowMin)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ adders */
function BlockAdder({ onAdd, prefill }) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [dur, setDur] = useState(60);
  const [kind, setKind] = useState("deep");

  useEffect(() => { if (prefill) setStart(prefill); }, [prefill]);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), start, end: hhmm(Math.min(DAY_END, mins(start) + Number(dur))), kind });
    setTitle("");
  };

  return (
    <div>
      <Eyebrow>Add a block <span style={{ textTransform: "none", letterSpacing: 0 }}>— or click the tape to set a time</span></Eyebrow>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Field placeholder="Block name, e.g. CBAM pricing for Manuchar" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ flex: "2 1 200px", width: "auto" }} />
        <Field mono type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 108 }} />
        <select value={dur} onChange={(e) => setDur(e.target.value)}
          style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.line}`, background: "#FCFDFC", padding: "7px 6px", borderRadius: 2 }}>
          {[30, 45, 60, 90, 120, 180].map((d) => <option key={d} value={d}>{d}m</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}
          style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.line}`, background: "#FCFDFC", padding: "7px 6px", borderRadius: 2 }}>
          {Object.entries(BLOCK_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <Btn onClick={submit} tone="solid"><Plus size={12} /> Add</Btn>
      </div>
    </div>
  );
}

function MeetingAdder({ onAdd }) {
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:30");
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), who: who.trim(), start, end });
    setTitle(""); setWho("");
  };
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}`, display: "flex", flexWrap: "wrap", gap: 6 }}>
      <Field placeholder="Meeting" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ flex: "2 1 160px", width: "auto" }} />
      <Field placeholder="Who" value={who} onChange={(e) => setWho(e.target.value)} style={{ flex: "1 1 110px", width: "auto" }} />
      <Field mono type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 104 }} />
      <Field mono type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 104 }} />
      <Btn onClick={submit} tone="solid"><Plus size={12} /> Add</Btn>
    </div>
  );
}

function TaskAdder({ onAdd }) {
  const [text, setText] = useState("");
  const [must, setMust] = useState(false);
  const submit = () => { if (!text.trim()) return; onAdd(text.trim(), must); setText(""); setMust(false); };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Field placeholder="Task" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ flex: "1 1 160px", width: "auto" }} />
      <Btn onClick={() => setMust(!must)} tone={must ? "solid" : "quiet"} title="Mark as must-do">Must</Btn>
      <Btn onClick={submit} tone="moss"><Plus size={12} /> Add</Btn>
    </div>
  );
}
