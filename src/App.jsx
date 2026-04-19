import { useState, useEffect, useRef } from "react";

// ═════════════════════════════════════════════════════════════════════════════
// EXERCISE DATABASE
// ═════════════════════════════════════════════════════════════════════════════
const EXERCISE_DB = [
  { name:"Barbell Bench Press", muscle:"Chest", emoji:"🏋️" },
  { name:"Incline DB Press", muscle:"Chest", emoji:"💪" },
  { name:"Decline Bench Press", muscle:"Chest", emoji:"💪" },
  { name:"Cable Fly", muscle:"Chest", emoji:"🔄" },
  { name:"Push-Ups", muscle:"Chest", emoji:"⬇️" },
  { name:"Dips", muscle:"Chest/Tris", emoji:"⬇️" },
  { name:"Barbell Back Squat", muscle:"Quads", emoji:"🦵" },
  { name:"Front Squat", muscle:"Quads", emoji:"🦵" },
  { name:"Leg Press", muscle:"Quads", emoji:"🦵" },
  { name:"Leg Extension", muscle:"Quads", emoji:"🦵" },
  { name:"Bulgarian Split Squat", muscle:"Quads/Glutes", emoji:"🦵" },
  { name:"Hack Squat", muscle:"Quads", emoji:"🦵" },
  { name:"Romanian Deadlift", muscle:"Hamstrings", emoji:"🔙" },
  { name:"Deadlift", muscle:"Full Body", emoji:"🏋️" },
  { name:"Sumo Deadlift", muscle:"Full Body", emoji:"🏋️" },
  { name:"Lying Leg Curl", muscle:"Hamstrings", emoji:"🔙" },
  { name:"Seated Leg Curl", muscle:"Hamstrings", emoji:"🔙" },
  { name:"Hip Thrust", muscle:"Glutes", emoji:"🍑" },
  { name:"Standing Calf Raise", muscle:"Calves", emoji:"🦶" },
  { name:"Seated Calf Raise", muscle:"Calves", emoji:"🦶" },
  { name:"Barbell Row", muscle:"Back", emoji:"🔙" },
  { name:"Seated Cable Row", muscle:"Back", emoji:"🔙" },
  { name:"T-Bar Row", muscle:"Back", emoji:"🔙" },
  { name:"Single-Arm DB Row", muscle:"Back", emoji:"🔙" },
  { name:"Pull-Ups", muscle:"Back/Biceps", emoji:"⬆️" },
  { name:"Chin-Ups", muscle:"Back/Biceps", emoji:"⬆️" },
  { name:"Lat Pulldown", muscle:"Back", emoji:"⬇️" },
  { name:"Face Pulls", muscle:"Rear Delts", emoji:"🎯" },
  { name:"Overhead Press", muscle:"Shoulders", emoji:"⬆️" },
  { name:"DB Shoulder Press", muscle:"Shoulders", emoji:"⬆️" },
  { name:"Arnold Press", muscle:"Shoulders", emoji:"💪" },
  { name:"Lateral Raises", muscle:"Shoulders", emoji:"↔️" },
  { name:"Rear Delt Fly", muscle:"Rear Delts", emoji:"🦅" },
  { name:"Barbell Curl", muscle:"Biceps", emoji:"💪" },
  { name:"Dumbbell Curl", muscle:"Biceps", emoji:"💪" },
  { name:"Hammer Curl", muscle:"Biceps", emoji:"🔨" },
  { name:"Preacher Curl", muscle:"Biceps", emoji:"💪" },
  { name:"Skull Crushers", muscle:"Triceps", emoji:"💀" },
  { name:"Tricep Pushdown", muscle:"Triceps", emoji:"⬇️" },
  { name:"Overhead Tricep Extension", muscle:"Triceps", emoji:"⬆️" },
  { name:"Close-Grip Bench Press", muscle:"Triceps", emoji:"🏋️" },
  { name:"Cable Crunch", muscle:"Abs", emoji:"⚡" },
  { name:"Hanging Leg Raise", muscle:"Abs", emoji:"⬆️" },
  { name:"Plank", muscle:"Abs", emoji:"⬛" },
  { name:"Shrugs", muscle:"Traps", emoji:"🤷" },
];

// ═════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Instagram-inspired: minimal, whitespace-forward
// ═════════════════════════════════════════════════════════════════════════════
const THEMES = {
  dark: {
    bg: "#000000",
    surface: "#0a0a0a",
    card: "#0a0a0a",
    border: "#1c1c1e",
    divider: "#141414",
    accent: "#2f80ff",
    accentSoft: "rgba(47,128,255,0.12)",
    accent2: "#1d4ed8",
    orange: "#f97316",
    green: "#30d158",
    gold: "#eab308",
    red: "#ff3b30",
    text: "#f5f5f5",
    textDim: "#d1d5db",
    sub: "#8e8e93",
    muted: "#5c5c60",
    tabBg: "rgba(0,0,0,0.95)",
  },
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    card: "#ffffff",
    border: "#efefef",
    divider: "#f5f5f5",
    accent: "#0095f6",
    accentSoft: "rgba(0,149,246,0.08)",
    accent2: "#006dbf",
    orange: "#ea580c",
    green: "#16a34a",
    gold: "#ca8a04",
    red: "#ed4956",
    text: "#262626",
    textDim: "#3c3c3c",
    sub: "#8e8e8e",
    muted: "#c7c7c7",
    tabBg: "rgba(255,255,255,0.97)",
  }
};

const F = "-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif";
const MONO = "'SF Mono',Menlo,monospace";

// ═════════════════════════════════════════════════════════════════════════════
// SET TYPES
// ═════════════════════════════════════════════════════════════════════════════
const SET_TYPES = [
  { id:"normal",  label:"Normal",   color:"#8e8e93", short:"N" },
  { id:"warmup",  label:"Warm-up",  color:"#f97316", short:"W" },
  { id:"drop",    label:"Drop Set", color:"#a855f7", short:"D" },
  { id:"failure", label:"Failure",  color:"#ef4444", short:"F" },
];

