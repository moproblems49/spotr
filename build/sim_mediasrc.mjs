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

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
