// ONE definition of "what source files exist", shared by every source-level guard.
//
// This exists because guard blindness has now happened twice, both times silently: a scan whose
// target list was written as a literal ("src/App.jsx") kept printing PASS while the code it was
// meant to police moved out from under it. sim_undef lost 1,500 lines of the most-simulated code in
// the repo to the engine split; sim_designscale and sim_a11y had been blind to all ten src/lazy/
// screens since the August code-split. Nothing failed — that is precisely the danger.
//
// Enumerating the tree instead of listing it means a file MOVE can never again drop out of a
// guard's reach, and a new directory is one edit here rather than five. If you add a source
// directory, add it below and every guard picks it up at once.
import { readdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// A guard that cannot enumerate its targets must DIE LOUDLY, not narrow quietly. Returning []
// for a missing/renamed directory would shrink every guard back to blindness while they all kept
// printing PASS — the exact failure class this file exists to prevent, concentrated in one place.
// So an empty or absent directory throws; if a directory is genuinely retired, delete its line
// from the lists below in the same commit.
const listDir = (rel, ext) => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs))
    throw new Error(`source_files.mjs: ${rel}/ does not exist — a renamed or deleted source dir must be updated here, not silently skipped`);
  const files = readdirSync(abs).filter(f => f.endsWith(ext)).sort().map(f => `${rel}/${f}`);
  if (files.length === 0)
    throw new Error(`source_files.mjs: ${rel}/ contains no ${ext} files — refusing to hand the guards an empty target list`);
  return files;
};

/** Files containing JSX — everything the UI-shaped scanners (a11y, dead UI, accent) must see. */
export function jsxFiles() {
  return ["src/App.jsx", ...listDir("src/lazy", ".jsx")];
}

/** Every source file, JSX or not — for checks that read plain text or walk scopes. */
export function allSourceFiles() {
  return [...jsxFiles(), ...listDir("src/engine", ".js")];
}
