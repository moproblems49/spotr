---
target: live workout tracker + ExercisePickerSheet
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-21T19-16-09Z
slug: src-app-jsx-workouttracker-exercisepickersheet
---
Method: dual-agent (A: design-director review, browser-verified, both themes · B: detector + measured browser evidence, both themes)

# Design Critique — Live Workout Tracker + Exercise Picker Sheet

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Timer, running volume, sets, progress bar all live and correct — but the whole workout header (Discard/timer/Finish/progress) collapses away on scroll while the inert SESHD brand bar stays pinned. |
| 2 | Match System / Real World | 3 | Excellent domain vocabulary (per-side, warmup, RPE, e1RM) undercut by unexplained `N`/`W` abbreviations and an unlogged set literally reading "0 lbs · 0 reps." |
| 3 | User Control and Freedom | 3 | Discard confirms and names the stakes; NumberPad has 3 dismiss routes. No undo for Remove-exercise; picker search has no clear button. |
| 4 | Consistency and Standards | 2 | A set card's third row is sometimes e1RM+RPE, sometimes "Use last," sometimes empty; action-row width shifts with whether a warmup exists; picker shows a section kicker in browse mode only. |
| 5 | Error Prevention | 2 | A nameless Quick-Start row renders a fully tickable set table for data that gets silently discarded on save. |
| 6 | Recognition Rather Than Recall | 2 | 13 identical Back-muscle icons/subtitles in the picker differ only by name; `N`/`W`/dots/e1RM all require learned meaning with no legend. |
| 7 | Flexibility and Efficiency | 3 | Real power tooling (Use last, 2.5lb steps, superset, rest timer, plate calc) but no way to collapse a finished exercise and 189px/set costs real thumb-scrolling. |
| 8 | Aesthetic and Minimalist Design | 1 | Every set of one exercise redraws an identical plate diagram; measured contrast failures cluster on the numbers the screen exists to show; 5 accent hues on one card. |
| 9 | Error Recovery | 2 | No "no matches" message in the picker's empty state — one button over ~1,400px of black. No warning that a nameless row won't save. |
| 10 | Help and Documentation | 3 | FIRST TIME cues are genuinely well-judged (contextual, self-retiring) but "Full guide ›" is the faintest text in its own box, and no term (N/W/e1RM/RPE) is ever defined. |
| **Total** | | **24/40** | **Acceptable — significant improvements needed before users are happy** |

## Design Specificity Verdict

**Split, and the split is the finding.** The workout screen's *content* is written by someone who lifts: a per-side barbell diagram with competition-coded plate colors and a "PER SIDE (45 lbs bar)" caption, e1RM/RPE chips, warmup striping, a `Previous 185×8` column matched per set index, a `Use last` progressive-overload suggestion. None of that is template output.

The **Exercise Picker Sheet is the opposite** — 68px icon tile / bold name / grey subtitle / full-bleed row, swap the strings and it's a contacts app — and it's actively anti-specific: it knows what you bench and shows you nothing about it while you're choosing what to log next.