// ═════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2,10);
const timeAgo = ts => {
  const s = Math.floor((Date.now()-ts)/1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  if (s < 86400*7) return `${Math.floor(s/86400)}d`;
  return new Date(ts).toLocaleDateString();
};
const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const fmtVol = (v, u) => v >= 1000 ? `${(v/1000).toFixed(1)}k ${u}` : `${v} ${u}`;
const dKey = (d = new Date()) => d.toISOString().split("T")[0];

const LBS_TO_KG = 0.453592;
function cvt(w, from, to) {
  if (!w || from === to) return w;
  const n = parseFloat(w);
  if (isNaN(n)) return w;
  if (from === "lbs" && to === "kg") return Math.round(n * LBS_TO_KG * 10) / 10;
  if (from === "kg" && to === "lbs") return Math.round(n / LBS_TO_KG * 10) / 10;
  return n;
}

function calc1RM(weight, reps) {
  if (!weight || !reps) return null;
  const w = parseFloat(weight), r = parseInt(reps);
  if (isNaN(w) || isNaN(r) || r < 1) return null;
  return Math.round(w * (1 + r / 30));
}

function calcStreak(workoutDates) {
  const keys = Object.keys(workoutDates||{}).sort().reverse();
  if (!keys.length) return 0;
  const set = new Set(keys);
  let streak = 0;
  const check = new Date(); check.setHours(0,0,0,0);
  for (let i = 0; i < 365; i++) {
    if (set.has(dKey(check))) streak++;
    else if (i > 0) break;
    check.setDate(check.getDate()-1);
  }
  return streak;
}

function getPrev(store, exName, si, unit) {
  const dates = Object.keys(store.history||{}).sort().reverse();
  for (const d of dates) {
    const sessions = Object.values(store.history[d]||{});
    for (const sess of sessions) {
      const ex = sess.exercises?.find(e => e.name === exName);
      const set = ex?.sets?.[si];
      if (set?.weight || set?.reps) {
        const su = sess.unit || "lbs";
        return { w: cvt(set.weight||0, su, unit), r: set.reps||0 };
      }
    }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═════════════════════════════════════════════════════════════════════════════
const SEED_USERS = [
  { id:"u1", username:"you", name:"You", avatar:"💪", bio:"Chasing PRs 🔥", followers:["u2","u3","u4"], following:["u2","u3","u4"] },
  { id:"u2", username:"marcus_lifts", name:"Marcus Chen", avatar:"🔥", bio:"Powerlifter · 600lb DL", followers:["u1","u3"], following:["u1"] },
  { id:"u3", username:"jayden_gains", name:"Jayden Rivera", avatar:"⚡", bio:"Hypertrophy obsessed", followers:["u1"], following:["u1","u2"] },
  { id:"u4", username:"k_fitness", name:"Kayla Park", avatar:"🏋️", bio:"Strength coach", followers:["u1"], following:["u1"] },
];

const SEED_POSTS = [
  {
    id:"p1", userId:"u2", type:"workout", unit:"lbs",
    createdAt: Date.now() - 1000*60*45,
    workout: {
      name: "Pull Day",
      duration: 3720,
      volume: 18400,
      exercises: [
        { name:"Barbell Row", sets:[{w:185,r:7},{w:185,r:6},{w:185,r:5}] },
        { name:"Pull-Ups", sets:[{w:45,r:8},{w:45,r:7}] },
      ]
    },
    caption: "New PR on rows 🔥 Straps are gone next week.",
    kudos: ["u3","u1"],
    comments: [{id:"c1", userId:"u3", text:"Those rows are insane 👊", createdAt:Date.now()-1000*60*30}],
    isPR: true,
  },
  {
    id:"p2", userId:"u3", type:"achievement",
    createdAt: Date.now() - 1000*60*120,
    achievement: { type:"streak", days:14 },
    caption: "Two weeks straight 🔥",
    kudos: ["u2","u1","u4"],
    comments: [],
  },
  {
    id:"p3", userId:"u4", type:"photo",
    createdAt: Date.now() - 1000*60*300,
    caption: "Morning grind 🌅",
    imageColor: "#0a1628",
    kudos: ["u2"],
    comments: [],
  },
];

const SEED_CHALLENGES = [
  { id:"ch1", name:"30-Day Push-Up Challenge", description:"Progressive push-ups every day", createdBy:"u4", participants:["u4","u2","u3"], startDate:Date.now()-1000*60*60*24*3, endDate:Date.now()+1000*60*60*24*27, icon:"💪" },
];

const SEED_GROUPS = [
  { id:"g1", name:"The Crew", description:"Our gym group", createdBy:"u1", members:["u1","u2","u3"], icon:"🏋️" },
];

// ═════════════════════════════════════════════════════════════════════════════
// STORAGE
// ═════════════════════════════════════════════════════════════════════════════
const SK = "spotr_v8";
function loadStore() {
  try {
    const r = localStorage.getItem(SK);
    if (r) return JSON.parse(r);
  } catch {}
  return {
    users: SEED_USERS,
    posts: SEED_POSTS,
    currentUserId: "u1",
    history: {},
    prs: {},
    programs: [],
    activeProgramId: null,
    defaultRestTime: 120,
    unit: "lbs",
    theme: "light",
    challenges: SEED_CHALLENGES,
    groups: SEED_GROUPS,
    workoutDates: {},
    seenOnboarding: false,
  };
}
function saveStore(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} }

// ═════════════════════════════════════════════════════════════════════════════
// LOGO — Fyra flame icon + Spotr wordmark
// ═════════════════════════════════════════════════════════════════════════════
function SpotrLogo({ C, big = false }) {
  const size = big ? 52 : 32;
  const id = big ? "flame-big" : "flame-sm";
  return (
    <div style={{ display:"flex", alignItems:"center", gap: big ? 10 : 7 }}>
      {/* Flame icon — two intertwining feather-flame forms, chrome/silver */}
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <defs>
          {/* Chrome silver gradient for left flame */}
          <linearGradient id={`${id}-lg`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95"/>
            <stop offset="25%"  stopColor="#d0d0d0"/>
            <stop offset="50%"  stopColor="#888888"/>
            <stop offset="75%"  stopColor="#c8c8c8"/>
            <stop offset="100%" stopColor="#505050"/>
          </linearGradient>
          {/* Slightly darker gradient for right flame */}
          <linearGradient id={`${id}-rg`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#e0e0e0" stopOpacity="0.9"/>
            <stop offset="30%"  stopColor="#b0b0b0"/>
            <stop offset="60%"  stopColor="#686868"/>
            <stop offset="100%" stopColor="#3a3a3a"/>
          </linearGradient>
          {/* Inner highlight */}
          <linearGradient id={`${id}-hi`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.7"/>
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
          </linearGradient>
          <filter id={`${id}-sh`}>
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.4"/>
          </filter>
        </defs>

        {/* Left flame — sweeps up-right, curves inward at top */}
        <path
          d="M 38 88
             C 28 75, 22 58, 30 42
             C 35 30, 44 20, 48 10
             C 52 20, 54 32, 50 46
             C 47 56, 44 66, 46 78
             C 44 82, 41 86, 38 88 Z"
          fill={`url(#${id}-lg)`}
          filter={`url(#${id}-sh)`}
        />
        {/* Left flame inner highlight */}
        <path
          d="M 38 88
             C 30 74, 25 57, 33 42
             C 37 33, 43 24, 47 14
             C 48 20, 49 28, 47 38
             C 44 50, 42 62, 43 74
             C 42 79, 40 84, 38 88 Z"
          fill={`url(#${id}-hi)`}
          opacity="0.5"
        />

        {/* Right flame — sweeps up-left, crosses over left flame */}
        <path
          d="M 62 88
             C 72 75, 78 58, 70 42
             C 65 30, 56 20, 52 10
             C 48 20, 46 32, 50 46
             C 53 56, 56 66, 54 78
             C 56 82, 59 86, 62 88 Z"
          fill={`url(#${id}-rg)`}
          filter={`url(#${id}-sh)`}
          opacity="0.88"
        />
        {/* Right flame inner highlight */}
        <path
          d="M 62 88
             C 70 74, 75 57, 67 42
             C 63 33, 57 24, 53 14
             C 52 20, 51 28, 53 38
             C 56 50, 58 62, 57 74
             C 58 79, 60 84, 62 88 Z"
          fill={`url(#${id}-hi)`}
          opacity="0.35"
        />

        {/* Crossing overlap shimmer at mid-point */}
        <ellipse
          cx="50" cy="50" rx="6" ry="18"
          fill="white"
          opacity="0.08"
        />
      </svg>

      {/* Wordmark */}
      <span style={{
        fontSize: big ? 32 : 20,
        fontWeight: 700,
        letterSpacing: -0.5,
        color: C.text,
        lineHeight: 1,
        fontFamily: F,
      }}>
        Spotr
      </span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AVATAR
// ═════════════════════════════════════════════════════════════════════════════
function Avatar({ user, size = 36, onClick, C, ring = false }) {
  const content = user?.profileImage
    ? <img src={user.profileImage} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }}/>
    : <span>{user?.avatar || "👤"}</span>;

  const innerStyle = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: `linear-gradient(135deg,${C.accent},#60a5fa)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: size * 0.44,
    flexShrink: 0,
    cursor: onClick ? "pointer" : "default",
    overflow: "hidden",
    userSelect: "none",
  };

  if (ring) {
    return (
      <div onClick={onClick} style={{ padding:2.5, borderRadius:"50%", background:"linear-gradient(135deg,#f97316,#ea580c,#be123c)", cursor:onClick?"pointer":"default" }}>
        <div style={{ padding:2, borderRadius:"50%", background:C.bg }}>
          <div style={innerStyle}>{content}</div>
        </div>
      </div>
    );
  }

  return <div onClick={onClick} style={innerStyle}>{content}</div>;
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAK BADGE — minimal
// ═════════════════════════════════════════════════════════════════════════════
function StreakBadge({ streak, size = "sm" }) {
  if (!streak) return null;
  const cfg = {
    sm: { p:"3px 8px", fs:11 },
    md: { p:"5px 11px", fs:13 },
  }[size] || { p:"3px 8px", fs:11 };

  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      background:"linear-gradient(135deg,#ea580c,#f59e0b)",
      borderRadius:20, padding:cfg.p, fontWeight:700, color:"#fff", fontSize:cfg.fs
    }}>
      <span>🔥</span>
      <span>{streak}</span>
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// HEATMAP
// ═════════════════════════════════════════════════════════════════════════════
function Heatmap({ workoutDates, C }) {
  const weeks = 16;
  const today = new Date(); today.setHours(0,0,0,0);
  const allDays = [];
  for (let i = weeks*7 - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate()-i);
    allDays.push({ k: dKey(d), active: !!(workoutDates||{})[dKey(d)] });
  }
  const cols = []; let col = [];
  allDays.forEach(d => { col.push(d); if (col.length === 7) { cols.push(col); col = []; } });
  if (col.length) cols.push(col);

  return (
    <div style={{ padding:"16px 0" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Consistency</div>
        <div style={{ fontSize:12, color:C.sub }}>{Object.keys(workoutDates||{}).length} workouts</div>
      </div>
      <div style={{ display:"flex", gap:3, overflowX:"auto", paddingBottom:4 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {col.map((d, di) => (
              <div key={di} style={{
                width:12, height:12, borderRadius:2,
                background: d.active ? C.accent : C.border,
                opacity: d.active ? 1 : 0.4
              }}/>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EXERCISE SEARCH INPUT
// ═════════════════════════════════════════════════════════════════════════════
function ExerciseInput({ value, onChange, C }) {
  const [q, setQ] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = q.length > 0
    ? EXERCISE_DB.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 7)
    : EXERCISE_DB.slice(0, 7);

  function select(ex) {
    setQ(ex.name);
    onChange(ex.name);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position:"relative", flex:1 }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search exercise..."
        style={{
          width:"100%", background:"transparent", border:"none",
          padding:"4px 0", fontSize:15, fontWeight:600,
          color:C.text, outline:"none", boxSizing:"border-box",
          fontFamily:F
        }}
      />
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", left:-8, right:-8,
          background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:12, zIndex:200, maxHeight:240, overflowY:"auto",
          boxShadow:"0 8px 32px rgba(0,0,0,0.3)"
        }}>
          {results.length === 0 && (
            <div style={{ padding:"12px 14px", fontSize:13, color:C.sub }}>No exercises found</div>
          )}
          {results.map((ex, i) => (
            <div
              key={ex.name}
              onClick={() => select(ex)}
              style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"10px 14px", cursor:"pointer",
                borderBottom: i < results.length-1 ? `1px solid ${C.divider}` : "none"
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.divider}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontSize:18 }}>{ex.emoji}</div>
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{ex.name}</div>
                <div style={{ fontSize:11, color:C.sub }}>{ex.muscle}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SET ROW (extracted to fix hooks bug)
// ═════════════════════════════════════════════════════════════════════════════
function SetRow({ set, si, exName, store, unit, onUpdate, onToggleDone, C }) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const typeMenuRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target)) setShowTypeMenu(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const prev = exName ? getPrev(store, exName, si, unit) : null;
  const setType = SET_TYPES.find(t => t.id === set.type) || SET_TYPES[0];
  const estimated1RM = set.weight && set.reps ? calc1RM(set.weight, set.reps) : null;

  return (
    <div>
      <div style={{
        display:"grid", gridTemplateColumns:"24px 32px 1fr 68px 68px 32px",
        gap:6, padding:"6px 14px", alignItems:"center",
        background: set.done ? `${C.green}14` : "transparent"
      }}>
        <div style={{ textAlign:"center", fontSize:12, color:set.done?C.green:C.muted, fontWeight:600 }}>{si+1}</div>

        {/* Set type pill */}
        <div ref={typeMenuRef} style={{ position:"relative" }}>
          <button onClick={() => setShowTypeMenu(!showTypeMenu)} style={{
            width:"100%", padding:"3px 0",
            background: `${setType.color}1a`,
            border: `1px solid ${setType.color}40`,
            borderRadius:6, color:setType.color,
            fontSize:10, fontWeight:700, cursor:"pointer"
          }}>{setType.short}</button>
          {showTypeMenu && (
            <div style={{
              position:"absolute", top:"calc(100% + 4px)", left:0,
              background:C.surface, border:`1px solid ${C.border}`,
              borderRadius:10, zIndex:100, minWidth:110,
              boxShadow:"0 8px 24px rgba(0,0,0,0.3)", overflow:"hidden"
            }}>
              {SET_TYPES.map((t, i) => (
                <div
                  key={t.id}
                  onClick={() => { onUpdate({ type: t.id }); setShowTypeMenu(false); }}
                  style={{
                    padding:"9px 12px", fontSize:12,
                    color:t.color, fontWeight:600, cursor:"pointer",
                    borderBottom: i < SET_TYPES.length-1 ? `1px solid ${C.divider}` : "none"
                  }}
                >{t.label}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ fontSize:11, color:C.sub, textAlign:"center" }}>
          {prev ? `${prev.w}×${prev.r}` : "—"}
        </div>

        <input
          type="number" inputMode="decimal"
          value={set.weight}
          onChange={e => onUpdate({ weight: e.target.value })}
          placeholder={prev?.w || "0"}
          style={{
            background: set.done ? `${C.green}22` : C.divider,
            border:"none", borderRadius:8, padding:"8px 4px",
            fontSize:15, fontWeight:600, color:C.text,
            textAlign:"center", outline:"none", width:"100%", boxSizing:"border-box",
            fontFamily:F
          }}
        />

        <input
          type="number" inputMode="decimal"
          value={set.reps}
          onChange={e => onUpdate({ reps: e.target.value })}
          placeholder={prev?.r || "0"}
          style={{
            background: set.done ? `${C.green}22` : C.divider,
            border:"none", borderRadius:8, padding:"8px 4px",
            fontSize:15, fontWeight:600, color:C.text,
            textAlign:"center", outline:"none", width:"100%", boxSizing:"border-box",
            fontFamily:F
          }}
        />

        <button onClick={onToggleDone} style={{
          width:28, height:28, borderRadius:8,
          border:`1.5px solid ${set.done?C.green:C.border}`,
          background:set.done?C.green:"transparent",
          color:set.done?"#fff":C.muted,
          cursor:"pointer", fontSize:14,
          display:"flex", alignItems:"center", justifyContent:"center"
        }}>✓</button>
      </div>

      {set.weight && set.reps && estimated1RM && (
        <div style={{ padding:"0 14px 4px", textAlign:"right", fontSize:10, color:C.muted, fontFamily:MONO }}>
          est 1RM: {estimated1RM} {unit}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONFETTI (for PR modal)
// ═════════════════════════════════════════════════════════════════════════════
function Confetti() {
  const colors = ["#2f80ff","#f97316","#eab308","#30d158","#a855f7"];
  return (
    <>
      <style>{`@keyframes cfp{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(520px) rotate(720deg);opacity:0}}`}</style>
      <div style={{ position:"fixed", top:"25%", left:0, right:0, pointerEvents:"none", zIndex:998 }}>
        {Array.from({length:36},(_,i) => ({
          id:i, left:50+(Math.random()-0.5)*85,
          delay:Math.random()*0.4, color:colors[i%5], dur:1.4+Math.random()*1.2
        })).map(p => (
          <div key={p.id} style={{
            position:"absolute", left:`${p.left}%`, width:8, height:8,
            background:p.color, borderRadius:2,
            animation:`cfp ${p.dur}s ${p.delay}s ease-out forwards`
          }}/>
        ))}
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1RM CALCULATOR MODAL
// ═════════════════════════════════════════════════════════════════════════════
function OneRMModal({ onClose, unit, C }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const oneRM = calc1RM(weight, reps);
  const percentages = oneRM
    ? [100,95,90,85,80,75,70,65,60,55,50].map(p => ({ p, w: Math.round(oneRM * p / 100) }))
    : [];

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, maxHeight:"85vh", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.border}` }}>
          <button onClick={onClose} style={{ fontSize:14, color:C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Close</button>
          <div style={{ fontSize:15, fontWeight:600, color:C.text }}>1RM Calculator</div>
          <div style={{ width:50 }}/>
        </div>
        <div style={{ overflowY:"auto", flex:1, padding:16 }}>
          <div style={{ fontSize:13, color:C.sub, marginBottom:16, lineHeight:1.5 }}>
            Enter your best set to estimate your one-rep max. Uses the Epley formula.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:10, color:C.sub, marginBottom:6, letterSpacing:1 }}>WEIGHT ({unit.toUpperCase()})</div>
              <input type="number" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="0"
                style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:20, fontWeight:700, color:C.accent, outline:"none", boxSizing:"border-box", textAlign:"center", fontFamily:F }}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:C.sub, marginBottom:6, letterSpacing:1 }}>REPS</div>
              <input type="number" inputMode="numeric" value={reps} onChange={e=>setReps(e.target.value)} placeholder="0"
                style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:20, fontWeight:700, color:C.accent, outline:"none", boxSizing:"border-box", textAlign:"center", fontFamily:F }}/>
            </div>
          </div>
          {oneRM && (
            <>
              <div style={{ background:`linear-gradient(135deg,${C.accent},${C.accent2})`, borderRadius:14, padding:"20px", textAlign:"center", marginBottom:14, color:"#fff" }}>
                <div style={{ fontSize:11, opacity:0.85, letterSpacing:1, marginBottom:4 }}>ESTIMATED 1RM</div>
                <div style={{ fontSize:48, fontWeight:800, fontFamily:MONO }}>{oneRM}</div>
                <div style={{ fontSize:12, opacity:0.85 }}>{unit}</div>
              </div>
              <div style={{ fontSize:10, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>TRAINING PERCENTAGES</div>
              {percentages.map(({ p, w }) => (
                <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ width:36, height:4, borderRadius:2, background:C.accent, opacity:p/100 }}/>
                    <span style={{ fontSize:13, color:C.sub }}>{p}%</span>
                  </div>
                  <span style={{ fontSize:14, fontWeight:600, color:C.text, fontFamily:MONO }}>{w} {unit}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// WRAPPED MODAL
// ═════════════════════════════════════════════════════════════════════════════
function WrappedModal({ store, C, onClose }) {
  const unit = store.unit || "lbs";
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const weekHistory = Object.entries(store.history||{}).filter(([d]) => new Date(d).getTime() > weekAgo);
  const workouts = weekHistory.reduce((a,[,ss]) => a + Object.keys(ss).length, 0);
  const volume = weekHistory.reduce((a,[,ss]) => a + Object.values(ss).reduce((b,s) =>
    b + (s.exercises||[]).reduce((c,ex) =>
      c + (ex.sets||[]).reduce((d2,s2) =>
        d2 + (s2.done ? (parseFloat(s2.weight)||0) * (parseFloat(s2.reps)||0) : 0), 0), 0), 0), 0);
  const streak = calcStreak(store.workoutDates);

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"linear-gradient(135deg,#1d4ed8,#2563eb,#0ea5e9)", borderRadius:20, padding:"32px 20px", width:"100%", maxWidth:340, color:"#fff", textAlign:"center", position:"relative" }}>
        <button onClick={onClose} style={{ position:"absolute", top:12, right:12, background:"rgba(255,255,255,0.18)", border:"none", color:"#fff", width:28, height:28, borderRadius:"50%", cursor:"pointer", fontSize:12 }}>✕</button>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, marginBottom:4, opacity:0.8 }}>WEEKLY WRAPPED</div>
        <div style={{ fontSize:24, fontWeight:800, marginBottom:18 }}>Your Week 📊</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:18 }}>
          {[
            ["Workouts", workouts],
            ["Volume", fmtVol(Math.round(volume), unit)],
            ["PRs", Object.keys(store.prs||{}).length],
            ["Streak", `🔥 ${streak}d`]
          ].map(([l,v]) => (
            <div key={l} style={{ background:"rgba(255,255,255,0.15)", borderRadius:12, padding:"12px 6px" }}>
              <div style={{ fontSize:20, fontWeight:800 }}>{v}</div>
              <div style={{ fontSize:9, opacity:0.85, marginTop:2, letterSpacing:1 }}>{l.toUpperCase()}</div>
            </div>
          ))}
        </div>
        <button style={{ width:"100%", background:"#fff", color:"#1d4ed8", border:"none", borderRadius:10, padding:"12px", fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:8 }}>📸 Share to Instagram</button>
        <button onClick={onClose} style={{ width:"100%", background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:10, padding:"10px", fontSize:12, cursor:"pointer" }}>Close</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PR MODAL
