# How this skill got here, and how to update it

This is [impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, by Paul Bakaus),
vendored from the GitHub repo rather than installed with its own installer.

**Version:** 3.6.0 · repo commit `f88b283` · vendored 2026-08-18

## Why it is copied in rather than installed

`npx impeccable install` downloads the compiled skill bundle from `https://impeccable.style`,
and that host is blocked by the sandbox's network egress proxy — the download fails with
HTTP 403 in every claude.ai session. The npm package's DETECTOR works fine (it ships inside
the package), so `npx impeccable detect src/` needs none of this; only the skill bundle has
to come from somewhere else. GitHub is reachable, and `plugin/skills/impeccable/` in that repo
is the same compiled skill the installer would have fetched, so it is copied here verbatim.

## To update

On a machine that can reach impeccable.style (Mo's PC), from the repo root:

    npx impeccable update

Otherwise re-copy from GitHub, which is what was done here:

    git clone --depth 1 https://github.com/pbakaus/impeccable.git /tmp/imp
    rm -rf .claude/skills/impeccable
    cp -r /tmp/imp/plugin/skills/impeccable .claude/skills/
    # then restore this file

## What was deliberately NOT installed

The upstream plugin also ships `plugin/hooks/hooks.json` — a `PostToolUse` hook on
Edit/Write/MultiEdit plus a `Stop` hook, both running a design pass automatically. It is NOT
installed here, on purpose:

  * it fires on EVERY edit to `src/App.jsx`, a ~25,000-line single file, so the cost is paid
    on every change including ones with nothing visual in them;
  * a `Stop` hook runs a "design deep pass" at the end of every turn, which is a large amount
    of unrequested work on a repo whose visual direction is a settled, deliberate set of
    decisions (see the Conventions section of the root CLAUDE.md);
  * and it would change how every future session behaves without that being visible in a diff.

Invoking the skill explicitly (`/impeccable ...`) does everything the hook would, at the moment
someone actually wants it. If the hook is ever wanted, it is in the upstream repo at
`plugin/hooks/hooks.json`.

## Reading its advice against this repo's own conventions

The detector's rules are generic. Several of its findings on Seshd are real and several are
not — the four `borderLeft: 4px solid` "side tab" hits carry set-type and muscle-group meaning
rather than decoration, and the nine overshoot easings are a deliberate press-feedback family.
The root `CLAUDE.md` records which design decisions are settled and which are open; read that
before acting on anything this skill says.
