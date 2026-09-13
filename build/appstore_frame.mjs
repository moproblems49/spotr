// appstore_frame — renders a captioned App Store screenshot at 1284x2778 from a raw device capture.
//
// WHY THIS FILE EXISTS AT ALL: the original generator (build/shots.mjs) was lost to a container
// recycle because build/ is gitignored and it was never `git add -f`'d — the same way the first sim
// battery was lost. So this one is force-added, along with build/assets/inter-latin.woff2, and the
// template below is MEASURED off appstore-screenshots/captioned/04-recovery-insights.png rather
// than guessed, so a frame made next year still matches the four already on the listing.
//
// 1284x2778 is deliberate and is not the phone's native size: the 6.5" slot REJECTED 1290x2796,
// and 1284x2778 is accepted in both the 6.5" and 6.9" slots. Raw iPhone 16 Pro captures are
// 1206x2622 and must be reframed, not merely resized.
//
// CROP THE iOS STATUS BAR. A real capture carries the clock, the signal bars and the battery; the
// four existing frames were captured in Chromium and have none, so leaving it in is what makes a
// new frame look like it came from somewhere else. `cropTop` is in SOURCE pixels.
//
// Usage:
//   node build/appstore_frame.mjs <spec.json>
// where spec.json is an array of { src, out, cropTop, eyebrow, headline[], subhead }.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 1284, H = 2778;

// ── The template, measured off 04-recovery-insights.png ──────────────────────
// bg #07070a with a lime glow peaking near y240-360 and gone by y840; eyebrow ink #c8f23a with its
// cap band at y205-232; headline ink #f7f7fa on a 182px baseline; subhead ink #9a9aa6 on 69px;
// device frame x126..1157 (1032 wide), top y810, 3px #26262b rim over a 21px #141419 bezel, so the
// app content is 984 wide and starts at y834. Outer radius 80, inner 56.
// Each block is positioned absolutely by the TOP OF ITS OWN INK, because that is what the
// measurement pass reads off the four originals — a flow layout would make every offset depend on
// Inter's line-box metrics and drift the moment a headline gains a descender.
//
// ★ MEASURE THE INK, NOT "ANY PIXEL THAT DIFFERS FROM THE BACKGROUND". The first pass at this
// template read the headline as 148px because the lime glow behind it tripped a
// differs-from-background test, merging glow rows into the text band; the headline is really ~113px.
// The bands below come from a BRIGHT-ink test (r,g,b all > 150), which the glow never satisfies.
// Target ink bands, consistent across all four originals:
//   eyebrow cap 205-232 · headline ascender-top 299 and 422 · subhead ascender-top 594 and 663
//   ("Your body knows." measures 109 tall cap-to-descender and 937 wide, which is Inter 800 at
//    ~113px with -0.032em to within 1% on both axes.)
const T = {
  bg: "#07070a", glow: "rgba(200,242,58,0.10)",
  padX: 104, padR: 100,
  eyebrow: { ink: 205, anchor: "cap", size: 37, line: 37, weight: 700, track: "0.16em", color: "#c8f23a" },
  headline: { ink: 299, anchor: "asc", size: 113, line: 121, weight: 800, track: "-0.032em", color: "#f7f7fa" },
  subhead: { ink: 594, anchor: "asc", size: 42, line: 69, weight: 400, track: "0", color: "#9a9aa6", maxW: 1080 },
  frame: { x: 126, top: 810, w: 1032, radius: 80, rim: "#26262b", rimW: 3, bezel: "#141419", pad: 21 },
};
// Inter's own vertical metrics, used to turn a measured INK top into a CSS `top`. Hardcoding the
// offsets instead would silently break the moment a size or line-height here is retuned.
const M = { ascent: 0.969, descent: 0.242, cap: 0.727, asc: 0.760 };
const inkTopToBox = (b) => {
  const halfLead = (b.line - (M.ascent + M.descent) * b.size) / 2;
  const baseline = halfLead + M.ascent * b.size;
  return Math.round(b.ink - (baseline - M[b.anchor] * b.size));
};

