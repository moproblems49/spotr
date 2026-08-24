// Lazy-loaded: "Wrapped" is a seasonal/occasional recap the user opens deliberately (not part
// of any core flow), so its SVG-card-building code — including two hand-rolled SVG string
// builders that duplicate the muscle-heatmap logic for a static export — was dead weight in
// the eager bundle for every session that never opens it. buildWrappedSVG/wrapStorySVG are
// exclusive to this screen and moved with it; shareSvgCard/svgToDataURL stay in App.jsx
// (exported) because shareSvgCard also has a caller in the exercise-progress share flow.
import { Icon, DISPLAY, F, MONO, cvt, calcStreak, fmtVol, toast, weeklyMuscleVolume,
  useBodyMapData, shareSvgCard, svgToDataURL, PR_TYPE_LABEL_SHORT } from "../App.jsx";

// Builds a self-contained 1080×1350 share-card SVG (dark, branded) with the week's trained-muscle
// body map, headline stats, and new PRs. Self-contained (paths + text only) so it rasterizes to a
// clean PNG via canvas without external fonts or images.
function buildWrappedSVG({ store, unit, sex, workouts, volume, weekPRs, streak, prList, weekLabel, volDeltaPct, woDelta, bodyMapData }) {
  const W = 1080, H = 1350;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const data = (bodyMapData && (bodyMapData.BODYMAPS[sex] || bodyMapData.BODYMAP_MALE)) || {};
  const { region, max } = weeklyMuscleVolume(store, 7);
  const heat = (t) => {
    if (t <= 0) return "#26262e";
    const s = [[60,70,45],[200,241,53],[120,150,30]];
    const sg = t < 0.5 ? 0 : 1, lt = t < 0.5 ? t/0.5 : (t-0.5)/0.5;
    const a = s[sg], b = s[sg+1];
    const m = a.map((v,i)=>Math.round(v+(b[i]-v)*lt));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  };
  const fig = (view, x, y, w) => {
    const f = data[view]; if (!f) return "";
    const vb = view === "front" ? "46 6 160 408" : "26 6 160 408";
    const h = Math.round(w * 408 / 160);
    let s = `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">`;
    s += `<path d="${f._body}" fill="#34343e" fill-opacity="0.55" stroke="#34343e" stroke-opacity="0.55" stroke-width="19" stroke-linejoin="round"/><path d="${f._body}" fill="#34343e" stroke="#34343e" stroke-width="3" stroke-linejoin="round"/>`;
    for (const mk of Object.keys(f).filter(k => k !== "_body")) {
      const t = max > 0 ? (region[view + ":" + mk] || 0) / max : 0;
      s += `<path d="${f[mk]}" fill="${heat(t)}" stroke="#0A0A0A" stroke-width="0.6"/>`;
    }
    return s + "</svg>";
  };
  let g = "";
  for (let x = 0; x <= W; x += 48) g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-width="1"/>`;
  for (let y = 0; y <= H; y += 48) g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-width="1"/>`;
  const stats = [["WORKOUTS", String(workouts)], ["VOLUME", fmtVol(volume, unit).replace(/\s\w+$/, "")], ["PRS", String(weekPRs)], ["STREAK", `${streak}d`]];
  const sw = (W - 160) / 4;
  let statSvg = "";
  stats.forEach((st, i) => {
    const cx = 80 + sw * i + sw / 2;
    statSvg += `<text x="${cx}" y="960" fill="#fff" font-size="60" font-weight="700" text-anchor="middle" font-family="monospace">${esc(st[1])}</text>`;
    statSvg += `<text x="${cx}" y="1000" fill="#8a8a93" font-size="20" font-weight="700" text-anchor="middle" letter-spacing="2">${st[0]}</text>`;
  });
  let prSvg = "";
  if (prList && prList.length) {
    prSvg += `<text x="80" y="1108" fill="#c8f135" font-size="22" font-weight="700" letter-spacing="2">NEW PRs</text>`;
    prList.slice(0, 3).forEach((p, i) => {
      // Type suffix ("Wt+Vol PR") matches the in-workout badge language; older prEvents rows
      // (pre-types) have no types array, so the suffix is optional.
      const typeTag = (Array.isArray(p.types) && p.types.length)
        ? `<tspan fill="#6a6a73" font-size="22" font-weight="700">  ${esc(p.types.map(t => PR_TYPE_LABEL_SHORT[t] || t).join("+"))} PR</tspan>` : "";
      prSvg += `<text x="80" y="${1158 + i * 46}" fill="#e8e8ea" font-size="30" font-weight="600">${esc(p.name)} · ${esc(p.weight)} ${unit}${typeTag}</text>`;
    });
  } else {
    prSvg += `<text x="80" y="1140" fill="#8a8a93" font-size="26" font-weight="500">Another week in the books 💪</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`
    + `<rect width="${W}" height="${H}" fill="#0A0A0A"/>`
    + `<g opacity="0.04">${g}</g>`
    + `<text x="80" y="110" fill="#c8f135" font-size="30" font-weight="700" letter-spacing="8">SESHD WRAPPED</text>`
    + `<text x="80" y="158" fill="#8a8a93" font-size="26" font-weight="600" letter-spacing="3">${esc(weekLabel)}</text>`
    + (() => {
        const parts = [];
        if (volDeltaPct != null && volDeltaPct !== 0) parts.push(`${volDeltaPct > 0 ? "▲" : "▼"} ${Math.abs(volDeltaPct)}% volume`);
        if (woDelta) parts.push(`${woDelta > 0 ? "+" : ""}${woDelta} workout${Math.abs(woDelta) === 1 ? "" : "s"}`);
        if (!parts.length) return "";
        const col = (volDeltaPct != null && volDeltaPct !== 0) ? (volDeltaPct > 0 ? "#34d399" : "#f87171") : "#8a8a93";
        return `<text x="80" y="196" fill="${col}" font-size="23" font-weight="600">${esc(parts.join("   ·   "))} <tspan fill="#6a6a73">vs last week</tspan></text>`;
      })()
    + fig("front", 300, 205, 230) + fig("back", 560, 205, 230)
    + `<text x="${W/2}" y="835" fill="#6a6a73" font-size="22" text-anchor="middle" letter-spacing="2">MUSCLES TRAINED THIS WEEK</text>`
    + statSvg
    + `<line x1="80" y1="1050" x2="${W-80}" y2="1050" stroke="#222" stroke-width="2"/>`
    + prSvg
    + `<text x="${W/2}" y="1322" fill="#5a5a63" font-size="24" text-anchor="middle" font-weight="700" letter-spacing="4">seshd</text>`
    + `</svg>`;
}

// Wraps a 1080×1350 card SVG in a 1080×1920 story-format frame (IG/TikTok stories):
// card centered on the dark canvas with a small wordmark at the bottom.
function wrapStorySVG(cardSvg) {
  // The card carries its own lowercase "seshd" watermark for standalone shares. In a story we add
  // the bottom "SESHD" below, so strip the card's copy to avoid the wordmark appearing twice.
  const inner = cardSvg
    .replace(/^<svg /, '<svg y="220" ')
    .replace(/<text[^>]*>seshd<\/text>/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">`
    + `<rect width="1080" height="1920" fill="#0A0A0A"/>`
    + inner
    + `<text x="540" y="1782" fill="#5a5a64" font-family="Helvetica, Arial" font-size="30" font-weight="700" letter-spacing="10" text-anchor="middle">SESHD</text>`
    + `</svg>`;
}

export default function WrappedModal({ store, C, onClose, onPostToFeed, range }) {
  const bodyMapData = useBodyMapData();
  const unit = store.unit || "lbs";
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const rangeStart = range?.start ?? weekAgo;
  const rangeEnd = range?.end ?? Date.now();
  const inRange = (d) => { const t = new Date(d + "T12:00:00").getTime(); return t > rangeStart && t <= rangeEnd; };
  const weekHistory = Object.entries(store.history||{}).filter(([d]) => inRange(d));
  const workouts = weekHistory.reduce((a,[,ss]) => a + Object.keys(ss).length, 0);
  // Volume: exclude warmups and convert each session's stored unit to the display unit,
  // matching how volume is computed everywhere else in the app.
  const volume = weekHistory.reduce((a,[,ss]) => a + Object.values(ss).reduce((b,s) => {
    const su = s.unit || "lbs";
    return b + (s.exercises||[]).reduce((c,ex) =>
      c + (ex.sets||[]).reduce((d2,s2) => {
        const done = s2.done === true || (s2.done === undefined && parseFloat(s2.reps) > 0);
        if (!done || s2.type === "warmup") return d2;
        return d2 + cvt(parseFloat(s2.weight)||0, su, unit) * (parseFloat(s2.reps)||0);
      }, 0), 0);
  }, 0), 0);
  // PRs this week: read the actual PR-hit log (recorded the moment each PR was set) rather
  // than guessing from current store.prs — that used to falsely flag any week where a lifter
  // merely matched an old weight max (e.g. a reps/e1RM PR at the same top weight) as a fresh PR.
  const weekPREvents = (store.prEvents || []).filter(e => {
    const t = new Date(e.date + "T12:00:00").getTime();
    return t > rangeStart && t <= rangeEnd;
  });
  const weekPRs = new Set(weekPREvents.map(e => e.name)).size;
  const streak = calcStreak(store.workoutDates);
  const sex = (store.bodyType === "female" || store.bodyType === "male")
    ? store.bodyType
    : (store.strengthSex === "female" ? "female" : "male");
  const weekLabel = range?.label || `WEEK OF ${new Date().toLocaleDateString("en", { month: "short", day: "numeric" }).toUpperCase()}`;
  // Week-over-week: the prior 7-day window (7–14 days ago) for trend deltas.
  const volOf = (hist) => hist.reduce((a,[,ss]) => a + Object.values(ss).reduce((b,s) => {
    const su = s.unit || "lbs";
    return b + (s.exercises||[]).reduce((c,ex) => c + (ex.sets||[]).reduce((d2,s2) => {
      const done = s2.done === true || (s2.done === undefined && parseFloat(s2.reps) > 0);
      if (!done || s2.type === "warmup") return d2;
      return d2 + cvt(parseFloat(s2.weight)||0, su, unit) * (parseFloat(s2.reps)||0);
    }, 0), 0); }, 0), 0);
  const prevStart = rangeStart - (rangeEnd - rangeStart), prevEnd = rangeStart;
  const prevHistory = Object.entries(store.history||{}).filter(([d]) => { const t = new Date(d + "T12:00:00").getTime(); return t > prevStart && t <= prevEnd; });
  const prevWorkouts = prevHistory.reduce((a,[,ss]) => a + Object.keys(ss).length, 0);
  const prevVolume = volOf(prevHistory);
  const volDeltaPct = prevVolume > 0 ? Math.round((volume - prevVolume) / prevVolume * 100) : null;
  const woDelta = workouts - prevWorkouts;
  // Named PRs set this week (for the share card) — the weight actually lifted at the moment
  // of the PR, not whatever store.prs currently holds (which can have moved on since). If an
  // exercise PR'd more than once this week, show the heaviest of those hits, not just the first.
  const prList = (() => {
    // Best weight per exercise, plus the UNION of PR types hit that week (weight/e1rm/volume) —
    // the card labels them so an e1RM/volume-only PR isn't presented as a weight PR.
    const best = new Map();
    weekPREvents.forEach(e => {
      if (!e.name) return;
      const cur = best.get(e.name);
      const types = new Set([...(cur?.types || []), ...(Array.isArray(e.types) ? e.types : [])]);
      best.set(e.name, { weightLbs: Math.max(cur?.weightLbs || 0, e.weightLbs || 0), types });
    });
    const out = [...best.entries()].map(([name, v]) => ({
      name, weight: unit === "lbs" ? Math.round(v.weightLbs) : Math.round(cvt(v.weightLbs, "lbs", "kg")),
      types: [...v.types],
    }));
    return out.slice(0, 3);
  })();

  // The card is taller than a phone screen, so the backdrop scrolls and the card is centred with
  // `margin:auto` rather than `alignItems:center` — flex centering clips the TOP of an over-tall
  // child, which put the close button and header under the status bar (unreachable). Safe-area
  // padding keeps the header clear of the notch/Dynamic Island.
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:400, display:"flex", justifyContent:"center", overflowY:"auto", WebkitOverflowScrolling:"touch",
      padding:"calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px)" }}>
      <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{
        background:"#0A0A0A", borderRadius:24, padding:"24px 20px",
        width:"100%", maxWidth:340, color:"#fff", position:"relative",
        fontFamily:F, overflow:"hidden", margin:"auto", flexShrink:0,
      }}>
        {/* Grid texture */}
        <div style={{
          position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
          backgroundImage:`linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize:"24px 24px",
        }}/>

        <button onClick={onClose} aria-label="Close" style={{
          position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.08)",
          border:"none", color:"#fff", width:30, height:30, borderRadius:10,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1
        }}>
          <Icon name="x" size={14} color="#fff"/>
        </button>

        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:14, letterSpacing:5, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8, fontFamily:DISPLAY }}>SESHD WRAPPED</div>
          <div style={{ fontSize:13, letterSpacing:1.5, fontWeight:600, color:"rgba(255,255,255,0.4)", marginBottom:28 }}>
            {weekLabel.replace(/^WEEK OF/, "Week of")}
          </div>

          {/* Trained-muscle map (matches the shared image) */}
          {(() => {
            const { region, max } = weeklyMuscleVolume(store, 7);
            if (!max) return null;
            const dataMap = (bodyMapData && (bodyMapData.BODYMAPS[sex] || bodyMapData.BODYMAP_MALE)) || {};
            const heat = (t) => {
              if (t <= 0) return "#26262e";
              const s = [[60,70,45],[200,241,53],[120,150,30]];
              const sg = t < 0.5 ? 0 : 1, lt = t < 0.5 ? t/0.5 : (t-0.5)/0.5;
              const a = s[sg], b = s[sg+1]; const m = a.map((v,i)=>Math.round(v+(b[i]-v)*lt));
              return `rgb(${m[0]},${m[1]},${m[2]})`;
            };
            const Fig = ({ view }) => {
              const f = dataMap[view]; if (!f) return null;
              const vb = view === "front" ? "46 6 160 408" : "26 6 160 408";
              return (
                <svg viewBox={vb} width={88} height={Math.round(88*408/160)} style={{ display:"block" }}>
                  <><path d={f._body} fill="#34343e" fillOpacity={0.55} stroke="#34343e" strokeOpacity={0.55} strokeWidth={19} strokeLinejoin="round"/><path d={f._body} fill="#34343e" stroke="#34343e" strokeWidth={3} strokeLinejoin="round"/></>
                  {Object.keys(f).filter(k=>k!=="_body").map(mk => {
                    const t = max>0 ? (region[view+":"+mk]||0)/max : 0;
                    return <path key={mk} d={f[mk]} fill={heat(t)} stroke="#0A0A0A" strokeWidth={0.6}/>;
                  })}
                </svg>
              );
            };
            return (
              <div style={{ display:"flex", justifyContent:"center", gap:18, marginBottom:18 }}>
                <Fig view="front"/><Fig view="back"/>
              </div>
            );
          })()}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0, marginBottom:24 }}>
            {[
              ["WORKOUTS", workouts, "activity"],
              ["VOLUME", fmtVol(Math.round(volume), unit).replace(/\s\w+$/, ''), "package"],
              ["PRS", weekPRs, "trophy"],
              ["STREAK", `${streak}d`, "flame"],
            ].map(([l, v, ic], i) => (
              <div key={l} className="seshd-enter" style={{
                padding:"18px 16px",
                borderTop: i < 2 ? "none" : "1px solid rgba(255,255,255,0.08)",
                borderLeft: i % 2 === 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                animationDelay: `${i*80}ms`,
              }}>
                <div style={{ color:"rgba(255,255,255,0.5)", marginBottom:8 }}>
                  <Icon name={ic} size={14} color="rgba(255,255,255,0.5)"/>
                </div>
                <div style={{ fontFamily:MONO, fontSize:32, fontWeight:700, letterSpacing:-1, lineHeight:1 }}>{v}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", marginTop:6, letterSpacing:1.5, fontWeight:700 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* A zero delta is no news — "▲ 0% volume" read as a contradiction. Only show real changes;
              if neither volume nor workout count moved, the whole line drops out. */}
          {(() => {
            const hasVol = volDeltaPct != null && volDeltaPct !== 0;
            const hasWo = woDelta !== 0;
            if (!hasVol && !hasWo) return null;
            return (
              <div style={{ textAlign:"center", marginBottom:16, fontSize:12, fontWeight:600 }}>
                {hasVol && (
                  <span style={{ color: volDeltaPct > 0 ? "#34d399" : "#f87171" }}>
                    {volDeltaPct > 0 ? "▲" : "▼"} {Math.abs(volDeltaPct)}% volume
                  </span>
                )}
                {hasVol && hasWo ? <span style={{ color:"rgba(255,255,255,0.4)" }}> · </span> : null}
                {hasWo && <span style={{ color: woDelta > 0 ? "#34d399" : "#f87171" }}>{woDelta > 0 ? "+" : ""}{woDelta} workout{Math.abs(woDelta) === 1 ? "" : "s"}</span>}
                <span style={{ color:"rgba(255,255,255,0.4)" }}> vs last week</span>
              </div>
            );
          })()}

          <button onClick={async (e) => {
            e.preventDefault();
            if (e.currentTarget.dataset.sharing === "1") return; // guard against double-fire
            e.currentTarget.dataset.sharing = "1";
            try {
              const svg = buildWrappedSVG({ store, unit, sex, workouts, volume: Math.round(volume), weekPRs, streak, prList, weekLabel, volDeltaPct, woDelta, bodyMapData });
              const ok = await shareSvgCard(svg, "seshd-week.png", "My week on Seshd");
              if (!ok) {
                const text = `My week on Seshd\n${workouts} workout${workouts === 1 ? "" : "s"} · ${fmtVol(Math.round(volume), unit)} volume\n${weekPRs} PR${weekPRs === 1 ? "" : "s"} · ${streak} day streak`;
                if (navigator.clipboard) { await navigator.clipboard.writeText(text); if (typeof toast === "function") toast("Copied to clipboard", "success"); }
              }
            } finally {
              e.currentTarget && (e.currentTarget.dataset.sharing = "0");
            }
          }} style={{
            width:"100%", background:"#fff", color:"#0A0A0A", border:"none",
            borderRadius:12, padding:"14px", fontSize:14, fontWeight:700,
            cursor:"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2,
            display:"flex", alignItems:"center", justifyContent:"center", gap:8
          }} data-share-main>
            <Icon name="share" size={16} color="#0A0A0A"/>
            Share as image
          </button>
          <button onClick={async (e) => {
            e.preventDefault();
            if (e.currentTarget.dataset.sharing === "1") return; // guard against double-fire
            e.currentTarget.dataset.sharing = "1";
            const btn = e.currentTarget;
            try {
              if (!onPostToFeed) return;
              const svg = buildWrappedSVG({ store, unit, sex, workouts, volume: Math.round(volume), weekPRs, streak, prList, weekLabel, volDeltaPct, woDelta, bodyMapData });
              const imageData = await svgToDataURL(wrapStorySVG(svg), 1080, 1920);
              // Awaited now, and only toasts success if the write actually landed — this used to
              // toast "Posted!" and close immediately, before the (async, network) write even
              // started, so a failure showed a confident success toast followed moments later by
              // handleNewPost's own "Couldn't save post" with no context tying the two together.
              const ok = await onPostToFeed({ type: "story", caption: "", imageData });
              if (ok) { toast("Posted to your story", "success"); onClose(); }
              // On failure, handleNewPost already showed its own error toast — don't stack a
              // second, and leave the sheet open so the user can see what happened and retry.
            } catch (err) {
              toast("Couldn't post story", "error");
            } finally {
              btn && (btn.dataset.sharing = "0");
            }
          }} style={{
            width:"100%", background:"rgba(255,255,255,0.1)", color:"#fff", border:"1px solid rgba(255,255,255,0.18)",
            borderRadius:12, padding:"13px", fontSize:13, fontWeight:700,
            cursor:"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2
          }}>Share to Story</button>
          {onPostToFeed && (
            <button onClick={async (e) => {
              if (e.currentTarget.dataset.posting === "1") return;
              e.currentTarget.dataset.posting = "1";
              const btn = e.currentTarget;
              try {
                const { region, max } = weeklyMuscleVolume(store, 7);
                const ok = await onPostToFeed({
                  type: "achievement",
                  caption: "",
                  achievement: {
                    type: "wrapped",
                    workouts,
                    volume: Math.round(volume),
                    weekPRs,
                    streak,
                    unit,
                    sex,
                    muscles: region,
                    muscleMax: max,
                    volDeltaPct,
                    woDelta,
                  },
                });
                // Same fix as Share to Story above: only claim success once the write actually
                // landed. handleNewPost already toasts its own failure, so nothing to add here.
                if (ok) { toast("Posted to your feed", "success"); onClose(); }
              } finally {
                btn && (btn.dataset.posting = "0");
              }
            }} style={{
              width:"100%", background:"rgba(255,255,255,0.08)", color:"#fff",
              border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, padding:"13px",
              fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2,
              display:"flex", alignItems:"center", justifyContent:"center", gap:8
            }}>
              Post to my feed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
