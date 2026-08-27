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

const listDir = (rel, ext) => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter(f => f.endsWith(ext)).sort().map(f => `${rel}/${f}`);
};

/** Files containing JSX — everything the UI-shaped scanners (a11y, dead UI, accent) must see. */
export function jsxFiles() {
  return ["src/App.jsx", ...listDir("src/lazy", ".jsx")];
}

/** Every source file, JSX or not — for checks that read plain text or walk scopes. */
export function allSourceFiles() {
  return [...jsxFiles(), ...listDir("src/engine", ".js")];
}