// ═════════════════════════════════════════════════════════════════════════════
function PRModal({ pr, unit, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <Confetti/>
      <div style={{ background:"linear-gradient(135deg,#ca8a04,#dc2626)", borderRadius:20, padding:"36px 20px", width:"100%", maxWidth:320, color:"#fff", textAlign:"center" }}>
        <div style={{ fontSize:56, marginBottom:6 }}>🏆</div>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:3, opacity:0.9 }}>PERSONAL RECORD</div>
        <div style={{ fontSize:20, fontWeight:700, margin:"8px 0 4px" }}>{pr.name}</div>
        <div style={{ fontSize:44, fontWeight:800, fontFamily:MONO, marginBottom:6 }}>{pr.weight} {unit}</div>
        {pr.increase > 0 && <div style={{ fontSize:12, opacity:0.9, marginBottom:18 }}>↑ {pr.increase} {unit} from previous</div>}
        <button onClick={onClose} style={{ width:"100%", background:"#fff", color:"#dc2626", border:"none", borderRadius:10, padding:"12px", fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:8 }}>Share to Feed</button>
        <button onClick={onClose} style={{ width:"100%", background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:10, padding:"10px", fontSize:12, cursor:"pointer" }}>Keep going</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═════════════════════════════════════════════════════════════════════════════
