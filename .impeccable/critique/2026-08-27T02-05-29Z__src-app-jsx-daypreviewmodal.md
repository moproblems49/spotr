---
target: Day Preview screen (DayPreviewModal) — post-redesign
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-27T02-05-29Z
slug: src-app-jsx-daypreviewmodal
---
# Critique: Day Preview (DayPreviewModal) — post-flat-list redesign

Method: dual-agent (A: design review · B: detector + browser evidence). No user-visible overlay in remote session (fallback: headless measurement + screenshots). The grey "❯" tab in the phone screenshot is iOS PiP, not the app.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Summary line + Edit→Done; solid |
| 2 | Match System / Real World | 4 | "4×5–7", lbs, gym vocabulary |
| 3 | User Control and Freedom | 2 | No edge-swipe exit; Done commits with no undo |
| 4 | Consistency and Standards | 3 | Edit mode reintroduces the card language view mode removed |
| 5 | Error Prevention | 3 | Remove confirms; silent autosave on Done |
| 6 | Recognition Rather Than Recall | 4 | LAST line kills lifting's biggest recall demand |
| 7 | Flexibility and Efficiency | 3 | Floating CTA; no reorder in this edit mode |
| 8 | Aesthetic and Minimalist Design | 4 | Earned by the redesign |
| 9 | Error Recovery | 2 | Share failure just toasts; no retry/undo |
| 10 | Help and Documentation | 3 | Row-tap → hand-written cues |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict
Authored, not interchangeable. LAST-as-hero, mono for bar-loadable numbers, earned colour, flat list vs category card stack. Residue: edit mode still the old card kit.
Deterministic scan: 15 findings file-wide, ZERO in this screen (all 15 documented-deliberate elsewhere: 9 overshoot easings, 3 meaning-carrying borderLefts, 2 height transitions, Inter). Browser: fonts integer 10–17px on-scale; 0 text-contrast failures both themes (23 elements); dots clear 3:1 both themes (light thin: 3.12–3.45, matches post-audit re-deepening); no overflow at 428/320; screenshots clean.

## Priority Issues
- [P1] Only exit is a 36px Back top-left; no EdgeSwipeBack on this overlay (chat/Activity have it); Back AND Share are 36×36 with no .seshd-hit (B measured; only in-scope controls without 44pt). Fix: EdgeSwipeBack onBack={onClose} + .seshd-hit on both.
- [P1] LAST truncates+reorders: sorts sets by weight, slices to 3 — 4-set session under "4×…" chip reads as 3 sets, hides back-off patterns. Fix: performed order + muted "+1" marker.
- [P2] Edit mode is a different design system (rounded cards, icon tiles, dashed border). Fix: flatten to same divider list.
- [P2] Zero-exercise day: "0 exercises · 0 total sets", empty void, live Start. Fix: empty state + disable/relabel CTA.
- [P3] Dot + muscle word double-encode under a header already naming the groups.

## Personas
Alex: fast pass; breaks on LAST truncation; no start-from-row shortcut. Casey: Back top-left worst reach AND only exit. Sam: row name is full concatenation (~10s/row, no skim semantics); share modal takes no focus on open; "4×5–7" verbalizes unevenly.

## Minor
Share modal hardcoded black both themes; long names wrap 4 lines vs fixed trophy; dot halo earned; "total sets" provably matches (29). Cognitive load 7/8 (chunking marginal: muscle word vs note blur).

## Questions
1. If LAST is the hero, why does PR own the row's only colour and icon?
2. Should the summary estimate duration (~55 min)?
3. Should Start pre-fill LAST weights?
