// A MEDIA URL THAT CAME FROM THE SERVER IS ANOTHER USER'S INPUT.
// `avatar_url`, `cover_url` and `image_url` are plain text columns. Our upload path is their only
// legitimate writer, but a direct PATCH can set them to anything, and each is rendered as an
// `<img src>` to everyone who sees that person in a feed, search result, comment or follower list.
// A remote URL is therefore a tracking pixel that collects the IP and user-agent of every viewer;
// a giant data: URI is a download every viewer pays for inside the row.
// `safeMediaSrc` is the one gate. Refusing is always safe here — the only loss is a picture.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.test/" });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
let fails = 0;
const check = (l, c, d) => { if (c) console.log("PASS " + l); else { fails++; console.log("FAIL " + l + (d ? " — " + d : "")); } };

const { safeMediaSrc } = await import("./app.mjs");
check("0. safeMediaSrc is exported", typeof safeMediaSrc === "function");

// The bundle is built with the stub URL, so that is the host it must trust.
const OK_BASE = "https://stub.supabase.co/storage/v1/object";

// ── ALLOWED: what our own uploader actually produces ────────────────────────────────────────
const allowed = [
  [`${OK_BASE}/public/images/11111111/a.jpg`,           "a public bucket object"],
  [`${OK_BASE}/sign/group-images/g1/a.jpg?token=abc`,   "a signed private-bucket URL"],
  ["data:image/jpeg;base64,/9j/4AAQSkZJRg==",           "a legacy data: image (older posts carry these)"],
  ["data:image/png;base64,iVBORw0KGgo=",                "a data: png"],
  ["blob:https://app.test/1234-5678",                   "a local object URL (upload drafts)"],
];
for (const [u, why] of allowed) check(`1. keeps ${why}`, safeMediaSrc(u) !== null, u.slice(0, 60));

// ── REFUSED: everything an attacker would put there ─────────────────────────────────────────
const refused = [
  ["https://evil.example.com/pixel.png",                 "a foreign host (the tracking pixel)"],
  ["https://evil.example.com/storage/v1/object/x.png",   "a foreign host imitating the storage path"],
  ["http://stub.supabase.co/storage/v1/object/x.png",    "plain http on the right host"],
  [`https://stub.supabase.co.evil.com/storage/v1/object/x.png`, "a suffix-attack hostname"],
  [`https://stub.supabase.co/rest/v1/profiles?select=*`, "the right host but not a storage path"],
  ["javascript:alert(1)",                                "a javascript: URL"],
  ["data:text/html;base64,PHNjcmlwdD4=",                 "a data: URL that is not an image"],
  ["data:image/svg+xml;base64,PHN2Zz4=",                 "a data: SVG (scriptable in some contexts)"],
  ["//evil.example.com/pixel.png",                       "a protocol-relative URL"],
  ["", "an empty string"], [null, "null"], [undefined, "undefined"], [{}, "a non-string"],
];
for (const [u, why] of refused) check(`2. refuses ${why}`, safeMediaSrc(u) === null, JSON.stringify(u));

// ── 3. EVERY <img> READING A SERVER VALUE MUST GO THROUGH THE GATE ──────────────────────────
// The helper only helps at the sites that call it, and the first sweep MISSED one: GroupDetail's
// `resolveImg` returned a legacy absolute `image_url` verbatim, so a group member could point their
// own post's image at a remote pixel and collect the IP of everyone who opened that group's feed.
// This is the N-copies class in URL form, so the guard is structural rather than a list of sites:
// any `<img src={...}>` whose expression is not a literal, not a call to safeMediaSrc, and not a
// named DEVICE-LOCAL source fails here. Adding a new image site therefore forces a decision.
import { readFileSync } from "fs";
import { join } from "path";
const { jsxFiles, ROOT } = await import("./source_files.mjs");

// Sources that can only ever be device-local: a FileReader/canvas data: URL or a bundled asset.
// Each is named deliberately — this list is where a future "is this local?" decision gets made.
const LOCAL_OK = new Set([
  "rasterSrc",                    // muscle icon, base64 baked into the bundle
  "img",                          // FileReader draft in the composer / group composer
  "draftPhoto", "coverDraft",     // local upload drafts
  "e.photoData",                  // body-log photo — device-only, never uploaded
  "workoutSummary.photoDraft",    // finish-sheet draft
]);

const offenders = [];
for (const rel of jsxFiles()) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  for (const m of text.matchAll(/<img\b[^>]*?\ssrc=(\{[^}]*\}|"[^"]*")/g)) {
    const raw = m[1];
    if (raw.startsWith('"')) continue;                       // a bundled path like "/icon-192.png"
    const expr = raw.slice(1, -1).trim();
    if (expr.startsWith("safeMediaSrc(")) continue;
    if (LOCAL_OK.has(expr)) continue;
    // A bare identifier is fine if THIS file assigns it from the gate — Avatar computes
    // `const imgSrc = safeMediaSrc(...)` once and uses it for both the guard and the src.
    if (/^[A-Za-z_$][\w$]*$/.test(expr)
        && new RegExp(`\\b${expr}\\s*=\\s*safeMediaSrc\\(`).test(text)) continue;
    // A resolver call is fine if EVERY return in its definition goes through the gate. Checked
    // rather than allowlisted, so a future branch that returns a raw URL (which is exactly the bug
    // GroupDetail's legacy `image_url` fallback was) fails here.
    const call = expr.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (call) {
      const def = text.match(new RegExp(`const ${call[1]} = \\([^)]*\\) => \\{[\\s\\S]*?\\n  \\};`));
      const body = def && def[0];
      if (body) {
        const returns = [...body.matchAll(/return ([^;]+);/g)].map(r => r[1].trim());
        if (returns.length && returns.every(r => r === "null" || r.includes("safeMediaSrc("))) continue;
      }
    }
    const line = text.slice(0, m.index).split("\n").length;
    offenders.push(`${rel}:${line} src={${expr}}`);
  }
}
check("3. every <img> either uses safeMediaSrc or names a device-local source",
  offenders.length === 0,
  offenders.length ? `${offenders.length} ungated: ${offenders.join("; ")} — wrap it in safeMediaSrc(), or add it to LOCAL_OK here with a reason` : "");
// The scan must actually be looking at something — an empty file list would pass vacuously.
check("3b. [control] the scan examined the real source files", jsxFiles().length >= 5, `${jsxFiles().length} file(s)`);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
