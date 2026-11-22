// SHARE CARDS THAT BRING PEOPLE BACK (Nov 22 2026).
// Every image Seshd hands to the share sheet used to end at the app NAME and nothing else, so a
// card posted to an Instagram story or a group chat sold the workout and not the app — nobody who
// saw it could find Seshd from it. Each card now ends with an App Store footer: a line of copy
// and a QR code for anyone looking at the image on ANOTHER screen (a story viewed on a laptop, a
// screenshot passed around). The share-sheet call also carries the link as text, which is the half
// that works on the same phone (Messages shows it as a tappable link).
//
// The QR is generated ONCE, at authoring time (qrcode@1.5.4, error correction M), and stored here
// as path data: the URL is a constant, so a runtime QR library would be ~25 kB of bundle spent
// re-deriving the same 37x37 grid on every share. Regenerate only if APP_STORE_URL changes — a
// stale QR pointing at a different URL than the text is a bug nothing here could see.
//
// Everything is drawn in fixed light-on-dark, NOT theme tokens: the card is a picture that leaves
// the app, and it must read the same whichever theme the sharer happens to use.

export const APP_STORE_URL = "https://apps.apple.com/us/app/seshd-gym-log-lift-tracker/id6780334417";
export const APP_STORE_ID = "6780334417";

