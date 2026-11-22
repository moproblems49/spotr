// SHARE CARDS + THE /p/ LANDING PAGE — the parts that need no browser.
//
// 1. buildWorkoutShareSVG draws the per-workout image from the finish summary. The numbers on it
//    must be the summary's numbers, user text must be escaped (a session named `<script>` is a
//    broken image, not an injection, but it must still render), and every card must end with the
//    App Store footer — that footer is the entire point of the feature.
// 2. api/post-landing.js is what a shared /p/ link opens for someone without the app. Its preview
//    must stay GENERIC (no workout content in an unfurl — the privacy decision recorded in
//    CLAUDE.md for /u/ links applies here too), it must carry the App Store button and Safari's
//    smart banner, and a hostile id must not reach the HTML.
import { buildWorkoutShareSVG, appStoreFooterSVG, APP_STORE_URL, APP_STORE_ID } from "../src/engine/sharecard.js";
import handler from "../api/post-landing.js";

let fails = 0;
const check = (l, c, d) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}${d ? " — " + d : ""}`); } };

const S = { volumeRaw: 13745, dayName: "Push Day", duration: "58m", sets: 19,
  prs: [{ name: "Barbell Bench Press", weight: 225 }], wins: [], streakWeeks: 4 };
const svg = buildWorkoutShareSVG(S, "lbs", "Nov 22, 2026");
check("1a. volume is the summary's own number", svg.includes(">13,745<"), svg.match(/font-size="150"[^>]*>([^<]*)/)?.[1]);
check("1b. session name, time and sets are on the card", svg.includes(">Push Day<") && svg.includes(">58m<") && svg.includes(">19<"));
check("1c. the PR is listed with its weight", svg.includes("Barbell Bench Press") && svg.includes("225 lbs"));
check("1d. a PR card says NEW PR; a streak says so", svg.includes("NEW PR") && svg.includes("4W STREAK"));
check("1e. the App Store footer is on the card", svg.includes("Track your lifts with Seshd") && svg.includes("App Store"));
check("1f. the QR is drawn on a white quiet zone", /<rect[^>]*fill="#ffffff"\/><path transform="translate/.test(svg));
check("1g. the SVG is well-formed 1080x1350", svg.startsWith('<svg') && svg.endsWith("</svg>") && svg.includes('viewBox="0 0 1080 1350"'));

const evil = buildWorkoutShareSVG({ ...S, dayName: `<script>alert(1)</script>&`, prs: [{ name: "A<B", weight: 1 }] }, "kg");
check("1h. user text is escaped", !evil.includes("<script>") && evil.includes("&lt;script&gt;") && evil.includes("A&lt;B"));
check("1i. kg sessions say kg", evil.includes(">kg<") && evil.includes("1 kg"));

const wins = buildWorkoutShareSVG({ ...S, prs: [], wins: [
  { name: "Back Squat", kind: "weight", by: 10 }, { name: "Leg Press", kind: "reps", by: 1 }, { name: "New Lift", kind: "first" }] }, "lbs");
check("1j. without a PR it lists what beat last time", wins.includes("BEAT LAST TIME") && wins.includes("+10 lbs") && wins.includes("+1 rep<"));
check("1k. a first-ever lift is not a 'beat last time' row", !wins.includes("New Lift"));
check("1l. no NEW PR badge when there is no PR", !wins.includes("NEW PR"));
const bare = buildWorkoutShareSVG({}, "lbs");
check("1m. an empty summary still renders, with no junk", bare.endsWith("</svg>") && !/NaN|undefined|null/.test(bare) && bare.includes("App Store"));
check("1n. the footer helper is the same footer", appStoreFooterSVG({ W: 1080, top: 1000 }).includes("Track your lifts with Seshd"));
check("1o. the App Store constants agree", APP_STORE_URL.endsWith(`/id${APP_STORE_ID}`));

// ── The landing page ───────────────────────────────────────────────────────────────────────
const run = async (id) => { let body = "", status = 0; const headers = {};
  await handler({ query: { id } }, { setHeader: (k, v) => { headers[k] = v; }, status(s) { status = s; return this; }, send(b) { body = b; } });
  return { body, status, headers }; };
const POST = "44444444-4444-4444-8444-444444444444";
const L = await run(POST);
check("2a. landing answers 200 HTML", L.status === 200 && /text\/html/.test(L.headers["Content-Type"] || ""));
check("2b. it links to the App Store", L.body.includes(`href="${APP_STORE_URL}"`));
check("2c. it carries Safari's smart banner for this app", L.body.includes(`name="apple-itunes-app" content="app-id=${APP_STORE_ID}`));
check("2d. the preview is GENERIC — titled as a workout, no content looked up", L.body.includes('og:title" content="A workout on Seshd"'));
check("2e. 'view in browser' points at the SPA's ?p= route", L.body.includes(`href="/?p=${POST}"`));
const E = await run(`"><script>alert(1)</script>`);
// (Not `!body.includes('"><')` — the page's own `<html lang="en"><head>` contains that.) The id is
// stripped to [\w-], so the og:url must end in a plain token and no injected tag may exist.
check("2f. a hostile id never reaches the HTML", !E.body.includes("<script>alert") &&
  /og:url" content="https:\/\/spotr-drab\.vercel\.app\/p\/[\w-]*"/.test(E.body), E.body.match(/og:url" content="[^"]*"/)?.[0]);
const C = await run("IGNITE-ABCD1234");
check("2g. a share-code link is a program page, not a broken post link", C.body.includes("A program on Seshd") && !C.body.includes("?p=IGNITE"));

console.log(fails ? `FAIL ${fails}` : "ALL PASS");
process.exit(fails ? 1 : 0);
