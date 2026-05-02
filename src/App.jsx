import { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";

// ═════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═════════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Lightweight Supabase client — no npm package needed
const sb = (() => {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Prefer": "return=representation",
  };

  function authHeaders(token) {
    if (!token) return headers;
    return { ...headers, "Authorization": `Bearer ${token}` };
  }

  function ensureSupabaseConfig() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error("Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
    }
  }

  async function parseJson(res) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response from ${res.url}: ${text.slice(0, 200)}`);
    }
  }

  async function query(path, opts = {}, token = null) {
    ensureSupabaseConfig();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: authHeaders(token),
      ...opts,
    });
    if (!res.ok) {
      const err = await parseJson(res).catch(() => ({}));
      throw new Error(err?.message || err?.error_description || res.statusText || `Request failed: ${res.status}`);
    }
    return parseJson(res);
  }

  async function rpc(fn, params = {}, token = null) {
    ensureSupabaseConfig();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await parseJson(res).catch(() => ({}));
      throw new Error(err?.message || err?.error_description || res.statusText || `RPC failed: ${res.status}`);
    }
    return parseJson(res);
  }

  // Auth helpers
  async function signUp(email, password, username, name) {
    ensureSupabaseConfig();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email, password,
        data: { username, name }
      }),
    });
    const data = await parseJson(res);
    if (data?.error) throw new Error(data.error.message || data.msg || "Signup failed");
    return data;
  }

  async function signIn(email, password) {
    ensureSupabaseConfig();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      throw new Error(data?.error_description || data?.error || data?.message || "Sign in failed");
    }
    return data;
  }

  async function signOut(token) {
    ensureSupabaseConfig();
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: authHeaders(token),
    });
  }

  async function refreshToken(refresh_token) {
    ensureSupabaseConfig();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token }),
    });
    const data = await parseJson(res);
    if (!res.ok) {
      throw new Error(data?.error_description || data?.error || "Session expired");
    }
    return data;
  }

  return { query, rpc, signUp, signIn, signOut, refreshToken };
})();

// Upload image to Supabase Storage, return public URL
async function uploadImage(base64DataUrl, token, userId) {
  if (!base64DataUrl || !token) return base64DataUrl;
  try {
    const [header, data] = base64DataUrl.split(",");
    const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    const filename = `${userId}/${Date.now()}.${ext}`;
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/post-images/${filename}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body: blob,
    });
    if (!res.ok) return base64DataUrl; // fallback to base64
    return `${SUPABASE_URL}/storage/v1/object/public/post-images/${filename}`;
  } catch { return base64DataUrl; }
}

// Session storage
const SESSION_STORAGE_KEY = "seshd_session";
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)); } catch { return null; }
}
function saveSession(s) {
  try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s)); } catch {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
}

// ═════════════════════════════════════════════════════════════════════════════
// EXERCISE DATABASE
// ═════════════════════════════════════════════════════════════════════════════
const EXERCISE_DB = [
  // CHEST
  { name:"Barbell Bench Press", muscle:"Chest" },
  { name:"Incline Barbell Press", muscle:"Chest" },
  { name:"Decline Barbell Press", muscle:"Chest" },
  { name:"Incline DB Press", muscle:"Chest" },
  { name:"Flat DB Press", muscle:"Chest" },
  { name:"Decline DB Press", muscle:"Chest" },
  { name:"Cable Fly (Low-to-High)", muscle:"Chest" },
  { name:"Cable Fly (High-to-Low)", muscle:"Chest" },
  { name:"Pec Deck Machine", muscle:"Chest" },
  { name:"Dips", muscle:"Chest/Tris" },
  { name:"Push-Ups", muscle:"Chest" },
  { name:"Weighted Push-Ups", muscle:"Chest" },
  { name:"DB Pullover", muscle:"Chest" },
  // BACK
  { name:"Barbell Row", muscle:"Back" },
  { name:"Pendlay Row", muscle:"Back" },
  { name:"T-Bar Row", muscle:"Back" },
  { name:"Seated Cable Row (Wide)", muscle:"Back" },
  { name:"Seated Cable Row (Narrow)", muscle:"Back" },
  { name:"Single-Arm DB Row", muscle:"Back" },
  { name:"Chest-Supported Row", muscle:"Back" },
  { name:"Pull-Ups", muscle:"Back" },
  { name:"Weighted Pull-Ups", muscle:"Back" },
  { name:"Chin-Ups", muscle:"Back" },
  { name:"Lat Pulldown (Wide)", muscle:"Back" },
  { name:"Lat Pulldown (Underhand)", muscle:"Back" },
  { name:"Straight-Arm Pulldown", muscle:"Back" },
  { name:"Face Pulls", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (Cable)", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (DB)", muscle:"Rear Delts" },
  // SHOULDERS
  { name:"Overhead Press (Barbell)", muscle:"Shoulders" },
  { name:"Seated DB Shoulder Press", muscle:"Shoulders" },
  { name:"Arnold Press", muscle:"Shoulders" },
  { name:"Lateral Raises (DB)", muscle:"Shoulders" },
  { name:"Lateral Raises (Cable)", muscle:"Shoulders" },
  { name:"Front Raises (DB)", muscle:"Shoulders" },
  { name:"Front Raises (Plate)", muscle:"Shoulders" },
  { name:"Upright Row", muscle:"Shoulders/Traps" },
  { name:"Machine Shoulder Press", muscle:"Shoulders" },
  // BICEPS
  { name:"Barbell Curl", muscle:"Biceps" },
  { name:"EZ Bar Curl", muscle:"Biceps" },
  { name:"Dumbbell Curl", muscle:"Biceps" },
  { name:"Incline DB Curl", muscle:"Biceps" },
  { name:"Hammer Curl", muscle:"Biceps" },
  { name:"Preacher Curl (EZ Bar)", muscle:"Biceps" },
  { name:"Preacher Curl (DB)", muscle:"Biceps" },
  { name:"Cable Curl (Single Arm)", muscle:"Biceps" },
  { name:"Concentration Curl", muscle:"Biceps" },
  { name:"Reverse Curl", muscle:"Biceps/Forearms" },
  // TRICEPS
  { name:"Skull Crushers (EZ Bar)", muscle:"Triceps" },
  { name:"Skull Crushers (DB)", muscle:"Triceps" },
  { name:"Tricep Rope Pushdown", muscle:"Triceps" },
  { name:"Tricep Bar Pushdown", muscle:"Triceps" },
  { name:"Overhead Tricep Extension", muscle:"Triceps" },
  { name:"Close-Grip Bench Press", muscle:"Triceps" },
  { name:"Tricep Dips", muscle:"Triceps" },
  { name:"Diamond Push-Ups", muscle:"Triceps" },
  // LEGS — QUADS
  { name:"Barbell Back Squat", muscle:"Quads" },
  { name:"Front Squat", muscle:"Quads" },
  { name:"Leg Press", muscle:"Quads" },
  { name:"Hack Squat", muscle:"Quads" },
  { name:"Bulgarian Split Squat", muscle:"Quads/Glutes" },
  { name:"Walking Lunges", muscle:"Quads/Glutes" },
  { name:"Leg Extension", muscle:"Quads" },
  { name:"Step-Ups", muscle:"Quads/Glutes" },
  // LEGS — POSTERIOR
  { name:"Deadlift", muscle:"Full Body" },
  { name:"Sumo Deadlift", muscle:"Full Body" },
  { name:"Romanian Deadlift", muscle:"Hamstrings" },
  { name:"Stiff-Leg Deadlift", muscle:"Hamstrings" },
  { name:"Lying Leg Curl", muscle:"Hamstrings" },
  { name:"Seated Leg Curl", muscle:"Hamstrings" },
  { name:"Nordic Curl", muscle:"Hamstrings" },
  { name:"Hip Thrust (Barbell)", muscle:"Glutes" },
  { name:"Hip Thrust (Machine)", muscle:"Glutes" },
  { name:"Glute Kickback (Cable)", muscle:"Glutes" },
  { name:"Abduction Machine", muscle:"Glutes" },
  // CALVES
  { name:"Standing Calf Raise", muscle:"Calves" },
  { name:"Seated Calf Raise", muscle:"Calves" },
  { name:"Leg Press Calf Raise", muscle:"Calves" },
  // CORE
  { name:"Plank", muscle:"Core" },
  { name:"Cable Crunch", muscle:"Core" },
  { name:"Hanging Leg Raise", muscle:"Core" },
  { name:"Ab Wheel Rollout", muscle:"Core" },
  { name:"Decline Crunch", muscle:"Core" },
  { name:"Russian Twist", muscle:"Core" },
  { name:"Landmine Rotation", muscle:"Core" },
  { name:"Cable Woodchop", muscle:"Core" },
  // COMPOUND / FULL BODY
  { name:"Power Clean", muscle:"Full Body" },
  { name:"Clean and Jerk", muscle:"Full Body" },
  { name:"Snatch", muscle:"Full Body" },
  { name:"Kettlebell Swing", muscle:"Full Body" },
  { name:"Farmers Walk", muscle:"Full Body" },
  { name:"Sled Push", muscle:"Full Body" },
  { name:"Battle Ropes", muscle:"Full Body" },
  // TRAPS / NECK
  { name:"Barbell Shrugs", muscle:"Traps" },
  { name:"DB Shrugs", muscle:"Traps" },
  { name:"Neck Extension", muscle:"Neck" },
  // FOREARMS
  { name:"Wrist Curl", muscle:"Forearms" },
  { name:"Reverse Wrist Curl", muscle:"Forearms" },
  { name:"Farmers Carry", muscle:"Forearms" },
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
    accent: "#7c3aed",
    accentSoft: "rgba(124,58,237,0.12)",
    accent2: "#6d28d9",
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
    accent: "#7c3aed",
    accentSoft: "rgba(124,58,237,0.08)",
    accent2: "#6d28d9",
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

// ─── Muscle group icon (replaces emoji) ──────────────────────────────────────
function MuscleIcon({ muscle = "", size = 28, C }) {
  const m = (muscle || "").toLowerCase().split("/")[0].trim();
  const colors = {
    chest:"#ef4444", back:"#3b82f6", shoulders:"#8b5cf6", biceps:"#f59e0b",
    triceps:"#f97316", quads:"#10b981", hamstrings:"#10b981", glutes:"#ec4899",
    calves:"#06b6d4", core:"#84cc16", traps:"#6366f1", forearms:"#f59e0b",
    "full body":"#2563eb", "rear delts":"#8b5cf6", "shoulders/traps":"#8b5cf6",
    "chest/tris":"#ef4444", "quads/glutes":"#10b981",
  };
  const color = colors[m] || C?.accent || "#2563eb";
  const abbrevs = {
    chest:"CHE", back:"BCK", shoulders:"SHO", biceps:"BIC", triceps:"TRI",
    quads:"QUA", hamstrings:"HAM", glutes:"GLU", calves:"CAL", core:"COR",
    traps:"TRP", forearms:"FOR", "full body":"FULL", "rear delts":"RD",
    "chest/tris":"CT", "quads/glutes":"QG", "shoulders/traps":"ST",
  };
  const label = abbrevs[m] || m.substring(0,3).toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.25),
      background:color+"18", display:"flex", alignItems:"center",
      justifyContent:"center", flexShrink:0, border:`1.5px solid ${color}55`
    }}>
      <span style={{ fontSize:Math.round(size*0.32), fontWeight:800, color, fontFamily:"monospace", lineHeight:1, letterSpacing:-0.5 }}>{label}</span>
    </div>
  );
}

let _setToast = null;
function toast(msg, type = "info") {
  if (_setToast) _setToast({ msg, type, id: Date.now() });
}
function ToastHost() {
  const [t, setT] = useState(null);
  _setToast = setT;
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 2800);
    return () => clearTimeout(id);
  }, [t?.id]);
  if (!t) return null;
  const bg = t.type === "error" ? "#ef4444" : t.type === "success" ? "#22c55e" : "#6d28d9";
  return (
    <div style={{
      position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)",
      background:bg, color:"#fff", borderRadius:20, padding:"10px 20px",
      fontSize:13, fontWeight:600, zIndex:999, whiteSpace:"nowrap",
      boxShadow:"0 4px 20px rgba(0,0,0,0.2)", fontFamily:F,
      animation:"fadeInUp 0.2s ease"
    }}>
      {t.msg}
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
    </div>
  );
}

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
  { id:"u1", username:"you", name:"You", avatar:"💪", bio:"Chasing PRs 🔥", followers:["u2","u3","u4","u5","u6","u7","u8"], following:["u2","u3","u4","u5","u6","u7","u8","u9"] },
  { id:"u2", username:"marcus_lifts", name:"Marcus Chen", avatar:"🔥", bio:"Powerlifter · 600lb DL", followers:["u1","u3","u5"], following:["u1","u5"] },
  { id:"u3", username:"jayden_gains", name:"Jayden Rivera", avatar:"⚡", bio:"Hypertrophy obsessed · 6 day PPL", followers:["u1","u2"], following:["u1","u2","u7"] },
  { id:"u4", username:"k_fitness", name:"Kayla Park", avatar:"🏋️", bio:"Strength coach · form is everything", followers:["u1","u6"], following:["u1","u5"] },
  { id:"u5", username:"iron_mike", name:"Mike Thompson", avatar:"🦾", bio:"5/3/1 lifer. Eat. Sleep. Lift.", followers:["u1","u2","u4"], following:["u1","u2"] },
  { id:"u6", username:"sarah_strong", name:"Sarah Nguyen", avatar:"💥", bio:"Glute gains + running · half marathon PR 1:42", followers:["u1","u4"], following:["u1","u4","u8"] },
  { id:"u7", username:"deadlift_dan", name:"Dan Hoffman", avatar:"⚙️", bio:"Deadlift or die. Currently pulling 505.", followers:["u1","u3"], following:["u1","u3","u5"] },
  { id:"u8", username:"curl_bro_9000", name:"Tyler Brooks", avatar:"💪", bio:"Chest & arms specialist · curl bro forever", followers:["u1","u6"], following:["u1","u6"] },
  { id:"u9", username:"yoga_lifter", name:"Priya Shah", avatar:"🧘", bio:"Mobility + strength. Yoga 2x / lift 4x per week.", followers:["u1"], following:["u1"] },
];

const SEED_POSTS = [
  {
    id:"p1", userId:"u2", type:"workout", unit:"lbs",
    createdAt: Date.now() - 1000*60*35,
    workout: {
      name: "Pull Day · Heavy",
      duration: 3720,
      volume: 18400,
      exercises: [
        { name:"Barbell Row", sets:[{w:225,r:5},{w:225,r:5},{w:225,r:4},{w:205,r:6}] },
        { name:"Weighted Pull-Ups", sets:[{w:55,r:6},{w:55,r:5},{w:45,r:7}] },
        { name:"Seated Cable Row", sets:[{w:180,r:10},{w:180,r:9}] },
        { name:"Barbell Curl", sets:[{w:95,r:10},{w:95,r:8}] },
      ]
    },
    caption: "Finally pulled 225 for sets on row 🔥 Strap-free pulls next week.",
    kudos: ["u3","u1","u5","u7"],
    comments: [
      {id:"c1", userId:"u3", text:"Those rows are insane 👊", createdAt:Date.now()-1000*60*25},
      {id:"c2", userId:"u7", text:"Strength is crazy bro", createdAt:Date.now()-1000*60*15},
    ],
    isPR: true,
  },
  {
    id:"p2", userId:"u3", type:"achievement",
    createdAt: Date.now() - 1000*60*120,
    achievement: { type:"streak", days:14 },
    caption: "Two weeks straight 🔥 no missed days",
    kudos: ["u2","u1","u4","u6","u8"],
    comments: [
      {id:"c3", userId:"u6", text:"Get it!! 💪", createdAt:Date.now()-1000*60*100},
    ],
  },
  {
    id:"p3", userId:"u6", type:"workout", unit:"lbs",
    createdAt: Date.now() - 1000*60*60*4,
    workout: {
      name: "Leg Day · Glute Focus",
      duration: 4260,
      volume: 24600,
      exercises: [
        { name:"Hip Thrust", sets:[{w:275,r:8},{w:275,r:8},{w:275,r:6}] },
        { name:"Bulgarian Split Squat", sets:[{w:40,r:10},{w:40,r:10}] },
        { name:"Romanian Deadlift", sets:[{w:185,r:10},{w:185,r:9}] },
        { name:"Seated Leg Curl", sets:[{w:120,r:12},{w:120,r:12}] },
      ]
    },
    caption: "Hip thrusts hit different 🍑 almost done with prep week",
    kudos: ["u1","u4","u8","u9"],
    comments: [
      {id:"c4", userId:"u4", text:"Form looked clean on that last set", createdAt:Date.now()-1000*60*60*3},
    ],
  },
  {
    id:"p4", userId:"u4", type:"photo",
    createdAt: Date.now() - 1000*60*60*6,
    caption: "Morning grind 🌅 first session of the week, feeling locked in",
    imageColor: "#0a1628",
    kudos: ["u2","u1","u6"],
    comments: [],
  },
  {
    id:"p5", userId:"u7", type:"workout", unit:"lbs",
    createdAt: Date.now() - 1000*60*60*8,
    workout: {
      name: "Deadlift Max Out",
      duration: 3000,
      volume: 15400,
      exercises: [
        { name:"Deadlift", sets:[{w:405,r:3},{w:455,r:1},{w:495,r:1},{w:505,r:1}] },
        { name:"Barbell Row", sets:[{w:185,r:8},{w:185,r:7}] },
        { name:"Lat Pulldown", sets:[{w:160,r:10},{w:160,r:10}] },
      ]
    },
    caption: "505 moved like it was taped to the floor but I'll take it 😤 onto 515 next month",
    kudos: ["u1","u2","u3","u5","u8"],
    comments: [
      {id:"c5", userId:"u2", text:"MASSIVE. let's go", createdAt:Date.now()-1000*60*60*7},
      {id:"c6", userId:"u5", text:"clean pull bro", createdAt:Date.now()-1000*60*60*6},
      {id:"c7", userId:"u8", text:"holy 😳", createdAt:Date.now()-1000*60*60*5},
    ],
    isPR: true,
  },
  {
    id:"p6", userId:"u5", type:"workout", unit:"lbs",
    createdAt: Date.now() - 1000*60*60*16,
    workout: {
      name: "Bench Day · 5/3/1 BBB",
      duration: 3300,
      volume: 11800,
      exercises: [
        { name:"Barbell Bench Press", sets:[{w:225,r:5},{w:255,r:3},{w:285,r:2}] },
        { name:"Barbell Bench Press (BBB)", sets:[{w:155,r:10},{w:155,r:10},{w:155,r:10},{w:155,r:10},{w:155,r:8}] },
        { name:"Dumbbell Row", sets:[{w:85,r:10},{w:85,r:10}] },
      ]
    },
    caption: "Top single felt heavy but moved. BBB volume is brutal 😮‍💨",
    kudos: ["u2","u7","u1"],
    comments: [],
  },
  {
    id:"p7", userId:"u8", type:"photo",
    createdAt: Date.now() - 1000*60*60*20,
    caption: "pump day 💪 chest looking big finally",
    imageColor: "#1a0818",
    kudos: ["u6","u1","u3"],
    comments: [
      {id:"c8", userId:"u6", text:"looking huge man", createdAt:Date.now()-1000*60*60*18},
    ],
  },
  {
    id:"p8", userId:"u9", type:"achievement",
    createdAt: Date.now() - 1000*60*60*24,
    achievement: { type:"pr", exercise:"Front Squat", weight:185 },
    caption: "New front squat PR — mobility work paying off ✨",
    kudos: ["u1","u4","u6"],
    comments: [
      {id:"c9", userId:"u4", text:"yess those wrists held up? 🙌", createdAt:Date.now()-1000*60*60*22},
      {id:"c10", userId:"u9", text:"finally yes lol", createdAt:Date.now()-1000*60*60*21},
    ],
  },
  {
    id:"p9", userId:"u3", type:"workout", unit:"lbs",
    createdAt: Date.now() - 1000*60*60*26,
    workout: {
      name: "Push A · Heavy Chest",
      duration: 3900,
      volume: 16200,
      exercises: [
        { name:"Barbell Bench Press", sets:[{w:205,r:6},{w:205,r:6},{w:205,r:5}] },
        { name:"Incline DB Press", sets:[{w:75,r:9},{w:75,r:8}] },
        { name:"Cable Fly", sets:[{w:40,r:12},{w:40,r:12},{w:35,r:14}] },
        { name:"Lateral Raises", sets:[{w:20,r:15},{w:20,r:15},{w:15,r:20}] },
        { name:"Tricep Pushdown", sets:[{w:60,r:12},{w:60,r:12}] },
      ]
    },
    caption: "Same PPL grind, different day. Hit every set clean 💯",
    kudos: ["u1","u7"],
    comments: [],
  },
  {
    id:"p10", userId:"u6", type:"photo",
    createdAt: Date.now() - 1000*60*60*36,
    caption: "recovery day run 🏃‍♀️ 6 miles easy pace",
    imageColor: "#0e1a0e",
    kudos: ["u4","u9","u1"],
    comments: [],
  },
];

const SEED_CHALLENGES = [
  { id:"ch1", name:"30-Day Push-Up Challenge", description:"Progressive push-ups every day", createdBy:"u4", participants:["u4","u2","u3","u1","u8"], startDate:Date.now()-1000*60*60*24*3, endDate:Date.now()+1000*60*60*24*27, icon:"💪" },
  { id:"ch2", name:"January Squat Streak", description:"Squat at least 3x per week for the whole month", createdBy:"u7", participants:["u7","u5","u2"], startDate:Date.now()-1000*60*60*24*10, endDate:Date.now()+1000*60*60*24*20, icon:"🦵" },
  { id:"ch3", name:"10K Steps Daily", description:"Hit 10,000 steps every day for 30 days", createdBy:"u6", participants:["u6","u9","u4","u1"], startDate:Date.now()-1000*60*60*24*5, endDate:Date.now()+1000*60*60*24*25, icon:"👟" },
];

const SEED_GROUPS = [
  { id:"g1", name:"The Crew", description:"Our gym group — training log + accountability", createdBy:"u1", members:["u1","u2","u3","u7"], icon:"🏋️" },
  { id:"g2", name:"Pull Day Party", description:"Back & biceps obsessed", createdBy:"u3", members:["u3","u1","u2","u7"], icon:"💪" },
  { id:"g3", name:"Form Checkers", description:"Post videos, get feedback from real coaches", createdBy:"u4", members:["u4","u1","u6","u9"], icon:"🎥" },
];

// ═════════════════════════════════════════════════════════════════════════════
// STORAGE
// ═════════════════════════════════════════════════════════════════════════════
const SK = "seshd_v1";
function loadStore() {
  try {
    const r = localStorage.getItem(SK);
    if (r) return JSON.parse(r);
  } catch {}
  return {
    users: [],
    posts: [],
    currentUserId: null,
    history: {},
    prs: {},
    programs: [],
    activeProgramId: null,
    defaultRestTime: 120,
    unit: "lbs",
    theme: "light",
    challenges: [],
    groups: [],
    workoutDates: {},
    seenOnboarding: true,
  };
}
function saveStore(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} }

// ═════════════════════════════════════════════════════════════════════════════
// LOGO — Fyra flame icon + Spotr wordmark
// ═════════════════════════════════════════════════════════════════════════════
function SeshdLogo({ C, big = false }) {
  const size = big ? 52 : 34;
  const id = big ? "seshd-big" : "seshd-sm";
  return (
    <div style={{ display:"flex", alignItems:"center", gap: big ? 10 : 8 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id={`${id}-g`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed"/>
            <stop offset="100%" stopColor="#a855f7"/>
          </linearGradient>
        </defs>
        {/* S-shaped speech bubble — matches the logo */}
        {/* Upper curve of S */}
        <path
          d="M 62 12 C 80 12, 88 22, 88 34 C 88 46, 78 54, 62 54 L 38 54 C 28 54, 22 58, 22 66 C 22 74, 30 80, 42 80 L 72 80 L 72 88 L 38 88 C 20 88, 10 78, 10 66 C 10 54, 20 44, 38 44 L 62 44 C 72 44, 76 38, 76 34 C 76 28, 70 22, 62 22 L 28 22 L 28 12 Z"
          fill={`url(#${id}-g)`}
        />
        {/* Speech bubble tail */}
        <path
          d="M 30 80 L 22 96 L 50 80 Z"
          fill={`url(#${id}-g)`}
        />
      </svg>
      <span style={{
        fontSize: big ? 30 : 19,
        fontWeight: 800,
        letterSpacing: -0.5,
        color: C.text,
        lineHeight: 1,
        fontFamily: F,
      }}>
        Seshd
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
const ExerciseInput = memo(function ExerciseInput({ value, onChange, C, recentExercises }) {
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

  const recent = (() => {
    const seen = new Set();
    (recentExercises || []).slice(0, 10).forEach(sess => {
      (sess.exercises || []).forEach(ex => { if (ex.name) seen.add(ex.name); });
    });
    return Array.from(seen).slice(0, 5);
  })();

  const results = q.length > 0
    ? EXERCISE_DB.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 7)
    : recent.length > 0
      ? recent.map(name => EXERCISE_DB.find(e => e.name === name) || { name, muscle: "" }).filter(Boolean)
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
          {q.length === 0 && recent.length > 0 && (
            <div style={{ padding:"8px 14px 4px", fontSize:10, fontWeight:600, color:C.accent, letterSpacing:1 }}>RECENT</div>
          )}
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
              <MuscleIcon muscle={ex.muscle || ""} size={24} C={C}/>
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
});

// BufferedInput: local state while typing, commits to parent only on blur.
// This means typing never triggers parent re-renders — zero lag.
function BufferedInput({ value, onCommit, placeholder, done, C, prevValue }) {
  const [local, setLocal] = useState(value || "");
  useEffect(() => { setLocal(value || ""); }, [value]);
  const isEmpty = local === "" || local === null || local === undefined;
  return (
    <div style={{ position:"relative" }}>
      {isEmpty && prevValue && (
        <div style={{
          position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:15, fontWeight:600, color:C.sub, opacity:0.45, pointerEvents:"none",
          fontFamily:F
        }}>{prevValue}</div>
      )}
      <input
        type="number" inputMode="decimal"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        placeholder={prevValue ? "" : (placeholder || "0")}
        style={{
          background: done ? `${C.green}22` : C.divider,
          border:"none", borderRadius:8, padding:"8px 4px",
          fontSize:15, fontWeight:600,
          color: done ? C.green : C.text,
          textAlign:"center", outline:"none", width:"100%", boxSizing:"border-box",
          fontFamily:F
        }}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SET ROW (extracted to fix hooks bug)
// ═════════════════════════════════════════════════════════════════════════════
const SetRow = memo(function SetRow({ set, si, exName, store, unit, onUpdate, onToggleDone, C }) {
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

        <div style={{ fontSize:11, color:C.sub, textAlign:"center", fontWeight: prev ? 500 : 400 }}>
          {prev ? (
            <span style={{ color:C.accent, fontFamily:MONO }}>{prev.w}×{prev.r}</span>
          ) : "—"}
        </div>

        <div style={{ position:"relative" }}>
          <BufferedInput
            value={set.weight} onCommit={v => onUpdate({ weight: v })}
            placeholder={prev?.w || "0"}
            prevValue={prev?.w || null}
            done={set.done} C={C}
          />
          {(set.weight || prev?.w) && (
            <div style={{ display:"flex", justifyContent:"center", gap:2, marginTop:2 }}>
              {[-5, 2.5].map(d => (
                <button key={d} onMouseDown={e => { e.preventDefault(); const cur = parseFloat(set.weight)||parseFloat(prev?.w)||0; onUpdate({ weight: String(Math.max(0, Math.round((cur+d)*10)/10)) }); }} style={{
                  background:"none", border:`1px solid ${d<0?C.red+"55":C.green+"55"}`,
                  color:d<0?C.red:C.green, borderRadius:4, padding:"1px 5px",
                  fontSize:9, fontWeight:700, cursor:"pointer", fontFamily:MONO, lineHeight:1.4
                }}>{d>0?"+":""}{d}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ position:"relative" }}>
          <BufferedInput
            value={set.reps} onCommit={v => onUpdate({ reps: v })}
            placeholder={prev?.r || "0"}
            prevValue={prev?.r || null}
            done={set.done} C={C}
          />
        </div>

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
});

// ═════════════════════════════════════════════════════════════════════════════
// CONFETTI (for PR modal)
// ═════════════════════════════════════════════════════════════════════════════
function Confetti() {
  const colors = ["#7c3aed","#f97316","#eab308","#30d158","#a855f7"];
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
    ? [100,95,90,85,80,75,70,65,60].map(p => ({ p, w: Math.round(oneRM * p / 100) }))
    : [];

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:20, width:"100%", maxWidth:400, maxHeight:"85vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px 12px", borderBottom:`1px solid ${C.divider}` }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>1RM Calculator</div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:"50%", background:C.divider, border:"none", cursor:"pointer", fontSize:14, color:C.text, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ overflowY:"auto", flex:1, padding:"16px 18px" }}>
          <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Enter your best set to estimate one-rep max (Epley formula)</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
            {[["Weight", weight, setWeight, unit.toUpperCase()], ["Reps", reps, setReps, "REPS"]].map(([label, val, setter, unit2]) => (
              <div key={label} style={{ background:C.divider, borderRadius:12, padding:"12px 14px" }}>
                <div style={{ fontSize:10, color:C.sub, fontWeight:700, letterSpacing:1, marginBottom:8 }}>{unit2}</div>
                <input type="number" inputMode="decimal" value={val} onChange={e => setter(e.target.value)} placeholder="0"
                  style={{ width:"100%", background:"none", border:"none", fontSize:28, fontWeight:800, color:C.accent, outline:"none", boxSizing:"border-box", fontFamily:MONO }}/>
              </div>
            ))}
          </div>
          {oneRM && (
            <>
              <div style={{ background:`linear-gradient(135deg,${C.accent},${C.accent2})`, borderRadius:14, padding:"18px", textAlign:"center", marginBottom:14 }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.8)", fontWeight:700, letterSpacing:2, marginBottom:4 }}>ESTIMATED 1RM</div>
                <div style={{ fontSize:52, fontWeight:800, color:"#fff", fontFamily:MONO, lineHeight:1 }}>{oneRM}</div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", marginTop:4 }}>{unit}</div>
              </div>
              <div style={{ fontSize:10, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:8 }}>TRAINING PERCENTAGES</div>
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
                {percentages.map(({ p, w }, i) => (
                  <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderBottom: i < percentages.length-1 ? `1px solid ${C.divider}` : "none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:32, height:3, borderRadius:2, background:C.accent, opacity:p/100 }}/>
                      <span style={{ fontSize:13, color:C.sub }}>{p}%</span>
                    </div>
                    <span style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:MONO }}>{w} {unit}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PLATE CALCULATOR MODAL
// ═════════════════════════════════════════════════════════════════════════════
function PlateCalcModal({ onClose, unit, C }) {
  const [target, setTarget] = useState("");
  const BAR_WEIGHT = unit === "kg" ? 20 : 45;
  const PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
  const PLATES_KG  = [25, 20, 15, 10, 5, 2.5, 1.25];
  const plates = unit === "kg" ? PLATES_KG : PLATES_LBS;
  const PLATE_COLORS = { 45:"#ef4444", 35:"#3b82f6", 25:"#22c55e", 10:"#f59e0b", 5:"#8b5cf6", 2.5:"#ec4899", 20:"#3b82f6", 15:"#22c55e", 1.25:"#ec4899" };

  function calcPlates(total) {
    const t = parseFloat(total);
    if (!t || t <= BAR_WEIGHT) return null;
    let remaining = (t - BAR_WEIGHT) / 2;
    const result = [];
    for (const p of plates) {
      const count = Math.floor(remaining / p);
      if (count > 0) { result.push({ p, count }); remaining = Math.round((remaining - p * count) * 1000) / 1000; }
    }
    if (remaining > 0.01) return null;
    return result;
  }

  const result = calcPlates(target);
  const achievable = target && parseFloat(target) > BAR_WEIGHT && result !== null;
  const notAchievable = target && parseFloat(target) > BAR_WEIGHT && result === null;

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:20, width:"100%", maxWidth:400, maxHeight:"85vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px 12px", borderBottom:`1px solid ${C.divider}` }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>Plate Calculator</div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:"50%", background:C.divider, border:"none", cursor:"pointer", fontSize:14, color:C.text, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ overflowY:"auto", flex:1, padding:"16px 18px" }}>
          <div style={{ fontSize:12, color:C.sub, marginBottom:12 }}>Bar: <strong style={{ color:C.text }}>{BAR_WEIGHT} {unit}</strong> · Enter total target weight</div>

          <div style={{ background:C.divider, borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
            <div style={{ fontSize:10, color:C.sub, fontWeight:700, letterSpacing:1, marginBottom:8 }}>TARGET ({unit.toUpperCase()})</div>
            <input type="number" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)}
              placeholder={unit === "kg" ? "100" : "225"}
              style={{ width:"100%", background:"none", border:"none", fontSize:36, fontWeight:800, color:C.accent, outline:"none", boxSizing:"border-box", fontFamily:MONO }}/>
          </div>

          {target && parseFloat(target) <= BAR_WEIGHT && (
            <div style={{ textAlign:"center", color:C.sub, fontSize:13, padding:"16px 0" }}>Enter more than bar weight ({BAR_WEIGHT} {unit})</div>
          )}
          {notAchievable && (
            <div style={{ textAlign:"center", color:"#ef4444", fontSize:13, padding:"16px 0" }}>Not achievable with standard plates</div>
          )}

          {achievable && result && (
            <>
              {/* Visual bar */}
              <div style={{ background:C.divider, borderRadius:12, padding:"14px 10px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"center", gap:2, overflowX:"auto" }}>
                {[...result].reverse().map(({ p, count }) =>
                  Array(count).fill(0).map((_, i) => {
                    const h = Math.max(28, Math.min(68, p * 1.4));
                    return (
                      <div key={`L${p}-${i}`} style={{ width:13, height:h, borderRadius:3, background:PLATE_COLORS[p]||C.accent, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:6, color:"#fff", fontWeight:800, writingMode:"vertical-rl", transform:"rotate(180deg)" }}>{p}</span>
                      </div>
                    );
                  })
                )}
                <div style={{ width:28, height:8, background:C.sub, borderRadius:4, opacity:0.5, flexShrink:0 }}/>
                {result.map(({ p, count }) =>
                  Array(count).fill(0).map((_, i) => {
                    const h = Math.max(28, Math.min(68, p * 1.4));
                    return (
                      <div key={`R${p}-${i}`} style={{ width:13, height:h, borderRadius:3, background:PLATE_COLORS[p]||C.accent, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ fontSize:6, color:"#fff", fontWeight:800, writingMode:"vertical-rl" }}>{p}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Plate list */}
              <div style={{ fontSize:10, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:8 }}>PER SIDE</div>
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
                {result.map(({ p, count }, i) => (
                  <div key={p} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", borderBottom: i < result.length-1 ? `1px solid ${C.divider}` : "none" }}>
                    <div style={{ width:8, height:26, borderRadius:2, background:PLATE_COLORS[p]||C.accent, flexShrink:0 }}/>
                    <div style={{ flex:1, fontSize:14, fontWeight:600, color:C.text }}>{p} {unit}</div>
                    <div style={{ fontSize:16, fontWeight:800, color:C.accent, fontFamily:MONO }}>× {count}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:10, padding:"10px 14px", background:C.divider, borderRadius:10, display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:C.sub }}>Total</span>
                <span style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:MONO }}>{target} {unit}</span>
              </div>
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
        <button style={{ width:"100%", background:"#fff", color:"#6d28d9", border:"none", borderRadius:10, padding:"12px", fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:8 }}>📸 Share to Instagram</button>
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
      <div style={{ background:"linear-gradient(135deg,#92400e,#ca8a04,#dc2626)", borderRadius:24, padding:"40px 24px", width:"100%", maxWidth:340, color:"#fff", textAlign:"center", boxShadow:"0 20px 60px rgba(220,38,38,0.4)" }}>
        <div style={{ fontSize:72, marginBottom:4, lineHeight:1 }}>🏆</div>
        <div style={{ fontSize:13, fontWeight:800, letterSpacing:4, opacity:0.9, marginBottom:6 }}>PERSONAL RECORD</div>
        <div style={{ fontSize:22, fontWeight:700, marginBottom:6, lineHeight:1.2 }}>{pr.name}</div>
        <div style={{ fontSize:56, fontWeight:900, fontFamily:MONO, marginBottom:4, lineHeight:1 }}>{pr.weight}</div>
        <div style={{ fontSize:16, opacity:0.9, marginBottom: pr.increase > 0 ? 6 : 20 }}>{unit}</div>
        {pr.increase > 0 && (
          <div style={{ fontSize:14, background:"rgba(255,255,255,0.2)", borderRadius:20, padding:"6px 16px", display:"inline-block", marginBottom:20, fontWeight:700 }}>
            ↑ {pr.increase} {unit} from previous best
          </div>
        )}
        <button onClick={onClose} style={{ display:"block", width:"100%", background:"#fff", color:"#dc2626", border:"none", borderRadius:12, padding:"14px", fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:10, fontFamily:F }}>
          📸 Share this PR
        </button>
        <button onClick={onClose} style={{ display:"block", width:"100%", background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:13, cursor:"pointer", fontFamily:F }}>
          Keep grinding 🔥
        </button>
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
          <SeshdLogo C={C} big/>
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
      toast("Give your program a name.", "error");
      return;
    }
    const validDays = days.filter(d => d.exercises.length > 0);
    if (validDays.length === 0) {
      toast("Add at least one exercise to one day.", "error");
      return;
    }
    onSave({
      id: uid(),
      name: name.trim(),
      days: validDays.map(d => ({ ...d, id: uid() }))
    });
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
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
                  {exInfo && <MuscleIcon muscle={exInfo.muscle} size={24} C={C}/>}
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
function StoryViewer({ user, post, onClose, onNext, onPrev, hasNext, hasPrev, onViewProfile, C }) {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragStart = useRef(null);
  const duration = 5000; // 5 seconds per story

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    let pausedFor = 0;
    let lastPauseStart = null;
    const interval = setInterval(() => {
      if (paused) {
        if (lastPauseStart === null) lastPauseStart = Date.now();
        return;
      }
      if (lastPauseStart !== null) {
        pausedFor += Date.now() - lastPauseStart;
        lastPauseStart = null;
      }
      const elapsed = Date.now() - start - pausedFor;
      const p = Math.min((elapsed / duration) * 100, 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(interval);
        if (hasNext) onNext(); else onClose();
      }
    }, 50);
    return () => clearInterval(interval);
  }, [user?.id, hasNext, onNext, onClose, paused]);

  function startDrag(x, y) {
    dragStart.current = { x, y };
    setPaused(true);
  }
  function moveDrag(x, y) {
    if (!dragStart.current) return;
    setDrag({ x: x - dragStart.current.x, y: y - dragStart.current.y });
  }
  function endDrag() {
    if (!dragStart.current) {
      setDrag({ x: 0, y: 0 });
      setPaused(false);
      return;
    }
    const { x, y } = drag;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    dragStart.current = null;

    // Determine primary direction
    if (absY > absX) {
      // Vertical dominant
      if (y > 100) {
        onClose();
        return;
      }
      if (y < -100) {
        if (onViewProfile) onViewProfile();
        else setDrag({ x: 0, y: 0 });
        setPaused(false);
        return;
      }
    } else {
      // Horizontal dominant
      if (x < -80 && hasNext) {
        onNext();
        return;
      }
      if (x > 80 && hasPrev) {
        onPrev();
        return;
      }
    }
    setDrag({ x: 0, y: 0 });
    setPaused(false);
  }

  if (!user) return null;

  // Derive visual transform and opacity based on drag
  const dragDist = Math.sqrt(drag.x ** 2 + drag.y ** 2);
  const opacity = Math.max(0.35, 1 - dragDist / 500);

  return (
    <div
      onTouchStart={(e) => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }}
      onTouchEnd={endDrag}
      onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
      onMouseMove={(e) => { if (dragStart.current) moveDrag(e.clientX, e.clientY); }}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      style={{
        position:"fixed", inset:0, background:"#000", zIndex:700,
        display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto",
        transform: `translate(${drag.x}px, ${drag.y}px)`,
        transition: (drag.x === 0 && drag.y === 0) ? "transform 0.2s" : "none",
        opacity,
        paddingTop:"env(safe-area-inset-top)",
        paddingBottom:"env(safe-area-inset-bottom)",
        touchAction:"none",
        userSelect:"none",
        cursor: dragStart.current ? "grabbing" : "default"
      }}
    >
      {/* Progress bar */}
      <div style={{ display:"flex", gap:3, padding:"10px 12px 0", flexShrink:0 }}>
        <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.3)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:"#fff", transition:"width 0.05s linear" }}/>
        </div>
      </div>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 14px 10px", flexShrink:0 }}>
        <Avatar user={user} size={34} C={C}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#fff" }}>{user.username}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>now</div>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#fff", fontSize:24, cursor:"pointer", padding:4, lineHeight:1 }}>✕</button>
      </div>

      {/* Story content */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", padding:20, minHeight:0 }}>
        {/* Tap zones for next/prev */}
        <div onClick={(e) => { e.stopPropagation(); if (hasPrev) onPrev(); }} style={{ position:"absolute", left:0, top:0, bottom:0, width:"33%", cursor: hasPrev ? "pointer" : "default", zIndex:2 }}/>
        <div onClick={(e) => { e.stopPropagation(); hasNext ? onNext() : onClose(); }} style={{ position:"absolute", right:0, top:0, bottom:0, width:"67%", cursor:"pointer", zIndex:2 }}/>

        <div style={{ width:"100%", aspectRatio:"9/16", maxHeight:"100%", borderRadius:12, overflow:"hidden", position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {post?.imageData ? (
            <img src={post.imageData} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
          ) : (
            <div style={{ width:"100%", height:"100%", background:`linear-gradient(135deg, ${C.accent}, ${C.accent2})`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", padding:40, textAlign:"center" }}>
              <div style={{ fontSize:60, marginBottom:16 }}>{user.avatar || "💪"}</div>
              <div style={{ fontSize:24, fontWeight:700, color:"#fff", marginBottom:8 }}>{user.name}</div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.9)", lineHeight:1.4 }}>{user.bio || "Building strength, one rep at a time."}</div>
            </div>
          )}
          {post?.caption && (
            <div style={{ position:"absolute", bottom:16, left:12, right:12, background:"rgba(0,0,0,0.5)", borderRadius:10, padding:"8px 12px", color:"#fff", fontSize:14, lineHeight:1.4 }}>
              {post.caption}
            </div>
          )}
        </div>
      </div>

      {/* Reply footer + swipe hints */}
      <div style={{ padding:"10px 14px 14px", flexShrink:0 }}>
        <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:24, padding:"10px 16px", color:"rgba(255,255,255,0.7)", fontSize:13 }}>
          Reply to {user.username}...
        </div>
        <div style={{ textAlign:"center", fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:8 }}>
          Swipe ← → to navigate · ↑ for profile · ↓ to close
        </div>
      </div>
    </div>
  );
}
const PostCard = memo(function PostCard({ post, store, currentUserId, onKudos, onComment, onUserClick, onEdit, onDelete, displayUnit, C }) {
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

      {post.type === "run" && post.run && (
        <div style={{ margin:"0 14px", background:"linear-gradient(135deg,#0ea5e9,#0284c7)", borderRadius:12, padding:"18px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <span style={{ fontSize:28 }}>🏃</span>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>
                {post.run.distance} {post.run.distUnit}
              </div>
              {post.run.route && <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>📍 {post.run.route}</div>}
            </div>
          </div>
          <div style={{ display:"flex", gap:16 }}>
            {[
              ["⏱", `${Math.floor(post.run.durationMins/60) ? Math.floor(post.run.durationMins/60)+"h " : ""}${post.run.durationMins%60}m`, "Time"],
              post.run.pace && ["⚡", post.run.pace, "Pace"],
            ].filter(Boolean).map(([icon, val, label]) => (
              <div key={label} style={{ flex:1, background:"rgba(255,255,255,0.15)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.7)", marginBottom:2 }}>{icon} {label}</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#fff", fontFamily:MONO }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {post.type === "yoga" && post.yoga && (
        <div style={{ margin:"0 14px", background:"linear-gradient(135deg,#7c3aed,#a78bfa)", borderRadius:12, padding:"18px 18px", display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:40 }}>🧘</span>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:"#fff", textTransform:"capitalize" }}>{post.yoga.style} Yoga</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.85)", marginTop:2 }}>{post.yoga.durationMins} minutes</div>
          </div>
        </div>
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
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{ex.name}</span>
                {ex.isPR && <span style={{ fontSize:9, background:"linear-gradient(135deg,#ca8a04,#dc2626)", color:"#fff", padding:"1px 6px", borderRadius:8, fontWeight:700, flexShrink:0 }}>🏆 PR</span>}
              </div>
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
              ? `${user?.username} on Seshd: ${post.caption}`
              : `Check out ${user?.username}'s workout on Seshd`;
            const shareUrl = typeof window !== "undefined" ? window.location.href : "";
            if (navigator.share) {
              navigator.share({ title: "Seshd", text: shareText, url: shareUrl }).catch(() => {});
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(`${shareText} ${shareUrl}`).then(() => {
                toast("Link copied! 🔗", "success");
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
});

// ═════════════════════════════════════════════════════════════════════════════
// PROGRAM DETAIL VIEW
// ═════════════════════════════════════════════════════════════════════════════
function ProgramDetailView({ prog, store, unit, C, F, MONO, onBack, onSaveProgram, onSaveStore, startWorkout, onProgramEdited }) {
  const [editingDayIdx, setEditingDayIdx] = useState(null);
  const [localProg, setLocalProg] = useState(prog);

  useEffect(() => { setLocalProg(prog); }, [prog.id]);

  const isActive = store.activeProgramId === prog.id;

  function updateExercise(di, ei, patch) {
    setLocalProg(p => {
      const updated = { ...p, days: p.days.map((d, dIdx) => dIdx !== di ? d : {
        ...d, exercises: d.exercises.map((ex, exIdx) => exIdx !== ei ? ex : { ...ex, ...patch })
      })};
      if (onProgramEdited) onProgramEdited(updated);
      return updated;
    });
  }

  function addExercise(di) {
    setLocalProg(p => {
      const updated = { ...p, days: p.days.map((d, dIdx) => dIdx !== di ? d : {
        ...d, exercises: [...(d.exercises||[]), { name:"", reps:"8-12", note:"" }]
      })};
      if (onProgramEdited) onProgramEdited(updated);
      return updated;
    });
  }

  function removeExercise(di, ei) {
    setLocalProg(p => {
      const updated = { ...p, days: p.days.map((d, dIdx) => dIdx !== di ? d : {
        ...d, exercises: d.exercises.filter((_, exIdx) => exIdx !== ei)
      })};
      if (onProgramEdited) onProgramEdited(updated);
      return updated;
    });
  }

  return (
    <div style={{ padding:"14px" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:C.text, fontSize:14, cursor:"pointer", padding:"4px 0 12px", fontFamily:F }}>‹ Back to Programs</button>

      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:22, fontWeight:700, color:C.text, marginBottom:4 }}>{localProg.name}</div>
        <div style={{ fontSize:13, color:C.sub }}>{localProg.days?.length || 0} days · {localProg.days?.reduce((a,d) => a+(d.exercises?.length||0),0)} exercises</div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:18 }}>
        {!isActive && (
          <button onClick={() => onSaveProgram && onSaveProgram(localProg)} style={{ flex:1, background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"10px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Set as Active</button>
        )}
        {isActive && (
          <button onClick={() => onSaveProgram && onSaveProgram({ ...localProg, _deactivate: true })} style={{ flex:1, background:"none", color:C.text, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Deactivate</button>
        )}
        <button onClick={() => {
          if (window.confirm(`Delete "${localProg.name}"?`)) {
            onSaveStore(s => ({ ...s, programs: s.programs.filter(p => p.id !== localProg.id), activeProgramId: s.activeProgramId === localProg.id ? null : s.activeProgramId }));
            onBack();
          }
        }} style={{ padding:"10px 16px", background:"none", border:`1px solid #ef4444`, borderRadius:8, color:"#ef4444", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>Delete</button>
      </div>

      {(localProg.days || []).map((day, di) => (
        <div key={day.id || di} style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:"14px", marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{day.name}</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => {
                if (editingDayIdx === di) {
                  // Closing edit — trigger explicit save
                  if (onSaveProgram) onSaveProgram(localProg);
                  else if (onProgramEdited) onProgramEdited(localProg);
                }
                setEditingDayIdx(editingDayIdx === di ? null : di);
              }} style={{
                background: editingDayIdx === di ? C.accent : C.divider,
                color: editingDayIdx === di ? "#fff" : C.sub,
                border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
              }}>{editingDayIdx === di ? "Save" : "Edit"}</button>
              <button onClick={() => startWorkout && startWorkout(day, localProg.id)} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:6, padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F }}>Start</button>
            </div>
          </div>

          {(day.exercises || []).map((ex, ei) => {
            const exInfo = EXERCISE_DB?.find(e => e.name === ex.name);
            return (
              <div key={ei} style={{ padding:"8px 0", borderTop: ei > 0 ? `1px solid ${C.divider}` : "none" }}>
                {editingDayIdx === di ? (
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ flex:1 }}>
                      <input value={ex.name} onChange={e => updateExercise(di, ei, { name: e.target.value })}
                        style={{ width:"100%", background:C.divider, border:"none", borderRadius:6, padding:"6px 10px", fontSize:13, color:C.text, outline:"none", fontFamily:F, boxSizing:"border-box", marginBottom:4 }}
                      />
                      <input value={ex.note||""} placeholder="Note..." onChange={e => updateExercise(di, ei, { note: e.target.value })}
                        style={{ width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.divider}`, padding:"3px 0", fontSize:12, color:C.sub, outline:"none", fontFamily:F, boxSizing:"border-box" }}
                      />
                    </div>
                    <button onClick={() => removeExercise(di, ei)} style={{ background:"none", border:"none", fontSize:20, color:"#ef4444", cursor:"pointer", flexShrink:0 }}>×</button>
                  </div>
                ) : (
                  <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    {exInfo && <div style={{ width:32, height:32, borderRadius:8, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><MuscleIcon muscle={exInfo.muscle} size={22} C={C}/></div>}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{ex.name}</div>
                      {ex.reps && <div style={{ fontSize:11, color:C.sub }}>{ex.reps}</div>}
                      {ex.note && <div style={{ fontSize:11, color:C.accent, marginTop:2 }}>💡 {ex.note}</div>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {editingDayIdx === di && (
            <button onClick={() => addExercise(di)} style={{ width:"100%", marginTop:10, padding:"8px", background:"none", border:`1px dashed ${C.border}`, borderRadius:8, color:C.accent, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F }}>
              + Add Exercise
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// WORKOUT TRACKER
// ═════════════════════════════════════════════════════════════════════════════
const SESSION_KEY = "seshd_active_session";
const WSTART_KEY = "seshd_wstart";

function WorkoutTracker({ store, setStore, onShareWorkout, onSaveWorkout, onSaveProgram, onProgramEdited, onPRHit, C }) {
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [elapsed, setElapsed] = useState(() => {
    try {
      const ws = localStorage.getItem(WSTART_KEY);
      return ws ? Math.floor((Date.now() - parseInt(ws)) / 1000) : 0;
    } catch { return 0; }
  });
  const [wStart, setWStart] = useState(() => {
    try {
      const ws = localStorage.getItem(WSTART_KEY);
      return ws ? parseInt(ws) : null;
    } catch { return null; }
  });
  const [rest, setRest] = useState(null);
  const [showFinish, setShowFinish] = useState(false);
  const [show1RM, setShow1RM] = useState(false);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [subTab, setSubTab] = useState("today");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAICoach, setShowAICoach] = useState(false);
  const [viewingProgram, setViewingProgram] = useState(null); // program ID
  const [showBuilder, setShowBuilder] = useState(false);
  const [previewDay, setPreviewDay] = useState(null); // {day, programName}
  const [viewingExercise, setViewingExercise] = useState(null);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("All");
  const elRef = useRef(null);
  const rtRef = useRef(null);

  // Resync elapsed when app comes back to foreground
  useEffect(() => {
    function onVisible() {
      if (!document.hidden && wStart) {
        setElapsed(Math.floor((Date.now() - wStart) / 1000));
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [wStart]);
  useEffect(() => {
    if (!session) { localStorage.removeItem(SESSION_KEY); return; }
    const id = setInterval(() => {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [session]);

  const unit = store.unit || "lbs";
  const prog = store.programs?.find(p => p.id === store.activeProgramId);

  useEffect(() => {
    clearInterval(elRef.current);
    if (wStart) {
      localStorage.setItem(WSTART_KEY, String(wStart));
      elRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-wStart)/1000)), 1000);
    } else {
      localStorage.removeItem(WSTART_KEY);
    }
    return () => clearInterval(elRef.current);
  }, [wStart]);

  useEffect(() => {
    clearInterval(rtRef.current);
    if (rest?.running && rest.secs > 0) {
      rtRef.current = setInterval(() => setRest(p => {
        if (!p) return null;
        if (p.secs > 1) {
          return { ...p, secs: p.secs - 1 };
        }
        // Timer just hit 0 — play ping + fire notification
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) {
            const ac = new Ctx();
            const now = ac.currentTime;
            // 3 ascending beeps — louder than before
            [660, 880, 1100].forEach((freq, i) => {
              const osc = ac.createOscillator();
              const gain = ac.createGain();
              osc.type = "sine";
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.0001, now + i * 0.18);
              gain.gain.exponentialRampToValueAtTime(0.7, now + i * 0.18 + 0.01);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.25);
              osc.connect(gain).connect(ac.destination);
              osc.start(now + i * 0.18);
              osc.stop(now + i * 0.18 + 0.3);
            });
            setTimeout(() => { try { ac.close(); } catch {} }, 1200);
          }
        } catch (e) {}
        // Vibrate (Android + some iOS)
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
        // Visual flash via toast
        try { toast("Rest time's up — go! 🔥", "success"); } catch (e) {}
        // Background notification
        try {
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            new Notification("Rest time's up 🔥", {
              body: "Get back to it.",
              icon: "/icon-192.png",
              tag: "rest-timer",
            });
          }
        } catch (e) {}
        return null;
      }), 1000);
    }
    return () => clearInterval(rtRef.current);
  }, [rest?.running]);

  // Request notification permission once on mount (so it's ready when rest timer ends)
  useEffect(() => {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        // Don't auto-prompt on load — we'll request when user first starts a rest timer
      }
    } catch (e) {}
  }, []);

  function startWorkout(day, progId) {
    const exs = day
      ? day.exercises.map(ex => ({
          ...ex, id: uid(),
          sets: Array.from({ length: 3 }, () => ({ id: uid(), weight: "", reps: "", done: false, type: "normal" }))
        }))
      : [{ id: uid(), name: "", reps: "", note: "", sets: [{ id: uid(), weight: "", reps: "", done: false, type: "normal" }] }];
    setSession({
      dayId: day?.id || null,
      dayName: day?.name || "Quick Workout",
      programId: progId || store.activeProgramId || null,
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
    // Use per-set restTime if set, else exercise default, else global default
    setSession(p => {
      const ex = p.exercises[ei];
      const set = ex?.sets[si];
      const restSecs = set?.restTime || store.defaultRestTime || 120;
      setRest({ secs: restSecs, total: restSecs, running: true });
      return p;
    });
    // Request notification permission on first rest timer (user gesture required)
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) {}
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

  const [finishing, setFinishing] = useState(false);
  const [showWorkoutSummary, setShowWorkoutSummary] = useState(false);
  const [workoutSummary, setWorkoutSummary] = useState(null);

  async function finishWorkout(share) {
    if (!session || finishing) return;
    setFinishing(true);
    setShowFinish(false);

    try {
      const dk = dKey();
      const sid = uid();
      let hitPR = null;
      const newPRs = { ...store.prs };

      const cleanEx = session.exercises.filter(e => e.name).map(ex => ({
        name: ex.name,
        sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps, done: s.done, type: s.type }))
      }));

      // Compute PRs
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

      // Save to local store
      setStore(p => ({
        ...p,
        history: {
          ...p.history,
          [dk]: {
            ...(p.history[dk] || {}),
            [sid]: { dayName: session.dayName, exercises: cleanEx, duration: elapsed, unit, note: "" }
          }
        },
        prs: newPRs,
        workoutDates: { ...p.workoutDates, [dk]: true },
        exerciseNotes: {
          ...(p.exerciseNotes || {}),
          ...Object.fromEntries(
            session.exercises
              .filter(ex => ex.name && ex.note?.trim())
              .map(ex => [ex.name, ex.note.trim()])
          )
        }
      }));

      // Save program changes
      if (session.programId && session.dayName && onSaveProgram) {
        const prog = store.programs.find(p => p.id === session.programId);
        if (prog) {
          const updatedDays = prog.days.map(d => d.name === session.dayName ? {
            ...d,
            exercises: session.exercises.filter(e => e.name).map(ex => ({
              name: ex.name, reps: ex.reps || d.exercises.find(x => x.name === ex.name)?.reps || "8-12",
              note: ex.note || ""
            }))
          } : d);
          onSaveProgram({ ...prog, days: updatedDays });
        }
      }

      // Build summary
      const newPRsList = Object.entries(newPRs)
        .filter(([k, v]) => (store.prs?.[k] || 0) < v)
        .map(([name, weight]) => ({ name, weight: unit === "lbs" ? weight : cvt(weight, "lbs", "kg") }));
      const totalSets = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done && s.type !== "warmup").length, 0);
      const totalVol = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done && s.type !== "warmup").reduce((b, s) => b + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0), 0);

      // Clear session first so workout screen dismisses
      clearInterval(elRef.current);
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      setWStart(null);
      setElapsed(0);
      setRest(null);

      // Show summary
      setWorkoutSummary({
        dayName: session.dayName,
        duration: fmtTime(elapsed),
        sets: totalSets,
        volume: fmtVol(Math.round(totalVol), unit),
        exercises: session.exercises.filter(e => e.name).length,
        prs: newPRsList,
        share,
        shareData: share ? (() => {
          const postEx = session.exercises
            .filter(ex => ex.name && ex.sets.some(s => s.done))
            .map(ex => {
              const maxW = Math.max(0, ...ex.sets.filter(s => s.done && s.weight && s.type !== "warmup").map(s => parseFloat(s.weight) || 0));
              const maxLbs = unit === "lbs" ? maxW : cvt(maxW, "kg", "lbs");
              return {
                name: ex.name,
                sets: ex.sets.filter(s => s.done && s.type !== "warmup").map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 })),
                isPR: maxLbs > 0 && maxLbs > (store.prs?.[ex.name] || 0)
              };
            });
          const vol = postEx.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
          return { type:"workout", caption:`Just crushed ${session.dayName} 💪`, unit, workout:{ name:session.dayName, duration:elapsed, volume:Math.round(vol), exercises:postEx }, isPR:!!hitPR };
        })() : null,
      });
      setShowWorkoutSummary(true);

      // Fire-and-forget saves (don't block UI)
      if (share) {
        onShareWorkout(null); // will be called from summary modal "Share" button
      }
      onSaveWorkout({ dayName: session.dayName, exercises: session.exercises.filter(ex => ex.name), duration: elapsed, unit, note: "", prs: newPRs });

      toast(share ? "Workout posted! 🔥" : "Workout saved! 💪", "success");
      if (hitPR) setTimeout(() => onPRHit(hitPR), 300);
    } finally {
      setFinishing(false);
    }
  }

  // ── ACTIVE WORKOUT ──────────────────────────────────────────────────────────
  if (session) {
    const done = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const total = session.exercises.reduce((a, ex) => a + ex.sets.length, 0);

    return (
      <div style={{ background:C.bg, flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {show1RM && <OneRMModal onClose={() => setShow1RM(false)} unit={unit} C={C}/>}
        {showPlateCalc && <PlateCalcModal onClose={() => setShowPlateCalc(false)} unit={unit} C={C}/>}

        {/* Header */}
        <div style={{ background:C.bg, padding:"10px 14px 8px", borderBottom:`1px solid ${C.divider}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => { clearInterval(elRef.current); localStorage.removeItem(SESSION_KEY); setSession(null); setWStart(null); setElapsed(0); setRest(null); }} style={{ fontSize:13, color:C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{session.dayName}</div>
            <div style={{ fontSize:28, fontWeight:800, color:C.accent, fontFamily:MONO, lineHeight:1.1 }}>{fmtTime(elapsed)}</div>
          </div>
          <button onClick={() => setShowFinish(true)} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F }}>Finish</button>
        </div>

        {/* Progress + tools */}
        <div style={{ background:C.surface, padding:"8px 14px 10px", borderBottom:`1px solid ${C.divider}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:11, color:C.sub, fontWeight:600 }}>{done} / {total} sets · {unit.toUpperCase()}</span>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShow1RM(true)} style={{ fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F, fontWeight:600 }}>1RM</button>
              <button onClick={() => setShowPlateCalc(true)} style={{ fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F, fontWeight:600 }}>Plates</button>
            </div>
          </div>
          <div style={{ height:4, background:C.divider, borderRadius:4, overflow:"hidden" }}>
            <div style={{ height:"100%", background:C.accent, width:`${(done/Math.max(total,1))*100}%`, transition:"width 0.4s", borderRadius:4 }}/>
          </div>
        </div>

        {/* Rest timer */}
        {rest && (
          <div style={{ background:C.surface, borderBottom:`1px solid ${C.divider}` }}>
            <div style={{ height:3, background:C.divider }}>
              <div style={{ height:"100%", background:rest.secs<=10?"#ef4444":C.accent, width:`${(rest.secs/(rest.total||120))*100}%`, transition:"width 1s linear", borderRadius:2 }}/>
            </div>
            <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", gap:4, flex:1, flexWrap:"nowrap", overflow:"hidden" }}>
                {[30,60,90,120,180,240].map(s => (
                  <button key={s} onClick={() => setRest({secs:s,total:s,running:true})} style={{
                    fontSize:10, padding:"4px 7px",
                    background:rest.total===s?C.accent:"transparent",
                    border:`1px solid ${rest.total===s?C.accent:C.border}`,
                    color:rest.total===s?"#fff":C.sub,
                    borderRadius:16, cursor:"pointer", fontFamily:F, fontWeight:600, flexShrink:0
                  }}>{s>=60?`${s/60}m`:`${s}s`}</button>
                ))}
              </div>
              <span style={{ fontSize:28, fontWeight:800, color:rest.secs<=10?"#ef4444":C.text, fontFamily:MONO, flexShrink:0 }}>{fmtTime(rest.secs)}</span>
              <button onClick={() => { clearInterval(rtRef.current); setRest(null); }} style={{ color:C.sub, background:"none", border:"none", cursor:"pointer", fontSize:18, padding:"2px", flexShrink:0 }}>✕</button>
            </div>
          </div>
        )}

        {/* Exercises */}
        <div style={{ overflowY:"auto", flex:1, paddingBottom:24 }}>
          {session.exercises.map((ex, ei) => {
            const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
            return (
              <div key={ex.id || ei}>
                {/* Exercise header */}
                <div style={{ padding:"14px 14px 6px", display:"flex", alignItems:"flex-start", gap:10 }}>
                  <button onClick={() => ex.name && setViewingExercise(ex.name)} style={{ background:"none", border:"none", padding:0, cursor:ex.name?"pointer":"default", flexShrink:0, marginTop:2 }}>
                    <MuscleIcon muscle={exInfo?.muscle||""} size={36} C={C}/>
                  </button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <ExerciseInput value={ex.name}
                        onChange={v => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,name:v}) }))}
                        C={C} recentExercises={Object.values(store.history||{}).flatMap(Object.values).slice(0,20)}/>
                    </div>
                    {exInfo?.muscle && <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>{exInfo.muscle}</div>}
                    <input value={ex.note||""}
                      onChange={e => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,note:e.target.value}) }))}
                      placeholder="Add note..."
                      style={{ width:"100%", background:"none", border:"none", padding:"3px 0", fontSize:11, color:C.sub, outline:"none", fontFamily:F, boxSizing:"border-box", marginTop:4 }}
                    />
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    {ex.name && <button onClick={() => setViewingExercise(ex.name)} style={{ background:C.accentSoft, border:"none", borderRadius:6, padding:"5px 8px", fontSize:10, color:C.accent, fontWeight:700, cursor:"pointer", fontFamily:F }}>?</button>}
                    <button onClick={() => setSession(p => ({ ...p, exercises: p.exercises.filter((_,i)=>i!==ei) }))} style={{ background:"none", border:"none", color:C.sub, fontSize:18, cursor:"pointer", padding:"2px 4px" }}>×</button>
                  </div>
                </div>

                {/* Column headers */}
                <div style={{ display:"grid", gridTemplateColumns:"32px 36px 1fr 76px 76px 36px", gap:4, padding:"0 14px 4px" }}>
                  {["Set","Type","Previous",unit.toUpperCase(),"Reps",""].map((h,i) => (
                    <div key={i} style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:0.5, textAlign:"center" }}>{h}</div>
                  ))}
                </div>

                {ex.sets.map((set, si) => (
                  <div key={set.id||si}>
                    <SetRow set={set} si={si} exName={ex.name} store={store} unit={unit} C={C}
                      onUpdate={patch => updateSet(ei,si,patch)}
                      onToggleDone={() => toggleDone(ei,si)}
                    />
                    <div style={{ display:"flex", alignItems:"center", padding:"0 14px" }}>
                      <div style={{ flex:1, height:1, background:`${C.accent}18` }}/>
                      <button onClick={() => { const s=set.restTime||store.defaultRestTime||120; setRest({secs:s,total:s,running:true}); }} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 10px", fontSize:11, fontWeight:700, color:`${C.accent}80`, fontFamily:MONO }}>
                        {fmtTime(set.restTime||store.defaultRestTime||120)}
                      </button>
                      <button onClick={() => { const opts=[30,60,90,120,150,180,240,300]; const cur=set.restTime||store.defaultRestTime||120; updateSet(ei,si,{restTime:opts[(opts.indexOf(cur)+1)%opts.length]}); }} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 4px", fontSize:10, color:C.muted, fontFamily:F }}>edit</button>
                      <div style={{ flex:1, height:1, background:`${C.accent}18` }}/>
                    </div>
                  </div>
                ))}

                <div style={{ display:"flex", padding:"4px 14px 12px", borderBottom:`1px solid ${C.divider}` }}>
                  <button onClick={() => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,sets:[...x.sets,{id:uid(),weight:"",reps:"",done:false,type:"normal"}]}) }))} style={{ flex:1, padding:"8px", background:"none", border:"none", color:C.accent, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F, textAlign:"left" }}>+ Add Set</button>
                  {ex.sets.length > 1 && <button onClick={() => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,sets:x.sets.slice(0,-1)}) }))} style={{ flex:1, padding:"8px", background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:F, textAlign:"right" }}>Remove</button>}
                </div>
              </div>
            );
          })}

          <button onClick={() => setSession(p => ({ ...p, exercises:[...p.exercises,{id:uid(),name:"",reps:"",note:"",sets:[{id:uid(),weight:"",reps:"",done:false,type:"normal"}]}] }))} style={{
            width:"calc(100% - 28px)", margin:"14px 14px 0", padding:"13px",
            background:"none", border:`1.5px dashed ${C.border}`,
            borderRadius:12, fontSize:13, color:C.accent, fontWeight:600, cursor:"pointer", fontFamily:F
          }}>+ Add Exercise</button>
        </div>

        {showWorkoutSummary && workoutSummary && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
            <div style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}`, maxHeight:"90dvh", display:"flex", flexDirection:"column" }}>
              <div style={{ overflowY:"auto", flex:1, padding:"24px 18px 0" }}>
                {/* Shareable card */}
                <div id="workout-card" style={{ background:`linear-gradient(135deg,${C.accent},${C.accent2})`, borderRadius:16, padding:"20px", marginBottom:16, position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", top:-20, right:-20, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }}/>
                  <div style={{ position:"absolute", bottom:-30, left:-10, width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.04)" }}/>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:700, letterSpacing:2, marginBottom:4 }}>IGNITE · WORKOUT COMPLETE</div>
                  <div style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:14, lineHeight:1.2 }}>{workoutSummary.dayName}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    {[["⏱", workoutSummary.duration, "Time"], ["💪", workoutSummary.sets, "Sets"], ["📦", workoutSummary.volume, "Volume"]].map(([icon, val, label]) => (
                      <div key={label} style={{ background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                        <div style={{ fontSize:14, fontWeight:800, color:"#fff", fontFamily:MONO }}>{val}</div>
                        <div style={{ fontSize:9, color:"rgba(255,255,255,0.75)", marginTop:2, letterSpacing:0.5 }}>{label.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                  {workoutSummary.prs?.length > 0 && (
                    <div style={{ marginTop:12, background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"8px 12px" }}>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.8)", fontWeight:700, marginBottom:4 }}>🏆 PR{workoutSummary.prs.length > 1 ? "s" : ""}</div>
                      {workoutSummary.prs.map(pr => (
                        <div key={pr.name} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#fff" }}>
                          <span>{pr.name}</span><span style={{ fontWeight:700, fontFamily:MONO }}>{pr.weight} {unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ padding:"12px 18px 32px", display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={() => {
                  if (workoutSummary.shareData) {
                    onShareWorkout(workoutSummary.shareData);
                  }
                  const text = `Just crushed ${workoutSummary.dayName} on Seshd 🔥\n${workoutSummary.duration} · ${workoutSummary.sets} sets · ${workoutSummary.volume}${workoutSummary.prs?.length ? `\n🏆 ${workoutSummary.prs.map(p=>p.name).join(", ")}` : ""}`;
                  if (navigator.share) navigator.share({ title:"Seshd Workout", text }).catch(()=>{});
                  else if (navigator.clipboard) { navigator.clipboard.writeText(text); toast("Copied!", "success"); }
                  setShowWorkoutSummary(false); setWorkoutSummary(null);
                }} style={{ width:"100%", background:`linear-gradient(135deg,${C.accent},${C.accent2})`, color:"#fff", border:"none", borderRadius:10, padding:"14px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F }}>
                  📸 Share Workout
                </button>
                <button onClick={() => { setShowWorkoutSummary(false); setWorkoutSummary(null); }} style={{ width:"100%", background:"none", color:C.sub, border:"none", padding:"10px", fontSize:13, cursor:"pointer", fontFamily:F }}>Done</button>
              </div>
            </div>
          </div>
        )}
        {/* Finish modal */}
        {showFinish && (
          <div onClick={() => setShowFinish(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", padding:"20px 18px 36px", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:19, fontWeight:700, color:C.text, marginBottom:4 }}>Finish Workout?</div>
              <div style={{ fontSize:13, color:C.sub, marginBottom:18 }}>{done}/{total} sets · {fmtTime(elapsed)}</div>
              <button onClick={() => finishWorkout(true)} disabled={finishing} style={{ width:"100%", background:finishing?C.sub:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"13px", fontSize:14, fontWeight:600, cursor:finishing?"not-allowed":"pointer", marginBottom:8, fontFamily:F }}>{finishing ? "Saving..." : "Finish & Share"}</button>
              <button onClick={() => finishWorkout(false)} disabled={finishing} style={{ width:"100%", background:"none", color:C.text, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:600, cursor:finishing?"not-allowed":"pointer", marginBottom:8, fontFamily:F }}>{finishing ? "..." : "Save Only"}</button>
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
    <div style={{ overflowY:"auto", flex:1, display:"flex", flexDirection:"column", paddingBottom:20 }}>
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
          {/* Streak banner */}
          {(() => { const s = calcStreak(store.workoutDates || {}); return s > 0 ? (
            <div style={{ background:"linear-gradient(135deg,#ea580c,#f59e0b)", borderRadius:14, padding:"14px 16px", marginBottom:14, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:36, lineHeight:1 }}>🔥</div>
              <div>
                <div style={{ fontSize:26, fontWeight:800, color:"#fff", fontFamily:MONO, lineHeight:1 }}>{s}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.85)", marginTop:1 }}>day streak · keep it going</div>
              </div>
            </div>
          ) : null; })()}

          {/* Quick Start */}
          <button onClick={() => startWorkout(null)} style={{
            width:"100%", background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
            border:"none", borderRadius:14, padding:"16px 18px", marginBottom:10,
            cursor:"pointer", display:"flex", alignItems:"center", gap:14, fontFamily:F,
            boxShadow:`0 4px 16px ${C.accent}44`
          }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⚡</div>
            <div style={{ textAlign:"left", flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>Quick Start</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", marginTop:1 }}>Start an empty workout</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
          </button>

          {/* Calculators */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[["🧮","1RM Calc",() => setShow1RM(true)],["🏋️","Plates",() => setShowPlateCalc(true)]].map(([icon,label,fn]) => (
              <button key={label} onClick={fn} style={{
                flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12,
                padding:"11px 8px", display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontFamily:F
              }}>
                <span style={{ fontSize:18 }}>{icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{label}</span>
              </button>
            ))}
          </div>

          {show1RM && <OneRMModal onClose={() => setShow1RM(false)} unit={unit} C={C}/>}
          {showPlateCalc && <PlateCalcModal onClose={() => setShowPlateCalc(false)} unit={unit} C={C}/>}

          {prog ? (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1 }}>ACTIVE PROGRAM</div>
                <div style={{ fontSize:12, fontWeight:600, color:C.accent }}>{prog.name}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {prog.days.map((day, di) => (
                  <div key={day.id || di} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
                    <button onClick={() => setPreviewDay({ day, programName: prog.name })} style={{
                      width:"100%", background:"none", border:"none", padding:"13px 14px",
                      display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left", fontFamily:F
                    }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:C.accentSoft, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:C.accent }}>{di+1}</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{day.name}</div>
                        <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>
                          {day.exercises.slice(0,3).map(e=>e.name).join(" · ")}{day.exercises.length > 3 ? ` +${day.exercises.length-3}` : ""}
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
                    </button>
                    <div style={{ display:"flex", borderTop:`1px solid ${C.divider}` }}>
                      <button onClick={() => { setSubTab("programs"); setViewingProgram(prog.id); }} style={{
                        flex:1, padding:"9px", background:"none", border:"none", borderRight:`1px solid ${C.divider}`,
                        fontSize:12, fontWeight:600, color:C.sub, cursor:"pointer", fontFamily:F
                      }}>Edit</button>
                      <button onClick={() => startWorkout(day)} style={{
                        flex:1, padding:"9px", background:"none", border:"none",
                        fontSize:12, fontWeight:600, color:C.accent, cursor:"pointer", fontFamily:F
                      }}>Start ›</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ background:C.surface, border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", marginTop:4 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📋</div>
              <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:4 }}>No active program</div>
              <div style={{ fontSize:12, color:C.sub, marginBottom:16 }}>Import a template to get started</div>
              <button onClick={() => setShowTemplates(true)} style={{
                background:C.accent, color:"#fff", border:"none", borderRadius:10,
                padding:"10px 22px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F
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
          {(store.programs || []).map((p, idx) => (
            <div key={p.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData("text/plain", String(idx)); e.currentTarget.style.opacity="0.5"; }}
              onDragEnd={e => { e.currentTarget.style.opacity="1"; }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
                if (fromIdx === idx) return;
                const arr = [...store.programs];
                const [moved] = arr.splice(fromIdx, 1);
                arr.splice(idx, 0, moved);
                setStore(prev => ({ ...prev, programs: arr }));
              }}
              onClick={() => setViewingProgram(p.id)} style={{
              background: store.activeProgramId === p.id ? C.accentSoft : "none",
              border:`1px solid ${store.activeProgramId === p.id ? C.accent : C.border}`,
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
              <span style={{ fontSize:18, color:C.sub }}>⠿</span>
            </div>
          ))}
        </div>
      )}

      {/* Program Detail View */}
      {subTab === "programs" && viewingProgram && (() => {
        const prog = store.programs?.find(p => p.id === viewingProgram);
        if (!prog) { setViewingProgram(null); return null; }
        return (
          <ProgramDetailView
            prog={prog}
            store={store}
            unit={unit}
            C={C}
            F={F}
            MONO={MONO}
            onBack={() => setViewingProgram(null)}
            onSaveProgram={onSaveProgram}
            onSaveStore={setStore}
            onProgramEdited={onProgramEdited}
            startWorkout={(day, progId) => {
              setPreviewDay({ day, programName: prog.name, progId });
            }}
          />
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
          {/* Search Bar */}
          <div style={{ position:"relative", marginBottom:12 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:C.sub }}>🔍</span>
            <input value={exerciseSearch} onChange={e => setExerciseSearch(e.target.value)}
              placeholder="Search exercises..."
              style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"10px 10px 10px 38px", fontSize:14, color:C.text, outline:"none", fontFamily:F, boxSizing:"border-box" }}
            />
            {exerciseSearch && <button onClick={() => setExerciseSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.sub, fontSize:16, cursor:"pointer" }}>×</button>}
          </div>
          {/* Filter Pills */}
          <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:4 }}>
            {["All","Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Core"].map(f => (
              <button key={f} onClick={() => setExerciseFilter(f)} style={{
                padding:"5px 12px", background: exerciseFilter===f ? C.accent : C.divider,
                border:"none", borderRadius:20, fontSize:11, fontWeight:600,
                color: exerciseFilter===f ? "#fff" : C.sub, cursor:"pointer", fontFamily:F, flexShrink:0
              }}>{f}</button>
            ))}
          </div>
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>
            LOGGED EXERCISES · {allEx.size}
          </div>
          {!allEx.size && (
            <div style={{ textAlign:"center", color:C.sub, padding:"24px 0", fontSize:13 }}>Complete a workout to see your exercises here, or browse all below.</div>
          )}
          {Array.from(allEx).sort().filter(name => {
            const matchSearch = !exerciseSearch || name.toLowerCase().includes(exerciseSearch.toLowerCase());
            const matchFilter = exerciseFilter === "All" || (EXERCISE_DB.find(e => e.name === name)?.muscle || "").toLowerCase().includes(exerciseFilter.toLowerCase());
            return matchSearch && matchFilter;
          }).map(name => {
            const pr = store.prs?.[name];
            const exInfo = EXERCISE_DB.find(e => e.name === name);
            return (
              <button key={name} onClick={() => setViewingExercise(name)} style={{
                width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.divider}`,
                padding:"11px 0", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left", fontFamily:F
              }}>
                <div style={{ width:40, height:40, borderRadius:10, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <MuscleIcon muscle={exInfo?.muscle || ""} size={28} C={C}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{name}</div>
                  {pr && <div style={{ fontSize:11, color:C.gold, marginTop:1 }}>🏆 PR · {cvt(pr, "lbs", unit)} {unit}</div>}
                </div>
                <span style={{ fontSize:16, color:C.sub }}>›</span>
              </button>
            );
          })}

          {/* Browse all exercises */}
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginTop:20, marginBottom:10 }}>
            BROWSE ALL · {EXERCISE_DB.length}
          </div>
          {["Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Calves","Core","Full Body","Traps","Forearms"].map(group => {
            const exercises = EXERCISE_DB.filter(e => {
              const matchSearch = !exerciseSearch || e.name.toLowerCase().includes(exerciseSearch.toLowerCase());
              const matchFilter = exerciseFilter === "All" || (e.muscle||"").toLowerCase().includes(exerciseFilter.toLowerCase());
              const matchGroup = (e.muscle||"").toLowerCase().includes(group.toLowerCase());
              return matchSearch && matchFilter && matchGroup;
            });
            if (!exercises.length) return null;
            return (
              <div key={group} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:0.5, marginBottom:6 }}>{group.toUpperCase()}</div>
                {exercises.map(ex => (
                  <button key={ex.name} onClick={() => setViewingExercise(ex.name)} style={{
                    width:"100%", background:"none", border:"none", borderBottom:`1px solid ${C.divider}`,
                    padding:"9px 0", display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left", fontFamily:F
                  }}>
                    <MuscleIcon muscle={ex.muscle} size={24} C={C}/>
                    <div style={{ flex:1, fontSize:13, color:C.text }}>{ex.name}</div>
                    {store.prs?.[ex.name] && <span style={{ fontSize:11, color:C.gold }}>🏆</span>}
                    <span style={{ fontSize:14, color:C.sub }}>›</span>
                  </button>
                ))}
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
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"85dvh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
              <button onClick={() => setShowTemplates(false)} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
              <div style={{ fontSize:15, fontWeight:600, color:C.text }}>Starter Templates</div>
              <div style={{ width:50 }}/>
            </div>

            {/* AI Coach button */}
            <div style={{ padding:"12px 14px 0" }}>
              <button onClick={() => { setShowTemplates(false); setShowAICoach(true); }} style={{
                width:"100%", background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                border:"none", borderRadius:12, padding:"14px", cursor:"pointer", fontFamily:F,
                display:"flex", alignItems:"center", gap:12, marginBottom:2
              }}>
                <span style={{ fontSize:24 }}>🤖</span>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>AI Coach — Build My Program</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>Answer 5 questions, get a custom plan</div>
                </div>
                <span style={{ marginLeft:"auto", color:"rgba(255,255,255,0.7)", fontSize:18 }}>›</span>
              </button>
              <div style={{ fontSize:10, color:C.sub, textAlign:"center", marginBottom:10, marginTop:6 }}>— or pick from templates below —</div>
            </div>

            <div style={{ overflowY:"auto", flex:1, padding:"0 14px 14px" }}>
              {[
                { id:"mypp6", name:"No Mercy PPL · 6 Day", icon:"⭐", desc:"Built for you · detailed notes · daily laterals", featured:true, days:[
                  { name:"Push A · Heavy Chest", exercises:[
                    { name:"Barbell Bench Press", reps:"5–7", note:"Last set: rest-pause" },
                    { name:"Incline DB Press", reps:"8–10", note:"2 sec negative" },
                    { name:"Cable Fly (Low-to-High)", reps:"10–12", note:"Drop set final set" },
                    { name:"Weighted Dips", reps:"8–12", note:"Lean forward for chest" },
                    { name:"DB Shoulder Press", reps:"10–12", note:"Superset with laterals" },
                    { name:"Lateral Raises", reps:"15–20", note:"No rest after press" },
                    { name:"Tricep Rope Pushdown", reps:"12–15", note:"Drop set final set" },
                    { name:"Overhead Tricep Extension", reps:"12–15", note:"Slow eccentric" },
                    { name:"Lateral Raises (finisher)", reps:"15–25", note:"Light pump finisher" },
                  ]},
                  { name:"Pull A · Back Width", exercises:[
                    { name:"Weighted Pull-Ups", reps:"6–10", note:"Full dead hang each rep" },
                    { name:"Lat Pulldown (wide)", reps:"10–12", note:"Extended set if needed" },
                    { name:"Pendlay Row", reps:"5–7", note:"Bar dead stops on floor" },
                    { name:"Seated Cable Row (narrow)", reps:"10–12", note:"Full stretch + contraction" },
                    { name:"Straight-Arm Pulldown", reps:"12–15", note:"Isolates lat, no bicep" },
                    { name:"Face Pulls (rope)", reps:"15–20", note:"External rotate at peak" },
                    { name:"Incline DB Curl", reps:"10–12", note:"Best for bicep peak" },
                    { name:"Hammer Curl → Cable Curl", reps:"10+10", note:"Back to back, no rest" },
                    { name:"Lateral Raises (finisher)", reps:"15–25", note:"Light pump finisher" },
                  ]},
                  { name:"Legs A · Quad Focus", exercises:[
                    { name:"Barbell Back Squat", reps:"5–8", note:"2 feeder sets first" },
                    { name:"Leg Press (quad bias)", reps:"10–12", note:"Feet low/narrow" },
                    { name:"Hack Squat / Bulgarian", reps:"10–12", note:"Alternate week to week" },
                    { name:"Leg Extension", reps:"12–15", note:"Drop set + 2 sec pause" },
                    { name:"Romanian Deadlift", reps:"10–12", note:"Slow eccentric" },
                    { name:"Lying Leg Curl", reps:"12–15", note:"Supinate feet" },
                    { name:"Standing Calf Raise", reps:"15–20", note:"Full stretch, no bounce" },
                    { name:"Seated Calf Raise", reps:"15–20", note:"Hits soleus" },
                    { name:"Lateral Raises (finisher)", reps:"15–20", note:"Even after legs" },
                  ]},
                  { name:"Push B · Shoulders/Arms", exercises:[
                    { name:"Standing Barbell OHP", reps:"5–7", note:"Brace hard, arc press" },
                    { name:"DB Arnold Press", reps:"10–12", note:"Full rotation" },
                    { name:"DB Lateral Raises (heavy)", reps:"10–15", note:"Volume work" },
                    { name:"Cable Lateral Raise (single)", reps:"15–20", note:"Lean away from cable" },
                    { name:"Incline DB Press", reps:"10–12", note:"Upper chest secondary" },
                    { name:"Cable Chest Fly", reps:"12–15", note:"Stretch and squeeze" },
                    { name:"Skull Crushers → CGBP", reps:"10+8", note:"Extend to failure then switch" },
                    { name:"Tricep Dips (burnout)", reps:"Failure", note:"Absolute failure" },
                    { name:"Lateral Raises (finisher)", reps:"20–25", note:"Lighter — high vol day" },
                  ]},
                  { name:"Pull B · Back Thickness", exercises:[
                    { name:"Barbell Bent-Over Row", reps:"5–7", note:"Bar to lower chest, explosive" },
                    { name:"T-Bar / Chest-Supported Row", reps:"8–10", note:"Use straps" },
                    { name:"Single-Arm DB Row", reps:"10–12", note:"Elbow past torso" },
                    { name:"Lat Pulldown (underhand)", reps:"10–12", note:"Different angle from Pull A" },
                    { name:"Rear Delt Fly (bent-over)", reps:"15–20", note:"Drop set last set" },
                    { name:"Cable Face Pull", reps:"15–20", note:"High anchor, external rotate" },
                    { name:"EZ Bar Curl → Reverse Curl", reps:"10+10", note:"Both bicep heads" },
                    { name:"Cable Curl (single-arm)", reps:"12–15", note:"Constant tension" },
                    { name:"Lateral Raises (finisher)", reps:"15–25", note:"Light finisher" },
                  ]},
                  { name:"Legs B · Posterior Chain", exercises:[
                    { name:"Conventional Deadlift", reps:"4–6", note:"Full deadlift from floor" },
                    { name:"Romanian Deadlift (heavy)", reps:"8–10", note:"Heavier than Legs A" },
                    { name:"Bulgarian Split Squat", reps:"10–12", note:"Non-negotiable" },
                    { name:"Leg Press (high/wide)", reps:"12–15", note:"Glute + ham bias" },
                    { name:"Seated Leg Curl", reps:"12–15", note:"Different from lying" },
                    { name:"Hip Thrust (barbell)", reps:"10–12", note:"Chin to chest, full squeeze" },
                    { name:"Standing Calf Raise", reps:"15–20", note:"Full ROM, slow" },
                    { name:"Lateral Raises (finisher)", reps:"15–20", note:"Even after deadlifts" },
                  ]},
                ]},
                { id:"ppl", name:"Push Pull Legs", icon:"🔥", desc:"3-day hypertrophy", days:[
                  { name:"Push", exercises:["Barbell Bench Press","Incline DB Press","Lateral Raises","Tricep Pushdown"] },
                  { name:"Pull", exercises:["Pull-Ups","Barbell Row","Face Pulls","Barbell Curl"] },
                  { name:"Legs", exercises:["Barbell Back Squat","Romanian Deadlift","Leg Press","Standing Calf Raise"] },
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
                  background: t.featured ? `linear-gradient(135deg, ${C.accentSoft}, transparent)` : "none",
                  border:`1px solid ${t.featured ? C.accent : C.border}`,
                  borderRadius:12, padding:"14px", marginBottom:10
                }}>
                  {t.featured && (
                    <div style={{ fontSize:9, fontWeight:700, color:C.accent, letterSpacing:1.5, marginBottom:6 }}>FEATURED · YOUR PROGRAM</div>
                  )}
                  <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:2 }}>{t.icon} {t.name}</div>
                  <div style={{ fontSize:12, color:C.sub, marginBottom:12 }}>{t.desc} · {t.days.length} days</div>
                  <button onClick={() => {
                    const prog = {
                      id: uid(),
                      name: t.name,
                      days: t.days.map(d => ({
                        ...d, id: uid(),
                        exercises: d.exercises.map(ex =>
                          typeof ex === "string"
                            ? { name: ex, reps: "8–12", note: "" }
                            : { name: ex.name, reps: ex.reps || "8–12", note: ex.note || "" }
                        )
                      }))
                    };
                    if (onSaveProgram) onSaveProgram(prog);
                    else setStore(p => ({ ...p, programs: [...(p.programs || []), prog], activeProgramId: prog.id }));
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

      {/* Exercise Detail */}
      {viewingExercise && (
        <ExerciseDetail
          name={viewingExercise}
          store={store}
          unit={unit}
          C={C}
          onClose={() => setViewingExercise(null)}
        />
      )}

      {/* Day Preview modal — shows exercises before starting */}
      {previewDay && (
        <DayPreviewModal
          previewDay={previewDay}
          store={store}
          unit={unit}
          C={C}
          onClose={() => setPreviewDay(null)}
          onStart={day => { setPreviewDay(null); startWorkout(day); }}
          onSaveProgram={onSaveProgram}
        />
      )}

      {/* AI Coach modal */}
      {showAICoach && (
        <AICoachModal
          C={C}
          onClose={() => setShowAICoach(false)}
          onImport={(prog) => {
            if (onSaveProgram) onSaveProgram(prog);
            else setStore(p => ({ ...p, programs: [...(p.programs||[]), prog], activeProgramId: prog.id }));
            setShowAICoach(false);
          }}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AI COACH MODAL
// ═════════════════════════════════════════════════════════════════════════════
function DayPreviewModal({ previewDay, store, unit, C, onClose, onStart, onSaveProgram }) {
  const [editMode, setEditMode] = useState(false);
  const [editDay, setEditDay] = useState(() => JSON.parse(JSON.stringify(previewDay.day)));
  const [viewingExercise, setViewingExercise] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);

  function saveAndStart() {
    if (editMode && onSaveProgram) {
      const prog = store.programs.find(p => p.days?.some(d => d.name === editDay.name));
      if (prog) onSaveProgram({ ...prog, days: prog.days.map(d => d.name === editDay.name ? editDay : d) });
    }
    onStart(editMode ? editDay : previewDay.day);
  }

  // Last performed
  const lastPerformed = (() => {
    const dates = Object.keys(store.history||{}).sort().reverse();
    for (const dk of dates) {
      if (Object.values(store.history[dk]||{}).some(s => s.dayName === editDay.name)) {
        const d = Math.floor((Date.now() - new Date(dk).getTime()) / 86400000);
        return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
      }
    }
    return null;
  })();

  if (viewingExercise) {
    return (
      <ExerciseDetail name={viewingExercise} store={store} unit={unit} C={C} onClose={() => setViewingExercise(null)}/>
    );
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:C.bg, borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480,
        maxHeight:"92dvh", display:"flex", flexDirection:"column",
        paddingBottom:"env(safe-area-inset-bottom)", boxShadow:"0 -8px 40px rgba(0,0,0,0.2)"
      }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 16px 10px", flexShrink:0 }}>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:"50%", background:C.divider, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:C.text }}>×</button>
          <div style={{ flex:1, textAlign:"center" }}>
            {editMode
              ? <input value={editDay.name} onChange={e => setEditDay(d => ({...d, name:e.target.value}))}
                  style={{ fontSize:16, fontWeight:700, color:C.text, background:"none", border:"none", outline:"none", textAlign:"center", fontFamily:F, width:"100%" }}/>
              : <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{editDay.name}</div>
            }
            {lastPerformed && !editMode && <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>Last Performed: {lastPerformed}</div>}
          </div>
          <button onClick={() => {
            if (editMode && onSaveProgram) {
              const prog = store.programs.find(p => p.days?.some(d => d.name === previewDay.day.name));
              if (prog) onSaveProgram({ ...prog, days: prog.days.map(d => d.name === previewDay.day.name ? editDay : d) });
            }
            setEditMode(m => !m);
          }} style={{ fontSize:14, fontWeight:600, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>
            {editMode ? "Save" : "Edit"}
          </button>
        </div>

        <div style={{ overflowY:"auto", flex:1, paddingBottom:8 }}>
          {!editMode ? (
            <div style={{ padding:"0 14px" }}>
              {editDay.exercises.map((ex, i) => {
                const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
                const pr = store.prs?.[ex.name];
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom: i < editDay.exercises.length-1 ? `1px solid ${C.divider}` : "none" }}>
                    <div style={{ width:52, height:52, borderRadius:12, background:C.divider, overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <MuscleIcon muscle={exInfo?.muscle||""} size={36} C={C}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text }}>
                        {ex.reps ? `${ex.reps.split("–")[0]||ex.reps.split("-")[0]||"3"} × ` : ""}{ex.name}
                      </div>
                      <div style={{ fontSize:12, color:C.sub }}>{exInfo?.muscle||""}{pr && <span style={{ color:C.gold, marginLeft:6 }}>· PR {cvt(pr,"lbs",unit)}{unit}</span>}</div>
                      {ex.note && <div style={{ fontSize:11, color:C.accent, marginTop:2 }}>💡 {ex.note}</div>}
                    </div>
                    <button onClick={() => setViewingExercise(ex.name)} style={{
                      width:32, height:32, borderRadius:8, background:C.accentSoft,
                      border:"none", cursor:"pointer", fontSize:15, color:C.accent, fontWeight:700, flexShrink:0
                    }}>?</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding:"0 14px" }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:12, marginTop:4 }}>Drag ⠿ to reorder · tap × to remove</div>
              {editDay.exercises.map((ex, i) => (
                <div key={i}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx === null || dragIdx === i) return;
                    const arr = [...editDay.exercises];
                    const [moved] = arr.splice(dragIdx, 1);
                    arr.splice(i, 0, moved);
                    setEditDay(d => ({...d, exercises: arr}));
                    setDragIdx(null);
                  }}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0", borderBottom:`1px solid ${C.divider}`, cursor:"grab" }}>
                  <span style={{ color:C.muted, fontSize:16, flexShrink:0 }}>⠿</span>
                  <div style={{ flex:1 }}>
                    <input value={ex.name}
                      onChange={e => setEditDay(d => ({...d, exercises:d.exercises.map((x,j)=>j!==i?x:{...x,name:e.target.value})}))}
                      style={{ width:"100%", background:C.divider, border:"none", borderRadius:6, padding:"7px 10px", fontSize:13, color:C.text, outline:"none", fontFamily:F, boxSizing:"border-box", marginBottom:4 }}
                    />
                    <div style={{ display:"flex", gap:6 }}>
                      <input value={ex.reps||""} placeholder="Reps/Sets"
                        onChange={e => setEditDay(d => ({...d, exercises:d.exercises.map((x,j)=>j!==i?x:{...x,reps:e.target.value})}))}
                        style={{ width:90, background:C.divider, border:"none", borderRadius:6, padding:"5px 8px", fontSize:12, color:C.text, outline:"none", fontFamily:F }}
                      />
                      <input value={ex.note||""} placeholder="Note..."
                        onChange={e => setEditDay(d => ({...d, exercises:d.exercises.map((x,j)=>j!==i?x:{...x,note:e.target.value})}))}
                        style={{ flex:1, background:"none", border:"none", borderBottom:`1px solid ${C.divider}`, padding:"5px 0", fontSize:12, color:C.sub, outline:"none", fontFamily:F }}
                      />
                    </div>
                  </div>
                  <button onClick={() => setEditDay(d => ({...d, exercises:d.exercises.filter((_,j)=>j!==i)}))}
                    style={{ background:"none", border:"none", fontSize:20, color:"#ef4444", cursor:"pointer", flexShrink:0 }}>×</button>
                </div>
              ))}
              <button onClick={() => setEditDay(d => ({...d, exercises:[...d.exercises,{name:"",reps:"8-12",note:""}]}))}
                style={{ width:"100%", marginTop:12, padding:"11px", background:"none", border:`1px dashed ${C.border}`, borderRadius:8, color:C.accent, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F }}>
                + Add Exercise
              </button>
            </div>
          )}
        </div>

        <div style={{ padding:"12px 14px 16px", flexShrink:0 }}>
          <button onClick={saveAndStart} style={{
            width:"100%", background:C.accent, color:"#fff", border:"none",
            borderRadius:14, padding:"16px", fontSize:15, fontWeight:700,
            cursor:"pointer", fontFamily:F, boxShadow:`0 4px 16px ${C.accent}55`
          }}>Start Workout</button>
        </div>
      </div>
    </div>
  );
}

function AICoachModal({ C, onClose, onImport }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  const questions = [
    {
      key:"goal", label:"What's your main goal?",
      options:[
        { id:"muscle", label:"💪 Build Muscle", desc:"Hypertrophy focus, moderate reps" },
        { id:"strength", label:"🏋️ Get Stronger", desc:"Heavy compounds, low reps" },
        { id:"fat_loss", label:"🔥 Lose Fat", desc:"Higher volume, circuits" },
        { id:"general", label:"⚡ General Fitness", desc:"Balanced, all-around" },
      ]
    },
    {
      key:"days", label:"How many days can you train per week?",
      options:[
        { id:"3", label:"3 Days", desc:"Full body or push/pull split" },
        { id:"4", label:"4 Days", desc:"Upper/lower or PPL+" },
        { id:"5", label:"5 Days", desc:"Classic bro split or PPL" },
        { id:"6", label:"6 Days", desc:"Full PPL double" },
      ]
    },
    {
      key:"level", label:"What's your experience level?",
      options:[
        { id:"beginner", label:"🌱 Beginner", desc:"Under 1 year lifting" },
        { id:"intermediate", label:"📈 Intermediate", desc:"1–3 years" },
        { id:"advanced", label:"🔥 Advanced", desc:"3+ years, know your lifts" },
      ]
    },
    {
      key:"equipment", label:"What equipment do you have?",
      options:[
        { id:"full", label:"🏋️ Full Gym", desc:"Barbells, cables, machines" },
        { id:"home", label:"🏠 Home Gym", desc:"Barbell + bench + rack" },
        { id:"dumbbells", label:"💪 Dumbbells Only", desc:"Adjustable or fixed set" },
      ]
    },
    {
      key:"focus", label:"Any specific focus area?",
      options:[
        { id:"none", label:"No Preference", desc:"Balanced program" },
        { id:"upper", label:"💪 Upper Body", desc:"More chest, back, arms" },
        { id:"legs", label:"🦵 Legs", desc:"Quad/glute/hamstring focus" },
        { id:"posterior", label:"🍑 Posterior Chain", desc:"Glutes, hamstrings, back" },
      ]
    },
  ];

  // Program library — matched by goal/days/level
  function buildProgram() {
    const { goal, days, level, equipment, focus } = answers;

    // Define programs for key combinations
    const PROGRAMS = {
      "muscle-6-advanced-full": {
        name:"No Mercy PPL · Advanced", icon:"🔥",
        days:[
          { name:"Push A · Chest Heavy", exercises:[
            { name:"Barbell Bench Press", reps:"4×5–7", note:"Rest-pause last set" },
            { name:"Incline DB Press", reps:"3×8–10", note:"2 sec negative" },
            { name:"Cable Fly (Low-to-High)", reps:"3×12", note:"Drop set" },
            { name:"DB Shoulder Press", reps:"3×10" },
            { name:"Lateral Raises", reps:"4×15–20" },
            { name:"Tricep Rope Pushdown", reps:"3×12–15" },
          ]},
          { name:"Pull A · Back Width", exercises:[
            { name:"Weighted Pull-Ups", reps:"4×6–8", note:"Dead hang" },
            { name:"Lat Pulldown (wide)", reps:"3×10–12" },
            { name:"Seated Cable Row", reps:"3×10" },
            { name:"Face Pulls", reps:"3×15" },
            { name:"Barbell Curl", reps:"3×10" },
            { name:"Hammer Curl", reps:"3×12" },
          ]},
          { name:"Legs A · Quad", exercises:[
            { name:"Barbell Back Squat", reps:"4×5–8" },
            { name:"Leg Press", reps:"3×10–12" },
            { name:"Leg Extension", reps:"3×12–15", note:"Drop set" },
            { name:"Romanian Deadlift", reps:"3×10" },
            { name:"Lying Leg Curl", reps:"3×12" },
            { name:"Standing Calf Raise", reps:"4×15" },
          ]},
          { name:"Push B · Shoulders", exercises:[
            { name:"Overhead Press", reps:"4×5–7" },
            { name:"DB Arnold Press", reps:"3×10" },
            { name:"Lateral Raises", reps:"4×12–15" },
            { name:"Incline DB Press", reps:"3×10" },
            { name:"Skull Crushers", reps:"3×10" },
            { name:"Tricep Rope Pushdown", reps:"3×15" },
          ]},
          { name:"Pull B · Thickness", exercises:[
            { name:"Barbell Row", reps:"4×5–7" },
            { name:"T-Bar Row", reps:"3×8" },
            { name:"Single-Arm DB Row", reps:"3×10" },
            { name:"Rear Delt Fly", reps:"3×15" },
            { name:"EZ Bar Curl", reps:"3×10" },
            { name:"Cable Curl", reps:"3×12" },
          ]},
          { name:"Legs B · Posterior", exercises:[
            { name:"Deadlift", reps:"4×4–6" },
            { name:"Romanian Deadlift", reps:"3×8" },
            { name:"Bulgarian Split Squat", reps:"3×10" },
            { name:"Hip Thrust", reps:"3×10" },
            { name:"Seated Leg Curl", reps:"3×12" },
            { name:"Seated Calf Raise", reps:"3×15" },
          ]},
        ]
      },
      "muscle-4-intermediate-full": {
        name:"Upper/Lower Hypertrophy · 4 Day", icon:"💪",
        days:[
          { name:"Upper A · Push Focus", exercises:[
            { name:"Barbell Bench Press", reps:"4×8–10" },
            { name:"Overhead Press", reps:"3×10" },
            { name:"Incline DB Press", reps:"3×10–12" },
            { name:"Lateral Raises", reps:"3×15" },
            { name:"Tricep Rope Pushdown", reps:"3×12" },
          ]},
          { name:"Lower A · Quad Focus", exercises:[
            { name:"Barbell Back Squat", reps:"4×8" },
            { name:"Leg Press", reps:"3×12" },
            { name:"Leg Extension", reps:"3×15" },
            { name:"Romanian Deadlift", reps:"3×10" },
            { name:"Standing Calf Raise", reps:"4×15" },
          ]},
          { name:"Upper B · Pull Focus", exercises:[
            { name:"Barbell Row", reps:"4×8" },
            { name:"Pull-Ups", reps:"3×8–10" },
            { name:"Seated Cable Row", reps:"3×12" },
            { name:"Face Pulls", reps:"3×15" },
            { name:"Barbell Curl", reps:"3×10" },
            { name:"Hammer Curl", reps:"3×12" },
          ]},
          { name:"Lower B · Posterior", exercises:[
            { name:"Deadlift", reps:"4×5" },
            { name:"Bulgarian Split Squat", reps:"3×10" },
            { name:"Hip Thrust", reps:"3×12" },
            { name:"Lying Leg Curl", reps:"3×12" },
            { name:"Seated Calf Raise", reps:"3×15" },
          ]},
        ]
      },
      "strength-3-intermediate-full": {
        name:"3-Day Powerbuilding", icon:"🏋️",
        days:[
          { name:"Day A · Squat + Push", exercises:[
            { name:"Barbell Back Squat", reps:"5×5", note:"Work up to heavy 5" },
            { name:"Barbell Bench Press", reps:"4×5" },
            { name:"Overhead Press", reps:"3×8" },
            { name:"Lateral Raises", reps:"3×15" },
            { name:"Tricep Rope Pushdown", reps:"3×12" },
          ]},
          { name:"Day B · Deadlift + Pull", exercises:[
            { name:"Deadlift", reps:"3×3", note:"Heavy triples" },
            { name:"Barbell Row", reps:"4×5" },
            { name:"Pull-Ups", reps:"3×8" },
            { name:"Barbell Curl", reps:"3×10" },
          ]},
          { name:"Day C · Volume", exercises:[
            { name:"Barbell Back Squat", reps:"3×8", note:"Lighter, more volume" },
            { name:"Barbell Bench Press", reps:"3×8" },
            { name:"Barbell Row", reps:"3×8" },
            { name:"Overhead Press", reps:"3×8" },
            { name:"Romanian Deadlift", reps:"3×10" },
          ]},
        ]
      },
      "general-3-beginner-full": {
        name:"Beginner Full Body · 3 Day", icon:"🌱",
        days:[
          { name:"Full Body A", exercises:[
            { name:"Barbell Back Squat", reps:"3×8" },
            { name:"Barbell Bench Press", reps:"3×8" },
            { name:"Barbell Row", reps:"3×8" },
            { name:"Overhead Press", reps:"3×10" },
            { name:"Standing Calf Raise", reps:"3×15" },
          ]},
          { name:"Full Body B", exercises:[
            { name:"Deadlift", reps:"3×5" },
            { name:"Incline DB Press", reps:"3×10" },
            { name:"Pull-Ups", reps:"3×6–8" },
            { name:"Lateral Raises", reps:"3×12" },
            { name:"Barbell Curl", reps:"3×10" },
          ]},
          { name:"Full Body C", exercises:[
            { name:"Leg Press", reps:"3×10" },
            { name:"Barbell Bench Press", reps:"3×10" },
            { name:"Seated Cable Row", reps:"3×10" },
            { name:"Overhead Press", reps:"3×10" },
            { name:"Romanian Deadlift", reps:"3×10" },
          ]},
        ]
      },
      "fat_loss-4-intermediate-full": {
        name:"Fat Loss · 4 Day Circuit", icon:"🔥",
        days:[
          { name:"Upper Circuit A", exercises:[
            { name:"Barbell Bench Press", reps:"4×12" },
            { name:"Barbell Row", reps:"4×12" },
            { name:"Overhead Press", reps:"3×12" },
            { name:"Pull-Ups", reps:"3×10" },
            { name:"Lateral Raises", reps:"3×15" },
            { name:"Tricep Rope Pushdown", reps:"3×15" },
            { name:"Barbell Curl", reps:"3×15" },
          ]},
          { name:"Lower Circuit A", exercises:[
            { name:"Barbell Back Squat", reps:"4×12" },
            { name:"Romanian Deadlift", reps:"3×12" },
            { name:"Leg Press", reps:"3×15" },
            { name:"Lying Leg Curl", reps:"3×15" },
            { name:"Standing Calf Raise", reps:"4×20" },
          ]},
          { name:"Upper Circuit B", exercises:[
            { name:"Incline DB Press", reps:"4×12" },
            { name:"Single-Arm DB Row", reps:"4×12" },
            { name:"Lateral Raises", reps:"4×15" },
            { name:"Face Pulls", reps:"3×15" },
            { name:"Hammer Curl", reps:"3×15" },
            { name:"Skull Crushers", reps:"3×12" },
          ]},
          { name:"Lower Circuit B", exercises:[
            { name:"Deadlift", reps:"4×8" },
            { name:"Bulgarian Split Squat", reps:"3×12" },
            { name:"Hip Thrust", reps:"3×15" },
            { name:"Leg Extension", reps:"3×15" },
            { name:"Seated Calf Raise", reps:"4×20" },
          ]},
        ]
      },
    };

    // Build lookup key, fallback gracefully
    const key = `${goal}-${days}-${level}-${equipment}`;
    let selected = PROGRAMS[key];

    // Fallback chain
    if (!selected) {
      // Try without level
      const keyNoLevel = `${goal}-${days}-intermediate-${equipment}`;
      selected = PROGRAMS[keyNoLevel];
    }
    if (!selected) {
      // Fallback to general
      selected = PROGRAMS["general-3-beginner-full"];
    }

    // Convert to program format
    return {
      id: uid(),
      name: selected.name,
      days: selected.days.map(d => ({
        ...d, id: uid(),
        exercises: d.exercises.map(ex =>
          typeof ex === "string"
            ? { name:ex, reps:"8–12", note:"" }
            : { name:ex.name, reps:ex.reps||"8–12", note:ex.note||"" }
        )
      }))
    };
  }

  const q = questions[step];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:250, display:"flex", alignItems:"flex-end" }}>
      <div style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"85dvh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
          <button onClick={() => step > 0 ? setStep(s => s - 1) : onClose()} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>
            {step > 0 ? "‹ Back" : "Cancel"}
          </button>
          <div style={{ fontSize:12, color:C.sub }}>Step {step + 1} of {questions.length}</div>
          <div style={{ width:60 }}/>
        </div>

        {result ? (
          // Show result
          <div style={{ overflowY:"auto", flex:1, padding:20 }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🤖</div>
              <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Your Program is Ready</div>
              <div style={{ fontSize:13, color:C.sub, marginTop:4 }}>{result.name}</div>
            </div>
            {result.days.map((d, i) => (
              <div key={i} style={{ padding:"10px 14px", background:C.divider, borderRadius:10, marginBottom:8 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{d.name}</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{d.exercises.length} exercises</div>
              </div>
            ))}
            <button onClick={() => onImport(result)} style={{
              width:"100%", background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
              color:"#fff", border:"none", borderRadius:12, padding:"14px",
              fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F, marginTop:12
            }}>Import & Set Active</button>
          </div>
        ) : (
          // Show question
          <div style={{ overflowY:"auto", flex:1, padding:20 }}>
            {/* Progress bar */}
            <div style={{ background:C.divider, borderRadius:4, height:4, marginBottom:20, overflow:"hidden" }}>
              <div style={{ width:`${((step) / questions.length) * 100}%`, height:"100%", background:C.accent, transition:"width 0.3s" }}/>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:16 }}>{q.label}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {q.options.map(opt => (
                <button key={opt.id} onClick={() => {
                  const newAnswers = { ...answers, [q.key]: opt.id };
                  setAnswers(newAnswers);
                  if (step < questions.length - 1) {
                    setStep(s => s + 1);
                  } else {
                    // All answers collected — build program
                    setResult(buildProgram());
                  }
                }} style={{
                  background:answers[q.key] === opt.id ? C.accentSoft : C.divider,
                  border:`1.5px solid ${answers[q.key] === opt.id ? C.accent : "transparent"}`,
                  borderRadius:12, padding:"14px 16px", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:12, textAlign:"left", fontFamily:F
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{opt.label}</div>
                    <div style={{ fontSize:12, color:C.sub, marginTop:2 }}>{opt.desc}</div>
                  </div>
                  {answers[q.key] === opt.id && <span style={{ color:C.accent, fontSize:18 }}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ═════════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════
// EXERCISE DETAIL — graph + stats + animated SVG how-to
// ═════════════════════════════════════════════════════════════════════════════

// Technique cues per exercise category
const EXERCISE_CUES = {
  "Barbell Bench Press": {
    cues:["Retract and depress shoulder blades","Slight arch in lower back, both feet flat","Bar path: lower to nipple line, slight diagonal press","Grip just outside shoulder width","Touch chest lightly, drive explosively"],
    mistakes:["Flaring elbows too wide","Bouncing bar off chest","Losing leg drive","Not keeping wrists stacked over elbows"],
    breathe:"Inhale on the way down, exhale and brace hard on the press",
  },
  "Barbell Back Squat": {
    cues:["Bar on low or high trap shelf","Hip-width stance, toes 15–30° out","Knees track over toes throughout","Break at hips and knees simultaneously","Drive up through mid-foot, not toes"],
    mistakes:["Knees caving inward","Heels rising","Forward lean with bar drifting","Half-reps — hit parallel or below"],
    breathe:"Valsalva — big breath at top, hold through the hole, exhale at lockout",
  },
  "Deadlift": {
    cues:["Bar over mid-foot (1 inch from shins)","Hip-width stance, double overhand or mixed grip","Hinge: push floor away, don't pull bar up","Keep lats tight — 'protect your armpits'","Lock out hips at top — don't hyperextend"],
    mistakes:["Bar drifting away from body","Jerking the bar off floor","Rounding lower back under load","Squatting the deadlift"],
    breathe:"Big breath and brace before the pull, hold until past the knee",
  },
  "Overhead Press (Barbell)": {
    cues:["Grip just outside shoulders, full grip","Bar rests on front delts before press","Press the bar — move your head back then through","Stack wrists over elbows","Squeeze glutes and abs — no lumbar hyperextension"],
    mistakes:["Pressing in front of body instead of over it","Flaring elbows too wide","Losing core tension","Wrist bend"],
    breathe:"Inhale and brace at the bottom, exhale at lockout",
  },
  "Romanian Deadlift": {
    cues:["Hip-width stance, slight knee bend throughout","Push hips back — not down","Bar stays close to legs the entire time","Feel the hamstring stretch at bottom","Drive hips forward to stand, squeeze glutes at top"],
    mistakes:["Bending knees too much (becomes squat)","Rounding lower back","Going too deep past stretch point","Rushing the eccentric"],
    breathe:"Inhale at top, slow exhale on the way down, exhale fully on the way up",
  },
  "Pull-Ups": {
    cues:["Dead hang start — full arm extension","Depress scapula before pulling","Lead with chest toward bar, not chin","Pull elbows toward hips","Control the descent — don't drop"],
    mistakes:["Kipping momentum","Partial range of motion","Shrugging instead of depressing scapula","Forward head position"],
    breathe:"Exhale as you pull up, inhale on the way down",
  },
  "Hip Thrust (Barbell)": {
    cues:["Upper back on bench at shoulder blade level","Feet flat, hip-width, shins vertical at top","Bar padded over hip crease","Drive through heels, not toes","Full hip extension at top — squeeze hard, chin tucked"],
    mistakes:["Hyperextending lower back at top","Feet too far or too close","Not achieving full extension","Head tilting back"],
    breathe:"Exhale and brace on the drive up, inhale on the way down",
  },
  "Lateral Raises (DB)": {
    cues:["Slight forward torso lean (15°)","Lead with elbows, not hands","Pinkies slightly higher than thumbs at top","Control the descent — 3 sec negative","Stop at shoulder height — no higher"],
    mistakes:["Using momentum / swinging body","Going above shoulder height","Straight arm with no elbow lead","Too heavy — ruins form"],
    breathe:"Exhale on the raise, inhale on the lower",
  },
  "Barbell Row": {
    cues:["Hinge to ~45°, back neutral","Bar starts over mid-foot","Pull to lower chest / upper abs","Drive elbows back and up","Lower with control, maintain hinge"],
    mistakes:["Torso swinging upright","Pulling to belly instead of chest","Rounding lower back","Jerky reps"],
    breathe:"Exhale as you row, inhale on the way down",
  },
  "Bulgarian Split Squat": {
    cues:["Front foot far enough that shin is vertical at bottom","Rear foot on bench, laces down","Descend straight down — don't lunge forward","Front knee tracks over toes","Keep torso upright or slight lean"],
    mistakes:["Front foot too close (forward knee drift)","Losing balance (core not tight)","Rushing the descent","Uneven hip height"],
    breathe:"Inhale on the way down, exhale on the drive up",
  },
};

// Generic cues by muscle group
const MUSCLE_CUES = {
  chest: { cues:["Full stretch at bottom","Control the eccentric","Squeeze at peak contraction","Keep shoulder blades retracted"], mistakes:["Partial range","Flaring elbows","Losing upper back tightness"] },
  back: { cues:["Initiate with scapula before arms","Pull elbows toward hips","Full stretch at the bottom","Avoid shrugging"], mistakes:["Bicep-dominant pulling","Partial reps","Losing neutral spine"] },
  shoulders: { cues:["Keep core braced","Control both phases","Don't shrug","Full range of motion"], mistakes:["Using momentum","Going too heavy","Ignoring rear delts"] },
  biceps: { cues:["Full extension at bottom","Supinate at top","No swinging","Squeeze at peak"], mistakes:["Elbow flare","Using momentum","Partial reps"] },
  triceps: { cues:["Lock out fully","Keep elbows fixed","Control the stretch","Squeeze at extension"], mistakes:["Moving elbows","Partial lockout","Too much weight"] },
  quads: { cues:["Full depth","Knee tracks over toes","Control descent","Drive through whole foot"], mistakes:["Knees caving","Heels rising","Partial reps"] },
  hamstrings: { cues:["Feel the stretch","Slow eccentric","Hip hinge dominant","Neutral spine"], mistakes:["Rounding back","No stretch","Rushing"] },
  glutes: { cues:["Full hip extension","Squeeze at top","Posterior pelvic tilt","Drive through heels"], mistakes:["No lockout","Lumbar hyperextension","Rushing"] },
  calves: { cues:["Full stretch at bottom","Pause at top","Slow and controlled","Full ROM"], mistakes:["Bouncing","Partial range","Too fast"] },
  core: { cues:["Brace don't suck in","Exhale on effort","Control the movement","Neutral spine"], mistakes:["Holding breath","Hip flexor dominance","Momentum"] },
};

function getCues(name, muscle) {
  if (EXERCISE_CUES[name]) return EXERCISE_CUES[name];
  const m = (muscle||"").toLowerCase();
  for (const key of Object.keys(MUSCLE_CUES)) {
    if (m.includes(key)) return { cues: MUSCLE_CUES[key].cues, mistakes: MUSCLE_CUES[key].mistakes, breathe: null };
  }
  return { cues:["Full range of motion","Control the eccentric","Mind-muscle connection","Progressive overload"], mistakes:["Partial reps","Using momentum","Too much weight"], breathe:null };
}

// ── Animated SVG exercise demos ───────────────────────────────────────────────
// ── Exercise demo fetcher — uses multiple sources with fallback ──────────────

// Strip prefixes to normalize search queries
function toWgerQuery(name) {
  return name.toLowerCase()
    .replace(/\(.*?\)/g,"")
    .replace(/barbell |dumbbell |db |ez bar |cable |machine |weighted |lever |single-arm |chest-supported /g,"")
    .replace(/\s+/g," ").trim();
}

// Direct wger base IDs for common exercises — faster and more reliable than search
const WGER_IDS = {
  "Barbell Bench Press":192,"Incline Barbell Press":314,"Incline DB Press":206,"Flat DB Press":207,
  "Cable Fly (Low-to-High)":253,"Dips":37,"Weighted Dips":37,"Push-Ups":35,
  "Barbell Row":72,"Pendlay Row":72,"T-Bar Row":73,"Single-Arm DB Row":74,
  "Pull-Ups":31,"Weighted Pull-Ups":31,"Chin-Ups":32,
  "Lat Pulldown (Wide)":102,"Lat Pulldown (Underhand)":102,
  "Seated Cable Row (Wide)":110,"Seated Cable Row (Narrow)":110,
  "Face Pulls":126,"Rear Delt Fly (DB)":127,
  "Overhead Press (Barbell)":64,"Seated DB Shoulder Press":65,"Arnold Press":66,
  "Lateral Raises (DB)":68,"Lateral Raises (Cable)":68,"Lateral Raises":68,"Front Raises (DB)":70,
  "Barbell Curl":3,"EZ Bar Curl":4,"Dumbbell Curl":5,"Hammer Curl":8,
  "Incline DB Curl":7,"Preacher Curl (EZ Bar)":6,"Concentration Curl":10,
  "Skull Crushers (EZ Bar)":22,"Skull Crushers (DB)":22,"Tricep Rope Pushdown":26,
  "Tricep Bar Pushdown":26,"Overhead Tricep Extension":25,"Close-Grip Bench Press":193,
  "Barbell Back Squat":111,"Front Squat":112,"Leg Press":116,"Hack Squat":113,
  "Bulgarian Split Squat":119,"Walking Lunges":120,"Leg Extension":115,
  "Deadlift":29,"Sumo Deadlift":30,"Romanian Deadlift":91,"Stiff-Leg Deadlift":92,
  "Lying Leg Curl":117,"Seated Leg Curl":118,"Hip Thrust (Barbell)":228,
  "Standing Calf Raise":125,"Seated Calf Raise":124,
  "Plank":160,"Hanging Leg Raise":163,"Cable Crunch":162,"Ab Wheel Rollout":165,
  "Barbell Shrugs":133,"DB Shrugs":134,
};

function ExerciseAnimation({ name, muscle, C }) {
  const [gifUrl, setGifUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [muscles, setMuscles] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const CACHE_KEY = "seshd_exercise_gifs_v1";

  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;

    async function fetchGif() {
      setLoading(true);
      setFetchError(null);

      // Cache check
      try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
        if (cache[name]) {
          if (!cancelled) { setGifUrl(cache[name].gif); setMuscles(cache[name].muscles); setLoading(false); }
          return;
        }
      } catch {}

      // Hard timeout — show muscle icon after 6s if nothing loads
      timeoutId = setTimeout(() => {
        if (!cancelled) { setLoading(false); }
      }, 6000);

      async function tryFetch(url) {
        const res = await fetch(url, { headers: { "Accept":"application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      // 1. Try direct ID if we have it
      const baseId = WGER_IDS[name];
      if (baseId) {
        try {
          const imgData = await tryFetch(`https://wger.de/api/v2/exerciseimage/?exercise_base=${baseId}&format=json`);
          const img = imgData?.results?.[0]?.image;
          if (img && !cancelled) {
            clearTimeout(timeoutId);
            const m = { target: muscle, secondary: [], bodyPart: muscle };
            setGifUrl(img); setMuscles(m); setLoading(false);
            try {
              const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
              cache[name] = { gif: img, muscles: m };
              if (Object.keys(cache).length > 200) delete cache[Object.keys(cache)[0]];
              localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch {}
            return;
          }
        } catch {}
      }

      // 2. Search fallback
      const queries = [name.toLowerCase(), toWgerQuery(name)].filter((q,i,a) => q && a.indexOf(q)===i);
      for (const q of queries) {
        try {
          const searchData = await tryFetch(`https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(q)}&language=english&format=json`);
          const s = searchData?.suggestions?.[0];
          const bid = s?.data?.base_id || s?.data?.id;
          if (!bid) continue;
          const imgData = await tryFetch(`https://wger.de/api/v2/exerciseimage/?exercise_base=${bid}&format=json`);
          const img = imgData?.results?.[0]?.image;
          if (img && !cancelled) {
            clearTimeout(timeoutId);
            const m = { target: muscle, secondary: [], bodyPart: muscle };
            setGifUrl(img); setMuscles(m); setLoading(false);
            try {
              const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
              cache[name] = { gif: img, muscles: m };
              if (Object.keys(cache).length > 200) delete cache[Object.keys(cache)[0]];
              localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch {}
            return;
          }
        } catch {}
      }

      if (!cancelled) { clearTimeout(timeoutId); setLoading(false); }
    }

    fetchGif();
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
  }, [name]);

  if (loading) return (
    <div style={{ width:"100%", height:240, display:"flex", alignItems:"center", justifyContent:"center", background:C.divider, borderRadius:12 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:36, height:36, borderRadius:"50%", border:`3px solid ${C.divider}`, borderTopColor:C.accent, animation:"spotrSpin 0.8s linear infinite", margin:"0 auto 10px" }}/>
        <div style={{ fontSize:11, color:C.sub }}>Loading demo...</div>
      </div>
    </div>
  );

  return (
    <div style={{ width:"100%", borderRadius:12, overflow:"hidden", background:C.divider }}>
      {gifUrl ? (
        <img src={gifUrl} alt={name} style={{ width:"100%", maxHeight:300, objectFit:"contain", display:"block", background:"#fff" }}/>
      ) : (
        <div style={{ height:200, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, padding:"0 20px" }}>
          <MuscleIcon muscle={muscle} size={52} C={C}/>
          <div style={{ fontSize:11, color:C.sub, textAlign:"center" }}>{name}</div>
          {fetchError && <div style={{ fontSize:10, color:"#ef4444", textAlign:"center", marginTop:4 }}>API error: {fetchError}</div>}
        </div>
      )}
      {muscles && (
        <div style={{ padding:"10px 14px", display:"flex", gap:8, flexWrap:"wrap", background:C.bg }}>
          {muscles.target && (
            <span style={{ background:C.accent, color:"#fff", borderRadius:12, padding:"3px 10px", fontSize:11, fontWeight:600, textTransform:"capitalize" }}>
              🎯 {muscles.target}
            </span>
          )}
          {(muscles.secondary || []).slice(0,3).map(m => (
            <span key={m} style={{ background:C.divider, color:C.sub, borderRadius:12, padding:"3px 10px", fontSize:11, textTransform:"capitalize" }}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseVolumeChart({ data, unit, C }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign:"center", padding:"30px 0", color:C.sub, fontSize:13 }}>
      No history yet — log this exercise to see your progress
    </div>
  );

  const W = 320, H = 100, PAD = { l:40, r:12, t:10, b:24 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const maxV = Math.max(...data.map(d => d.value));
  const minV = Math.min(...data.map(d => d.value));
  const range = maxV - minV || 1;

  const px = (i) => PAD.l + (i / (data.length - 1 || 1)) * iW;
  const py = (v) => PAD.t + iH - ((v - minV) / range) * iH;

  const pathD = data.map((d, i) => `${i===0?"M":"L"}${px(i)},${py(d.value)}`).join(" ");
  const areaD = `${pathD} L${px(data.length-1)},${PAD.t+iH} L${PAD.l},${PAD.t+iH} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
      {/* Grid lines */}
      {[0,0.5,1].map(f => (
        <line key={f} x1={PAD.l} y1={PAD.t + iH*(1-f)} x2={W-PAD.r} y2={PAD.t + iH*(1-f)}
          stroke={C.divider} strokeWidth="1" opacity="0.8"/>
      ))}
      {/* Area fill */}
      <path d={areaD} fill={C.accent} opacity="0.08"/>
      {/* Line */}
      <path d={pathD} fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.value)} r="3.5" fill={C.accent}/>
      ))}
      {/* Y labels */}
      <text x={PAD.l-4} y={PAD.t+4} textAnchor="end" fontSize="9" fill={C.sub}>{Math.round(maxV)}</text>
      <text x={PAD.l-4} y={PAD.t+iH+4} textAnchor="end" fontSize="9" fill={C.sub}>{Math.round(minV)}</text>
      {/* X labels — first and last */}
      <text x={PAD.l} y={H-2} textAnchor="middle" fontSize="9" fill={C.sub}>{data[0]?.label}</text>
      {data.length > 1 && <text x={px(data.length-1)} y={H-2} textAnchor="middle" fontSize="9" fill={C.sub}>{data[data.length-1]?.label}</text>}
    </svg>
  );
}

function ExerciseDetail({ name, store, unit, C, onClose }) {
  const exInfo = EXERCISE_DB.find(e => e.name === name) || { name, muscle:"Full Body" };
  const cueData = getCues(name, exInfo.muscle);
  const pr = store.prs?.[name];
  const [chartMode, setChartMode] = useState("weight"); // "weight" | "volume"

  // Build history data from store
  const historyData = useMemo(() => {
    const points = [];
    const dates = Object.keys(store.history || {}).sort();
    for (const dk of dates) {
      const sessions = Object.values(store.history[dk] || {});
      for (const sess of sessions) {
        const ex = sess.exercises?.find(e => e.name === name);
        if (!ex) continue;
        const doneSets = (ex.sets || []).filter(s => s.done && (s.weight || s.reps));
        if (!doneSets.length) continue;
        const maxW = Math.max(...doneSets.map(s => cvt(parseFloat(s.weight)||0, sess.unit||"lbs", unit)));
        const vol = doneSets.reduce((a, s) => a + (cvt(parseFloat(s.weight)||0, sess.unit||"lbs", unit)) * (parseFloat(s.reps)||0), 0);
        const d = new Date(dk);
        const label = `${d.getMonth()+1}/${d.getDate()}`;
        points.push({ label, weight: maxW, volume: vol, date: dk, sets: doneSets.length });
      }
    }
    return points;
  }, [store.history, name, unit]);

  const chartData = historyData.map(p => ({ label: p.label, value: chartMode === "weight" ? p.weight : p.volume }));
  const totalSets = historyData.reduce((a, p) => a + p.sets, 0);
  const totalVol = historyData.reduce((a, p) => a + p.volume, 0);
  const sessions = historyData.length;

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:500, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", paddingTop:"env(safe-area-inset-top)" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"4px 8px 4px 0", fontFamily:F }}>‹</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{name}</div>
          <div style={{ fontSize:12, color:C.sub }}>{exInfo.muscle}</div>
        </div>
        {pr && (
          <div style={{ background:C.accentSoft, borderRadius:8, padding:"4px 10px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:C.accent, fontWeight:700, letterSpacing:1 }}>PR</div>
            <div style={{ fontSize:13, fontWeight:700, color:C.accent, fontFamily:MONO }}>{cvt(pr,"lbs",unit)} {unit}</div>
          </div>
        )}
      </div>

      <div style={{ overflowY:"auto", flex:1 }}>
        {/* Animation */}
        <div style={{ display:"flex", justifyContent:"center", padding:"20px 0 10px", background:C.bg }}>
          <ExerciseAnimation name={name} muscle={exInfo.muscle} C={C}/>
        </div>

        {/* Stats strip */}
        {sessions > 0 && (
          <div style={{ display:"flex", gap:0, margin:"0 16px 16px", border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
            {[
              ["Sessions", sessions],
              ["Total Sets", totalSets],
              ["Volume", totalVol > 1000 ? `${(totalVol/1000).toFixed(1)}k` : Math.round(totalVol)],
            ].map(([label, val], i) => (
              <div key={label} style={{ flex:1, padding:"12px 8px", textAlign:"center", borderRight: i < 2 ? `1px solid ${C.divider}` : "none" }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:MONO }}>{val}</div>
                <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        <div style={{ margin:"0 16px 20px", border:`1px solid ${C.border}`, borderRadius:12, padding:"14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>Progress</div>
            <div style={{ display:"flex", background:C.divider, borderRadius:16, padding:2 }}>
              {["weight","volume"].map(m => (
                <button key={m} onClick={() => setChartMode(m)} style={{
                  padding:"4px 10px", borderRadius:14, border:"none",
                  background: chartMode===m ? C.accent : "transparent",
                  color: chartMode===m ? "#fff" : C.sub,
                  fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
                }}>{m === "weight" ? "Max Weight" : "Volume"}</button>
              ))}
            </div>
          </div>
          <ExerciseVolumeChart data={chartData} unit={unit} C={C}/>
          {chartData.length > 0 && <div style={{ fontSize:10, color:C.sub, textAlign:"right", marginTop:4 }}>{unit}</div>}
        </div>

        {/* How To */}
        <div style={{ margin:"0 16px 16px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10, letterSpacing:0.3 }}>HOW TO DO IT</div>
          <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
            {cueData.cues.map((cue, i) => (
              <div key={i} style={{
                display:"flex", gap:12, padding:"11px 14px",
                borderBottom: i < cueData.cues.length - 1 ? `1px solid ${C.divider}` : "none",
                alignItems:"flex-start"
              }}>
                <div style={{
                  width:20, height:20, borderRadius:"50%", background:C.accent,
                  color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1
                }}>{i+1}</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>{cue}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Common Mistakes */}
        <div style={{ margin:"0 16px 16px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10, letterSpacing:0.3 }}>COMMON MISTAKES</div>
          <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
            {cueData.mistakes.map((m, i) => (
              <div key={i} style={{
                display:"flex", gap:12, padding:"11px 14px",
                borderBottom: i < cueData.mistakes.length - 1 ? `1px solid ${C.divider}` : "none",
                alignItems:"flex-start"
              }}>
                <div style={{ color:"#ef4444", fontSize:16, flexShrink:0, lineHeight:1.3 }}>✕</div>
                <div style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>{m}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Breathing cue */}
        {cueData.breathe && (
          <div style={{ margin:"0 16px 24px", background:C.accentSoft, borderRadius:12, padding:"14px 16px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:1, marginBottom:4 }}>BREATHING</div>
            <div style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>{cueData.breathe}</div>
          </div>
        )}

        {/* Previous sessions */}
        {historyData.length > 0 && (
          <div style={{ margin:"0 16px 32px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:10, letterSpacing:0.3 }}>RECENT SESSIONS</div>
            <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
              {historyData.slice(-5).reverse().map((d, i) => (
                <div key={i} style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px",
                  borderBottom: i < Math.min(5, historyData.length) - 1 ? `1px solid ${C.divider}` : "none"
                }}>
                  <div>
                    <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{d.label}</div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{d.sets} sets</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.accent, fontFamily:MONO }}>{d.weight} {unit}</div>
                    <div style={{ fontSize:11, color:C.sub }}>vol {d.volume > 1000 ? `${(d.volume/1000).toFixed(1)}k` : Math.round(d.volume)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupDetail({ g, members, notMembers, currentUserId, store, C, token, onBack, onUpdateMembers, onLeave }) {
  const [tab, setTab] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState("");
  const [img, setImg] = useState(null);
  const [posting, setPosting] = useState(false);
  const [showPostKinds, setShowPostKinds] = useState(false);
  const fileRef = useRef(null);
  const me = store.users.find(u => u.id === currentUserId);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/group_posts?group_id=eq.${g.id}&select=*&order=created_at.desc`,
          { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` } }
        );
        if (res.ok) setPosts((await res.json()) || []);
      } catch {}
      setLoading(false);
    }
    if (token) load(); else setLoading(false);
  }, [g.id, token]);

  async function sendPost() {
    if ((!caption.trim() && !img) || !token) return;
    setPosting(true);
    try {
      let imageUrl = null;
      if (img) {
        // Upload image
        const [header, data] = img.split(",");
        const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
        const ext = mime.split("/")[1] || "jpg";
        const filename = `${currentUserId}/group_${Date.now()}.${ext}`;
        const bytes = atob(data); const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/post-images/${filename}`, {
          method:"POST", headers:{ "Authorization":`Bearer ${token}`, "Content-Type":mime, "x-upsert":"true" },
          body: new Blob([arr], { type: mime })
        });
        if (upRes.ok) imageUrl = `${SUPABASE_URL}/storage/v1/object/public/post-images/${filename}`;
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts`, {
        method:"POST",
        headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}`, "Content-Type":"application/json", "Prefer":"return=representation" },
        body: JSON.stringify({ group_id:g.id, user_id:currentUserId, type:img?"photo":"text", caption:caption.trim(), image_url:imageUrl })
      });
      if (res.ok) {
        const data = await res.json();
        const newPost = Array.isArray(data) ? data[0] : data;
        if (newPost) setPosts(p => [{ ...newPost, _localImage: img }, ...p]);
        setCaption(""); setImg(null);
      }
    } catch {}
    setPosting(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.divider}`, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button onClick={onBack} style={{ fontSize:20, color:C.text, background:"none", border:"none", cursor:"pointer" }}>‹</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:600, color:C.text }}>{g.icon} {g.name}</div>
          <div style={{ fontSize:11, color:C.sub }}>🔒 {(g.members||[]).length} members</div>
        </div>
        <div style={{ display:"flex", gap:0, background:C.divider, borderRadius:8, padding:2 }}>
          {["feed","members"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:"5px 12px", background:tab===t?C.bg:"transparent", color:tab===t?C.text:C.sub,
              border:"none", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F,
              boxShadow:tab===t?"0 1px 3px rgba(0,0,0,0.1)":"none"
            }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
      </div>

      {tab === "feed" && (
        <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>
          {/* Post composer */}
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
              const f = e.target.files[0]; if (!f) return;
              const r = new FileReader(); r.onload = ev => setImg(ev.target.result); r.readAsDataURL(f);
            }}/>
            {img && (
              <div style={{ position:"relative", marginBottom:8 }}>
                <img src={img} style={{ width:"100%", maxHeight:180, objectFit:"cover", borderRadius:10 }}/>
                <button onClick={() => setImg(null)} style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", borderRadius:"50%", width:24, height:24, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            )}
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <Avatar user={me} size={32} C={C}/>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={`Post to ${g.name}...`}
                rows={1}
                style={{ flex:1, background:C.divider, border:"none", borderRadius:16, padding:"8px 12px", fontSize:14, color:C.text, outline:"none", fontFamily:F, resize:"none", minHeight:36 }}
              />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
              <div style={{ display:"flex", gap:12 }}>
                <button onClick={() => fileRef.current?.click()} style={{ background:"none", border:"none", color:C.accent, fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600 }}>📷 Photo</button>
                {/* Share recent workout */}
                {Object.entries(store.history||{}).slice(0,1).map(([date, sessions]) =>
                  Object.values(sessions).slice(0,1).map((sess, i) => (
                    <button key={i} onClick={async () => {
                      if (!token) return; setPosting(true);
                      try {
                        const workoutData = { name: sess.dayName, duration: sess.duration, exercises: (sess.exercises||[]).filter(e=>e.name).map(ex=>({ name:ex.name, sets:(ex.sets||[]).filter(s=>s.done).map(s=>({w:parseFloat(s.weight)||0,r:parseFloat(s.reps)||0})) })) };
                        const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts`, {
                          method:"POST",
                          headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}`, "Content-Type":"application/json", "Prefer":"return=representation" },
                          body: JSON.stringify({ group_id:g.id, user_id:currentUserId, type:"workout", caption:`${sess.dayName} 💪`, workout:workoutData })
                        });
                        if (res.ok) { const d = await res.json(); const p = Array.isArray(d)?d[0]:d; if(p) setPosts(prev=>[p,...prev]); toast("Workout shared to group!", "success"); }
                      } catch {} setPosting(false);
                    }} style={{ background:"none", border:"none", color:C.accent, fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600 }}>💪 Share Workout</button>
                  ))
                )}
              </div>
              <button onClick={sendPost} disabled={(!caption.trim() && !img) || posting} style={{
                background:(caption.trim()||img)?C.accent:C.divider, color:(caption.trim()||img)?"#fff":C.sub,
                border:"none", borderRadius:16, padding:"6px 16px", fontSize:12, fontWeight:700,
                cursor:(caption.trim()||img)?"pointer":"default", fontFamily:F
              }}>{posting?"...":"Post"}</button>
            </div>
          </div>
          {/* Feed */}
          <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
            {loading && <div style={{ textAlign:"center", padding:40, color:C.sub }}>Loading...</div>}
            {!loading && posts.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.sub }}>
                <div style={{ fontSize:36, marginBottom:12 }}>💬</div>
                <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:6 }}>No posts yet</div>
                <div style={{ fontSize:13 }}>Be the first to post something to the group</div>
              </div>
            )}
            {posts.map(post => {
              const author = store.users.find(u => u.id === post.user_id);
              return (
                <div key={post.id} style={{ padding:"12px 14px", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8 }}>
                    <Avatar user={author} size={32} C={C}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{author?.username || "Unknown"}</span>
                        <span style={{ fontSize:11, color:C.sub }}>{timeAgo(new Date(post.created_at).getTime())}</span>
                      </div>
                      <div style={{ fontSize:14, color:C.text, lineHeight:1.45 }}>{post.caption}</div>
                      {(post.image_url || post._localImage) && <img src={post._localImage || post.image_url} alt="" style={{ width:"100%", borderRadius:10, marginTop:8, maxHeight:300, objectFit:"cover" }}/>}
                      {post.workout && (
                        <div style={{ marginTop:8, background:C.divider, borderRadius:10, padding:"10px 12px" }}>
                          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{post.workout.name} 💪</div>
                          <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{Math.floor((post.workout.duration||0)/60)}m · {(post.workout.exercises||[]).length} exercises</div>
                          {(post.workout.exercises||[]).slice(0,3).map((ex,i) => (
                            <div key={i} style={{ fontSize:12, color:C.sub, marginTop:4 }}>• {ex.name} {ex.sets?.length ? `${ex.sets.length} sets` : ""}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div style={{ overflowY:"auto", flex:1, padding:"14px", paddingBottom:20 }}>
          {g.description && <div style={{ fontSize:13, color:C.sub, marginBottom:16, lineHeight:1.5 }}>{g.description}</div>}
          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>MEMBERS · {members.length}</div>
          {members.map(u => (
            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:`1px solid ${C.divider}` }}>
              <Avatar user={u} size={38} C={C}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{u.name}{u.id===currentUserId?" (You)":""}</div>
                <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
              </div>
              {u.id === g.createdBy && <span style={{ fontSize:9, color:C.gold, fontWeight:600 }}>ADMIN</span>}
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
                  <button onClick={() => onUpdateMembers(g.id, [...(g.members||[]), u.id])} style={{
                    background:C.accent, color:"#fff", border:"none", borderRadius:6,
                    padding:"5px 12px", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
                  }}>Invite</button>
                </div>
              ))}
            </>
          )}
          <button onClick={onLeave} style={{ width:"100%", background:"none", color:C.red, border:"none", padding:"14px", fontSize:13, cursor:"pointer", marginTop:16, fontFamily:F }}>Leave Group</button>
        </div>
      )}
    </div>
  );
}

function GroupsScreen({ store, setStore, currentUserId, C, onBack, token }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [activeGroup, setActiveGroup] = useState(null);
  const myGroups = (store.groups || []).filter(g => (g.members||g.member_ids||[]).includes(currentUserId));

  async function createGroup() {
    if (!newName) return;
    const tempId = uid();
    const localGroup = { id: tempId, name: newName, description: newDesc, createdBy: currentUserId, members: [currentUserId], icon: "🏋️" };
    setStore(p => ({ ...p, groups: [...(p.groups || []), localGroup] }));
    setShowCreate(false); setNewName(""); setNewDesc("");
    if (token) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/groups`, {
          method: "POST",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify({ name: newName, description: newDesc, created_by: currentUserId, member_ids: [currentUserId], icon: "🏋️" })
        });
        if (res.ok) {
          const data = await res.json();
          const dbGroup = Array.isArray(data) ? data[0] : data;
          if (dbGroup?.id) {
            // Replace temp id with real UUID from DB
            setStore(p => ({ ...p, groups: p.groups.map(g => g.id === tempId ? { ...g, id: dbGroup.id } : g) }));
          }
        }
      } catch {}
    }
  }

  async function updateGroupMembers(groupId, newMembers) {
    setStore(p => ({ ...p, groups: p.groups.map(gr => gr.id !== groupId ? gr : { ...gr, members: newMembers, member_ids: newMembers }) }));
    if (token) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/groups?id=eq.${groupId}`, {
          method: "PATCH",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ member_ids: newMembers })
        });
      } catch {}
    }
  }

  if (activeGroup) {
    const g = (store.groups || []).find(x => x.id === activeGroup);
    if (!g) { setActiveGroup(null); return null; }
    const members = (g.members||[]).map(mid => store.users.find(u => u.id === mid)).filter(Boolean);
    const notMembers = store.users.filter(u => !(g.members||[]).includes(u.id) && u.id !== currentUserId);
    return <GroupDetail
      g={g} members={members} notMembers={notMembers}
      currentUserId={currentUserId} store={store} C={C} token={token}
      onBack={() => setActiveGroup(null)}
      onUpdateMembers={updateGroupMembers}
      onLeave={() => { updateGroupMembers(g.id, (g.members||[]).filter(m => m !== currentUserId)); setActiveGroup(null); }}
    />;
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderBottom:`1px solid ${C.divider}` }}>
        {onBack && <button onClick={onBack} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"0 8px 0 0" }}>‹</button>}
        <div style={{ flex:1, fontSize:18, fontWeight:700, color:C.text }}>Groups</div>
        <button onClick={() => setShowCreate(true)} style={{
          background:C.accent, color:"#fff", border:"none", borderRadius:6,
          padding:"6px 12px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
        }}>+ New</button>
      </div>
      <div style={{ padding:"16px 14px" }}>
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
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DISCOVER
// ═════════════════════════════════════════════════════════════════════════════
function DiscoverScreen({ store, setStore, currentUserId, onUserClick, setTab, C, token, onFollow }) {
  const [q, setQ] = useState("");
  const [subTab, setSubTab] = useState("discover"); // "discover" | "groups" | "challenges"
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];
  const others = store.users.filter(u =>
    u.id !== currentUserId && (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase()))
  );

  function toggleFollow(uid2) {
    if (onFollow) { onFollow(uid2); return; }
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

  if (subTab === "groups") {
    return <GroupsScreen store={store} setStore={setStore} currentUserId={currentUserId} C={C} onBack={() => setSubTab("discover")} token={token}/>;
  }
  if (subTab === "challenges") {
    return <FriendsActivityScreen store={store} currentUserId={currentUserId} C={C} unit={store.unit||"lbs"} onBack={() => setSubTab("discover")} onUserClick={onUserClick}/>;
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
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
          <button onClick={() => setSubTab("challenges")} style={{
            background:"linear-gradient(135deg,#059669,#047857)",
            border:"none", borderRadius:12, padding:"16px",
            color:"#fff", cursor:"pointer", textAlign:"left", fontFamily:F
          }}>
            <div style={{ fontSize:22 }}>🏅</div>
            <div style={{ fontSize:13, fontWeight:700, marginTop:6 }}>Friends Activity</div>
            <div style={{ fontSize:10, opacity:0.85 }}>Weekly stats</div>
          </button>
          <button onClick={() => setSubTab("groups")} style={{
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
// ═════════════════════════════════════════════════════════════════════════════
// FRIENDS ACTIVITY
// ═════════════════════════════════════════════════════════════════════════════
function FriendsActivityScreen({ store, currentUserId, C, unit, onBack, onUserClick }) {
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];
  const friends = [currentUserId, ...following].map(id => store.users.find(u => u.id === id)).filter(Boolean);

  function getMyStats() {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let sessions = 0, volume = 0;
    const history = store.history || {};
    for (const dk of Object.keys(history)) {
      const dayMs = new Date(dk).getTime();
      if (dayMs < weekAgo) continue;
      const daySessions = Object.values(history[dk] || {});
      sessions += daySessions.length;
      volume += daySessions.reduce((a, s) => a + (s.exercises||[]).reduce((b, ex) =>
        b + (ex.sets||[]).filter(st=>st.done).reduce((c,st) => c + (parseFloat(st.weight)||0)*(parseFloat(st.reps)||0), 0), 0), 0);
    }
    // streak
    let streak = 0;
    let check = new Date().toISOString().split("T")[0];
    while (history[check] && Object.values(history[check]).length > 0) {
      streak++;
      const d = new Date(check); d.setDate(d.getDate()-1);
      check = d.toISOString().split("T")[0];
    }
    return { sessions, volume: Math.round(volume), streak, prs: Object.keys(store.prs||{}).length };
  }

  const myStats = getMyStats();

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderBottom:`1px solid ${C.divider}` }}>
        {onBack && <button onClick={onBack} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"0 8px 0 0" }}>&#8249;</button>}
        <div style={{ flex:1, fontSize:18, fontWeight:700, color:C.text }}>Friends Activity</div>
      </div>
      <div style={{ padding:"14px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:12 }}>THIS WEEK</div>
        {friends.map((u) => {
          const isMe = u.id === currentUserId;
          const stats = isMe ? myStats : { sessions:"—", volume:"—", streak:0, prs:"—" };
          return (
            <div key={u.id} style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", marginBottom:10, background: isMe ? C.accentSoft : C.bg }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <button onClick={() => onUserClick && onUserClick(u.id)} style={{ background:"none", border:"none", padding:0, cursor:"pointer" }}>
                  <Avatar user={u} size={40} C={C}/>
                </button>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{isMe ? "You" : u.name}</div>
                  <div style={{ fontSize:11, color:C.sub }}>@{u.username}</div>
                </div>
                {isMe && stats.streak > 0 && (
                  <div style={{ background:"#f97316", borderRadius:20, padding:"3px 10px", fontSize:12, fontWeight:700, color:"#fff" }}>🔥 {stats.streak}</div>
                )}
              </div>
              <div style={{ display:"flex", gap:0, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
                {[["Sessions", stats.sessions], ["Volume", isMe && stats.volume > 1000 ? (stats.volume/1000).toFixed(1)+"k" : stats.volume], ["PRs", stats.prs]].map(([label, val], j) => (
                  <div key={label} style={{ flex:1, padding:"10px 6px", textAlign:"center", borderRight: j<2 ? `1px solid ${C.divider}` : "none" }}>
                    <div style={{ fontSize:17, fontWeight:800, color: isMe ? C.accent : C.text, fontFamily:MONO }}>{val}</div>
                    <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>
              {!isMe && <div style={{ fontSize:11, color:C.sub, textAlign:"center", marginTop:8 }}>Stats sync when {u.name} logs workouts</div>}
            </div>
          );
        })}
        {friends.length <= 1 && (
          <div style={{ textAlign:"center", padding:"20px 0", color:C.sub, fontSize:13 }}>Follow friends in Discover to see their activity here</div>
        )}
      </div>
    </div>
  );
}

function ProfileScreen({ userId, store, setStore, currentUserId, onBack, displayUnit, C, onToggleTheme, onUserClick, email, onSignOut, onFollow }) {
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
    if (onFollow) { onFollow(userId); return; }
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
    <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
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

              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>ACCOUNT</div>
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ fontSize:14, color:C.text }}>Signed in as</div>
                  <div style={{ fontSize:12, color:C.sub }}>{email || ""}</div>
                </div>
                <button onClick={() => { setShowSettings(false); setTimeout(() => onSignOut && onSignOut(), 200); }} style={{
                  width:"100%", background:"none", border:"none", padding:"14px",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  cursor:"pointer", fontFamily:F
                }}>
                  <div style={{ fontSize:14, color:"#ef4444", fontWeight:600 }}>Sign Out</div>
                  <span style={{ fontSize:16, color:"#ef4444" }}>→</span>
                </button>
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
function NewPostModal({ C, onClose, onPost, initialKind = "photo" }) {
  const [postKind, setPostKind] = useState(initialKind);
  const [caption, setCaption] = useState("");
  const [img, setImg] = useState(null);
  const [isFC, setIsFC] = useState(false);
  const [loc, setLoc] = useState("");
  const [runDist, setRunDist] = useState("");
  const [runDistUnit, setRunDistUnit] = useState("mi");
  const [runHrs, setRunHrs] = useState("");
  const [runMins, setRunMins] = useState("");
  const [runSecs, setRunSecs] = useState("");
  const [runRoute, setRunRoute] = useState("");
  const [yogaMins, setYogaMins] = useState("");
  const [yogaType, setYogaType] = useState("vinyasa");
  const fileRef = useRef(null);

  function handleFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = e => setImg(e.target.result);
    r.readAsDataURL(f);
  }

  function calcPace() {
    const dist = parseFloat(runDist);
    const totalMins = (parseInt(runHrs)||0)*60 + (parseInt(runMins)||0) + (parseInt(runSecs)||0)/60;
    if (!dist || !totalMins) return null;
    const paceMin = Math.floor(totalMins / dist);
    const paceSec = Math.round(((totalMins / dist) - paceMin) * 60);
    return `${paceMin}:${String(paceSec).padStart(2,"0")} /${runDistUnit}`;
  }

  function canShare() {
    if (postKind === "story") return !!(caption || img);
    if (postKind === "photo") return !!(caption || img);
    if (postKind === "run") return !!(runDist && (runMins || runHrs));
    if (postKind === "yoga") return !!yogaMins;
    return false;
  }

  function handleShare() {
    if (!canShare()) return;
    if (postKind === "photo") {
      onPost({ type: "story", caption, imageData: img });
    } else if (postKind === "photo") {
      onPost({ type: isFC ? "form_check" : "photo", caption, imageData: img, location: loc });
    } else if (postKind === "run") {
      const totalMins = (parseInt(runHrs)||0)*60 + (parseInt(runMins)||0) + (parseInt(runSecs)||0)/60;
      onPost({ type: "run", caption, location: loc || runRoute, run: {
        distance: parseFloat(runDist), distUnit: runDistUnit,
        durationMins: Math.round(totalMins), pace: calcPace(), route: runRoute
      }});
    } else if (postKind === "yoga") {
      onPost({ type: "yoga", caption, yoga: { durationMins: parseInt(yogaMins), style: yogaType }});
    }
    onClose();
  }

  const kinds = [
    { id:"story", label:"⚡ Story" },
    { id:"photo", label:"📸 Photo" },
    { id:"run", label:"🏃 Run" },
    { id:"yoga", label:"🧘 Yoga" },
  ];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"92dvh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
          <button onClick={onClose} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
          <div style={{ fontSize:15, fontWeight:600, color:C.text }}>New Post</div>
          <button onClick={handleShare} style={{ fontSize:14, fontWeight:600, color: canShare() ? C.accent : C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Share</button>
        </div>

        {/* Kind selector tabs */}
        <div style={{ display:"flex", gap:6, padding:"10px 14px", borderBottom:`1px solid ${C.divider}` }}>
          {kinds.map(k => (
            <button key={k.id} onClick={() => setPostKind(k.id)} style={{
              padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:600,
              background: postKind === k.id ? C.accent : C.divider,
              color: postKind === k.id ? "#fff" : C.sub,
              border:"none", cursor:"pointer", fontFamily:F
            }}>{k.label}</button>
          ))}
        </div>

        <div style={{ overflowY:"auto", flex:1, padding:"14px" }}>
          {(postKind === "story" || postKind === "photo") && (<>
            <div onClick={() => fileRef.current?.click()} style={{
              border:`1.5px dashed ${C.border}`, borderRadius:10, minHeight:150,
              display:"flex", alignItems:"center", justifyContent:"center",
              flexDirection:"column", gap:8, cursor:"pointer", marginBottom:12, overflow:"hidden"
            }}>
              {img
                ? <img src={img} alt="" style={{ width:"100%", maxHeight:270, objectFit:"cover" }}/>
                : <><span style={{ fontSize:28 }}>{postKind === "story" ? "⚡" : "📸"}</span><span style={{ fontSize:13, color:C.sub }}>{postKind === "story" ? "Tap to add story photo" : "Tap to add photo or video"}</span></>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])}/>
            {postKind === "photo" && (
              <button onClick={() => setIsFC(!isFC)} style={{
                marginBottom:10, padding:"6px 12px",
                background:isFC?C.accent:"transparent", color:isFC?"#fff":C.sub,
                border:`1px solid ${isFC?C.accent:C.border}`, borderRadius:20,
                fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
              }}>🎥 Form Check</button>
            )}
            {postKind === "photo" && (
              <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="📍 Add location"
                style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}/>
            )}
            <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write a caption..." rows={3}
              style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 13px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}/>
          </>)}

          {postKind === "run" && (<>
            <div style={{ fontSize:13, fontWeight:600, color:C.sub, letterSpacing:0.5, marginBottom:12 }}>RUN DETAILS</div>
            {/* Distance */}
            <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Distance</div>
                <input value={runDist} onChange={e => setRunDist(e.target.value)} placeholder="0.0" type="number" inputMode="decimal"
                  style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 12px", fontSize:16, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}/>
              </div>
              <div style={{ flexShrink:0, marginTop:18 }}>
                <button onClick={() => setRunDistUnit(u => u === "mi" ? "km" : "mi")} style={{
                  background:C.divider, border:"none", borderRadius:8, padding:"11px 14px",
                  fontSize:13, fontWeight:700, color:C.accent, cursor:"pointer", fontFamily:F
                }}>{runDistUnit}</button>
              </div>
            </div>
            {/* Time */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Time (h : m : s)</div>
              <div style={{ display:"flex", gap:6 }}>
                {[["Hours", runHrs, setRunHrs], ["Mins", runMins, setRunMins], ["Secs", runSecs, setRunSecs]].map(([label, val, set]) => (
                  <div key={label} style={{ flex:1 }}>
                    <input value={val} onChange={e => set(e.target.value)} placeholder="0" type="number" inputMode="numeric"
                      style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 8px", fontSize:16, color:C.text, outline:"none", textAlign:"center", boxSizing:"border-box", fontFamily:F }}/>
                    <div style={{ fontSize:10, color:C.sub, textAlign:"center", marginTop:3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Auto pace */}
            {calcPace() && (
              <div style={{ background:C.accentSoft, borderRadius:8, padding:"10px 14px", marginBottom:12, display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:13, color:C.sub }}>Avg Pace</span>
                <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>{calcPace()}</span>
              </div>
            )}
            <input value={runRoute} onChange={e => setRunRoute(e.target.value)} placeholder="📍 Route name (e.g. 'Around the park')"
              style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}/>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="How did it feel?" rows={3}
              style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 13px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}/>
          </>)}

          {postKind === "yoga" && (<>
            <div style={{ fontSize:13, fontWeight:600, color:C.sub, letterSpacing:0.5, marginBottom:12 }}>YOGA SESSION</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>Duration (minutes)</div>
              <input value={yogaMins} onChange={e => setYogaMins(e.target.value)} placeholder="45" type="number" inputMode="numeric"
                style={{ width:"100%", background:C.divider, border:"none", borderRadius:8, padding:"11px 12px", fontSize:16, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}/>
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:8 }}>Style</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {["Vinyasa","Yin","Power","Hatha","Restorative","Hot","Ashtanga"].map(s => (
                  <button key={s} onClick={() => setYogaType(s.toLowerCase())} style={{
                    padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:600,
                    background: yogaType === s.toLowerCase() ? C.accent : C.divider,
                    color: yogaType === s.toLowerCase() ? "#fff" : C.text,
                    border:"none", cursor:"pointer", fontFamily:F
                  }}>{s}</button>
                ))}
              </div>
            </div>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="How was the session?" rows={3}
              style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 13px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}/>
          </>)}
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
// AUTH SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function AuthScreen({ onAuth, C }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    if (!email || !password) { setError("Email and password required"); return; }
    if (mode === "signup" && !username) { setError("Username required"); return; }
    if (mode === "signup" && username.length < 3) { setError("Username must be at least 3 characters"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        const data = await sb.signUp(email, password, username.toLowerCase().replace(/\s/g,""), name || username);
        if (data.access_token) {
          onAuth(data);
        } else {
          setError("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      } else {
        const data = await sb.signIn(email, password);
        onAuth(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width:"100%", background:C.divider, border:"none", borderRadius:10,
    padding:"13px 14px", fontSize:16, color:C.text, outline:"none",
    fontFamily:F, boxSizing:"border-box", marginBottom:10
  };

  return (
    <div style={{
      height:"100dvh", background:C.bg, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"0 28px",
      paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)"
    }}>
      {/* Logo */}
      <div style={{ marginBottom:32, textAlign:"center" }}>
        <SeshdLogo C={C} big/>
        <div style={{ fontSize:13, color:C.sub, marginTop:8 }}>
          {mode === "signin" ? "Welcome back 🔥" : "Join Seshd — start your journey 🔥"}
        </div>
      </div>

      {/* Form */}
      <div style={{ width:"100%", maxWidth:360 }}>
        {mode === "signup" && (
          <>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Full name" style={inputStyle}/>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
              placeholder="Username (letters, numbers, _)" style={inputStyle}
              autoCapitalize="none" autoCorrect="off"/>
          </>
        )}
        <input value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" type="email" style={inputStyle}
          autoCapitalize="none" autoCorrect="off"/>
        <input value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password (min 6 chars)" type="password" style={inputStyle}/>

        {error && (
          <div style={{ fontSize:13, color:C.red, marginBottom:10, textAlign:"center", lineHeight:1.4 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width:"100%", background:loading ? C.sub : `linear-gradient(135deg,${C.accent},${C.accent2})`,
          color:"#fff", border:"none", borderRadius:10, padding:"14px",
          fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginBottom:14, transition:"background 0.2s"
        }}>
          {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); }} style={{
          width:"100%", background:"none", border:"none", color:C.accent,
          fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F, padding:8
        }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth state ──────────────────────────────────────────────────
  const [session, setSession] = useState(loadSession);
  const [authLoading, setAuthLoading] = useState(true);

  // ── App data state ──────────────────────────────────────────────
  const [store, setStore] = useState(loadStore);
  const [dbReady, setDbReady] = useState(false);

  const token = session?.access_token || null;
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = session?.access_token || null; }, [session]);
  const currentUserId = session?.user?.id || null;

  // ── All UI state — must be at top level before any returns ──
  const [tab, setTab] = useState("feed");
  const [prevTab, setPrevTab] = useState(null);
  const TABS_ORDER = ["feed", "tracker", "discover", "profile"];
  function switchTab(t) { setPrevTab(tab); setTab(t); }
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostKind, setNewPostKind] = useState("photo");
  const [profileUserId, setProfileUserId] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [prModal, setPrModal] = useState(null);
  const [showWrapped, setShowWrapped] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [storyIndex, setStoryIndex] = useState(null);
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pullScrollRef = useRef(null);
  const swipeStart = useRef({ x: 0, y: 0, t: 0, type: null });
  const [swipeX, setSwipeX] = useState(0);
  useEffect(() => {
    async function init() {
      const saved = loadSession();
      if (!saved?.refresh_token) { setAuthLoading(false); return; }
      try {
        const fresh = await sb.refreshToken(saved.refresh_token);
        const merged = { ...saved, ...fresh };
        saveSession(merged);
        setSession(merged);
      } catch {
        clearSession();
        setSession(null);
      } finally {
        setAuthLoading(false);
      }
    }
    init();

    // Proactively refresh token every 45 min (tokens expire after 1hr)
    const refreshInterval = setInterval(async () => {
      const saved = loadSession();
      if (!saved?.refresh_token) return;
      try {
        const fresh = await sb.refreshToken(saved.refresh_token);
        const merged = { ...saved, ...fresh };
        saveSession(merged);
        setSession(merged);
      } catch (e) {
        console.warn("Token refresh failed:", e.message);
      }
    }, 45 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  // ── Load user data from Supabase once authenticated ─────────────
  useEffect(() => {
    if (!token || !currentUserId) return;
    loadUserData();
  }, [token, currentUserId]);

  async function loadUserData() {
    try {
      // Load profile
      const tok = tokenRef.current || token;
      const [profiles, programs, prs, history, groupsData] = await Promise.all([
        sb.query(`profiles?select=*`, {}, tok),
        sb.query(`programs?user_id=eq.${currentUserId}&select=*&order=created_at.desc`, {}, tok),
        sb.query(`personal_records?user_id=eq.${currentUserId}&select=*`, {}, tok),
        sb.query(`workout_history?user_id=eq.${currentUserId}&select=*&order=created_at.desc`, {}, tok),
        sb.query(`groups?select=*`, {}, tok).catch(() => []),
      ]);

      const me = profiles?.find(p => p.id === currentUserId);
      const activeProgram = programs?.find(p => p.is_active) || programs?.[0];

      // Convert DB programs to app format
      const appPrograms = (programs || []).map(p => ({
        id: p.id, name: p.name, days: p.days || []
      }));

      // Convert PRs to app format { exerciseName: weightLbs }
      const appPrs = {};
      (prs || []).forEach(pr => { appPrs[pr.exercise_name] = pr.weight_lbs; });

      // Convert history to app format
      const appHistory = {};
      const appWorkoutDates = {};
      (history || []).forEach(w => {
        const dk = w.workout_date;
        if (!appHistory[dk]) appHistory[dk] = {};
        appHistory[dk][w.id] = {
          dayName: w.day_name, exercises: w.exercises,
          duration: w.duration_secs, unit: w.unit, note: w.note
        };
        appWorkoutDates[dk] = true;
      });

      // Load posts (from people user follows + own)
      await loadFeed(tok, currentUserId, profiles || []);

      setStore(prev => ({
        ...prev,
        users: (profiles || []).map(p => ({
          id: p.id, username: p.username, name: p.name,
          bio: p.bio, avatar: p.avatar_emoji, avatarUrl: p.avatar_url,
          unit: p.unit, theme: p.theme,
          followers: [], following: [] // loaded separately
        })),
        currentUserId,
        programs: appPrograms,
        activeProgramId: activeProgram?.id || null,
        prs: appPrs,
        history: appHistory,
        workoutDates: appWorkoutDates,
        unit: me?.unit || "lbs",
        theme: me?.theme || "light",
        defaultRestTime: me?.default_rest_time || 120,
        seenOnboarding: true,
        groups: (groupsData||[]).map(g => ({ id:g.id, name:g.name, description:g.description, icon:g.icon||'🏋️', createdBy:g.created_by, members:g.member_ids||[] })),
      }));

      // Load follows
      const follows = await sb.query(`follows?select=follower_id,following_id`, {}, tok);
      setStore(prev => ({
        ...prev,
        users: prev.users.map(u => ({
          ...u,
          followers: (follows||[]).filter(f => f.following_id === u.id).map(f => f.follower_id),
          following: (follows||[]).filter(f => f.follower_id === u.id).map(f => f.following_id),
        }))
      }));

      setDbReady(true);
    } catch (e) {
      console.error("loadUserData error:", e);
      toast("Couldn't load your data — check connection", "error");
      setDbReady(true);
    }
  }

  async function loadFeed(tok, uid, profiles) {
    try {
      // Get all posts with kudos + comments counts
      const posts = await sb.query(
        `posts?select=*,kudos(user_id),comments(id,user_id,text,created_at)&order=created_at.desc&limit=50`,
        {}, tok
      );
      if (!posts) return;

      const appPosts = posts.map(p => ({
        id: p.id,
        userId: p.user_id,
        type: p.type,
        caption: p.caption || "",
        imageData: p.image_url,
        location: p.location,
        workout: p.workout,
        run: p.run,
        yoga: p.yoga,
        achievement: p.achievement,
        unit: p.unit || "lbs",
        isPR: p.is_pr,
        kudos: (p.kudos || []).map(k => k.user_id),
        comments: (p.comments || []).map(c => ({
          id: c.id, userId: c.user_id, text: c.text, createdAt: new Date(c.created_at).getTime()
        })),
        createdAt: new Date(p.created_at).getTime(),
      }));

      setStore(prev => ({ ...prev, posts: appPosts }));
    } catch (e) {
      console.error("loadFeed error:", e);
    }
  }

  // ── Auth handlers ─────────────────────────────────────────────
  function handleAuth(data) {
    saveSession(data);
    setSession(data);
  }

  async function handleSignOut() {
    try { await sb.signOut(token); } catch {}
    clearSession();
    setSession(null);
    setStore(loadStore());
    setDbReady(false);
  }

  // ── Supabase-backed action handlers ──────────────────────────
  async function handleNewPost(postData) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) { toast("Not signed in", "error"); return; }
    try {
      // Upload image to Storage if present - don't fall back to base64 (too large for DB)
      let imageUrl = null;
      if (postData.imageData && postData.imageData.startsWith("data:")) {
        const uploaded = await uploadImage(postData.imageData, tok, currentUserId);
        // Only use if it's a real URL (upload succeeded), not base64
        imageUrl = uploaded && !uploaded.startsWith("data:") ? uploaded : null;
        if (!imageUrl) toast("Image upload failed — posting without photo", "error");
      } else {
        imageUrl = postData.imageData || null;
      }
      const row = {
        user_id: currentUserId,
        type: postData.type || "photo",
        caption: postData.caption || "",
        image_url: imageUrl,
        location: postData.location || null,
        workout: postData.workout || null,
        run: postData.run || null,
        yoga: postData.yoga || null,
        achievement: postData.achievement || null,
        unit: store.unit || "lbs",
        is_pr: postData.isPR || false,
      };
      const result = await sb.query("posts", {
        method: "POST", body: JSON.stringify(row)
      }, tok);
      const newPost = Array.isArray(result) ? result[0] : result;
      if (newPost) {
        const appPost = {
          id: newPost.id, userId: newPost.user_id, type: newPost.type,
          caption: newPost.caption || "",
          imageData: imageUrl || postData.imageData || null,
          location: newPost.location, workout: newPost.workout,
          run: newPost.run, yoga: newPost.yoga, achievement: newPost.achievement,
          unit: newPost.unit, isPR: newPost.is_pr,
          kudos: [], comments: [],
          createdAt: new Date(newPost.created_at).getTime(),
        };
        setStore(prev => ({ ...prev, posts: [appPost, ...prev.posts] }));
      }
    } catch (e) { console.error("post error:", e); toast("Couldn't save post", "error"); }
  }

  async function handleKudos(postId) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) return;
    const post = store.posts.find(p => p.id === postId);
    if (!post) return;
    const hasKudos = post.kudos.includes(currentUserId);
    // Optimistic update
    setStore(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id !== postId ? p : {
        ...p,
        kudos: hasKudos ? p.kudos.filter(id => id !== currentUserId) : [...p.kudos, currentUserId]
      })
    }));
    try {
      if (hasKudos) {
        await sb.query(`kudos?post_id=eq.${postId}&user_id=eq.${currentUserId}`, { method:"DELETE" }, tok);
      } else {
        await sb.query("kudos", { method:"POST", body: JSON.stringify({ post_id: postId, user_id: currentUserId }) }, tok);
      }
    } catch (e) {
      // Revert on failure
      setStore(prev => ({
        ...prev,
        posts: prev.posts.map(p => p.id !== postId ? p : {
          ...p,
          kudos: hasKudos ? [...p.kudos, currentUserId] : p.kudos.filter(id => id !== currentUserId)
        })
      }));
    }
  }

  async function handleComment(postId, text) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok || !text.trim()) return;
    try {
      const result = await sb.query("comments", {
        method: "POST",
        body: JSON.stringify({ post_id: postId, user_id: currentUserId, text: text.trim() })
      }, tok);
      const newComment = Array.isArray(result) ? result[0] : result;
      if (newComment) {
        setStore(prev => ({
          ...prev,
          posts: prev.posts.map(p => p.id !== postId ? p : {
            ...p,
            comments: [...p.comments, {
              id: newComment.id, userId: newComment.user_id,
              text: newComment.text, createdAt: new Date(newComment.created_at).getTime()
            }]
          })
        }));
      }
    } catch (e) { console.error("comment error:", e); }
  }

  async function handleDelete(postId) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) return;
    setStore(prev => ({ ...prev, posts: prev.posts.filter(p => p.id !== postId) }));
    try {
      await sb.query(`posts?id=eq.${postId}`, { method:"DELETE" }, tok);
    } catch (e) { console.error("delete error:", e); }
  }

  async function handleSaveProgram(program) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) {
      // No auth — just save locally
      setStore(prev => ({
        ...prev,
        programs: prev.programs.find(p => p.id === program.id)
          ? prev.programs.map(p => p.id === program.id ? program : p)
          : [...prev.programs, program],
        activeProgramId: program._deactivate ? null : program.id
      }));
      return;
    }
    try {
      if (program._deactivate) {
        // Just deactivate all — no new active
        await sb.query(`programs?user_id=eq.${currentUserId}`, {
          method:"PATCH", body: JSON.stringify({ is_active: false })
        }, tok);
        setStore(prev => ({ ...prev, activeProgramId: null }));
        return;
      }
      // Deactivate all others
      await sb.query(`programs?user_id=eq.${currentUserId}`, {
        method:"PATCH", body: JSON.stringify({ is_active: false })
      }, tok);
      // Check if existing or new
      const existing = store.programs.find(p => p.id === program.id);
      if (existing && program.id) {
        await sb.query(`programs?id=eq.${program.id}`, {
          method:"PATCH", body: JSON.stringify({ name: program.name, days: program.days, is_active: true })
        }, tok);
      } else {
        const result = await sb.query("programs", {
          method:"POST",
          body: JSON.stringify({ user_id: currentUserId, name: program.name, days: program.days, is_active: true })
        }, tok);
        const newProg = Array.isArray(result) ? result[0] : result;
        if (newProg) program = { ...program, id: newProg.id };
      }
      setStore(prev => ({
        ...prev,
        programs: prev.programs.find(p => p.id === program.id)
          ? prev.programs.map(p => p.id === program.id ? program : p)
          : [...prev.programs, program],
        activeProgramId: program.id
      }));
      toast("Program activated 💪", "success");
    } catch (e) {
      console.error("program save error:", e);
      toast("Couldn't save program", "error");
    }
  }

  // Save program edits (notes, exercise changes) back to Supabase
  const saveProgramDebounceRef = useRef({});
  async function handleProgramEdited(prog) {
    // Always save to local state first
    setStore(prev => ({
      ...prev,
      programs: prev.programs.map(p => p.id === prog.id ? prog : p)
    }));
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok || !prog.id) return;
    clearTimeout(saveProgramDebounceRef.current[prog.id]);
    saveProgramDebounceRef.current[prog.id] = setTimeout(async () => {
      try {
        await sb.query(`programs?id=eq.${prog.id}`, {
          method:"PATCH", body: JSON.stringify({ days: prog.days })
        }, tok);
      } catch (e) { console.error("program edit sync error:", e); }
    }, 1500);
  }

  async function handleSaveWorkout(workoutData) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) return;
    try {
      const row = {
        user_id: currentUserId,
        day_name: workoutData.dayName,
        exercises: workoutData.exercises,
        duration_secs: workoutData.duration,
        unit: workoutData.unit || "lbs",
        note: workoutData.note || "",
        workout_date: new Date().toISOString().split("T")[0],
      };
      await sb.query("workout_history", { method:"POST", body: JSON.stringify(row) }, tok);

      // Save PRs
      if (workoutData.prs) {
        for (const [exName, weight] of Object.entries(workoutData.prs)) {
          await sb.query("personal_records", {
            method:"POST",
            headers_extra: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify({ user_id: currentUserId, exercise_name: exName, weight_lbs: weight })
          }, tok);
        }
      }
    } catch (e) { console.error("workout save error:", e); }
  }

  // Pull to refresh
  async function handleRefresh() {
    if (!token) return;
    const profiles = store.users;
    await loadFeed(tokenRef.current || loadSession()?.access_token, currentUserId, profiles);
  }

  // Persist non-Supabase store changes to localStorage as fallback
  useEffect(() => { saveStore(store); }, [store]);

  // ── Lock document scroll ──────────────────────────────────────
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    html.style.cssText = "margin:0;padding:0;height:100%;width:100%;overflow:hidden;overscroll-behavior:none;";
    body.style.cssText = "margin:0;padding:0;height:100%;width:100%;overflow:hidden;overscroll-behavior:none;position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;-webkit-tap-highlight-color:transparent;";
    if (root) root.style.cssText = "height:100%;width:100%;overflow:hidden;";
  }, []);

  // C needs to be available for loading screens
  const C = THEMES[(store.theme || "light")];
  const unit = store.unit || "lbs";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, textAlign: "center" }}>
        <div>
          <SeshdLogo C={C} big />
          <div style={{ marginTop: 20, color: C.sub, maxWidth: 520, fontSize: 13, lineHeight: 1.6 }}>
            Missing Supabase configuration.
            <div style={{ marginTop: 10 }}>
              Set <code style={{ background: C.divider, padding: "2px 6px", borderRadius: 6 }}>VITE_SUPABASE_URL</code> and <code style={{ background: C.divider, padding: "2px 6px", borderRadius: 6 }}>VITE_SUPABASE_ANON_KEY</code> in your environment and restart the app.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Show loading screen ───────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ height:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, flexDirection:"column", gap:16 }}>
        <SeshdLogo C={C} big/>
        <div style={{ fontSize:13, color:C.sub }}>Loading...</div>
      </div>
    );
  }

  // ── Show auth screen if not logged in ─────────────────────────
  if (!session || !currentUserId) {
    return <AuthScreen onAuth={handleAuth} C={C}/>;
  }

  // ── Show loading while fetching data ─────────────────────────
  if (!dbReady) {
    return (
      <div style={{ height:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, flexDirection:"column", gap:16 }}>
        <SeshdLogo C={C} big/>
        <div style={{ fontSize:13, color:C.sub }}>Setting up your account...</div>
      </div>
    );
  }

  // ── me is only valid after dbReady ────────────────────────────
  const me = store.users.find(u => u.id === currentUserId) || {
    id: currentUserId,
    username: session?.user?.email?.split("@")[0] || "you",
    name: "You",
    bio: "",
    avatar: "💪",
    followers: [],
    following: [],
  };

  // ── me, following, feed computed after dbReady guard ────────────
  const following = me?.following || [];
  // Story users = people who have story posts in the last 24h
  const recentStoryPosts = (store.posts || []).filter(p =>
    p.type === "story" && Date.now() - p.createdAt < 24 * 60 * 60 * 1000
  );
  const myStoryPost = recentStoryPosts.find(p => p.userId === currentUserId);
  const storyUserIds = [...new Set(recentStoryPosts.map(p => p.userId))].filter(id => id !== currentUserId);
  const storyUsers = storyUserIds.map(id => store.users.find(u => u.id === id)).filter(Boolean);
  const streak = calcStreak(store.workoutDates || {});
  // Build synthetic feed items from own workout history (not shared)
  const sharedWorkoutIds = new Set((store.posts||[]).filter(p=>p.type==="workout"&&p.userId===currentUserId).map(p=>p.workout?.name+p.createdAt));
  const historyFeedItems = Object.entries(store.history||{}).flatMap(([date, sessions]) =>
    Object.values(sessions).map(sess => {
      const key = sess.dayName + new Date(date).getTime();
      if (sharedWorkoutIds.has(key)) return null;
      const vol = (sess.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseFloat(s.reps)||0),0),0);
      return {
        id: "hist_"+date+"_"+sess.dayName,
        userId: currentUserId,
        type: "workout",
        caption: "",
        unit: sess.unit || unit,
        workout: { name: sess.dayName, duration: sess.duration||0, volume: Math.round(vol), exercises: (sess.exercises||[]).filter(e=>e.name).map(ex=>({ name:ex.name, sets:(ex.sets||[]).filter(s=>s.done).map(s=>({w:parseFloat(s.weight)||0,r:parseFloat(s.reps)||0})) })) },
        kudos: [], comments: [],
        createdAt: new Date(date).getTime(),
        _isHistory: true,
      };
    }).filter(Boolean)
  );

  const feedPosts = [...(store.posts || []).filter(p => p.userId === currentUserId || following.includes(p.userId)), ...historyFeedItems.filter(i => !((store.posts||[]).some(p=>p.type==="workout"&&p.userId===currentUserId&&p.workout?.name===i.workout?.name&&Math.abs(p.createdAt-i.createdAt)<86400000)))]
    .sort((a, b) => b.createdAt - a.createdAt);

  async function handleEditSave(id, cap) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    setStore(p => ({ ...p, posts: p.posts.map(pt => pt.id !== id ? pt : { ...pt, caption: cap }) }));
    setEditingPost(null);
    try {
      await sb.query(`posts?id=eq.${id}`, {
        method:"PATCH", body: JSON.stringify({ caption: cap })
      }, tok);
    } catch (e) { console.error("edit error:", e); }
  }

  async function handleFollow(userId) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    const isFollowing = me?.following?.includes(userId);
    setStore(prev => ({
      ...prev,
      users: prev.users.map(u => u.id !== currentUserId ? u : {
        ...u,
        following: isFollowing ? u.following.filter(id => id !== userId) : [...(u.following||[]), userId]
      })
    }));
    try {
      if (isFollowing) {
        await sb.query(`follows?follower_id=eq.${currentUserId}&following_id=eq.${userId}`, { method:"DELETE" }, tok);
      } else {
        await sb.query("follows", { method:"POST", body: JSON.stringify({ follower_id: currentUserId, following_id: userId }) }, tok);
      }
    } catch (e) { console.error("follow error:", e); }
  }

  // Track when activity tab was last viewed
  const lastSeenActivityRef = useRef(parseInt(localStorage.getItem("seshd_last_activity") || "0"));
  function markActivitySeen() {
    const now = Date.now();
    lastSeenActivityRef.current = now;
    localStorage.setItem("seshd_last_activity", String(now));
  }

  const notifCount = (store.posts || [])
    .filter(p => p.userId === currentUserId)
    .reduce((a, pt) => {
      const newKudos = (pt.kudos||[]).filter(x => x !== currentUserId && pt.createdAt > lastSeenActivityRef.current).length;
      const newComments = (pt.comments||[]).filter(c => c.userId !== currentUserId && c.createdAt > lastSeenActivityRef.current).length;
      return a + newKudos + newComments;
    }, 0);

  if (prModal) return <PRModal pr={prModal} unit={unit} onClose={() => setPrModal(null)}/>;

  if (profileUserId) {
    return (
      <div style={{ background:C.bg, height:"100dvh", maxWidth:480, margin:"0 auto", fontFamily:F, display:"flex", flexDirection:"column", color:C.text }}>
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
          onFollow={handleFollow}
        />
      </div>
    );
  }

  return (
    <div
      onTouchStart={(e) => {
        if (showNewPost || editingPost || prModal || showWrapped || storyIndex !== null) return;
        const t = e.touches[0];
        swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now(), type: null };
        setSwipeX(0);
      }}
      onTouchMove={(e) => {
        if (!swipeStart.current.t) return;
        const t = e.touches[0];
        const dx = t.clientX - swipeStart.current.x;
        const dy = t.clientY - swipeStart.current.y;

        // Classify gesture type once enough movement
        if (!swipeStart.current.type) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          swipeStart.current.type = Math.abs(dx) > Math.abs(dy) * 0.7 ? "horizontal" : "vertical";
        }
        if (swipeStart.current.type === "vertical") return;

        const idx = TABS_ORDER.indexOf(tab);
        const canLeft = idx > 0;
        const canRight = idx < TABS_ORDER.length - 1;
        if ((dx > 0 && !canLeft && !profileUserId) || (dx < 0 && !canRight)) return;
        e.preventDefault();
        setSwipeX(dx);
      }}
      onTouchEnd={() => {
        if (!swipeStart.current.type || swipeStart.current.type === "vertical") {
          swipeStart.current = { x:0, y:0, t:0, type:null };
          setSwipeX(0);
          return;
        }
        const dx = swipeX;
        const dt = Date.now() - swipeStart.current.t;
        const velocity = Math.abs(dx) / dt;
        swipeStart.current = { x:0, y:0, t:0, type:null };
        setSwipeX(0);

        // Trigger if fast flick OR dragged past 35% of screen
        const threshold = velocity > 0.3 || Math.abs(dx) > window.innerWidth * 0.35;
        if (!threshold) return;

        if (dx > 0) {
          // Swipe right → go back / previous tab
          if (profileUserId) { setProfileUserId(null); return; }
          const idx = TABS_ORDER.indexOf(tab);
          if (idx > 0) switchTab(TABS_ORDER[idx - 1]);
        } else {
          // Swipe left → next tab
          const idx = TABS_ORDER.indexOf(tab);
          if (idx < TABS_ORDER.length - 1) switchTab(TABS_ORDER[idx + 1]);
        }
      }}
      style={{ background:C.bg, height:"100dvh", maxWidth:480, margin:"0 auto", fontFamily:F, color:C.text, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}
    >
      {showWrapped && <WrappedModal store={store} C={C} onClose={() => setShowWrapped(false)}/>}
      <ToastHost/>

      {/* TOP BAR — Instagram thin, minimal, SVG icons */}
      <div style={{
        background:C.tabBg, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.divider}`,
        padding:"calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 14px) 10px calc(env(safe-area-inset-left) + 14px)",
        display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0
      }}>
        <SeshdLogo C={C}/>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {streak > 0 && <div style={{ marginRight:4 }}><StreakBadge streak={streak} size="sm"/></div>}
          {tab === "feed" && (
            <button
              onClick={() => { setNewPostKind("photo"); setShowNewPost(true); }}
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

      {/* CONTENT — single tab visible at a time with slide transition */}
      {(() => {
        const prevIdx = TABS_ORDER.indexOf(prevTab);
        const curIdx = TABS_ORDER.indexOf(tab);
        const dir = prevIdx < curIdx ? "left" : "right";
        const animKey = tab + "_" + (prevTab || "");
        const isDragging = swipeStart.current.type === "horizontal";
        const dragPct = isDragging ? (swipeX / (window.innerWidth || 390)) * 100 : 0;
        return (
          <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", position:"relative" }}>
            <style>{`
              @keyframes slideInLeft {
                from { transform:translateX(100%); }
                to { transform:translateX(0); }
              }
              @keyframes slideInRight {
                from { transform:translateX(-100%); }
                to { transform:translateX(0); }
              }
            `}</style>
            <div key={animKey} style={{
              flex:1, display:"flex", flexDirection:"column", overflow:"hidden",
              transform: dragPct !== 0 ? `translateX(${dragPct}%)` : undefined,
              transition: dragPct !== 0 ? "none" : "transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)",
              animation: dragPct === 0 && prevTab && swipeX === 0
                ? `${dir === "left" ? "slideInLeft" : "slideInRight"} 0.3s cubic-bezier(0.25,0.46,0.45,0.94)` : "none",
            }}>

        {tab === "feed" && (
          <div
            ref={pullScrollRef}
            onTouchStart={(e) => {
              if (pullScrollRef.current?.scrollTop === 0) {
                touchStartY.current = e.touches[0].clientY;
              } else {
                touchStartY.current = 0;
              }
            }}
            onTouchMove={(e) => {
              if (touchStartY.current === 0 || isRefreshing) return;
              const dist = e.touches[0].clientY - touchStartY.current;
              if (dist > 0 && pullScrollRef.current?.scrollTop === 0) {
                setPullDist(Math.min(dist * 0.5, 100));
              }
            }}
            onTouchEnd={() => {
              if (pullDist > 60 && !isRefreshing) {
                setIsRefreshing(true);
                setPullDist(50);
                handleRefresh().finally(() => {
                  setIsRefreshing(false);
                  setPullDist(0);
                  touchStartY.current = 0;
                });
              } else {
                setPullDist(0);
                touchStartY.current = 0;
              }
            }}
            style={{ overflowY:"auto", flex:1, position:"relative" }}
          >
            <div style={{
              position:"absolute", top:0, left:0, right:0,
              height:pullDist, display:"flex", alignItems:"center", justifyContent:"center",
              transition: pullDist === 0 ? "height 0.2s" : "none",
              pointerEvents:"none"
            }}>
              {pullDist > 0 && (
                <div style={{
                  width:32, height:32, borderRadius:"50%",
                  border:`2.5px solid ${C.divider}`,
                  borderTopColor: C.accent,
                  animation: isRefreshing ? "spotrSpin 0.8s linear infinite" : "none",
                  transform: `rotate(${pullDist * 3}deg)`
                }}/>
              )}
            </div>
            <style>{`@keyframes spotrSpin { to { transform: rotate(360deg); } }`}</style>

            <div style={{ paddingTop: pullDist }}>
              {/* Stories */}
              <div style={{ display:"flex", gap:14, padding:"12px 14px", overflowX:"auto", overflowY:"hidden", borderBottom:`1px solid ${C.divider}` }}>
                {/* My story */}
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0, minWidth:60 }}>
                  <div style={{ position:"relative", cursor:"pointer" }} onClick={() => {
                    if (myStoryPost) {
                      setStoryIndex("self");
                    } else {
                      setNewPostKind("story"); setShowNewPost(true);
                    }
                  }}>
                    <div style={{
                      width:60, height:60, borderRadius:"50%", overflow:"hidden",
                      border: myStoryPost ? "2.5px solid #f97316" : `2.5px solid ${C.divider}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: C.divider
                    }}>
                      {myStoryPost?.imageData
                        ? <img src={myStoryPost.imageData} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                        : <span style={{ fontSize:26 }}>{me?.avatar || "💪"}</span>
                      }
                    </div>
                    {!myStoryPost && (
                      <div style={{ position:"absolute", bottom:-2, right:-2, width:20, height:20, borderRadius:"50%", background:C.accent, color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", border:`2px solid ${C.bg}` }}>+</div>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:C.text }}>Your story</div>
                </div>
                {/* Others' stories */}
                {storyUsers.map((u, i) => (
                  <div key={u.id} onClick={() => setStoryIndex(i)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0, minWidth:60 }}>
                    <div style={{ padding:2.5, borderRadius:"50%", background:"linear-gradient(135deg,#f97316,#ea580c,#be123c)", cursor:"pointer" }}>
                      <div style={{ background:C.bg, padding:2, borderRadius:"50%" }}>
                        <Avatar user={u} size={54} C={C}/>
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:C.text, maxWidth:60, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.username}</div>
                  </div>
                ))}
              </div>

              {/* Posts */}
              <div style={{ paddingTop:4 }}>
                {feedPosts.length === 0 && (
                  <div style={{ textAlign:"center", padding:"60px 20px", color:C.sub }}>
                    <div style={{ fontSize:48, marginBottom:12 }}>🔥</div>
                    <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:6 }}>Your feed is empty</div>
                    <div style={{ fontSize:13, lineHeight:1.5, marginBottom:20 }}>
                      Follow athletes in the Discover tab,{"\n"}or log your first workout to get started
                    </div>
                    <button onClick={() => switchTab("tracker")} style={{
                      background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                      color:"#fff", border:"none", borderRadius:10,
                      padding:"11px 22px", fontSize:13, fontWeight:700,
                      cursor:"pointer", fontFamily:F
                    }}>Start a Workout</button>
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "tracker" && (
          <WorkoutTracker store={store} setStore={setStore} onShareWorkout={handleNewPost} onSaveWorkout={handleSaveWorkout} onSaveProgram={handleSaveProgram} onProgramEdited={handleProgramEdited} onPRHit={setPrModal} C={C}/>
        )}

        {tab === "activity" && (() => {
          markActivitySeen();
          const myPosts = (store.posts||[]).filter(p => p.userId === currentUserId);
          const events = [];
          myPosts.forEach(post => {
            (post.kudos||[]).filter(uid => uid !== currentUserId).forEach(uid => {
              const u = store.users.find(x => x.id === uid);
              if (u) events.push({ type:"kudos", user:u, post, ts: post.createdAt });
            });
            (post.comments||[]).filter(c => c.userId !== currentUserId).forEach(c => {
              const u = store.users.find(x => x.id === c.userId);
              if (u) events.push({ type:"comment", user:u, post, comment:c, ts: c.createdAt });
            });
          });
          events.sort((a,b) => b.ts - a.ts);
          return (
            <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
              <div style={{ padding:"12px 14px 10px", borderBottom:`1px solid ${C.divider}` }}>
                <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Activity</div>
              </div>
              {events.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 20px", color:C.sub }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:6 }}>No activity yet</div>
                  <div style={{ fontSize:13 }}>Kudos and comments on your posts will show here</div>
                </div>
              ) : events.slice(0,50).map((ev, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderBottom:`1px solid ${C.divider}` }}>
                  <Avatar user={ev.user} size={40} C={C} onClick={() => setProfileUserId(ev.user.id)}/>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{ev.user.username} </span>
                    <span style={{ fontSize:13, color:C.text }}>
                      {ev.type === "kudos" ? "liked your post 🔥" : `commented: "${ev.comment?.text}"`}
                    </span>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{timeAgo(ev.ts)}</div>
                  </div>
                  {ev.post.workout && <div style={{ fontSize:11, color:C.sub, flexShrink:0 }}>{ev.post.workout.name}</div>}
                </div>
              ))}
            </div>
          );
        })()}

        {tab === "discover" && (
          <DiscoverScreen store={store} setStore={setStore} currentUserId={currentUserId} onUserClick={setProfileUserId} setTab={setTab} C={C} token={token} onFollow={handleFollow}/>
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
            email={session?.user?.email || ""}
            onSignOut={handleSignOut}
            onFollow={handleFollow}
          />
        )}
            </div>
          </div>
        );
      })()}

      {/* BOTTOM NAV — Instagram: clean SVG icons with filled/outlined states */}
      <div style={{
        background:C.tabBg, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderTop:`1px solid ${C.divider}`,
        paddingBottom:"env(safe-area-inset-bottom)",
        paddingLeft:"env(safe-area-inset-left)",
        paddingRight:"env(safe-area-inset-right)",
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
              onClick={() => switchTab(id)}
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

      {showNewPost && <NewPostModal C={C} onClose={() => setShowNewPost(false)} onPost={handleNewPost} initialKind={newPostKind}/>}
      {editingPost && <EditPostModal C={C} post={editingPost} onSave={handleEditSave} onClose={() => setEditingPost(null)}/>}
      {storyIndex !== null && (() => {
        if (storyIndex === "self") {
          return (
            <StoryViewer
              user={me}
              post={myStoryPost}
              onClose={() => setStoryIndex(null)}
              onNext={storyUsers.length > 0 ? () => setStoryIndex(0) : null}
              onPrev={null}
              hasNext={storyUsers.length > 0}
              hasPrev={false}
              C={C}
            />
          );
        }
        const allStoryEntries = storyUsers.map(u => ({
          user: u,
          post: recentStoryPosts.find(p => p.userId === u.id)
        }));
        const entry = allStoryEntries[storyIndex];
        if (!entry) { setStoryIndex(null); return null; }
        return (
          <StoryViewer
            user={entry.user}
            post={entry.post}
            onClose={() => setStoryIndex(null)}
            onNext={() => setStoryIndex(i => i + 1)}
            onPrev={() => setStoryIndex(i => Math.max(0, i - 1))}
            hasNext={storyIndex < allStoryEntries.length - 1}
            hasPrev={storyIndex > 0}
            onViewProfile={() => { setStoryIndex(null); setProfileUserId(entry.user.id); }}
            C={C}
          />
        );
      })()}
    </div>
  );
}
