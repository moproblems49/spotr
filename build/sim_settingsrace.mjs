// EVERY USER-FACING SETTING WRITTEN OPTIMISTICALLY MUST BE PROTECTED FROM THE REFRESH THAT
// OVERWRITES IT — AND THIS KEEPS BEING ONE GUARD THAT DIDN'T GET COPIED.
//
// The shape: a control does `setStore(...)` and fires a `profiles` PATCH. `loadUserData` REPLACES
// its keys wholesale from the server, so if a foreground refresh lands before the write does, the
// server's stale value wins and the control visibly flips back under the user's finger. It
// self-heals on a later load, which is exactly why nobody reports it.
//
// The defence is two halves that must BOTH be present for a field:
//   1. the write stamps `_lastSettingsEditAt`, and
//   2. `loadUserData`'s `recent` branch returns `prev.<field>` inside that 20s window.
//
// This has now been found THREE times, each time as "the one field the guard didn't reach":
//   * the sign-out audit    — seven fields had the currentUserId fallback without the guard
//   * the switch commit     — notificationPrefs was the last field with this exact shape
//   * generalising that     — unit, theme, strengthSex and bodyType all had it too, and `theme`
//                             is the most visible possible version (the whole app flips back)
// So the answer is not to patch the next one when someone notices; it is to make adding a setting
// without the guard FAIL. A new toggle either joins the protected set or is explicitly exempted
// here with a reason — no third option.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const snakeToCamel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Fields written to `profiles` that are NOT a control the user watches: derived data, telemetry,
// or bookkeeping. A stale re-serve of these is invisible, so the guard buys nothing. Each needs a
// reason — this list is the place a future decision gets made deliberately rather than by default.
const EXEMPT = {
  pr_events:           "derived from history and max-merged on load, not a control",
  custom_exercises:    "list edits are additive and re-derived; no toggle to flip back",
  body_log:            "append-only log, not a control",
  push_token:          "device bookkeeping, never rendered",
  seen_activity_count: "badge bookkeeping; has its own re-baseline logic",
  dismissed_insights:  "append-only set; a stale re-serve re-shows a card, not a wrong toggle",
  cover_url:           "written after an upload completes, not optimistically",
  cover_pos:           "written together with cover_url after upload",
  avatar_url:          "written after an upload completes, not optimistically",
  seen_onboarding:     "one-way latch, never toggled back by a user",
  onboarding_answers:  "written once at the end of onboarding",
  age:                 "written once at onboarding alongside onboarding_answers",
  active_program_id:   "written by program actions that also refetch",
  workout_notes:       "covered via workoutNotes in the recent branch",
  exercise_notes:      "covered via exerciseNotes in the recent branch",
  bar_types:           "covered via barTypes in the recent branch",
  close_friends:       "covered via closeFriends in the recent branch",
};

// ── 1. Find every profiles PATCH that sits next to an optimistic setStore ────────────────────
// A write is "optimistic" when a setStore for the same control happens within a few lines of it,
// which is the shape that produces a visible flip-back.
const lines = src.split("\n");
const optimistic = new Map();            // field -> first line number seen
for (let i = 0; i < lines.length; i++) {
  if (!/profiles\?id=eq\./.test(lines[i])) continue;
  if (!/PATCH/.test(lines[i]) && !/PATCH/.test(lines[i + 1] || "")) continue;
  // The lookback has to clear an explanatory COMMENT between the setStore and the write — an
  // 8-line window silently missed `notification_prefs`, the exact field this check was built
  // for, because the comment documenting its fix pushed the setStore out of range. A detector
  // that cannot see the bug it was written for is the failure mode to watch for here.
  const window = lines.slice(Math.max(0, i - 22), i + 3).join("\n");
  if (!/setStore\s*\(/.test(window)) continue;             // not optimistic: no local write first
  for (const m of (lines[i] + (lines[i + 1] || "")).matchAll(/JSON\.stringify\(\{\s*([^}]*)\}/g)) {
    for (const km of m[1].matchAll(/(?:^|[\s,{])([a-z][a-z0-9_]*)\s*:/g)) {
      const f = km[1];
      if (f === "method" || f === "body") continue;
      if (!optimistic.has(f)) optimistic.set(f, i + 1);
    }
  }
}
check("found optimistic profiles writes to audit", optimistic.size > 0, `${optimistic.size} field(s)`);

// ── 2. The `recent` branch tells us which fields are protected ───────────────────────────────
const recentBlock = (src.match(/const recent = sameUser[\s\S]*?\n {10}\};/) || [])[0] || "";
check("loadUserData still has the settings-edit `recent` guard", recentBlock.length > 0);
const protectedFields = new Set([...recentBlock.matchAll(/^\s+(?:\.\.\.\(prev\.)?([a-zA-Z]+)\s*[:?]/gm)].map(m => m[1]));

// ── 3. Every non-exempt optimistic field must be protected ───────────────────────────────────
const unguarded = [];
for (const [field, line] of optimistic) {
  if (EXEMPT[field]) continue;
  if (!protectedFields.has(snakeToCamel(field))) unguarded.push(`${field} (App.jsx:${line})`);
}
check("every optimistically-written setting is covered by the recent-edit guard",
  unguarded.length === 0,
  unguarded.length ? `${unguarded.length} unguarded: ${unguarded.join(", ")} — add it to the recent branch, or to EXEMPT here with a reason` : "");

// ── 4. …and the write itself must stamp the edit time, or the window never opens ─────────────
// Without the stamp the recent branch is dead code for that field: the 20s window is measured
// from `_lastSettingsEditAt`, so a field that never sets it is never "recent".
const stampCount = (src.match(/_lastSettingsEditAt = Date\.now\(\)/g) || []).length;
const guardedCount = [...optimistic.keys()].filter(f => !EXEMPT[f]).length;
check("enough writes stamp _lastSettingsEditAt to cover the guarded fields",
  stampCount >= guardedCount, `${stampCount} stamp(s) for ${guardedCount} guarded field(s)`);

console.log(`\naudited ${optimistic.size} optimistic profiles field(s); ${guardedCount} require the guard, ${Object.keys(EXEMPT).length} exempted by name`);
console.log(fails ? `${fails} FAIL(S)` : "ALL PASS");
process.exit(fails ? 1 : 0);