// 37x37 modules, one "M x y h w v1 h-w z" run per horizontal stretch of dark modules.
const QR_N = 37;
const QR_PATH = "M0 0h7v1h-7zM8 0h1v1h-1zM11 0h2v1h-2zM14 0h1v1h-1zM16 0h1v1h-1zM18 0h2v1h-2zM21 0h1v1h-1zM23 0h4v1h-4zM30 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h3v1h-3zM18 1h1v1h-1zM20 1h2v1h-2zM25 1h2v1h-2zM28 1h1v1h-1zM30 1h1v1h-1zM36 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h2v1h-2zM12 2h2v1h-2zM18 2h1v1h-1zM20 2h2v1h-2zM24 2h2v1h-2zM27 2h2v1h-2zM30 2h1v1h-1zM32 2h3v1h-3zM36 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM9 3h3v1h-3zM14 3h1v1h-1zM17 3h1v1h-1zM19 3h4v1h-4zM25 3h1v1h-1zM27 3h1v1h-1zM30 3h1v1h-1zM32 3h3v1h-3zM36 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h1v1h-1zM12 4h2v1h-2zM16 4h4v1h-4zM26 4h1v1h-1zM28 4h1v1h-1zM30 4h1v1h-1zM32 4h3v1h-3zM36 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM11 5h1v1h-1zM13 5h3v1h-3zM17 5h2v1h-2zM20 5h2v1h-2zM23 5h1v1h-1zM26 5h1v1h-1zM28 5h1v1h-1zM30 5h1v1h-1zM36 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM26 6h1v1h-1zM28 6h1v1h-1zM30 6h7v1h-7zM10 7h4v1h-4zM15 7h1v1h-1zM20 7h2v1h-2zM25 7h2v1h-2zM0 8h1v1h-1zM3 8h6v1h-6zM10 8h2v1h-2zM13 8h4v1h-4zM18 8h4v1h-4zM24 8h2v1h-2zM27 8h3v1h-3zM32 8h1v1h-1zM34 8h3v1h-3zM0 9h4v1h-4zM5 9h1v1h-1zM7 9h2v1h-2zM10 9h1v1h-1zM14 9h1v1h-1zM20 9h3v1h-3zM25 9h1v1h-1zM27 9h1v1h-1zM31 9h3v1h-3zM35 9h1v1h-1zM1 10h2v1h-2zM5 10h2v1h-2zM8 10h1v1h-1zM11 10h2v1h-2zM14 10h1v1h-1zM17 10h1v1h-1zM22 10h1v1h-1zM24 10h1v1h-1zM27 10h4v1h-4zM33 10h1v1h-1zM36 10h1v1h-1zM1 11h1v1h-1zM7 11h3v1h-3zM12 11h2v1h-2zM15 11h1v1h-1zM17 11h2v1h-2zM27 11h1v1h-1zM30 11h1v1h-1zM33 11h4v1h-4zM1 12h1v1h-1zM3 12h1v1h-1zM6 12h1v1h-1zM10 12h2v1h-2zM14 12h1v1h-1zM16 12h1v1h-1zM18 12h2v1h-2zM30 12h2v1h-2zM33 12h1v1h-1zM36 12h1v1h-1zM1 13h1v1h-1zM3 13h2v1h-2zM8 13h2v1h-2zM11 13h1v1h-1zM14 13h5v1h-5zM23 13h1v1h-1zM25 13h5v1h-5zM32 13h2v1h-2zM0 14h2v1h-2zM4 14h1v1h-1zM6 14h1v1h-1zM11 14h7v1h-7zM19 14h4v1h-4zM25 14h1v1h-1zM27 14h1v1h-1zM30 14h1v1h-1zM32 14h5v1h-5zM0 15h1v1h-1zM3 15h1v1h-1zM7 15h1v1h-1zM9 15h6v1h-6zM17 15h2v1h-2zM23 15h1v1h-1zM26 15h1v1h-1zM28 15h4v1h-4zM33 15h4v1h-4zM2 16h1v1h-1zM4 16h4v1h-4zM9 16h1v1h-1zM12 16h1v1h-1zM16 16h2v1h-2zM20 16h2v1h-2zM24 16h4v1h-4zM30 16h2v1h-2zM34 16h1v1h-1zM0 17h1v1h-1zM2 17h2v1h-2zM7 17h1v1h-1zM9 17h1v1h-1zM12 17h2v1h-2zM16 17h1v1h-1zM18 17h1v1h-1zM20 17h1v1h-1zM23 17h2v1h-2zM27 17h3v1h-3zM31 17h1v1h-1zM1 18h3v1h-3zM5 18h2v1h-2zM10 18h1v1h-1zM12 18h2v1h-2zM15 18h1v1h-1zM17 18h1v1h-1zM20 18h4v1h-4zM25 18h1v1h-1zM27 18h6v1h-6zM34 18h1v1h-1zM36 18h1v1h-1zM2 19h1v1h-1zM7 19h2v1h-2zM10 19h4v1h-4zM22 19h2v1h-2zM25 19h1v1h-1zM27 19h1v1h-1zM30 19h1v1h-1zM32 19h2v1h-2zM36 19h1v1h-1zM2 20h1v1h-1zM5 20h3v1h-3zM9 20h3v1h-3zM13 20h1v1h-1zM15 20h3v1h-3zM24 20h1v1h-1zM27 20h7v1h-7zM1 21h1v1h-1zM3 21h1v1h-1zM7 21h2v1h-2zM12 21h4v1h-4zM18 21h2v1h-2zM21 21h1v1h-1zM23 21h5v1h-5zM29 21h1v1h-1zM32 21h1v1h-1zM34 21h1v1h-1zM0 22h1v1h-1zM3 22h2v1h-2zM6 22h1v1h-1zM8 22h1v1h-1zM11 22h1v1h-1zM13 22h1v1h-1zM15 22h4v1h-4zM22 22h2v1h-2zM25 22h3v1h-3zM29 22h3v1h-3zM33 22h1v1h-1zM35 22h2v1h-2zM0 23h2v1h-2zM11 23h1v1h-1zM14 23h1v1h-1zM17 23h1v1h-1zM19 23h1v1h-1zM21 23h3v1h-3zM25 23h1v1h-1zM27 23h1v1h-1zM31 23h4v1h-4zM0 24h2v1h-2zM4 24h5v1h-5zM13 24h1v1h-1zM16 24h4v1h-4zM21 24h1v1h-1zM26 24h1v1h-1zM30 24h1v1h-1zM36 24h1v1h-1zM0 25h2v1h-2zM7 25h1v1h-1zM9 25h4v1h-4zM14 25h1v1h-1zM16 25h1v1h-1zM19 25h2v1h-2zM24 25h1v1h-1zM26 25h3v1h-3zM32 25h2v1h-2zM0 26h2v1h-2zM3 26h1v1h-1zM6 26h5v1h-5zM12 26h1v1h-1zM14 26h1v1h-1zM16 26h2v1h-2zM19 26h5v1h-5zM26 26h2v1h-2zM30 26h1v1h-1zM33 26h1v1h-1zM35 26h2v1h-2zM0 27h1v1h-1zM2 27h1v1h-1zM7 27h2v1h-2zM10 27h1v1h-1zM13 27h1v1h-1zM15 27h1v1h-1zM20 27h1v1h-1zM22 27h3v1h-3zM26 27h1v1h-1zM30 27h2v1h-2zM33 27h3v1h-3zM0 28h1v1h-1zM2 28h3v1h-3zM6 28h2v1h-2zM9 28h1v1h-1zM11 28h2v1h-2zM14 28h1v1h-1zM22 28h1v1h-1zM24 28h2v1h-2zM27 28h6v1h-6zM34 28h2v1h-2zM8 29h2v1h-2zM14 29h3v1h-3zM19 29h2v1h-2zM28 29h1v1h-1zM32 29h1v1h-1zM34 29h2v1h-2zM0 30h7v1h-7zM8 30h3v1h-3zM12 30h1v1h-1zM15 30h1v1h-1zM19 30h1v1h-1zM21 30h3v1h-3zM28 30h1v1h-1zM30 30h1v1h-1zM32 30h1v1h-1zM36 30h1v1h-1zM0 31h1v1h-1zM6 31h1v1h-1zM8 31h1v1h-1zM10 31h1v1h-1zM13 31h1v1h-1zM16 31h3v1h-3zM22 31h2v1h-2zM25 31h2v1h-2zM28 31h1v1h-1zM32 31h1v1h-1zM35 31h1v1h-1zM0 32h1v1h-1zM2 32h3v1h-3zM6 32h1v1h-1zM8 32h1v1h-1zM11 32h4v1h-4zM21 32h3v1h-3zM25 32h1v1h-1zM27 32h6v1h-6zM35 32h1v1h-1zM0 33h1v1h-1zM2 33h3v1h-3zM6 33h1v1h-1zM8 33h1v1h-1zM11 33h1v1h-1zM13 33h2v1h-2zM16 33h3v1h-3zM26 33h2v1h-2zM29 33h2v1h-2zM33 33h3v1h-3zM0 34h1v1h-1zM2 34h3v1h-3zM6 34h1v1h-1zM10 34h3v1h-3zM14 34h8v1h-8zM23 34h5v1h-5zM32 34h2v1h-2zM35 34h2v1h-2zM0 35h1v1h-1zM6 35h1v1h-1zM9 35h2v1h-2zM13 35h2v1h-2zM16 35h2v1h-2zM19 35h2v1h-2zM22 35h3v1h-3zM26 35h1v1h-1zM29 35h1v1h-1zM32 35h1v1h-1zM34 35h3v1h-3zM0 36h7v1h-7zM8 36h3v1h-3zM12 36h1v1h-1zM15 36h2v1h-2zM20 36h1v1h-1zM22 36h1v1h-1zM24 36h1v1h-1zM28 36h1v1h-1zM31 36h1v1h-1zM33 36h1v1h-1zM36 36h1v1h-1z";

