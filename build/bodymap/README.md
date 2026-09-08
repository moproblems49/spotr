# The female body map's generator

`src/bodyMapData.js`'s `BODYMAP_FEMALE` is generated, not hand-authored. Regenerate with:

```
node build/bodymap/gen.mjs <path/to/AdobeStock_858843878.ai> --write
```

Without `--write` it is a dry run and prints every measurement it made.

## The artwork is not in this repo, and must not be added

The repo is public; the file is licensed for the app, not for redistribution — the same rule
`CLAUDE.md` applies to every credential and asset. Mo holds the `.ai`; the generator takes its
path as an argument so nothing licensed is ever committed.

## Why a generator exists at all

A data file whose generator lives only in a scratchpad can only be hand-edited after the next
container recycle, and the geometry here (the cuts, the landmark fit, the arm narrowing) is
exactly the kind that gets silently wrecked by a hand edit. `gen.mjs` carries the reasoning for
each step in its own header; read that before changing any number in it.

## Files

- `gen.mjs`  — the pipeline: parse → pick the figures → cut head/hands/feet → drop and trim the
  muscles those cuts remove → assign the nine regions → bring the arms in → fit → emit.
- `eps.mjs`  — reads the artist's own Béziers out of the Illustrator EPS. No raster anywhere.
- `geom.mjs` — path geometry: exact chord cuts and half-plane clips via de Casteljau, so the only
  curves that change are the two a cut actually splits.

## After regenerating

`node build/sim_bodymapfemale.mjs` (structure, bounds, size-vs-male, region ⊂ _body) and
`node build/pw_bodymapfemale.mjs` (the same containment, rasterised) are the guards. `gen.mjs`
self-checks the verbatim property before it writes, so a failure there means the pipeline broke
rather than the data drifting.