const CONTENT_W = T.frame.w - 2 * (T.frame.rimW + T.frame.pad); // 984

const specPath = process.argv[2];
if (!specPath) { console.error("usage: node build/appstore_frame.mjs <spec.json>"); process.exit(2); }
const specs = JSON.parse(readFileSync(specPath, "utf8"));
const fontB64 = readFileSync(path.join(ROOT, "build/assets/inter-latin.woff2")).toString("base64");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const page$ = (s) => {
  const shot = readFileSync(path.isAbsolute(s.src) ? s.src : path.join(ROOT, s.src)).toString("base64");
  const scale = CONTENT_W / (s.srcWidth || 1206);
  const f = T.frame;
  return `<style>
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-weight:100 900;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${T.bg};font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.glow{position:absolute;inset:0;background:radial-gradient(125% 42% at 50% 4%, ${T.glow}, rgba(200,242,58,0) 72%)}
.eyebrow,.head,.sub{position:absolute;left:${T.padX}px;right:${T.padR}px}
.eyebrow{top:${inkTopToBox(T.eyebrow)}px;font-size:${T.eyebrow.size}px;line-height:${T.eyebrow.line}px;
  font-weight:${T.eyebrow.weight};letter-spacing:${T.eyebrow.track};text-transform:uppercase;
  color:${T.eyebrow.color}}
.head{top:${inkTopToBox(T.headline)}px;font-size:${T.headline.size}px;line-height:${T.headline.line}px;
  font-weight:${T.headline.weight};letter-spacing:${T.headline.track};color:${T.headline.color};
  white-space:nowrap}
.sub{top:${inkTopToBox(T.subhead)}px;max-width:${T.subhead.maxW}px;font-size:${T.subhead.size}px;
  line-height:${T.subhead.line}px;font-weight:${T.subhead.weight};color:${T.subhead.color}}
.frame{position:absolute;left:${f.x}px;top:${f.top}px;width:${f.w}px;height:${H - f.top + 40}px;
  background:${f.bezel};border:${f.rimW}px solid ${f.rim};border-radius:${f.radius}px;padding:${f.pad}px;
  box-shadow:0 -12px 80px rgba(0,0,0,0.55)}
.screen{width:${CONTENT_W}px;height:100%;border-radius:${f.radius - f.rimW - f.pad}px;overflow:hidden;background:#000}
.screen img{display:block;width:${CONTENT_W}px;
  margin-top:${-Math.round((s.cropTop || 0) * scale)}px}
</style>
<div class="glow"></div>
<div class="copy">
  <div class="eyebrow">${esc(s.eyebrow)}</div>
  <div class="head">${s.headline.map(esc).join("<br>")}</div>
  <div class="sub">${esc(s.subhead)}</div>
</div>
<div class="frame"><div class="screen"><img src="data:image/png;base64,${shot}"></div></div>`;
};

const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const pg = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const s of specs) {
  await pg.setContent(page$(s));
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
  // nowrap on the headline keeps the author's line breaks exact, so an over-long line would run
  // silently off the right edge rather than wrapping into the phone. Refuse it loudly instead —
  // the originals reach x=1178 at most.
  const over = await pg.evaluate((lim) => {
    const r = document.querySelector(".head").getBoundingClientRect();
    const kids = [...document.querySelectorAll(".head")].map(() => 0);
    const range = document.createRange(); range.selectNodeContents(document.querySelector(".head"));
    return { right: Math.round(range.getBoundingClientRect().right), lim, block: Math.round(r.right) };
  }, 1184);
  if (over.right > over.lim) {
    throw new Error(`headline overflows: ink reaches x=${over.right}, limit ${over.lim} — shorten a line in the spec`);
  }
  const out = path.isAbsolute(s.out) ? s.out : path.join(ROOT, s.out);
  await pg.screenshot({ path: out, type: "png" });
  console.log("wrote", out);
}
await br.close();