const FONT = "Arial, Helvetica, sans-serif";
export const escSvg = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A QR needs a LIGHT ground and a quiet zone to scan; drawn dark-on-white whatever the card is.
export function appStoreQrSVG(x, y, size) {
  const quiet = 2, units = QR_N + quiet * 2, s = size / units;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.06)}" fill="#ffffff"/>`
    + `<path transform="translate(${x + quiet * s} ${y + quiet * s}) scale(${s})" d="${QR_PATH}" fill="#0A0A0A" shape-rendering="crispEdges"/>`;
}

// The footer every share card ends with. `top` is where its hairline sits; it occupies
// `size + 40` below that.
export function appStoreFooterSVG({ W, top, pad = 96, size = 170 }) {
  const qx = W - pad - size, qy = top + 34;
  const ty = qy + size / 2;
  return `<line x1="${pad}" y1="${top}" x2="${W - pad}" y2="${top}" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>`
    + `<text x="${pad}" y="${ty - 14}" fill="#ffffff" font-size="38" font-weight="800" font-family="${FONT}">Track your lifts with Seshd</text>`
    + `<text x="${pad}" y="${ty + 34}" fill="rgba(255,255,255,0.6)" font-size="28" font-weight="600" font-family="${FONT}">Free on the App Store · scan to download</text>`
    + appStoreQrSVG(qx, qy, size);
}