**Deterministic scan** (`detect.mjs --json src/App.jsx`, exit 2, 16 findings app-wide): of those touching the 3 components in scope, all 4 flagged (`side-tab` ×1, `bounce-easing` ×3, `layout-transition` ×1) are **false positives on close reading** — the border-left is the set-type stripe (meaning, not decoration, per this file's own documented convention), the overshoot easings are the deliberate press/release spring family. The one real new finding the CLI missed entirely: a **7px font size** on the "Volume by week" chart (line 14738, on the History sub-tab adjacent to this screen) — below even the already-retired 8/9px floor, and outside `sim_designscale.mjs`'s regex (`fontSize:\s*([89])` doesn't match `7`), meaning the standing check has an actual hole in it.

**Visual overlays**: no shared `[Human]` browser tab — Assessment B ran the detector's own browser payload via direct script injection into its own Playwright session (not `live-server.mjs`, to avoid mutating the repo's HTML entry against a prebuilt dist) and read results programmatically. In place of a live overlay, both assessments report **measured** evidence: real computed-style contrast ratios and real hit-tested tap-target boxes, not eyeballed impressions. Where the detector's own automated contrast pass and the manual measurement overlap (the e1RM chip), they agree exactly: 4.0:1, needs 4.5:1.

## Overall Impression

The screen knows what a lifter needs to see and mostly shows it — the plate diagram and the "what you did last time" column are real, defensible, product-specific decisions. But it shows *all of it, every time*, at a size tuned for a design review rather than a thumb mid-set: one set costs 189px, and a straightforward 5×5 costs 1,125px of scroll — one and a half screens — largely because the same plate diagram redraws under every single set instead of once per exercise. Layered on top of that is a genuinely serious, easily-missed correctness-adjacent bug (a nameless row silently discards whatever you log into it) and a contrast problem severe enough that one control — the rest-time button, in dark theme — is white text on a near-white fill and is, measured, **invisible**. The single biggest opportunity is compression: this screen would improve more from deleting redundant pixels than from adding anything.

## What's Working

1. **The per-side plate diagram with "PER SIDE (45 lbs bar)" and its "2×45" legend.** Answers a physical question — did I load the bar right — at the exact moment of anxiety, in the user's own unit system, colour-coded to real competition bumpers. The single most defensible element in scope.
2. **`Previous 185×8` matched per SET INDEX, plus the "Use last" chip.** The highest-value fact the app owns, delivered at the exact instant the decision is made — set 2 shows what set 2 was last time, not a lifetime PR from March. Real coaching.
3. **The completed-set feedback loop.** Ticking a set fires a spring pop, a haptic, a green fill, a filled dot and progress-bar advance — four coordinated confirmations in ~0.3s with no modal. Exactly the right amount of ceremony for something pressed dozens of times a session. And `NumberPad`'s `Next` key is deliberately styled as a plain move-focus action, not a fake "commit" button — most teams get this wrong.

## Priority Issues

**[P0] A set costs 189px because the same plate diagram redraws under every one of them**
- **Why it matters**: Measured live: 189px per set row in a 759px scroller; a 5-set exercise is 1,125px — 1.5 scroller-heights. Sets 2, 3 and 4 of one bench exercise each redraw an identical plate diagram and "2×45" legend; that alone is roughly 330px of the total. Mid-workout, one-handed, breathing hard, the two things a lifter needs together — what they just did and what's next — never fit on screen at once.
- **Fix**: Collapse each set to one line (~56-64px): number, type, previous, weight, reps, tick. Move the +/− stepper row and e1RM/RPE behind a tap on the row (NumberPad already exists for this). Render the plate diagram **once per exercise**, keyed to the current working weight, not once per set.
- **Suggested command**: `/impeccable layout`

**[P0] A nameless Quick-Start row renders a fully working set table for data that gets silently discarded**
- **Why it matters**: A row with `name:""` shows the full UI — set table, weight/reps/type, a tickable checkbox, a rest divider, Add Set — and a user CAN log a set into it. `savedExercises = session.exercises.filter(e => e.name)` drops it from the count, the volume, and the save with zero warning. Compounding it: the "Search exercises..." placeholder (16px/600, `C.sub`) sits at nearly the same visual weight as a real exercise name (20px/800, `C.text`), especially in light theme where `C.sub` has already converged toward `C.text` — at a glance the row reads as a real exercise called "Search exercises...".
- **Fix**: Until the row has a name, render it as one tappable strip ("Choose an exercise," muted, with the picker glyph) and don't mount the set table, note field, or overflow menu at all — this is exactly the shape of the fix already shipped for this row this session (opening the picker), just extended to not ALSO show a set table underneath.
- **Suggested command**: `/impeccable harden`

**[P1] Contrast failures cluster on the numbers and controls that matter most, and one is measured as effectively invisible**
- **Why it matters**: Measured on the live screen, not estimated. The rest-time button's active state (line ~13238) is a hardcoded `color:"#fff"` on `background:C.primary` — dark theme's `C.primary` is near-white, so this measures **1.10:1**, the worst number found anywhere in scope; the icon and duration label are functionally invisible. Separately, `SET_TYPES` (line 2720) is a hardcoded hex palette never routed through the theme system: the "Normal" chip fails on BOTH themes (4.03:1 dark, 2.55-2.98:1 light), and Warmup/Drop/Failure all fail on light (as low as 2.35:1). And the logged weight/reps themselves — the number this whole screen exists to record — measure **3.96:1** in light theme, because they sit on a tinted done-set fill that `sim_a11y` cannot see (it only sweeps token-vs-`C.bg`/`C.surface` pairs, not a component's own derived tint). 15 distinct light-theme failures were measured on one screen; the app's own headroom is nearly gone (`Chest`/`Discard`/`Remove` measured 4.52:1, a 0.02 margin above the floor).
- **Fix**: Route `SET_TYPES` through per-theme tokens (same pattern already used for `LEVEL_COLOR`/`_readyColor` earlier this session). Fix the rest-button's hardcoded white-on-`C.primary` (the exact class of bug this session already fixed twice elsewhere in this file). Deepen the light-theme done-set tint's ink until it clears 4.5:1 against the TINT it actually sits on, not against `C.surface`.
- **Suggested command**: `/impeccable audit`

**[P1] The most-tapped control in the app has no accessible name or checked state**
- **Why it matters**: Independently found by both assessments. The done-tick button (`onClick={onToggleDone}`, icon wrapped in an inner `<span>` for its pop animation) has no `aria-label`, no `role`, no `aria-checked` — `sim_a11y`'s own icon-only-button scan misses it because it looks one level too deep for the icon and stops at the `<span>` wrapper, a real gap in that check's own stated conservatism. A VoiceOver user hears "button" with no name and no state, for the single control this entire screen revolves around — the core loop is genuinely unusable for that user.
- **Fix**: `role="checkbox"` + `aria-checked={isDone}` + `aria-label={\`Set ${n}, ${weight} ${unit} × ${reps}\`}`. Extend `sim_a11y`'s icon-only-button walk to look inside a wrapping `<span>`, not just direct children — this exact shape will recur elsewhere in a 22k-line file with the same pattern.
- **Suggested command**: `/impeccable audit`

**[P2] Tap-target coverage from this session's own Profile pass never reached this screen**
- **Why it matters**: Measured via real hit-testing (not box math): **20 controls under 44×44 on the live workout screen with zero `.seshd-hit`/`.seshd-hit-y` halo at all** — "Full guide ›" (58×12), the rest-time button (28×24), the bar-weight chip (61×24), "Add note..." (280×21), the exercise-name field (280×34). The Exercise Picker Sheet is worse: **12 of its 13 controls fail**, including all 11 category chips at 30px tall with no halo. This is the exact `.seshd-hit`/`-y` pattern this session already applied thoroughly to the Profile screen — it simply never got extended here. Separately: the picker's category chips (anatomical order: Chest, Back, Shoulders...) and its browse-all section headers (`Object.keys(...).sort()`, alphabetical: Back, Biceps, Calves...) are two different orderings of the same taxonomy on the same screen, 40px apart — chips read "Chest" first, the list underneath opens on "BACK."
- **Fix**: Apply the same `.seshd-hit`/`.seshd-hit-y` pass already run on Profile to these 20+32 controls. Sort `EXPICK_CATEGORIES` and derive the browse-all grouping from the SAME ordered list instead of independently alphabetizing one of the two.
- **Suggested command**: `/impeccable adapt`

## Persona Red Flags

**Alex (Power User)**: A 5×5 costs 1,125px of scrolling per exercise with no way to collapse a finished one. There's no path from typing a weight to ticking the set without leaving the NumberPad, since `Next` deliberately only moves focus and the tick often sits below the pad. The picker opens on an alphabetical muscle dump starting at "BACK" with no favorites, no pinning, and (measured) a 16,840px-tall browse list before any filter is applied.

**Sam (Accessibility-Dependent)**: The done-tick — the core loop — is an unnamed, unstated button (VoiceOver: "button," nothing else). Light theme measures the logged weight at 3.96:1 and the Warmup chip at 2.35:1. `N`/`W` and the progress dots carry meaning with no text equivalent. The picker's category chips are 30px tall with no hit halo at all.

**Casey (Distracted Mobile)**: A suggested-but-unlogged set ("Use last," 225×6) renders in the identical size and weight as an actually-logged set — easy to misread mid-set, out of breath. A set logged into the nameless blank row vanishes on save with no message at all.

## Minor Observations

- An unlogged set literally displays "0 lbs · 0 reps" — a false statement about work not done; should read "—".
- A `02:00` rest divider renders after the LAST set of every exercise, leading nowhere.
- "Add warmup" is the only orange-outlined action button and reads as the most salient of three, despite being the least used; "Remove" (destructive) sits at the same visual weight as "+ Add Set" and, in light theme, reads as disabled rather than dangerous.
- Hierarchy is inverted: a completed set gets a tinted fill, green border, filled tick and green numerals; the NEXT set — the one that needs attention — is the flattest card on screen (near-white-on-near-white in light theme).
- NumberPad doesn't scroll the field it's editing clear of itself — captured parked mid-glyph across a stepper row, the same "resting on a sliced glyph" class this file has fixed once already for a different header.
- `recentExercises` in the picker is sliced from `Object.values(store.history)` in object key order, not date order — worth confirming "Recent" is actually recent.
- The exercise-rename field and the picker's own search field share the literal placeholder "Search exercises..." — caused a real mis-click during this critique's own testing (typed into the wrong field on the first attempt) and is a small but real ambiguity for a user too.
- The picker's empty-search state has no "no matches" text — one Create button over ~1,400px of black.