function Onboarding({ C, onComplete }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon:"🏋️", title:"Track every rep", body:"Log sets, weights, and reps. See every exercise improve over time." },
    { icon:"📸", title:"Share the grind", body:"Post workouts and photos. Give Kudos to your crew. Build your fitness identity." },
    { icon:"🔥", title:"Compete together", body:"Streaks, challenges, private groups. Train with your people." },
  ];
  const s = steps[step];
  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:600, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", fontFamily:F }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 32px", textAlign:"center" }}>
        <div style={{ marginBottom:40 }}>
          <SpotrLogo C={C} big/>
        </div>
        <div style={{ fontSize:64, marginBottom:20 }}>{s.icon}</div>
        <div style={{ fontSize:24, fontWeight:700, color:C.text, marginBottom:10 }}>{s.title}</div>
        <div style={{ fontSize:15, color:C.sub, lineHeight:1.5, maxWidth:280 }}>{s.body}</div>
      </div>
      <div style={{ padding:"0 32px 44px" }}>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:22 }}>
          {steps.map((_,i) => <div key={i} style={{ width:i===step?22:6, height:6, borderRadius:3, background:i===step?C.accent:C.border, transition:"all 0.3s" }}/>)}
        </div>
        <button onClick={() => step<steps.length-1 ? setStep(step+1) : onComplete()} style={{ width:"100%", background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"14px", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:F }}>
          {step<steps.length-1 ? "Continue" : "Get started"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROGRAM BUILDER — Build your own custom program
// ═════════════════════════════════════════════════════════════════════════════
function ProgramBuilder({ C, onCancel, onSave }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState([
    { id: uid(), name: "Day 1", exercises: [] }
  ]);

  function addDay() {
    setDays(ds => [...ds, { id: uid(), name: `Day ${ds.length + 1}`, exercises: [] }]);
  }
  function removeDay(idx) {
    if (days.length <= 1) return;
    setDays(ds => ds.filter((_, i) => i !== idx));
  }
  function updateDayName(idx, newName) {
    setDays(ds => ds.map((d, i) => i === idx ? { ...d, name: newName } : d));
  }
  function addExercise(dayIdx, exName) {
    if (!exName) return;
    setDays(ds => ds.map((d, i) => i === dayIdx ? {
      ...d,
      exercises: [...d.exercises, { name: exName, reps: "8–12", note: "" }]
    } : d));
  }
  function removeExercise(dayIdx, exIdx) {
    setDays(ds => ds.map((d, i) => i === dayIdx ? {
      ...d,
      exercises: d.exercises.filter((_, j) => j !== exIdx)
    } : d));
  }
  function updateReps(dayIdx, exIdx, reps) {
    setDays(ds => ds.map((d, i) => i === dayIdx ? {
      ...d,
      exercises: d.exercises.map((ex, j) => j === exIdx ? { ...ex, reps } : ex)
    } : d));
  }
  function save() {
    if (!name.trim()) {
      alert("Please give your program a name.");
      return;
    }
    const validDays = days.filter(d => d.exercises.length > 0);
    if (validDays.length === 0) {
      alert("Add at least one exercise to one day.");
      return;
    }
    onSave({
      id: uid(),
      name: name.trim(),
      days: validDays.map(d => ({ ...d, id: uid() }))
    });
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:80 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}`, position:"sticky", top:0, background:C.bg, zIndex:5 }}>
        <button onClick={onCancel} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
        <div style={{ fontSize:15, fontWeight:600, color:C.text }}>New Program</div>
        <button onClick={save} style={{ fontSize:14, fontWeight:600, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Save</button>
      </div>

      <div style={{ padding:"16px 14px" }}>
        <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:6 }}>PROGRAM NAME</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Upper/Lower Split"
          style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", marginBottom:20, fontFamily:F }}/>

        {days.map((day, di) => (
          <div key={day.id} style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:"12px", marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <input value={day.name} onChange={e => updateDayName(di, e.target.value)}
                style={{ flex:1, background:"transparent", border:"none", fontSize:14, fontWeight:700, color:C.text, outline:"none", fontFamily:F }}/>
              {days.length > 1 && (
                <button onClick={() => removeDay(di)} style={{ background:"none", border:"none", color:C.sub, fontSize:14, cursor:"pointer", padding:4 }}>✕</button>
              )}
            </div>

            {day.exercises.map((ex, ei) => {
              const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
              return (
                <div key={ei} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop: ei > 0 ? `1px solid ${C.divider}` : "none" }}>
                  {exInfo && <div style={{ fontSize:16 }}>{exInfo.emoji}</div>}
                  <div style={{ flex:1, fontSize:13, color:C.text }}>{ex.name}</div>
                  <input value={ex.reps} onChange={e => updateReps(di, ei, e.target.value)}
                    style={{ width:70, background:C.divider, border:"none", borderRadius:6, padding:"5px 8px", fontSize:11, color:C.text, outline:"none", textAlign:"center", fontFamily:F }}/>
                  <button onClick={() => removeExercise(di, ei)} style={{ background:"none", border:"none", color:C.sub, fontSize:14, cursor:"pointer", padding:4 }}>✕</button>
                </div>
              );
            })}

            <div style={{ marginTop: day.exercises.length > 0 ? 8 : 0 }}>
              <ExerciseInput key={`ex-${di}-${day.exercises.length}`} value="" onChange={v => { if (v) addExercise(di, v); }} C={C}/>
            </div>
          </div>
        ))}

        <button onClick={addDay} style={{
          width:"100%", background:"none", border:`1.5px dashed ${C.border}`,
          borderRadius:10, padding:"12px", fontSize:13, color:C.accent, fontWeight:600, cursor:"pointer", fontFamily:F
        }}>+ Add Day</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STORY VIEWER — Instagram-style full-screen with auto-advance
// ═════════════════════════════════════════════════════════════════════════════
function StoryViewer({ user, onClose, onNext, onPrev, hasNext, hasPrev, C }) {
  const [progress, setProgress] = useState(0);
  const duration = 5000; // 5 seconds per story

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min((elapsed / duration) * 100, 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        if (hasNext) onNext(); else onClose();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [user?.id, hasNext, onNext, onClose]);

  if (!user) return null;

  return (
    <div style={{ position:"fixed", inset:0, background:"#000", zIndex:700, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>
      {/* Progress bar */}
      <div style={{ display:"flex", gap:3, padding:"10px 12px 0" }}>
        <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.3)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:"#fff", transition:"width 0.05s linear" }}/>
        </div>
      </div>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 14px 10px" }}>
        <Avatar user={user} size={34} C={C}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{user.username}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>now</div>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#fff", fontSize:24, cursor:"pointer", padding:4, lineHeight:1 }}>✕</button>
      </div>

      {/* Story content — placeholder (in real app, would be user's latest post image/video) */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", padding:20 }}>
        {/* Tap zones for next/prev */}
        <div onClick={onPrev} style={{ position:"absolute", left:0, top:0, bottom:0, width:"33%", cursor:"pointer", zIndex:2 }}/>
        <div onClick={hasNext ? onNext : onClose} style={{ position:"absolute", right:0, top:0, bottom:0, width:"67%", cursor:"pointer", zIndex:2 }}/>

        <div style={{ width:"100%", aspectRatio:"9/16", maxHeight:"100%", background:`linear-gradient(135deg, ${C.accent}, ${C.accent2})`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", padding:40, textAlign:"center" }}>
          <div style={{ fontSize:60, marginBottom:16 }}>{user.avatar}</div>
          <div style={{ fontSize:24, fontWeight:700, color:"#fff", marginBottom:8 }}>{user.name}</div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.9)", lineHeight:1.4 }}>{user.bio || "Building strength, one rep at a time."}</div>
        </div>
      </div>

      {/* Reply footer */}
      <div style={{ padding:"10px 14px 24px" }}>
        <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:24, padding:"10px 16px", color:"rgba(255,255,255,0.7)", fontSize:13 }}>
          Reply to {user.username}...
        </div>
      </div>
    </div>
  );
}
function PostCard({ post, store, currentUserId, onKudos, onComment, onUserClick, onEdit, onDelete, displayUnit, C }) {
  const user = store.users.find(u => u.id === post.userId);
  const hasKudos = (post.kudos||[]).includes(currentUserId);
  const isOwn = post.userId === currentUserId;
  const [showCmts, setShowCmts] = useState(false);
  const [cmtText, setCmtText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pop, setPop] = useState(false);
  const menuRef = useRef(null);
  const postUnit = post.unit || "lbs";

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleKudos() {
    if (!hasKudos) { setPop(true); setTimeout(() => setPop(false), 400); }
    onKudos(post.id);
  }

  return (
    <div style={{ borderBottom:`1px solid ${C.divider}`, paddingBottom:16, marginBottom:16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"0 14px 10px" }}>
        <Avatar user={user} size={32} C={C} onClick={() => onUserClick(user?.id)}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            <span onClick={() => onUserClick(user?.id)} style={{ fontSize:13, fontWeight:600, color:C.text, cursor:"pointer" }}>
              {user?.username}
            </span>
            {post.isPR && (
              <span style={{ fontSize:9, background:"linear-gradient(135deg,#ca8a04,#dc2626)", color:"#fff", padding:"1px 6px", borderRadius:10, fontWeight:700 }}>🏆 PR</span>
            )}
          </div>
          <div style={{ fontSize:11, color:C.sub }}>
            {post.location && <>{post.location} · </>}
            {timeAgo(post.createdAt)}
          </div>
        </div>
        {isOwn && (
          <div ref={menuRef} style={{ position:"relative" }}>
            <button onClick={() => setShowMenu(!showMenu)} style={{ background:"none", border:"none", color:C.text, fontSize:18, cursor:"pointer", padding:"4px 8px", lineHeight:1 }}>⋯</button>
            {showMenu && (
              <div style={{ position:"absolute", right:0, top:"100%", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", zIndex:30, minWidth:130, boxShadow:"0 8px 24px rgba(0,0,0,0.3)" }}>
                <button onClick={() => { setShowMenu(false); onEdit(post); }} style={{ display:"block", width:"100%", padding:"10px 14px", background:"none", border:"none", color:C.text, fontSize:13, textAlign:"left", cursor:"pointer", borderBottom:`1px solid ${C.divider}`, fontFamily:F }}>Edit</button>
                <button onClick={() => { setShowMenu(false); onDelete(post.id); }} style={{ display:"block", width:"100%", padding:"10px 14px", background:"none", border:"none", color:C.red, fontSize:13, textAlign:"left", cursor:"pointer", fontFamily:F }}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {post.type === "achievement" && post.achievement?.type === "streak" && (
        <div style={{ margin:"0 14px", background:"linear-gradient(135deg,#ea580c,#f59e0b)", borderRadius:12, padding:"32px 20px", textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:6 }}>🔥</div>
          <div style={{ fontSize:42, fontWeight:800, color:"#fff", fontFamily:MONO, lineHeight:1 }}>{post.achievement.days}</div>
          <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.9)", letterSpacing:2, marginTop:4 }}>DAY STREAK</div>
        </div>
      )}

      {(post.type === "photo" || post.type === "form_check") && (
        post.imageData
          ? <img src={post.imageData} alt="" style={{ width:"100%", maxHeight:500, objectFit:"cover", display:"block" }}/>
          : <div style={{ width:"100%", aspectRatio:"1", background:`linear-gradient(135deg,${post.imageColor||"#1e293b"},#0f172a)`, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:48 }}>📸</span></div>
      )}

      {post.type === "workout" && post.workout && (
        <div style={{ margin:"0 14px", background:C.divider, borderRadius:12, padding:"14px 14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{post.workout.name}</div>
            <div style={{ display:"flex", gap:14 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.accent, fontFamily:MONO }}>{Math.floor(post.workout.duration/60)}m</div>
                <div style={{ fontSize:9, color:C.sub, letterSpacing:1 }}>TIME</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.accent, fontFamily:MONO }}>{fmtVol(Math.round(cvt(post.workout.volume, postUnit, displayUnit)), displayUnit)}</div>
                <div style={{ fontSize:9, color:C.sub, letterSpacing:1 }}>VOLUME</div>
              </div>
            </div>
          </div>
          {(expanded ? post.workout.exercises : post.workout.exercises.slice(0,3)).map((ex,i) => (
            <div key={i} style={{ paddingTop: i>0 ? 10 : 0, borderTop: i>0 ? `1px solid ${C.border}` : "none", marginTop: i>0 ? 10 : 0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:5 }}>{ex.name}</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {ex.sets.map((s,j) => (
                  <span key={j} style={{ fontSize:11, background:C.bg, borderRadius:5, padding:"2px 8px", color:C.textDim, fontFamily:MONO }}>
                    {cvt(s.w, postUnit, displayUnit)}×{s.r}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {post.workout.exercises.length > 3 && (
            <button onClick={() => setExpanded(!expanded)} style={{ marginTop:10, fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", padding:0, fontWeight:600, fontFamily:F }}>
              {expanded ? "Show less" : `+${post.workout.exercises.length-3} more`}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"10px 10px 2px" }}>
        <button
          onClick={handleKudos}
          aria-label="Give kudos"
          style={{
            background:"none", border:"none", cursor:"pointer",
            padding:8, display:"flex", alignItems:"center", justifyContent:"center",
            transform: pop ? "scale(1.2)" : "scale(1)",
            transition:"transform 0.2s",
          }}
        >
          {/* Kudos = fire/flame for strength app (more fitting than clap) */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill={hasKudos ? C.orange : "none"} stroke={hasKudos ? C.orange : C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 C12 2 8 6 8 11 C8 14 10 16 10 16 C10 13 11 12 12 12 C13 12 14 13 14 16 C14 16 16 14 16 11 C16 6 12 2 12 2 Z"/>
            <path d="M7 13 C5 15 4 17 4 19 C4 21.5 7 23 12 23 C17 23 20 21.5 20 19 C20 17 19 15 17 13 C17 16 15 18 12 18 C9 18 7 16 7 13 Z"/>
          </svg>
        </button>
        <button
          onClick={() => setShowCmts(!showCmts)}
          aria-label="Comments"
          style={{
            background:"none", border:"none", cursor:"pointer",
            padding:8, display:"flex", alignItems:"center", justifyContent:"center",
          }}
        >
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15 Q21 17 19 17 L8 17 L4 21 V17 Q3 17 3 15 V7 Q3 5 5 5 H19 Q21 5 21 7 Z"/>
          </svg>
        </button>
        <button
          onClick={() => {
            const shareText = post.caption
              ? `${user?.username} on Spotr: ${post.caption}`
              : `Check out ${user?.username}'s workout on Spotr`;
            const shareUrl = typeof window !== "undefined" ? window.location.href : "";
            if (navigator.share) {
              navigator.share({ title: "Spotr", text: shareText, url: shareUrl }).catch(() => {});
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(`${shareText} ${shareUrl}`).then(() => {
                alert("Link copied to clipboard!");
              }).catch(() => {});
            }
          }}
          aria-label="Share"
          style={{
            background:"none", border:"none", cursor:"pointer",
            padding:8, display:"flex", alignItems:"center", justifyContent:"center",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>

      {/* Kudos count + caption + comments */}
      <div style={{ padding:"2px 14px 0" }}>
        {(post.kudos||[]).length > 0 && (
          <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:5 }}>
            {(post.kudos||[]).length} {(post.kudos||[]).length === 1 ? "kudo" : "kudos"}
          </div>
        )}
        {post.caption && (
          <div style={{ fontSize:13, color:C.text, lineHeight:1.45, marginBottom:5 }}>
            <span style={{ fontWeight:600, marginRight:6 }}>{user?.username}</span>
            {post.caption}
          </div>
        )}
        {post.comments.length > 0 && !showCmts && (
          <button onClick={() => setShowCmts(true)} style={{ fontSize:12, color:C.sub, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:F }}>
            View {post.comments.length === 1 ? "comment" : `all ${post.comments.length} comments`}
          </button>
        )}
      </div>

      {showCmts && (
        <div style={{ padding:"8px 14px 0" }}>
          {post.comments.map(c => {
            const cu = store.users.find(u => u.id === c.userId);
            return (
              <div key={c.id} style={{ display:"flex", gap:8, marginBottom:7 }}>
                <Avatar user={cu} size={26} C={C}/>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{cu?.username} </span>
                  <span style={{ fontSize:13, color:C.text }}>{c.text}</span>
                  <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>{timeAgo(c.createdAt)}</div>
                </div>
              </div>
            );
          })}
          <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
            <Avatar user={store.users.find(u => u.id === currentUserId)} size={26} C={C}/>
            <input
              value={cmtText}
              onChange={e => setCmtText(e.target.value)}
              placeholder="Add a comment..."
              onKeyDown={e => { if (e.key === "Enter" && cmtText.trim()) { onComment(post.id, cmtText); setCmtText(""); } }}
              style={{ flex:1, background:"transparent", border:"none", padding:"6px 0", fontSize:13, color:C.text, outline:"none", fontFamily:F }}
            />
            {cmtText.trim() && (
              <button onClick={() => { onComment(post.id, cmtText); setCmtText(""); }} style={{ background:"none", border:"none", color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Post</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// WORKOUT TRACKER
// ═════════════════════════════════════════════════════════════════════════════
function WorkoutTracker({ store, setStore, onShareWorkout, onPRHit, C }) {
  const [session, setSession] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [wStart, setWStart] = useState(null);
  const [rest, setRest] = useState(null);
  const [showFinish, setShowFinish] = useState(false);
  const [show1RM, setShow1RM] = useState(false);
  const [subTab, setSubTab] = useState("today");
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewingProgram, setViewingProgram] = useState(null); // program ID
  const [showBuilder, setShowBuilder] = useState(false);
  const [previewDay, setPreviewDay] = useState(null); // {day, programName}
  const elRef = useRef(null);
  const rtRef = useRef(null);

  const unit = store.unit || "lbs";
  const prog = store.programs?.find(p => p.id === store.activeProgramId);

  useEffect(() => {
    clearInterval(elRef.current);
    if (wStart) elRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-wStart)/1000)), 1000);
    return () => clearInterval(elRef.current);
  }, [wStart]);

  useEffect(() => {
    clearInterval(rtRef.current);
    if (rest?.running && rest.secs > 0) {
      rtRef.current = setInterval(() => setRest(p => p?.secs > 0 ? { ...p, secs: p.secs - 1 } : null), 1000);
    }
    return () => clearInterval(rtRef.current);
  }, [rest?.running]);

  function startWorkout(day) {
    const exs = day
      ? day.exercises.map(ex => ({
          ...ex, id: uid(),
          sets: Array.from({ length: 3 }, () => ({ id: uid(), weight: "", reps: "", done: false, type: "normal" }))
        }))
      : [{ id: uid(), name: "", reps: "", note: "", sets: [{ id: uid(), weight: "", reps: "", done: false, type: "normal" }] }];
    setSession({
      dayId: day?.id || "quick_" + uid(),
      dayName: day?.name || "Quick Workout",
      exercises: exs
    });
    setWStart(Date.now());
    setElapsed(0);
  }

  function toggleDone(ei, si) {
    setSession(p => ({
      ...p,
      exercises: p.exercises.map((ex, i) => i !== ei ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: !s.done })
      })
    }));
    setRest({ secs: store.defaultRestTime || 120, total: store.defaultRestTime || 120, running: true });
  }

  function updateSet(ei, si, patch) {
    setSession(p => ({
      ...p,
      exercises: p.exercises.map((ex, i) => i !== ei ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== si ? s : { ...s, ...patch })
      })
    }));
  }

  function finishWorkout(share) {
    if (!session) return;
    const dk = dKey();
    const sid = uid();
    let hitPR = null;

    const cleanEx = session.exercises.filter(e => e.name).map(ex => ({
      name: ex.name,
      sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps, done: s.done, type: s.type }))
    }));

    setStore(p => {
      const newPRs = { ...p.prs };
      session.exercises.forEach(ex => {
        if (!ex.name) return;
        const maxW = Math.max(0, ...ex.sets.filter(s => s.done && s.weight && s.type !== "warmup").map(s => parseFloat(s.weight) || 0));
        const maxLbs = unit === "lbs" ? maxW : cvt(maxW, "kg", "lbs");
        const prev = newPRs[ex.name] || 0;
        if (maxLbs > 0 && maxLbs > prev) {
          newPRs[ex.name] = maxLbs;
          hitPR = { name: ex.name, weight: maxW, increase: Math.round((maxLbs - prev) * 10) / 10 };
        }
      });
      return {
        ...p,
        history: {
          ...p.history,
          [dk]: {
            ...(p.history[dk] || {}),
            [sid]: { dayName: session.dayName, exercises: cleanEx, duration: elapsed, unit }
          }
        },
        prs: newPRs,
        workoutDates: { ...p.workoutDates, [dk]: true }
      };
    });

    if (share) {
      const postEx = session.exercises
        .filter(ex => ex.name && ex.sets.some(s => s.done))
        .map(ex => ({
          name: ex.name,
          sets: ex.sets.filter(s => s.done && s.type !== "warmup").map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 }))
        }));
      const vol = postEx.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
      onShareWorkout({
        type: "workout",
        caption: `Just crushed ${session.dayName} 💪`,
        unit,
        workout: { name: session.dayName, duration: elapsed, volume: Math.round(vol), exercises: postEx },
        isPR: !!hitPR
      });
    }

    clearInterval(elRef.current);
    setSession(null);
    setWStart(null);
    setElapsed(0);
    setRest(null);
    setShowFinish(false);
    if (hitPR) setTimeout(() => onPRHit(hitPR), 300);
  }

  // ── ACTIVE WORKOUT ──────────────────────────────────────────────────────────
  if (session) {
    const done = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const total = session.exercises.reduce((a, ex) => a + ex.sets.length, 0);

    return (
      <div style={{ background:C.bg, flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {show1RM && <OneRMModal onClose={() => setShow1RM(false)} unit={unit} C={C}/>}

        {/* Header */}
        <div style={{ background:C.bg, padding:"10px 14px", borderBottom:`1px solid ${C.divider}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => { clearInterval(elRef.current); setSession(null); setWStart(null); setElapsed(0); setRest(null); }} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1 }}>{session.dayName.toUpperCase()}</div>
            <div style={{ fontSize:22, fontWeight:700, color:C.text, fontFamily:MONO }}>{fmtTime(elapsed)}</div>
          </div>
          <button onClick={() => setShowFinish(true)} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Finish</button>
        </div>

        {/* Progress */}
        <div style={{ height:2, background:C.divider }}>
          <div style={{ height:"100%", background:C.accent, width:`${(done/Math.max(total,1))*100}%`, transition:"width 0.3s" }}/>
        </div>
        <div style={{ padding:"5px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:11, color:C.sub }}>{done}/{total} sets · {unit.toUpperCase()}</div>
          <button onClick={() => setShow1RM(true)} style={{ fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F, fontWeight:600 }}>1RM Calc</button>
        </div>

        {/* Rest timer */}
        {rest && (
          <div style={{ background:C.surface, padding:"8px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:`1px solid ${C.divider}`, borderBottom:`1px solid ${C.divider}` }}>
            <div style={{ display:"flex", gap:5 }}>
              {[60,90,120,180].map(s => (
                <button key={s} onClick={() => setRest({ secs:s, total:s, running:true })} style={{
                  fontSize:10, padding:"4px 9px", background:"transparent",
                  border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, cursor:"pointer", fontFamily:F
                }}>{s}s</button>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22, fontWeight:700, color:rest.secs<=10?C.red:C.green, fontFamily:MONO }}>{fmtTime(rest.secs)}</span>
              <button onClick={() => { clearInterval(rtRef.current); setRest(null); }} style={{ color:C.sub, background:"none", border:"none", cursor:"pointer", fontSize:16 }}>✕</button>
            </div>
          </div>
        )}

        {/* Exercises */}
        <div style={{ overflowY:"auto", flex:1, padding:"12px 0 20px" }}>
          {session.exercises.map((ex, ei) => {
            const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
            return (
              <div key={ex.id || ei} style={{ marginBottom:16, borderBottom:`1px solid ${C.divider}`, paddingBottom:12 }}>
                <div style={{ padding:"0 14px 10px", display:"flex", alignItems:"center", gap:10 }}>
                  {exInfo && <div style={{ fontSize:22 }}>{exInfo.emoji}</div>}
                  <ExerciseInput
                    value={ex.name}
                    onChange={v => setSession(p => ({
                      ...p,
                      exercises: p.exercises.map((x, i) => i !== ei ? x : { ...x, name: v })
                    }))}
                    C={C}
                  />
                  <button onClick={() => setSession(p => ({ ...p, exercises: p.exercises.filter((_, i) => i !== ei) }))} style={{
                    color:C.sub, background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px", flexShrink:0
                  }}>🗑</button>
                </div>

                {/* Column headers */}
                <div style={{ display:"grid", gridTemplateColumns:"24px 32px 1fr 68px 68px 32px", gap:6, padding:"0 14px 4px" }}>
                  {["#","TYPE","PREV", unit.toUpperCase(), "REPS",""].map(h => (
                    <div key={h} style={{ fontSize:9, color:C.sub, fontWeight:700, letterSpacing:0.5, textAlign:"center" }}>{h}</div>
                  ))}
                </div>

                {ex.sets.map((set, si) => (
                  <SetRow
                    key={set.id || si}
                    set={set}
                    si={si}
                    exName={ex.name}
                    store={store}
                    unit={unit}
                    C={C}
                    onUpdate={patch => updateSet(ei, si, patch)}
                    onToggleDone={() => toggleDone(ei, si)}
                  />
                ))}

                <div style={{ display:"flex", marginTop:4, padding:"0 14px" }}>
                  <button onClick={() => setSession(p => ({
                    ...p,
                    exercises: p.exercises.map((x, i) => i !== ei ? x : {
                      ...x, sets: [...x.sets, { id:uid(), weight:"", reps:"", done:false, type:"normal" }]
                    })
                  }))} style={{
                    flex:1, padding:"8px", background:"none", border:"none", color:C.accent,
                    fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
                  }}>+ Add Set</button>
                  {ex.sets.length > 1 && (
                    <button onClick={() => setSession(p => ({
                      ...p,
                      exercises: p.exercises.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.slice(0, -1) })
                    }))} style={{
                      flex:1, padding:"8px", background:"none", border:"none",
                      color:C.red, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
                    }}>− Remove</button>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={() => setSession(p => ({
            ...p,
            exercises: [...p.exercises, { id:uid(), name:"", reps:"", sets:[{ id:uid(), weight:"", reps:"", done:false, type:"normal" }] }]
          }))} style={{
            width:"calc(100% - 28px)", margin:"0 14px", padding:"12px",
            background:"none", border:`1.5px dashed ${C.border}`,
            borderRadius:10, fontSize:13, color:C.accent, fontWeight:600, cursor:"pointer", fontFamily:F
          }}>+ Add Exercise</button>
        </div>

        {/* Finish modal */}
        {showFinish && (
          <div onClick={() => setShowFinish(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", padding:"20px 18px 36px", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:19, fontWeight:700, color:C.text, marginBottom:4 }}>Finish Workout?</div>
              <div style={{ fontSize:13, color:C.sub, marginBottom:18 }}>{done}/{total} sets · {fmtTime(elapsed)}</div>
              <button onClick={() => finishWorkout(true)} style={{ width:"100%", background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"13px", fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:8, fontFamily:F }}>Save & Share to Feed</button>
              <button onClick={() => finishWorkout(false)} style={{ width:"100%", background:"none", color:C.text, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:8, fontFamily:F }}>Save (Don't Share)</button>
              <button onClick={() => setShowFinish(false)} style={{ width:"100%", background:"none", color:C.sub, border:"none", padding:"10px", fontSize:13, cursor:"pointer", fontFamily:F }}>Keep going</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── TRACKER HOME ────────────────────────────────────────────────────────────
  const allEx = new Set();
  Object.values(store.history || {}).forEach(d =>
    Object.values(d).forEach(s =>
      s.exercises?.forEach(e => e.name && allEx.add(e.name))
    )
  );

  return (
    <div style={{ overflowY:"auto", flex:1, display:"flex", flexDirection:"column", paddingBottom:80 }}>
      {/* Sub-tabs — Instagram-style thin underline */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.divider}`, background:C.bg, position:"sticky", top:0, zIndex:5 }}>
        {[["today","Today"],["programs","Programs"],["exercises","Exercises"],["history","History"]].map(([t,l]) => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            flex:1, padding:"12px 4px", background:"none", border:"none",
            color:subTab===t?C.text:C.sub, fontSize:12, fontWeight:subTab===t?700:500, cursor:"pointer",
            borderBottom:subTab===t?`2px solid ${C.text}`:"2px solid transparent", fontFamily:F
          }}>{l}</button>
        ))}
      </div>

      {subTab === "today" && (
        <div style={{ padding:"16px 14px" }}>
          <button onClick={() => startWorkout(null)} style={{
            width:"100%", background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
            border:"none", borderRadius:12, padding:"18px 16px", marginBottom:14,
            cursor:"pointer", display:"flex", alignItems:"center", gap:14, fontFamily:F
          }}>
            <div style={{ fontSize:28 }}>⚡</div>
            <div style={{ textAlign:"left", flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>Quick Start</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.85)", marginTop:2 }}>Empty workout</div>
            </div>
            <span style={{ fontSize:20, color:"rgba(255,255,255,0.7)" }}>›</span>
          </button>

          <button onClick={() => setShow1RM(true)} style={{
            width:"100%", background:"none", border:`1px solid ${C.border}`,
            borderRadius:10, padding:"14px 16px", marginBottom:16,
            display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left", fontFamily:F
          }}>
            <div style={{ fontSize:20 }}>🧮</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text }}>1RM Calculator</div>
              <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>Estimate your one-rep max</div>
            </div>
            <span style={{ fontSize:16, color:C.sub }}>›</span>
          </button>

          {show1RM && <OneRMModal onClose={() => setShow1RM(false)} unit={unit} C={C}/>}

          {prog ? (
            <>
              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>
                ACTIVE · {prog.name.toUpperCase()}
              </div>
              {prog.days.map(day => (
                <button key={day.id} onClick={() => setPreviewDay({ day, programName: prog.name })} style={{
                  width:"100%", background:"none", border:`1px solid ${C.border}`,
                  borderRadius:10, padding:"12px 14px",
                  display:"flex", alignItems:"center", gap:11, cursor:"pointer", textAlign:"left", marginBottom:6, fontFamily:F
                }}>
                  <div style={{ width:3, height:32, borderRadius:2, background:C.accent, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{day.name}</div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>{day.exercises.length} exercises</div>
                  </div>
                  <span style={{ fontSize:16, color:C.sub }}>›</span>
                </button>
              ))}
            </>
          ) : (
            <div style={{ background:"none", border:`1px dashed ${C.border}`, borderRadius:12, padding:"22px 16px", textAlign:"center" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>No active program</div>
              <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Import a starter template or just start logging</div>
              <button onClick={() => setShowTemplates(true)} style={{
                background:C.accent, color:"#fff", border:"none", borderRadius:8,
                padding:"9px 18px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
              }}>Browse Templates</button>
            </div>
          )}
        </div>
      )}

      {subTab === "programs" && !viewingProgram && !showBuilder && (
        <div style={{ padding:"16px 14px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            <button onClick={() => setShowBuilder(true)} style={{
              background:`linear-gradient(135deg,${C.accent},${C.accent2})`, color:"#fff", border:"none",
              borderRadius:10, padding:"13px 10px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
            }}>
              <div style={{ fontSize:18, marginBottom:3 }}>✨</div>
              Build Your Own
            </button>
            <button onClick={() => setShowTemplates(true)} style={{
              background:"none", color:C.text, border:`1px solid ${C.border}`,
              borderRadius:10, padding:"13px 10px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
            }}>
              <div style={{ fontSize:18, marginBottom:3 }}>📋</div>
              Use Template
            </button>
          </div>

          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>
            MY PROGRAMS · {store.programs?.length || 0}
          </div>
          {(!store.programs || !store.programs.length) && (
            <div style={{ textAlign:"center", color:C.sub, padding:"24px 0", fontSize:13 }}>No programs yet. Build one or import a template.</div>
          )}
          {(store.programs || []).map(p => (
            <div key={p.id} onClick={() => setViewingProgram(p.id)} style={{
              background:"none", border:`1px solid ${store.activeProgramId === p.id ? C.accent : C.border}`,
              borderRadius:10, padding:"13px 14px", marginBottom:8, cursor:"pointer",
              display:"flex", alignItems:"center", gap:12
            }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{p.name}</div>
                  {store.activeProgramId === p.id && (
                    <span style={{ fontSize:9, background:C.accent, color:"#fff", padding:"2px 7px", borderRadius:20, fontWeight:700, letterSpacing:0.5 }}>ACTIVE</span>
                  )}
                </div>
                <div style={{ fontSize:11, color:C.sub }}>
                  {p.days?.length || 0} days · {p.days?.reduce((a, d) => a + (d.exercises?.length || 0), 0)} exercises
                </div>
              </div>
              <span style={{ fontSize:18, color:C.sub }}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* Program Detail View */}
      {subTab === "programs" && viewingProgram && (() => {
        const prog = store.programs?.find(p => p.id === viewingProgram);
        if (!prog) { setViewingProgram(null); return null; }
        const isActive = store.activeProgramId === prog.id;
        return (
          <div style={{ padding:"14px" }}>
            <button onClick={() => setViewingProgram(null)} style={{
              background:"none", border:"none", color:C.text, fontSize:14, cursor:"pointer",
              padding:"4px 0 12px", fontFamily:F
            }}>‹ Back to Programs</button>

            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:4 }}>{prog.name}</div>
              <div style={{ fontSize:13, color:C.sub }}>{prog.days?.length || 0} days · {prog.days?.reduce((a, d) => a + (d.exercises?.length || 0), 0)} exercises</div>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:18 }}>
              {!isActive && (
                <button onClick={() => setStore(s => ({ ...s, activeProgramId: prog.id }))} style={{
                  flex:1, background:C.accent, color:"#fff", border:"none", borderRadius:8,
                  padding:"10px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F
                }}>Set as Active</button>
              )}
              {isActive && (
                <button onClick={() => setStore(s => ({ ...s, activeProgramId: null }))} style={{
                  flex:1, background:"none", color:C.text, border:`1px solid ${C.border}`, borderRadius:8,
                  padding:"10px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F
                }}>Deactivate</button>
              )}
              <button onClick={() => {
                if (window.confirm(`Delete "${prog.name}"?`)) {
                  setStore(s => ({
                    ...s,
                    programs: s.programs.filter(x => x.id !== prog.id),
                    activeProgramId: s.activeProgramId === prog.id ? null : s.activeProgramId
                  }));
                  setViewingProgram(null);
                }
              }} style={{
                background:"none", color:C.red, border:`1px solid ${C.border}`, borderRadius:8,
                padding:"10px 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F
              }}>Delete</button>
            </div>

            {(prog.days || []).map((day, di) => (
              <div key={day.id || di} style={{
                border:`1px solid ${C.border}`, borderRadius:12, padding:"14px", marginBottom:10
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{day.name}</div>
                  <button onClick={() => { startWorkout(day); }} style={{
                    background:C.accent, color:"#fff", border:"none", borderRadius:6,
                    padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
                  }}>Start</button>
                </div>
                {(day.exercises || []).map((ex, ei) => {
                  const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
                  return (
                    <div key={ei} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"8px 0",
                      borderTop: ei > 0 ? `1px solid ${C.divider}` : "none"
                    }}>
                      {exInfo && <div style={{ fontSize:18 }}>{exInfo.emoji}</div>}
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{ex.name}</div>
                        {ex.reps && <div style={{ fontSize:11, color:C.sub }}>{ex.reps} reps</div>}
                      </div>
                    </div>
                  );
                })}
                {(!day.exercises || day.exercises.length === 0) && (
                  <div style={{ fontSize:12, color:C.sub, textAlign:"center", padding:"8px 0" }}>No exercises</div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Custom Program Builder */}
      {subTab === "programs" && showBuilder && (
        <ProgramBuilder
          C={C}
          onCancel={() => setShowBuilder(false)}
          onSave={prog => {
            setStore(p => ({ ...p, programs: [...(p.programs || []), prog], activeProgramId: prog.id }));
            setShowBuilder(false);
            setViewingProgram(prog.id);
          }}
        />
      )}

      {subTab === "exercises" && (
        <div style={{ padding:"16px 14px" }}>
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>
            LOGGED EXERCISES · {allEx.size}
          </div>
          {!allEx.size && (
            <div style={{ textAlign:"center", color:C.sub, padding:"24px 0", fontSize:13 }}>Complete a workout to see your exercises.</div>
          )}
          {Array.from(allEx).sort().map(name => {
            const pr = store.prs?.[name];
            const exInfo = EXERCISE_DB.find(e => e.name === name);
            return (
              <div key={name} style={{
                background:"none", borderBottom:`1px solid ${C.divider}`,
                padding:"11px 0", display:"flex", alignItems:"center", gap:12
              }}>
                {exInfo && (
                  <div style={{
                    width:40, height:40, borderRadius:10,
                    background:C.divider,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:20, flexShrink:0
                  }}>{exInfo.emoji}</div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{name}</div>
                  {pr && (
                    <div style={{ fontSize:11, color:C.gold, marginTop:1 }}>🏆 PR · {cvt(pr, "lbs", unit)} {unit}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subTab === "history" && (
        <div style={{ padding:"6px 14px" }}>
          <Heatmap workoutDates={store.workoutDates} C={C}/>
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>
            WORKOUT HISTORY
          </div>
          {!Object.keys(store.history || {}).length && (
            <div style={{ textAlign:"center", color:C.sub, padding:"24px 0", fontSize:13 }}>No workouts yet.</div>
          )}
          {Object.entries(store.history || {}).sort(([a], [b]) => b.localeCompare(a)).map(([date, sessions]) => (
            <div key={date} style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.sub, marginBottom:6 }}>{date}</div>
              {Object.values(sessions).map((sess, i) => {
                const done = sess.exercises?.reduce((a, ex) => a + (ex.sets?.filter(s => s.done).length || 0), 0) || 0;
                return (
                  <div key={i} style={{
                    background:"none", border:`1px solid ${C.border}`,
                    borderRadius:10, padding:"11px 14px", marginBottom:6
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{sess.dayName}</div>
                      <div style={{ fontSize:11, color:C.sub }}>{fmtTime(sess.duration)} · {done} sets</div>
                    </div>
                    <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      {sess.exercises?.filter(e => e.name).map((ex, j) => (
                        <span key={j} style={{ fontSize:11, color:C.sub }}>
                          {ex.name}{j < sess.exercises.length - 1 ? " ·" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {showTemplates && (
        <div onClick={() => setShowTemplates(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"85vh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
              <button onClick={() => setShowTemplates(false)} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
              <div style={{ fontSize:15, fontWeight:600, color:C.text }}>Starter Templates</div>
              <div style={{ width:50 }}/>
            </div>
            <div style={{ overflowY:"auto", flex:1, padding:"14px" }}>
              {[
                { id:"ppl", name:"Push Pull Legs", icon:"🔥", desc:"6-day hypertrophy", days:[
                  { name:"Push A", exercises:["Barbell Bench Press","Incline DB Press","Lateral Raises","Tricep Pushdown"] },
                  { name:"Pull A", exercises:["Pull-Ups","Barbell Row","Face Pulls","Barbell Curl"] },
                  { name:"Legs A", exercises:["Barbell Back Squat","Romanian Deadlift","Leg Press","Standing Calf Raise"] },
                ]},
                { id:"531", name:"5/3/1 BBB", icon:"💪", desc:"Wendler strength", days:[
                  { name:"Squat Day", exercises:["Barbell Back Squat","Leg Press"] },
                  { name:"Bench Day", exercises:["Barbell Bench Press","Barbell Row"] },
                  { name:"Deadlift Day", exercises:["Deadlift","Seated Leg Curl"] },
                  { name:"OHP Day", exercises:["Overhead Press","Pull-Ups"] },
                ]},
                { id:"bro", name:"Bro Split", icon:"💯", desc:"One muscle/day · 5 days", days:[
                  { name:"Chest Day", exercises:["Barbell Bench Press","Incline DB Press","Cable Fly"] },
                  { name:"Back Day", exercises:["Deadlift","Pull-Ups","Barbell Row"] },
                  { name:"Shoulder Day", exercises:["Overhead Press","Lateral Raises"] },
                  { name:"Arms Day", exercises:["Barbell Curl","Skull Crushers"] },
                  { name:"Legs Day", exercises:["Barbell Back Squat","Romanian Deadlift","Leg Press"] },
                ]},
              ].map(t => (
                <div key={t.id} style={{
                  background:"none", border:`1px solid ${C.border}`,
                  borderRadius:12, padding:"14px", marginBottom:10
                }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:2 }}>{t.icon} {t.name}</div>
                  <div style={{ fontSize:12, color:C.sub, marginBottom:12 }}>{t.desc} · {t.days.length} days</div>
                  <button onClick={() => {
                    const prog = {
                      id: uid(),
                      name: t.name,
                      days: t.days.map(d => ({
                        ...d, id: uid(),
                        exercises: d.exercises.map(name => ({ name, reps: "8–12", note: "" }))
                      }))
                    };
                    setStore(p => ({ ...p, programs: [...(p.programs || []), prog], activeProgramId: prog.id }));
                    setShowTemplates(false);
                  }} style={{
                    width:"100%", background:C.accent, border:"none", borderRadius:8,
                    fontSize:12, fontWeight:600, color:"#fff", cursor:"pointer", padding:"9px", fontFamily:F
                  }}>Import & Set Active</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day Preview modal — shows exercises before starting */}
      {previewDay && (
        <div onClick={() => setPreviewDay(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"85vh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
              <button onClick={() => setPreviewDay(null)} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
              <div style={{ fontSize:15, fontWeight:600, color:C.text }}>{previewDay.day.name}</div>
              <div style={{ width:50 }}/>
            </div>
            <div style={{ overflowY:"auto", flex:1, padding:"14px 14px 6px" }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:4 }}>
                {(previewDay.programName || "").toUpperCase()}
              </div>
              <div style={{ fontSize:13, color:C.sub, marginBottom:16 }}>
                {previewDay.day.exercises.length} exercise{previewDay.day.exercises.length === 1 ? "" : "s"}
              </div>
              {previewDay.day.exercises.map((ex, i) => {
                const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
                const pr = store.prs?.[ex.name];
                return (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:12,
                    padding:"12px 0", borderBottom: i < previewDay.day.exercises.length - 1 ? `1px solid ${C.divider}` : "none"
                  }}>
                    {exInfo && (
                      <div style={{
                        width:44, height:44, borderRadius:10,
                        background:C.divider,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:22, flexShrink:0
                      }}>{exInfo.emoji}</div>
                    )}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{ex.name}</div>
                      <div style={{ fontSize:11, color:C.sub, marginTop:2, display:"flex", gap:10 }}>
                        {ex.reps && <span>{ex.reps} reps</span>}
                        {exInfo?.muscle && <span>· {exInfo.muscle}</span>}
                        {pr && <span style={{ color:C.gold }}>· PR {cvt(pr, "lbs", unit)} {unit}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding:"12px 14px 24px", borderTop:`1px solid ${C.divider}` }}>
              <button onClick={() => {
                const day = previewDay.day;
                setPreviewDay(null);
                startWorkout(day);
              }} style={{
                width:"100%", background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                color:"#fff", border:"none", borderRadius:10, padding:"14px",
                fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F
              }}>Start Workout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// GROUPS
// ═════════════════════════════════════════════════════════════════════════════
function GroupsScreen({ store, setStore, currentUserId, C }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [activeGroup, setActiveGroup] = useState(null);
  const myGroups = (store.groups || []).filter(g => g.members.includes(currentUserId));

  function createGroup() {
    if (!newName) return;
    const g = { id:uid(), name:newName, description:newDesc, createdBy:currentUserId, members:[currentUserId], icon:"🏋️" };
    setStore(p => ({ ...p, groups:[...(p.groups || []), g] }));
    setShowCreate(false); setNewName(""); setNewDesc("");
  }

  if (activeGroup) {
    const g = (store.groups || []).find(x => x.id === activeGroup);
    if (!g) { setActiveGroup(null); return null; }
    const members = g.members.map(mid => store.users.find(u => u.id === mid)).filter(Boolean);
    const notMembers = store.users.filter(u => !g.members.includes(u.id) && u.id !== currentUserId);

    return (
      <div style={{ overflowY:"auto", flex:1, paddingBottom:80 }}>
        <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.divider}`, display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={() => setActiveGroup(null)} style={{ fontSize:20, color:C.text, background:"none", border:"none", cursor:"pointer" }}>‹</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:600, color:C.text }}>{g.icon} {g.name}</div>
            <div style={{ fontSize:11, color:C.sub }}>🔒 {g.members.length} members</div>
          </div>
        </div>
        <div style={{ padding:"14px" }}>
          {g.description && (
            <div style={{ fontSize:13, color:C.textDim, marginBottom:16, lineHeight:1.5 }}>{g.description}</div>
          )}
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>MEMBERS</div>
          {members.map(u => (
            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:`1px solid ${C.divider}` }}>
              <Avatar user={u} size={38} C={C}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{u.name}{u.id===currentUserId?" (You)":""}</div>
                <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
              </div>
              {u.id === g.createdBy && (
                <span style={{ fontSize:9, color:C.gold, fontWeight:600, letterSpacing:0.5 }}>ADMIN</span>
              )}
            </div>
          ))}
          {notMembers.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, margin:"16px 0 10px" }}>INVITE</div>
              {notMembers.map(u => (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:`1px solid ${C.divider}` }}>
                  <Avatar user={u} size={36} C={C}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{u.name}</div>
                    <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
                  </div>
                  <button onClick={() => setStore(p => ({
                    ...p,
                    groups: p.groups.map(gr => gr.id !== g.id ? gr : { ...gr, members: [...gr.members, u.id] })
                  }))} style={{
                    background:C.accent, color:"#fff", border:"none", borderRadius:6,
                    padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
                  }}>Invite</button>
                </div>
              ))}
            </>
          )}
          <button onClick={() => {
            setStore(p => ({
              ...p,
              groups: p.groups.map(gr => gr.id !== g.id ? gr : { ...gr, members: gr.members.filter(m => m !== currentUserId) })
            }));
            setActiveGroup(null);
          }} style={{
            width:"100%", background:"none", color:C.red, border:"none",
            padding:"14px", fontSize:13, cursor:"pointer", marginTop:16, fontFamily:F
          }}>Leave Group</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowY:"auto", flex:1, padding:"16px 14px 80px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <div style={{ fontSize:22, fontWeight:700, color:C.text }}>Groups</div>
        <button onClick={() => setShowCreate(true)} style={{
          background:C.accent, color:"#fff", border:"none", borderRadius:6,
          padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
        }}>+ New</button>
      </div>
      <div style={{ fontSize:12, color:C.sub, marginBottom:16, lineHeight:1.5 }}>
        Private groups for your gym crew or teammates. Only members see activity inside.
      </div>
      {!myGroups.length && (
        <div style={{
          background:"none", border:`1px dashed ${C.border}`,
          borderRadius:12, padding:"26px", textAlign:"center"
        }}>
          <div style={{ fontSize:28, marginBottom:8 }}>👥</div>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>No groups yet</div>
          <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Create one for your gym crew or team</div>
          <button onClick={() => setShowCreate(true)} style={{
            background:C.accent, color:"#fff", border:"none", borderRadius:8,
            padding:"9px 18px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
          }}>Create Group</button>
        </div>
      )}
      {myGroups.map(g => (
        <div key={g.id} onClick={() => setActiveGroup(g.id)} style={{
          border:`1px solid ${C.border}`, borderRadius:10, padding:"14px",
          marginBottom:8, cursor:"pointer"
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:g.description?6:0 }}>
            <div style={{ fontSize:26 }}>{g.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{g.name}</div>
              <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>🔒 {g.members.length} members</div>
            </div>
            <span style={{ fontSize:16, color:C.sub }}>›</span>
          </div>
          {g.description && <div style={{ fontSize:12, color:C.textDim, lineHeight:1.4 }}>{g.description}</div>}
        </div>
      ))}

      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", padding:"18px 18px 32px", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}` }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>New Group</div>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Group name"
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}
            />
            <textarea
              value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="What's this group for?"
              rows={2}
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 14px", fontSize:13, color:C.text, outline:"none", marginBottom:14, boxSizing:"border-box", resize:"none", fontFamily:F }}
            />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:"11px", background:"none", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, cursor:"pointer", fontFamily:F }}>Cancel</button>
              <button onClick={createGroup} style={{ flex:1, padding:"11px", background:C.accent, border:"none", borRadius:8, borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DISCOVER
// ═════════════════════════════════════════════════════════════════════════════
function DiscoverScreen({ store, setStore, currentUserId, onUserClick, setTab, C }) {
  const [q, setQ] = useState("");
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];
  const others = store.users.filter(u =>
    u.id !== currentUserId && (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase()))
  );

  function toggleFollow(uid2) {
    const isF = me?.following?.includes(uid2);
    setStore(p => ({
      ...p,
      users: p.users.map(u => {
        if (u.id === currentUserId) return { ...u, following: isF ? u.following.filter(id => id !== uid2) : [...(u.following || []), uid2] };
        if (u.id === uid2) return { ...u, followers: isF ? u.followers.filter(id => id !== currentUserId) : [...(u.followers || []), currentUserId] };
        return u;
      })
    }));
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:80 }}>
      <div style={{ padding:"10px 14px 6px", position:"relative" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position:"absolute", left:26, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.5" y2="16.5"/>
        </svg>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search"
          style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"10px 14px 10px 36px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}
        />
      </div>
      <div style={{ padding:"6px 14px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
          <button onClick={() => setTab("challenges")} style={{
            background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
            border:"none", borderRadius:12, padding:"16px",
            color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:F
          }}>
            <div style={{ fontSize:22 }}>🎯</div>
            <div style={{ fontSize:13, fontWeight:700, marginTop:6 }}>Challenges</div>
            <div style={{ fontSize:10, opacity:0.85 }}>Join or create</div>
          </button>
          <button onClick={() => setTab("groups")} style={{
            background:"linear-gradient(135deg,#059669,#047857)",
            border:"none", borderRadius:12, padding:"16px",
            color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:F
          }}>
            <div style={{ fontSize:22 }}>👥</div>
            <div style={{ fontSize:13, fontWeight:700, marginTop:6 }}>Groups</div>
            <div style={{ fontSize:10, opacity:0.85 }}>Private crews</div>
          </button>
        </div>

        {following.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>🏅 FRIENDS LEADERBOARD</div>
            <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px" }}>
              {["Barbell Bench Press","Barbell Back Squat","Deadlift"].map((ex, i) => (
                <div key={ex} style={{ borderBottom:i<2?`1px solid ${C.divider}`:"none", paddingBottom:i<2?10:0, marginBottom:i<2?10:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:C.text, marginBottom:6 }}>{ex}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[...store.users.filter(u => following.includes(u.id)), store.users.find(u => u.id === currentUserId)].filter(Boolean).map((u, j) => (
                      <div key={u.id} style={{ display:"flex", alignItems:"center", gap:5, background:C.divider, borderRadius:20, padding:"3px 10px" }}>
                        <Avatar user={u} size={16} C={C}/>
                        <span style={{ fontSize:10, color:C.text, fontWeight:500 }}>{u.name.split(" ")[0]}</span>
                        <span style={{ fontSize:10, color:C.sub, fontFamily:MONO }}>{[225,185,205][j%3] || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ fontSize:10, color:C.muted, marginTop:10 }}>Friends only · no strangers, no faking</div>
            </div>
          </div>
        )}

        <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>SUGGESTED</div>
        {others.map(u => {
          const isF = following.includes(u.id);
          return (
            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0" }}>
              <Avatar user={u} size={44} C={C} onClick={() => onUserClick(u.id)}/>
              <div style={{ flex:1, cursor:"pointer" }} onClick={() => onUserClick(u.id)}>
                <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                <div style={{ fontSize:12, color:C.sub }}>{u.name} · {u.bio}</div>
              </div>
              <button onClick={() => toggleFollow(u.id)} style={{
                padding:"6px 16px", background:isF?"transparent":C.accent,
                border:`1px solid ${isF?C.border:C.accent}`, borderRadius:6,
                fontSize:12, fontWeight:600, color:isF?C.text:"#fff",
                cursor:"pointer", flexShrink:0, fontFamily:F
              }}>{isF?"Following":"Follow"}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHALLENGES
// ═════════════════════════════════════════════════════════════════════════════
function ChallengesScreen({ store, setStore, currentUserId, C }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  function create() {
    if (!name) return;
    const ch = {
      id: uid(), name, description: desc, createdBy: currentUserId,
      participants: [currentUserId], startDate: Date.now(),
      endDate: Date.now() + 30*24*60*60*1000, icon: "💪"
    };
    setStore(p => ({ ...p, challenges: [...(p.challenges || []), ch] }));
    setShowCreate(false); setName(""); setDesc("");
  }
  function toggle(cid) {
    setStore(p => ({
      ...p,
      challenges: p.challenges.map(c => c.id !== cid ? c : {
        ...c,
        participants: c.participants.includes(currentUserId)
          ? c.participants.filter(x => x !== currentUserId)
          : [...c.participants, currentUserId]
      })
    }));
  }

  return (
    <div style={{ overflowY:"auto", flex:1, padding:"16px 14px 80px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:700, color:C.text }}>Challenges</div>
        <button onClick={() => setShowCreate(true)} style={{
          background:C.accent, color:"#fff", border:"none", borderRadius:6,
          padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
        }}>+ New</button>
      </div>
      {(store.challenges || []).map(ch => {
        const joined = ch.participants.includes(currentUserId);
        const daysLeft = Math.ceil((ch.endDate - Date.now()) / (1000*60*60*24));
        return (
          <div key={ch.id} style={{
            border:`1px solid ${C.border}`, borderRadius:12,
            padding:"14px", marginBottom:10
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:11, marginBottom:8 }}>
              <div style={{ fontSize:26 }}>{ch.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{ch.name}</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>
                  {ch.participants.length} joined · {daysLeft > 0 ? `${daysLeft}d left` : "Ended"}
                </div>
              </div>
            </div>
            {ch.description && (
              <div style={{ fontSize:13, color:C.textDim, marginBottom:10, lineHeight:1.5 }}>{ch.description}</div>
            )}
            <button onClick={() => toggle(ch.id)} style={{
              width:"100%", background:joined?"transparent":C.accent,
              color:joined?C.text:"#fff", border:`1px solid ${joined?C.border:C.accent}`,
              borderRadius:8, padding:"9px", fontSize:13, fontWeight:600,
              cursor:"pointer", fontFamily:F
            }}>{joined ? "Leave Challenge" : "Join Challenge"}</button>
          </div>
        );
      })}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", padding:"18px 18px 32px", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}` }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>New Challenge</div>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Challenge name"
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}
            />
            <textarea
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Description..."
              rows={2}
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 14px", fontSize:13, color:C.text, outline:"none", marginBottom:14, boxSizing:"border-box", resize:"none", fontFamily:F }}
            />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex:1, padding:"11px", background:"none", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, cursor:"pointer", fontFamily:F }}>Cancel</button>
              <button onClick={create} style={{ flex:1, padding:"11px", background:C.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═════════════════════════════════════════════════════════════════════════════
function ProfileScreen({ userId, store, setStore, currentUserId, onBack, displayUnit, C, onToggleTheme, onUserClick }) {
  const user = store.users.find(u => u.id === userId);
  const isMe = userId === currentUserId;
  const me = store.users.find(u => u.id === currentUserId);
  const isFollowing = me?.following?.includes(userId);
  const posts = store.posts.filter(p => p.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  const avatarRef = useRef(null);
  const streak = isMe ? calcStreak(store.workoutDates) : 0;
  const followers = store.users.find(u => u.id === userId)?.followers?.length || 0;
  const following2 = store.users.find(u => u.id === userId)?.following?.length || 0;
  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [listModal, setListModal] = useState(null); // "followers" | "following" | null
  const [editName, setEditName] = useState(user?.name || "");
  const [editUsername, setEditUsername] = useState(user?.username || "");
  const [editBio, setEditBio] = useState(user?.bio || "");

  useEffect(() => {
    if (showEdit) {
      setEditName(user?.name || "");
      setEditUsername(user?.username || "");
      setEditBio(user?.bio || "");
    }
  }, [showEdit, user]);

  function saveProfile() {
    setStore(p => ({
      ...p,
      users: p.users.map(u => u.id === currentUserId ? {
        ...u,
        name: editName.trim() || u.name,
        username: editUsername.trim().replace(/\s/g, "") || u.username,
        bio: editBio
      } : u)
    }));
    setShowEdit(false);
  }

  function toggleFollow() {
    setStore(p => ({
      ...p,
      users: p.users.map(u => {
        if (u.id === currentUserId) return { ...u, following: isFollowing ? u.following.filter(id => id !== userId) : [...(u.following || []), userId] };
        if (u.id === userId) return { ...u, followers: isFollowing ? u.followers.filter(id => id !== currentUserId) : [...(u.followers || []), currentUserId] };
        return u;
      })
    }));
  }

  function handleAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = ev => setStore(p => ({
      ...p,
      users: p.users.map(u => u.id === currentUserId ? { ...u, profileImage: ev.target.result } : u)
    }));
    r.readAsDataURL(file);
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:80 }}>
      <div style={{ padding:"12px 14px" }}>
        {onBack && (
          <button onClick={onBack} style={{ fontSize:20, color:C.text, background:"none", border:"none", cursor:"pointer", marginBottom:10, display:"block" }}>‹</button>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:14 }}>
          <div style={{ position:"relative" }}>
            <Avatar user={user} size={76} C={C} onClick={isMe ? () => avatarRef.current?.click() : undefined}/>
            {isMe && (
              <>
                <input ref={avatarRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleAvatar}/>
                <div style={{ position:"absolute", bottom:-2, right:-2, background:C.accent, border:`2px solid ${C.bg}`, borderRadius:"50%", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#fff", cursor:"pointer" }}>📷</div>
              </>
            )}
          </div>
          <div style={{ flex:1, display:"flex", justifyContent:"space-around", textAlign:"center" }}>
            <div><div style={{ fontSize:17, fontWeight:700, color:C.text }}>{posts.length}</div><div style={{ fontSize:12, color:C.sub }}>Posts</div></div>
            <div onClick={() => followers > 0 && setListModal("followers")} style={{ cursor: followers > 0 ? "pointer" : "default" }}>
              <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{followers}</div>
              <div style={{ fontSize:12, color:C.sub }}>Followers</div>
            </div>
            <div onClick={() => following2 > 0 && setListModal("following")} style={{ cursor: following2 > 0 ? "pointer" : "default" }}>
              <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{following2}</div>
              <div style={{ fontSize:12, color:C.sub }}>Following</div>
            </div>
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, display:"flex", alignItems:"center", gap:8 }}>
            {user?.name}
            {isMe && streak > 0 && <StreakBadge streak={streak} size="sm"/>}
          </div>
          <div style={{ fontSize:13, color:C.sub }}>@{user?.username}</div>
          {user?.bio && <div style={{ fontSize:13, color:C.text, marginTop:4 }}>{user.bio}</div>}
        </div>
        {!isMe ? (
          <button onClick={toggleFollow} style={{
            width:"100%", padding:"8px", background:isFollowing?"transparent":C.accent,
            border:`1px solid ${isFollowing?C.border:C.accent}`, borderRadius:8,
            fontSize:13, fontWeight:600, color:isFollowing?C.text:"#fff",
            cursor:"pointer", fontFamily:F
          }}>{isFollowing ? "Following" : "Follow"}</button>
        ) : (
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={() => setShowEdit(true)} style={{
              flex:1, padding:"7px", background:"transparent",
              border:`1px solid ${C.border}`, borderRadius:8,
              fontSize:13, fontWeight:600, color:C.text,
              cursor:"pointer", fontFamily:F
            }}>Edit profile</button>
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              style={{
                width:38, padding:"7px 0", background:"transparent",
                border:`1px solid ${C.border}`, borderRadius:8,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {isMe && (
        <div style={{ padding:"0 14px" }}>
          <Heatmap workoutDates={store.workoutDates} C={C}/>
        </div>
      )}

      <div style={{ borderTop:`1px solid ${C.divider}`, paddingTop:16 }}>
        {posts.length === 0 && (
          <div style={{ textAlign:"center", color:C.sub, padding:"36px 0", fontSize:14 }}>No posts yet.</div>
        )}
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            store={store}
            currentUserId={currentUserId}
            displayUnit={displayUnit}
            C={C}
            onKudos={() => {}}
            onComment={() => {}}
            onUserClick={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        ))}
      </div>

      {/* Edit Profile modal */}
      {showEdit && (
        <div onClick={() => setShowEdit(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"90vh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
              <button onClick={() => setShowEdit(false)} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
              <div style={{ fontSize:15, fontWeight:600, color:C.text }}>Edit Profile</div>
              <button onClick={saveProfile} style={{ fontSize:14, fontWeight:600, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Done</button>
            </div>
            <div style={{ padding:"16px", overflowY:"auto" }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:18 }}>
                <Avatar user={user} size={84} C={C} onClick={() => avatarRef.current?.click()}/>
                <button onClick={() => avatarRef.current?.click()} style={{ marginTop:8, background:"none", border:"none", color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Change photo</button>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:6 }}>NAME</div>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:6 }}>USERNAME</div>
                <input value={editUsername} onChange={e => setEditUsername(e.target.value)}
                  style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}/>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:6 }}>BIO</div>
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3}
                  style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", resize:"none", fontFamily:F }}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"85vh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
              <div style={{ width:50 }}/>
              <div style={{ fontSize:15, fontWeight:600, color:C.text }}>Settings</div>
              <button onClick={() => setShowSettings(false)} style={{ fontSize:14, color:C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F, width:50 }}>Done</button>
            </div>
            <div style={{ overflowY:"auto", flex:1, padding:"14px" }}>
              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>PREFERENCES</div>
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ fontSize:14, color:C.text }}>Appearance</div>
                  <div style={{ display:"flex", background:C.divider, borderRadius:20, padding:3, gap:1 }}>
                    {["light","dark"].map(th => (
                      <button key={th} onClick={() => onToggleTheme(th)} style={{
                        padding:"6px 14px", background:(store.theme||"light")===th?C.accent:"transparent",
                        color:(store.theme||"light")===th?"#fff":C.sub, border:"none", borderRadius:20,
                        fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
                      }}>{th==="light"?"Light":"Dark"}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px" }}>
                  <div style={{ fontSize:14, color:C.text }}>Weight Units</div>
                  <div style={{ display:"flex", background:C.divider, borderRadius:20, padding:3, gap:1 }}>
                    {["lbs","kg"].map(u => (
                      <button key={u} onClick={() => setStore(p => ({ ...p, unit: u }))} style={{
                        padding:"6px 16px", background:(store.unit||"lbs")===u?C.accent:"transparent",
                        color:(store.unit||"lbs")===u?"#fff":C.sub, border:"none", borderRadius:20,
                        fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
                      }}>{u.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>ABOUT</div>
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px" }}>
                  <div style={{ fontSize:14, color:C.text }}>Version</div>
                  <div style={{ fontSize:13, color:C.sub }}>1.0 (beta)</div>
                </div>
              </div>

              <div style={{ fontSize:11, color:C.muted, textAlign:"center", padding:"14px 0" }}>
                More settings coming soon
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Followers / Following list modal */}
      {listModal && (() => {
        const targetUser = store.users.find(u => u.id === userId);
        const idList = listModal === "followers" ? (targetUser?.followers || []) : (targetUser?.following || []);
        const listUsers = idList.map(id => store.users.find(u => u.id === id)).filter(Boolean);
        return (
          <div onClick={() => setListModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"80vh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
                <div style={{ width:60 }}/>
                <div style={{ fontSize:15, fontWeight:600, color:C.text, textTransform:"capitalize" }}>{listModal}</div>
                <button onClick={() => setListModal(null)} style={{ fontSize:14, color:C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F, width:60 }}>Close</button>
              </div>
              <div style={{ overflowY:"auto", flex:1, padding:"6px 14px 14px" }}>
                {listUsers.length === 0 && (
                  <div style={{ textAlign:"center", color:C.sub, padding:"40px 0", fontSize:13 }}>No {listModal} yet.</div>
                )}
                {listUsers.map(u => (
                  <div key={u.id} onClick={() => {
                    setListModal(null);
                    if (onUserClick) onUserClick(u.id);
                  }} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:`1px solid ${C.divider}`, cursor:"pointer" }}>
                    <Avatar user={u} size={42} C={C}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                      <div style={{ fontSize:12, color:C.sub }}>{u.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// NEW POST MODAL
// ═════════════════════════════════════════════════════════════════════════════
function NewPostModal({ C, onClose, onPost }) {
  const [caption, setCaption] = useState("");
  const [img, setImg] = useState(null);
  const [isFC, setIsFC] = useState(false);
  const [loc, setLoc] = useState("");
  const fileRef = useRef(null);

  function handleFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = e => setImg(e.target.result);
    r.readAsDataURL(f);
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"92vh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
          <button onClick={onClose} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
          <div style={{ fontSize:15, fontWeight:600, color:C.text }}>New Post</div>
          <button onClick={() => {
            if (caption || img) {
              onPost({ type: isFC ? "form_check" : "photo", caption, imageData: img, location: loc });
              onClose();
            }
          }} style={{
            fontSize:14, fontWeight:600, color:C.accent,
            background:"none", border:"none", cursor:"pointer", fontFamily:F
          }}>Share</button>
        </div>
        <div style={{ overflowY:"auto", flex:1, padding:"14px" }}>
          <div onClick={() => fileRef.current?.click()} style={{
            border:`1.5px dashed ${C.border}`, borderRadius:10, minHeight:150,
            display:"flex", alignItems:"center", justifyContent:"center",
            flexDirection:"column", gap:8, cursor:"pointer", marginBottom:12, overflow:"hidden"
          }}>
            {img
              ? <img src={img} alt="" style={{ width:"100%", maxHeight:270, objectFit:"cover" }}/>
              : <>
                  <span style={{ fontSize:28 }}>📸</span>
                  <span style={{ fontSize:13, color:C.sub }}>Tap to add photo or video</span>
                  <span style={{ fontSize:10, color:C.muted }}>Up to 90 seconds</span>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])}/>
          <button onClick={() => setIsFC(!isFC)} style={{
            marginBottom:10, padding:"6px 12px",
            background:isFC?C.accent:"transparent",
            color:isFC?"#fff":C.sub,
            border:`1px solid ${isFC?C.accent:C.border}`, borderRadius:20,
            fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
          }}>🎥 Form Check</button>
          <input
            value={loc} onChange={e => setLoc(e.target.value)}
            placeholder="📍 Add location"
            style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}
          />
          <textarea
            value={caption} onChange={e => setCaption(e.target.value)}
            placeholder="Write a caption..."
            rows={3}
            style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 13px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}
          />
        </div>
      </div>
    </div>
  );
}

function EditPostModal({ C, post, onSave, onClose }) {
  const [cap, setCap] = useState(post.caption || "");
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.bg, borderRadius:16, padding:20, width:"100%", maxWidth:400, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>Edit Post</div>
        <textarea value={cap} onChange={e => setCap(e.target.value)} rows={4}
          style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"12px 14px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", marginBottom:14, fontFamily:F }}/>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px", background:"none", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, cursor:"pointer", fontFamily:F }}>Cancel</button>
          <button onClick={() => onSave(post.id, cap)} style={{ flex:1, padding:"10px", background:C.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [store, setStore] = useState(loadStore);
  const [tab, setTab] = useState("feed");
  const [showNewPost, setShowNewPost] = useState(false);
  const [profileUserId, setProfileUserId] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [prModal, setPrModal] = useState(null);
  const [showWrapped, setShowWrapped] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!store.seenOnboarding);
  const [storyIndex, setStoryIndex] = useState(null); // index into story users array

  useEffect(() => saveStore(store), [store]);

  const C = THEMES[store.theme || "light"];
  const currentUserId = store.currentUserId;
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];
  const unit = store.unit || "lbs";
  const streak = calcStreak(store.workoutDates);
  const feedPosts = store.posts
    .filter(p => p.userId === currentUserId || following.includes(p.userId))
    .sort((a, b) => b.createdAt - a.createdAt);

  function handleKudos(id) {
    setStore(p => ({
      ...p,
      posts: p.posts.map(pt => pt.id !== id ? pt : {
        ...pt,
        kudos: (pt.kudos || []).includes(currentUserId)
          ? (pt.kudos || []).filter(x => x !== currentUserId)
          : [...(pt.kudos || []), currentUserId]
      })
    }));
  }
  function handleComment(id, t) {
    setStore(p => ({
      ...p,
      posts: p.posts.map(pt => pt.id !== id ? pt : {
        ...pt,
        comments: [...pt.comments, { id: uid(), userId: currentUserId, text: t, createdAt: Date.now() }]
      })
    }));
  }
  function handleNewPost(d) {
    setStore(p => ({
      ...p,
      posts: [{ id: uid(), userId: currentUserId, createdAt: Date.now(), kudos: [], comments: [], ...d }, ...p.posts]
    }));
  }
  function handleDelete(id) {
    if (window.confirm("Delete this post?")) setStore(p => ({ ...p, posts: p.posts.filter(pt => pt.id !== id) }));
  }
  function handleEditSave(id, cap) {
    setStore(p => ({ ...p, posts: p.posts.map(pt => pt.id !== id ? pt : { ...pt, caption: cap }) }));
    setEditingPost(null);
  }

  const notifCount = store.posts
    .filter(p => p.userId === currentUserId)
    .reduce((a, pt) => a + (pt.kudos || []).filter(x => x !== currentUserId).length + pt.comments.filter(c => c.userId !== currentUserId).length, 0);

  if (showOnboarding) {
    return (
      <Onboarding
        C={C}
        onComplete={() => {
          setStore(p => ({ ...p, seenOnboarding: true }));
          setShowOnboarding(false);
        }}
      />
    );
  }

  if (prModal) return <PRModal pr={prModal} unit={unit} onClose={() => setPrModal(null)}/>;

  if (profileUserId) {
    return (
      <div style={{ background:C.bg, height:"100vh", maxWidth:480, margin:"0 auto", fontFamily:F, display:"flex", flexDirection:"column", color:C.text }}>
        <ProfileScreen
          userId={profileUserId}
          store={store}
          setStore={setStore}
          currentUserId={currentUserId}
          onBack={() => setProfileUserId(null)}
          displayUnit={unit}
          C={C}
          onToggleTheme={t => setStore(p => ({ ...p, theme: t }))}
          onUserClick={setProfileUserId}
        />
      </div>
    );
  }

  return (
    <div style={{ background:C.bg, height:"100vh", maxWidth:480, margin:"0 auto", fontFamily:F, color:C.text, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {showWrapped && <WrappedModal store={store} C={C} onClose={() => setShowWrapped(false)}/>}

      {/* TOP BAR — Instagram thin, minimal, SVG icons */}
      <div style={{
        background:C.tabBg, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.divider}`,
        padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0
      }}>
        <SpotrLogo C={C}/>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {streak > 0 && <div style={{ marginRight:4 }}><StreakBadge streak={streak} size="sm"/></div>}
          {tab === "feed" && (
            <button
              onClick={() => setShowNewPost(true)}
              aria-label="New post"
              style={{ background:"none", border:"none", cursor:"pointer", padding:8, display:"flex", alignItems:"center", justifyContent:"center" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="4"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowWrapped(true)}
            aria-label="Stats"
            style={{ background:"none", border:"none", cursor:"pointer", padding:8, display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="20" x2="4" y2="12"/>
              <line x1="10" y1="20" x2="10" y2="4"/>
              <line x1="16" y1="20" x2="16" y2="9"/>
              <line x1="22" y1="20" x2="2" y2="20"/>
            </svg>
          </button>
          <button
            onClick={() => setTab("activity")}
            aria-label="Activity"
            style={{ position:"relative", background:"none", border:"none", cursor:"pointer", padding:8, display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={notifCount > 0 ? C.red : "none"} stroke={notifCount > 0 ? C.red : C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {notifCount > 0 && (
              <span style={{ position:"absolute", top:2, right:2, background:C.red, color:"#fff", borderRadius:"50%", minWidth:16, height:16, padding:"0 4px", fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, border:`2px solid ${C.bg}` }}>{notifCount > 9 ? "9+" : notifCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {tab === "feed" && (
          <div style={{ overflowY:"auto", flex:1 }}>
            {/* Stories strip */}
            <div style={{ display:"flex", gap:12, overflowX:"auto", padding:"12px 14px", paddingBottom:12, scrollbarWidth:"none", borderBottom:`1px solid ${C.divider}` }}>
              {[me, ...store.users.filter(u => following.includes(u.id))].filter(Boolean).map((u, i) => (
                <div key={u.id} onClick={() => { if (i > 0) setStoryIndex(i - 1); }} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, flexShrink:0, cursor:i>0?"pointer":"default" }}>
                  <Avatar user={u} size={56} C={C} ring={i > 0}/>
                  <span style={{ fontSize:11, color:C.text, whiteSpace:"nowrap" }}>
                    {i === 0 ? "Your story" : u.username}
                  </span>
                </div>
              ))}
            </div>

            {/* Posts */}
            <div style={{ paddingTop:4 }}>
              {feedPosts.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 20px", color:C.sub }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🏋️</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:6 }}>Nothing here yet</div>
                  <div style={{ fontSize:13 }}>Follow athletes or post your first workout</div>
                </div>
              )}
              {feedPosts.map((post, i) => (
                <div key={post.id}>
                  <PostCard
                    post={post}
                    store={store}
                    currentUserId={currentUserId}
                    displayUnit={unit}
                    C={C}
                    onKudos={handleKudos}
                    onComment={handleComment}
                    onUserClick={setProfileUserId}
                    onEdit={setEditingPost}
                    onDelete={handleDelete}
                  />
                  {(i + 1) % 5 === 0 && i < feedPosts.length - 1 && (
                    <div style={{ padding:"12px 14px", textAlign:"center", borderBottom:`1px solid ${C.divider}`, marginBottom:16, opacity:0.4 }}>
                      <div style={{ fontSize:9, color:C.muted, letterSpacing:2 }}>SPONSORED · AdMob</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "tracker" && <WorkoutTracker store={store} setStore={setStore} onShareWorkout={handleNewPost} onPRHit={setPrModal} C={C}/>}
        {tab === "discover" && <DiscoverScreen store={store} setStore={setStore} currentUserId={currentUserId} onUserClick={setProfileUserId} setTab={setTab} C={C}/>}
        {tab === "challenges" && <ChallengesScreen store={store} setStore={setStore} currentUserId={currentUserId} C={C}/>}
        {tab === "groups" && <GroupsScreen store={store} setStore={setStore} currentUserId={currentUserId} C={C}/>}
        {tab === "activity" && (
          <div style={{ overflowY:"auto", flex:1, padding:"14px 14px 80px" }}>
            <div style={{ fontSize:22, fontWeight:700, marginBottom:14, color:C.text }}>Activity</div>
            {(() => {
              const n = [];
              store.posts.filter(p => p.userId === currentUserId).forEach(post => {
                (post.kudos || []).filter(id => id !== currentUserId).forEach(kid => {
                  const u = store.users.find(x => x.id === kid);
                  n.push({ id: `k${post.id}${kid}`, type: "kudos", user: u, ts: post.createdAt });
                });
                post.comments.filter(c => c.userId !== currentUserId).forEach(c => {
                  const u = store.users.find(x => x.id === c.userId);
                  n.push({ id: c.id, type: "comment", user: u, comment: c, ts: c.createdAt });
                });
              });
              n.sort((a, b) => b.ts - a.ts);
              if (!n.length) return <div style={{ textAlign:"center", color:C.sub, padding:"50px 0", fontSize:14 }}>No notifications yet.</div>;
              return n.map(x => (
                <div key={x.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"12px 0", borderBottom:`1px solid ${C.divider}` }}>
                  <Avatar user={x.user} size={40} C={C}/>
                  <div style={{ flex:1, fontSize:13, color:C.text, lineHeight:1.4 }}>
                    <span style={{ fontWeight:600 }}>{x.user?.username}</span>
                    {x.type === "kudos" && " gave you Kudos 👏"}
                    {x.type === "comment" && <> commented: <span style={{ color:C.sub }}>"{x.comment?.text}"</span></>}
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{timeAgo(x.ts)}</div>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
        {tab === "profile" && (
          <ProfileScreen
            userId={currentUserId}
            store={store}
            setStore={setStore}
            currentUserId={currentUserId}
            displayUnit={unit}
            C={C}
            onToggleTheme={t => setStore(p => ({ ...p, theme: t }))}
            onUserClick={setProfileUserId}
          />
        )}
      </div>

      {/* BOTTOM NAV — Instagram: clean SVG icons with filled/outlined states */}
      <div style={{
        background:C.tabBg, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderTop:`1px solid ${C.divider}`,
        display:"flex", flexShrink:0
      }}>
        {[
          {
            id: "feed", label: "Home",
            icon: (active) => (
              <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? C.text : "none"} stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9.5 L12 3 L21 9.5 V20 Q21 21 20 21 H15 V14 H9 V21 H4 Q3 21 3 20 Z"/>
              </svg>
            )
          },
          {
            id: "tracker", label: "Workout",
            icon: (active) => (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 6.5 L17.5 17.5"/>
                <rect x="1" y="9" width="4" height="6" rx="1"/>
                <rect x="19" y="9" width="4" height="6" rx="1"/>
                <rect x="4.5" y="7" width="3" height="10" rx="1"/>
                <rect x="16.5" y="7" width="3" height="10" rx="1"/>
                <line x1="7.5" y1="12" x2="16.5" y2="12"/>
              </svg>
            )
          },
          {
            id: "discover", label: "Discover",
            icon: (active) => (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/>
                <line x1="21" y1="21" x2="16.5" y2="16.5"/>
              </svg>
            )
          },
          {
            id: "profile", label: "Profile",
            icon: (active) => (
              <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? C.text : "none"} stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M3 21 Q3 14 12 14 Q21 14 21 21"/>
              </svg>
            )
          },
        ].map(({ id, label, icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-label={label}
              style={{
                flex:1, padding:"12px 4px 18px", background:"none", border:"none",
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                opacity: active ? 1 : 0.45,
                transition: "opacity 0.15s",
              }}
            >
              {icon(active)}
            </button>
          );
        })}
      </div>

      {showNewPost && <NewPostModal C={C} onClose={() => setShowNewPost(false)} onPost={handleNewPost}/>}
      {editingPost && <EditPostModal C={C} post={editingPost} onSave={handleEditSave} onClose={() => setEditingPost(null)}/>}
      {storyIndex !== null && (() => {
        const storyUsers = store.users.filter(u => following.includes(u.id));
        const currentStoryUser = storyUsers[storyIndex];
        if (!currentStoryUser) { setStoryIndex(null); return null; }
        return (
          <StoryViewer
            user={currentStoryUser}
            onClose={() => setStoryIndex(null)}
            onNext={() => setStoryIndex(i => i + 1)}
            onPrev={() => setStoryIndex(i => Math.max(0, i - 1))}
            hasNext={storyIndex < storyUsers.length - 1}
            hasPrev={storyIndex > 0}
            C={C}
          />
        );
      })()}
    </div>
  );
}