// The per-workout card, drawn from the SAME summary object the finish sheet renders, so the image
// and the screen cannot disagree about a number. 1080x1350 (4:5, the Instagram feed shape).
//   s: { volumeRaw, dayName, duration, sets, prs:[{name,weight}], wins:[{name,kind,by}],
//        streakWeeks }
export function buildWorkoutShareSVG(s, unit = "lbs", dateLabel = "") {
  const W = 1080, H = 1350, pad = 96;
  const u = String(unit || "lbs").toLowerCase();
  const vol = Math.round(Number(s?.volumeRaw) || 0).toLocaleString("en-US");
  const name = String(s?.dayName || "Workout");
  const nameShown = name.length > 26 ? name.slice(0, 25) + "…" : name;
  const prs = (s?.prs || []).slice(0, 3);
  const wins = (s?.wins || []).filter(w => w && w.kind !== "first");
  const rows = prs.length
    ? { label: prs.length > 1 ? "PERSONAL RECORDS" : "PERSONAL RECORD", items: prs.map(p => [p.name, `${p.weight} ${u}`]) }
    : wins.length
      ? { label: "BEAT LAST TIME", items: wins.slice(0, 3).map(w => [w.name, w.kind === "weight" ? `+${w.by} ${u}` : `+${w.by} rep${w.by === 1 ? "" : "s"}`]) }
      : null;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#0A0A0A"/>`
    + `<text x="${pad}" y="140" fill="rgba(255,255,255,0.5)" font-size="28" font-weight="700" letter-spacing="8" font-family="${FONT}">SESHD</text>`
    + (dateLabel ? `<text x="${pad}" y="182" fill="rgba(255,255,255,0.32)" font-size="24" font-weight="600" letter-spacing="4" font-family="${FONT}">${escSvg(String(dateLabel).toUpperCase())}</text>` : "");

  // Badges, right-aligned, stacked.
  let by = 108;
  const badge = (txt, fill, ink) => {
    const w = Math.round(txt.length * 17 + 48);
    const r = `<rect x="${W - pad - w}" y="${by}" width="${w}" height="48" rx="24" fill="${fill}"/>`
      + `<text x="${W - pad - w / 2}" y="${by + 33}" text-anchor="middle" fill="${ink}" font-size="24" font-weight="800" letter-spacing="2" font-family="${FONT}">${escSvg(txt)}</text>`;
    by += 62; return r;
  };
  if (prs.length) out += badge("NEW PR", "#ffffff", "#0A0A0A");
  if (s?.streakWeeks > 0) out += badge(`${s.streakWeeks}W STREAK`, "rgba(251,146,60,0.2)", "#fb923c");

  out += `<text x="${pad}" y="300" fill="rgba(255,255,255,0.55)" font-size="30" font-weight="700" letter-spacing="4" font-family="${FONT}">TOTAL VOLUME</text>`
    + `<text x="${pad}" y="440" fill="#ffffff" font-size="150" font-weight="800" letter-spacing="-4" font-family="${FONT}">${vol}<tspan font-size="44" font-weight="600" fill="rgba(255,255,255,0.45)" letter-spacing="2" dx="18">${escSvg(u)}</tspan></text>`
    + `<text x="${pad}" y="530" fill="rgba(255,255,255,0.4)" font-size="24" font-weight="600" letter-spacing="4" font-family="${FONT}">SESSION</text>`
    + `<text x="${pad}" y="592" fill="#ffffff" font-size="54" font-weight="800" font-family="${FONT}">${escSvg(nameShown)}</text>`
    + `<line x1="${pad}" y1="650" x2="${W - pad}" y2="650" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>`;
  const mid = W / 2;
  [["TIME", s?.duration], ["SETS", s?.sets]].forEach(([label, val], i) => {
    const x = i === 0 ? pad : mid + 30;
    out += `<text x="${x}" y="712" fill="rgba(255,255,255,0.45)" font-size="24" font-weight="600" letter-spacing="4" font-family="${FONT}">${label}</text>`
      + `<text x="${x}" y="782" fill="#ffffff" font-size="60" font-weight="800" font-family="${FONT}">${escSvg(val == null || val === "" ? "—" : val)}</text>`;
  });
  out += `<line x1="${mid}" y1="680" x2="${mid}" y2="800" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>`;

  if (rows) {
    out += `<rect x="${pad}" y="840" width="${W - pad * 2}" height="${70 + rows.items.length * 58}" rx="24" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>`
      + `<text x="${pad + 32}" y="892" fill="rgba(255,255,255,0.55)" font-size="22" font-weight="700" letter-spacing="4" font-family="${FONT}">${rows.label}</text>`;
    rows.items.forEach(([n, v], i) => {
      const y = 948 + i * 58;
      const nm = String(n || "").length > 30 ? String(n).slice(0, 29) + "…" : String(n || "");
      out += `<text x="${pad + 32}" y="${y}" fill="#ffffff" font-size="32" font-weight="600" font-family="${FONT}">${escSvg(nm)}</text>`
        + `<text x="${W - pad - 32}" y="${y}" text-anchor="end" fill="#ffffff" font-size="32" font-weight="800" font-family="${FONT}">${escSvg(v)}</text>`;
    });
  }
  out += appStoreFooterSVG({ W, top: 1110, pad, size: 170 }) + "</svg>";
  return out;
}
