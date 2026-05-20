// v1778305358100
// PATCHED v13 - BUILD 2026-05-11 - share filter, edit workout redesign, builder sets/rest/notes
import { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

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
    "Prefer": "return=representation",
  };

  function authHeaders(token) {
    if (!token) return headers;
    return { ...headers, "Authorization": `Bearer ${token}` };
  }

  async function query(path, opts = {}, token = null) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: authHeaders(token),
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || res.statusText);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function rpc(fn, params = {}, token = null) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // Auth helpers
  async function signUp(email, password, username, name) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email, password,
        data: { username, name }
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.msg || "Signup failed");
    return data;
  }

  async function signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.error || data.error_description) throw new Error(data.error_description || data.error || "Sign in failed");
    return data; // { access_token, refresh_token, user }
  }

  async function signOut(token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: authHeaders(token),
    });
  }

  async function refreshToken(refresh_token) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || "Session expired");
    return data;
  }

  // OAuth: start the flow by redirecting to Supabase's authorize endpoint
  function signInWithOAuth(provider) {
    const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
    const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${redirectTo}`;
    window.location.href = url;
  }

  return { query, rpc, signUp, signIn, signOut, refreshToken, signInWithOAuth };
})();

// Upload image to Supabase Storage, return public URL
// Upload image via Edge Function proxy — bypasses iOS Safari CORS/Storage issues
async function uploadImage(base64DataUrl, token, userId) {
  if (!base64DataUrl || !token) return null;
  try {
    const mime = base64DataUrl.match(/data:(.*?);/)?.[1] || "image/jpeg";
    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-image`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ base64: base64DataUrl, mimeType: mime }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("uploadImage edge fn error:", err);
      return null;
    }
    const { url } = await res.json();
    return url || null;
  } catch (e) {
    console.warn("uploadImage failed:", e);
    return null;
  }
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
  // ── CHEST ──────────────────────────────────────────────────────────────────
  { name:"Barbell Bench Press", muscle:"Chest" },
  { name:"Incline Barbell Press", muscle:"Chest" },
  { name:"Decline Barbell Press", muscle:"Chest" },
  { name:"Incline DB Press", muscle:"Chest" },
  { name:"Flat DB Press", muscle:"Chest" },
  { name:"Decline DB Press", muscle:"Chest" },
  { name:"Cable Fly (Low-to-High)", muscle:"Chest" },
  { name:"Cable Fly (High-to-Low)", muscle:"Chest" },
  { name:"Cable Fly (Neutral)", muscle:"Chest" },
  { name:"Pec Deck Machine", muscle:"Chest" },
  { name:"DB Fly", muscle:"Chest" },
  { name:"Incline DB Fly", muscle:"Chest" },
  { name:"Dips", muscle:"Chest" },
  { name:"Weighted Dips", muscle:"Chest" },
  { name:"Push-Ups", muscle:"Chest" },
  { name:"Weighted Push-Ups", muscle:"Chest" },
  { name:"Wide-Grip Push-Ups", muscle:"Chest" },
  { name:"Archer Push-Ups", muscle:"Chest" },
  { name:"DB Pullover", muscle:"Chest" },
  { name:"Machine Chest Press", muscle:"Chest" },
  { name:"Smith Machine Bench Press", muscle:"Chest" },
  { name:"Smith Machine Incline Press", muscle:"Chest" },
  { name:"Landmine Press", muscle:"Chest" },
  { name:"Svend Press", muscle:"Chest" },
  // ── BACK ───────────────────────────────────────────────────────────────────
  { name:"Barbell Row", muscle:"Back" },
  { name:"Pendlay Row", muscle:"Back" },
  { name:"T-Bar Row", muscle:"Back" },
  { name:"T-Bar Row (Landmine)", muscle:"Back" },
  { name:"Seated Cable Row (Wide)", muscle:"Back" },
  { name:"Seated Cable Row (Narrow)", muscle:"Back" },
  { name:"Single-Arm DB Row", muscle:"Back" },
  { name:"Single-Arm Cable Row", muscle:"Back" },
  { name:"Chest-Supported Row", muscle:"Back" },
  { name:"Chest-Supported DB Row", muscle:"Back" },
  { name:"Incline DB Row", muscle:"Back" },
  { name:"Pull-Ups", muscle:"Back" },
  { name:"Weighted Pull-Ups", muscle:"Back" },
  { name:"Chin-Ups", muscle:"Back" },
  { name:"Neutral-Grip Pull-Ups", muscle:"Back" },
  { name:"Lat Pulldown (Wide)", muscle:"Back" },
  { name:"Lat Pulldown (Underhand)", muscle:"Back" },
  { name:"Lat Pulldown (Neutral)", muscle:"Back" },
  { name:"Single-Arm Lat Pulldown", muscle:"Back" },
  { name:"Straight-Arm Pulldown", muscle:"Back" },
  { name:"Iso-Lateral Row (Machine)", muscle:"Back" },
  { name:"Hammer Strength Row", muscle:"Back" },
  { name:"Meadows Row", muscle:"Back" },
  { name:"Rack Pull", muscle:"Back" },
  { name:"Inverted Row", muscle:"Back" },
  { name:"Cable Pullover", muscle:"Back" },
  // ── REAR DELTS ─────────────────────────────────────────────────────────────
  { name:"Face Pulls", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (Cable)", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (DB)", muscle:"Rear Delts" },
  { name:"Rear Delt Fly (Machine)", muscle:"Rear Delts" },
  { name:"Band Pull-Apart", muscle:"Rear Delts" },
  { name:"Prone Y-Raise", muscle:"Rear Delts" },
  // ── SHOULDERS ──────────────────────────────────────────────────────────────
  { name:"Overhead Press (Barbell)", muscle:"Shoulders" },
  { name:"Seated OHP (Barbell)", muscle:"Shoulders" },
  { name:"Seated DB Shoulder Press", muscle:"Shoulders" },
  { name:"Standing DB Shoulder Press", muscle:"Shoulders" },
  { name:"Arnold Press", muscle:"Shoulders" },
  { name:"Lateral Raises (DB)", muscle:"Shoulders" },
  { name:"Lateral Raises (Cable)", muscle:"Shoulders" },
  { name:"Lateral Raises (Machine)", muscle:"Shoulders" },
  { name:"Seated Lateral Raises", muscle:"Shoulders" },
  { name:"Front Raises (DB)", muscle:"Shoulders" },
  { name:"Front Raises (Plate)", muscle:"Shoulders" },
  { name:"Front Raises (Cable)", muscle:"Shoulders" },
  { name:"Upright Row", muscle:"Shoulders" },
  { name:"Machine Shoulder Press", muscle:"Shoulders" },
  { name:"Smith Machine OHP", muscle:"Shoulders" },
  { name:"Push Press", muscle:"Shoulders" },
  { name:"Bradford Press", muscle:"Shoulders" },
  { name:"Lu Raises", muscle:"Shoulders" },
  // ── TRAPS ──────────────────────────────────────────────────────────────────
  { name:"Barbell Shrugs", muscle:"Traps" },
  { name:"DB Shrugs", muscle:"Traps" },
  { name:"Cable Shrugs", muscle:"Traps" },
  { name:"Behind-the-Back Shrugs", muscle:"Traps" },
  { name:"Rack Pull (Traps focus)", muscle:"Traps" },
  { name:"Farmer's Walk", muscle:"Traps" },
  // ── BICEPS ─────────────────────────────────────────────────────────────────
  { name:"Barbell Curl", muscle:"Biceps" },
  { name:"EZ Bar Curl", muscle:"Biceps" },
  { name:"Dumbbell Curl", muscle:"Biceps" },
  { name:"Alternating DB Curl", muscle:"Biceps" },
  { name:"Incline DB Curl", muscle:"Biceps" },
  { name:"Hammer Curl", muscle:"Biceps" },
  { name:"Cross-Body Hammer Curl", muscle:"Biceps" },
  { name:"Preacher Curl (EZ Bar)", muscle:"Biceps" },
  { name:"Preacher Curl (DB)", muscle:"Biceps" },
  { name:"Cable Curl (Single Arm)", muscle:"Biceps" },
  { name:"Cable Curl (Both Arms)", muscle:"Biceps" },
  { name:"Concentration Curl", muscle:"Biceps" },
  { name:"Reverse Curl", muscle:"Biceps" },
  { name:"Spider Curl", muscle:"Biceps" },
  { name:"Drag Curl", muscle:"Biceps" },
  { name:"21s (Barbell Curl)", muscle:"Biceps" },
  { name:"Machine Curl", muscle:"Biceps" },
  // ── TRICEPS ────────────────────────────────────────────────────────────────
  { name:"Skull Crushers (EZ Bar)", muscle:"Triceps" },
  { name:"Skull Crushers (DB)", muscle:"Triceps" },
  { name:"Skull Crushers (Cable)", muscle:"Triceps" },
  { name:"Tricep Rope Pushdown", muscle:"Triceps" },
  { name:"Tricep Bar Pushdown", muscle:"Triceps" },
  { name:"Tricep Straight Bar Pushdown", muscle:"Triceps" },
  { name:"Single-Arm Tricep Pushdown", muscle:"Triceps" },
  { name:"Overhead Tricep Extension (DB)", muscle:"Triceps" },
  { name:"Overhead Tricep Extension (Cable)", muscle:"Triceps" },
  { name:"Overhead Tricep Extension (EZ Bar)", muscle:"Triceps" },
  { name:"Close-Grip Bench Press", muscle:"Triceps" },
  { name:"Tricep Dips", muscle:"Triceps" },
  { name:"Diamond Push-Ups", muscle:"Triceps" },
  { name:"JM Press", muscle:"Triceps" },
  { name:"Tate Press", muscle:"Triceps" },
  { name:"Machine Tricep Extension", muscle:"Triceps" },
  // ── QUADS ──────────────────────────────────────────────────────────────────
  { name:"Barbell Back Squat", muscle:"Quads" },
  { name:"Low Bar Squat", muscle:"Quads" },
  { name:"High Bar Squat", muscle:"Quads" },
  { name:"Front Squat", muscle:"Quads" },
  { name:"Leg Press", muscle:"Quads" },
  { name:"Leg Press (Single Leg)", muscle:"Quads" },
  { name:"Hack Squat", muscle:"Quads" },
  { name:"Bulgarian Split Squat", muscle:"Quads" },
  { name:"Walking Lunges", muscle:"Quads" },
  { name:"Reverse Lunges", muscle:"Quads" },
  { name:"Lateral Lunges", muscle:"Quads" },
  { name:"Leg Extension", muscle:"Quads" },
  { name:"Leg Extension (Single)", muscle:"Quads" },
  { name:"Step-Ups", muscle:"Quads" },
  { name:"Goblet Squat", muscle:"Quads" },
  { name:"Smith Machine Squat", muscle:"Quads" },
  { name:"Sissy Squat", muscle:"Quads" },
  { name:"Cyclist Squat", muscle:"Quads" },
  // ── HAMSTRINGS ─────────────────────────────────────────────────────────────
  { name:"Deadlift", muscle:"Hamstrings" },
  { name:"Sumo Deadlift", muscle:"Hamstrings" },
  { name:"Romanian Deadlift", muscle:"Hamstrings" },
  { name:"Stiff-Leg Deadlift", muscle:"Hamstrings" },
  { name:"Single-Leg RDL", muscle:"Hamstrings" },
  { name:"Lying Leg Curl", muscle:"Hamstrings" },
  { name:"Seated Leg Curl", muscle:"Hamstrings" },
  { name:"Standing Leg Curl", muscle:"Hamstrings" },
  { name:"Nordic Curl", muscle:"Hamstrings" },
  { name:"Good Morning", muscle:"Hamstrings" },
  { name:"Glute Ham Raise", muscle:"Hamstrings" },
  // ── GLUTES ─────────────────────────────────────────────────────────────────
  { name:"Hip Thrust (Barbell)", muscle:"Glutes" },
  { name:"Hip Thrust (Machine)", muscle:"Glutes" },
  { name:"Hip Thrust (DB)", muscle:"Glutes" },
  { name:"Single-Leg Hip Thrust", muscle:"Glutes" },
  { name:"Glute Kickback (Cable)", muscle:"Glutes" },
  { name:"Glute Kickback (Machine)", muscle:"Glutes" },
  { name:"Abduction Machine", muscle:"Glutes" },
  { name:"Cable Abduction", muscle:"Glutes" },
  { name:"Donkey Kicks", muscle:"Glutes" },
  { name:"Frog Pumps", muscle:"Glutes" },
  { name:"Clamshells", muscle:"Glutes" },
  { name:"45° Back Extension", muscle:"Glutes" },
  // ── CALVES ─────────────────────────────────────────────────────────────────
  { name:"Standing Calf Raise", muscle:"Calves" },
  { name:"Seated Calf Raise", muscle:"Calves" },
  { name:"Leg Press Calf Raise", muscle:"Calves" },
  { name:"Single-Leg Calf Raise", muscle:"Calves" },
  { name:"Smith Machine Calf Raise", muscle:"Calves" },
  { name:"Donkey Calf Raise", muscle:"Calves" },
  { name:"Tibialis Raise", muscle:"Calves" },
  // ── CORE ───────────────────────────────────────────────────────────────────
  { name:"Plank", muscle:"Core" },
  { name:"Side Plank", muscle:"Core" },
  { name:"Cable Crunch", muscle:"Core" },
  { name:"Hanging Leg Raise", muscle:"Core" },
  { name:"Hanging Knee Raise", muscle:"Core" },
  { name:"Ab Wheel Rollout", muscle:"Core" },
  { name:"Decline Crunch", muscle:"Core" },
  { name:"Decline Sit-Up", muscle:"Core" },
  { name:"Russian Twist", muscle:"Core" },
  { name:"Landmine Rotation", muscle:"Core" },
  { name:"Cable Woodchop", muscle:"Core" },
  { name:"Pallof Press", muscle:"Core" },
  { name:"Dragon Flag", muscle:"Core" },
  { name:"Toes-to-Bar", muscle:"Core" },
  { name:"Reverse Crunch", muscle:"Core" },
  { name:"V-Up", muscle:"Core" },
  { name:"Hollow Body Hold", muscle:"Core" },
  { name:"Dead Bug", muscle:"Core" },
  // ── FOREARMS ───────────────────────────────────────────────────────────────
  { name:"Wrist Curl", muscle:"Forearms" },
  { name:"Reverse Wrist Curl", muscle:"Forearms" },
  { name:"Wrist Roller", muscle:"Forearms" },
  { name:"Plate Pinch", muscle:"Forearms" },
  { name:"Farmers Carry", muscle:"Forearms" },
  { name:"Gripper", muscle:"Forearms" },
  // ── NECK ───────────────────────────────────────────────────────────────────
  { name:"Neck Extension", muscle:"Neck" },
  { name:"Neck Flexion", muscle:"Neck" },
  { name:"Neck Lateral Flexion", muscle:"Neck" },
  { name:"Neck Harness", muscle:"Neck" },
  // ── FULL BODY / COMPOUND ───────────────────────────────────────────────────
  { name:"Power Clean", muscle:"Full Body" },
  { name:"Hang Clean", muscle:"Full Body" },
  { name:"Clean and Jerk", muscle:"Full Body" },
  { name:"Snatch", muscle:"Full Body" },
  { name:"Hang Snatch", muscle:"Full Body" },
  { name:"Kettlebell Swing", muscle:"Full Body" },
  { name:"Kettlebell Clean", muscle:"Full Body" },
  { name:"Kettlebell Snatch", muscle:"Full Body" },
  { name:"Trap Bar Deadlift", muscle:"Full Body" },
  { name:"Sled Push", muscle:"Full Body" },
  { name:"Sled Pull", muscle:"Full Body" },
  { name:"Battle Ropes", muscle:"Full Body" },
  { name:"Tire Flip", muscle:"Full Body" },
  { name:"Box Jump", muscle:"Full Body" },
  { name:"Broad Jump", muscle:"Full Body" },
  { name:"Thruster", muscle:"Full Body" },
  { name:"Wall Ball", muscle:"Full Body" },
  { name:"Bear Complex", muscle:"Full Body" },
  // ── CARDIO / CONDITIONING ──────────────────────────────────────────────────
  { name:"Treadmill Run", muscle:"Cardio" },
  { name:"Stationary Bike", muscle:"Cardio" },
  { name:"Rowing Machine", muscle:"Cardio" },
  { name:"Stair Master", muscle:"Cardio" },
  { name:"Elliptical", muscle:"Cardio" },
  { name:"Jump Rope", muscle:"Cardio" },
  { name:"Assault Bike", muscle:"Cardio" },
  { name:"Ski Erg", muscle:"Cardio" },
  { name:"Incline Walk", muscle:"Cardio" },
];


// ═════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Instagram-inspired: minimal, whitespace-forward
// ═════════════════════════════════════════════════════════════════════════════
const THEMES = {
  dark: {
    bg: "#0a0a0c",
    surface: "#141416",
    card: "#141416",
    border: "#2a2a2e",
    divider: "#1c1c1f",
    accent: "#8b5cf6",
    accentSoft: "rgba(139,92,246,0.14)",
    accent2: "#7c3aed",
    orange: "#f97316",
    green: "#34d399",
    gold: "#facc15",
    red: "#f87171",
    text: "#f5f5f7",
    textDim: "#d4d4d8",
    sub: "#a1a1aa",
    muted: "#71717a",
    tabBg: "rgba(10,10,12,0.95)",
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

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif";
const MONO = "'JetBrains Mono','SF Mono',Menlo,monospace";

// ─── Premium icon system — line icons, single accent ──────────────────────────
function Icon({ name, size = 20, color = "currentColor", strokeWidth = 2 }) {
  const props = { width:size, height:size, viewBox:"0 0 24 24", fill:"none", stroke:color, strokeWidth, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "flame": return <svg {...props}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1 2.5-2.5 0-2-2.5-3-2.5-5 0-2.5 2.5-3 2.5-3s1 4.5 4 6.5c2 1.5 3 3 3 5a7 7 0 1 1-14 0c0-2.5 2-4 3-5.5"/></svg>;
    case "dumbbell": return <svg {...props}><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>;
    case "trophy": return <svg {...props}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
    case "timer": return <svg {...props}><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/></svg>;
    case "users": return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "user": return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "share": return <svg {...props}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>;
    case "check": return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case "x": return <svg {...props}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case "chevron-right": return <svg {...props}><polyline points="9 18 15 12 9 6"/></svg>;
    case "chevron-left": return <svg {...props}><polyline points="15 18 9 12 15 6"/></svg>;
    case "plus": return <svg {...props}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>;
    case "trending-up": return <svg {...props}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
    case "zap": return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case "activity": return <svg {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "calendar": return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "clock": return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "barbell": return <svg {...props}><line x1="4" y1="12" x2="20" y2="12"/><rect x="1" y="9" width="3" height="6" rx="1"/><rect x="20" y="9" width="3" height="6" rx="1"/><rect x="5" y="7" width="2" height="10" rx="1"/><rect x="17" y="7" width="2" height="10" rx="1"/></svg>;
    case "package": return <svg {...props}><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case "edit": return <svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case "trash": return <svg {...props}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
    case "spark": return <svg {...props}><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>;
    default: return null;
  }
}

// ─── Muscle group icon (replaces emoji) ──────────────────────────────────────
// Anatomical SVG icons — stylized body silhouettes with the target muscle highlighted
function MuscleIcon({ muscle = "", size = 28, C }) {
  const m = (muscle || "").toLowerCase().split("/")[0].trim();
  const colors = {
    chest:"#ef4444", back:"#3b82f6", shoulders:"#8b5cf6", biceps:"#f59e0b",
    triceps:"#f97316", quads:"#10b981", hamstrings:"#14b8a6", glutes:"#ec4899",
    calves:"#06b6d4", core:"#84cc16", abs:"#84cc16", traps:"#6366f1", forearms:"#eab308",
    "full body":"#2563eb", "rear delts":"#8b5cf6", "shoulders/traps":"#8b5cf6",
    "chest/tris":"#ef4444", "quads/glutes":"#10b981",
  };
  const color = colors[m] || C?.accent || "#2563eb";
  const isDark = C?.bg === "#0a0a0c";
  const bodyFill = isDark ? "#2a2a2e" : "#e8ecf0";
  const bodyStroke = isDark ? "#3a3a3e" : "#cbd5e1";

  // Front-view body for chest, abs, arms, quads, etc.
  // Back-view body for back, hamstrings, glutes, calves, traps
  const isBackView = ["back","hamstrings","glutes","calves","traps","rear delts"].includes(m);

  return (
    <div style={{
      width:size, height:size, borderRadius:Math.round(size*0.28),
      background: isDark ? "#161618" : "#f8fafc",
      display:"flex", alignItems:"center", justifyContent:"center",
      flexShrink:0, border:`1px solid ${isDark ? "#252528" : "#e8ecf0"}`,
      overflow:"hidden",
    }}>
      <svg width={size*0.85} height={size*0.85} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Body silhouette */}
        {isBackView ? (
          <BodyBack baseFill={bodyFill} stroke={bodyStroke}/>
        ) : (
          <BodyFront baseFill={bodyFill} stroke={bodyStroke}/>
        )}
        {/* Highlighted muscle overlay */}
        <MuscleOverlay muscle={m} color={color}/>
      </svg>
    </div>
  );
}

function BodyFront({ baseFill, stroke }) {
  return (
    <g fill={baseFill} stroke={stroke} strokeWidth="0.7" strokeLinejoin="round">
      {/* Head */}
      <ellipse cx="24" cy="8.5" rx="3.6" ry="4.2"/>
      {/* Neck */}
      <rect x="22.5" y="12" width="3" height="2" rx="0.5"/>
      {/* Torso/shoulders */}
      <path d="M14 16 Q14 14 16 13.5 L21.5 13 L26.5 13 L32 13.5 Q34 14 34 16 L33 28 Q32 30 30 30 L18 30 Q16 30 15 28 Z"/>
      {/* Arms upper */}
      <path d="M14 16 Q12 17 11.5 19 L10.5 25 Q10.3 27 11 28 L13 28.3 Q14 28 14 26 Z"/>
      <path d="M34 16 Q36 17 36.5 19 L37.5 25 Q37.7 27 37 28 L35 28.3 Q34 28 34 26 Z"/>
      {/* Forearms */}
      <path d="M11 28 L10 35 Q10 36.5 11 36.7 L13 36.7 Q14 36.5 14 35.3 L13.5 28.3 Z"/>
      <path d="M37 28 L38 35 Q38 36.5 37 36.7 L35 36.7 Q34 36.5 34 35.3 L34.5 28.3 Z"/>
      {/* Waist/hips */}
      <path d="M16 30 L17 35 L18 38 L23 38 L25 38 L30 38 L31 35 L32 30 Z"/>
      {/* Quads */}
      <path d="M17 38 L16 46 L21 46 L22.5 38 Z"/>
      <path d="M31 38 L32 46 L27 46 L25.5 38 Z"/>
    </g>
  );
}

function BodyBack({ baseFill, stroke }) {
  return (
    <g fill={baseFill} stroke={stroke} strokeWidth="0.7" strokeLinejoin="round">
      {/* Head */}
      <ellipse cx="24" cy="8.5" rx="3.6" ry="4.2"/>
      {/* Neck */}
      <rect x="22.5" y="12" width="3" height="2" rx="0.5"/>
      {/* Back/shoulders */}
      <path d="M14 16 Q14 14 16 13.5 L21.5 13 L26.5 13 L32 13.5 Q34 14 34 16 L33 28 Q32 30 30 30 L18 30 Q16 30 15 28 Z"/>
      {/* Arms upper */}
      <path d="M14 16 Q12 17 11.5 19 L10.5 25 Q10.3 27 11 28 L13 28.3 Q14 28 14 26 Z"/>
      <path d="M34 16 Q36 17 36.5 19 L37.5 25 Q37.7 27 37 28 L35 28.3 Q34 28 34 26 Z"/>
      {/* Forearms */}
      <path d="M11 28 L10 35 Q10 36.5 11 36.7 L13 36.7 Q14 36.5 14 35.3 L13.5 28.3 Z"/>
      <path d="M37 28 L38 35 Q38 36.5 37 36.7 L35 36.7 Q34 36.5 34 35.3 L34.5 28.3 Z"/>
      {/* Hips */}
      <path d="M16 30 L17 35 L18 38 L23 38 L25 38 L30 38 L31 35 L32 30 Z"/>
      {/* Hamstrings/glutes area */}
      <path d="M17 38 L16 46 L21 46 L22.5 38 Z"/>
      <path d="M31 38 L32 46 L27 46 L25.5 38 Z"/>
    </g>
  );
}

function MuscleOverlay({ muscle, color }) {
  const m = muscle;
  // Each overlay is a colored path that sits ON TOP of the base body
  if (m === "chest" || m === "chest/tris") {
    return (
      <g fill={color} opacity="0.92">
        <path d="M16.5 14.5 Q17 17.5 19 20 Q21 22 23.5 22 L24.5 22 Q27 22 29 20 Q31 17.5 31.5 14.5 Q28 14 24 14 Q20 14 16.5 14.5 Z"/>
      </g>
    );
  }
  if (m === "back") {
    return (
      <g fill={color} opacity="0.92">
        {/* Lats */}
        <path d="M15.5 16 L14.5 25 Q15 27 17 28 L20 27 L20 18 Q18 16.5 15.5 16 Z"/>
        <path d="M32.5 16 L33.5 25 Q33 27 31 28 L28 27 L28 18 Q30 16.5 32.5 16 Z"/>
        {/* Mid back */}
        <path d="M20 17 L20 27 L28 27 L28 17 Z" opacity="0.7"/>
      </g>
    );
  }
  if (m === "shoulders" || m === "shoulders/traps" || m === "rear delts") {
    return (
      <g fill={color} opacity="0.92">
        <ellipse cx="14.5" cy="17" rx="3.2" ry="2.5"/>
        <ellipse cx="33.5" cy="17" rx="3.2" ry="2.5"/>
      </g>
    );
  }
  if (m === "biceps") {
    return (
      <g fill={color} opacity="0.92">
        <ellipse cx="12" cy="22.5" rx="2" ry="3.5"/>
        <ellipse cx="36" cy="22.5" rx="2" ry="3.5"/>
      </g>
    );
  }
  if (m === "triceps") {
    return (
      <g fill={color} opacity="0.92">
        <ellipse cx="11.5" cy="24" rx="1.8" ry="3.5"/>
        <ellipse cx="36.5" cy="24" rx="1.8" ry="3.5"/>
      </g>
    );
  }
  if (m === "forearms") {
    return (
      <g fill={color} opacity="0.92">
        <path d="M11 28 L10 35 Q10 36.5 11 36.7 L13 36.7 Q14 36.5 14 35.3 L13.5 28.3 Z"/>
        <path d="M37 28 L38 35 Q38 36.5 37 36.7 L35 36.7 Q34 36.5 34 35.3 L34.5 28.3 Z"/>
      </g>
    );
  }
  if (m === "core" || m === "abs") {
    return (
      <g fill={color} opacity="0.92">
        {/* Six pack blocks */}
        <rect x="21.5" y="22" width="5" height="3" rx="0.6"/>
        <rect x="21.5" y="25.5" width="5" height="3" rx="0.6"/>
        <rect x="21" y="29" width="6" height="3" rx="0.6"/>
      </g>
    );
  }
  if (m === "quads") {
    return (
      <g fill={color} opacity="0.92">
        <path d="M17 38 L16 46 L21 46 L22.5 38 Z"/>
        <path d="M31 38 L32 46 L27 46 L25.5 38 Z"/>
      </g>
    );
  }
  if (m === "hamstrings" || m === "quads/glutes") {
    return (
      <g fill={color} opacity="0.92">
        <path d="M17.5 39 L16.5 45 L21 45 L22 39 Z"/>
        <path d="M30.5 39 L31.5 45 L27 45 L26 39 Z"/>
      </g>
    );
  }
  if (m === "glutes") {
    return (
      <g fill={color} opacity="0.92">
        <ellipse cx="20.5" cy="34" rx="3.5" ry="3"/>
        <ellipse cx="27.5" cy="34" rx="3.5" ry="3"/>
      </g>
    );
  }
  if (m === "calves") {
    return (
      <g fill={color} opacity="0.92">
        {/* Approximate calves at bottom of body */}
        <ellipse cx="19" cy="44" rx="2" ry="2"/>
        <ellipse cx="29" cy="44" rx="2" ry="2"/>
      </g>
    );
  }
  if (m === "traps") {
    return (
      <g fill={color} opacity="0.92">
        {/* Upper traps - between shoulders and neck */}
        <path d="M19 13.5 Q22 13 24 13 Q26 13 29 13.5 L28 16 Q26 15.5 24 15.5 Q22 15.5 20 16 Z"/>
      </g>
    );
  }
  if (m === "full body") {
    // Highlight the whole figure subtly
    return (
      <g fill={color} opacity="0.35">
        <path d="M14 16 Q14 14 16 13.5 L21.5 13 L26.5 13 L32 13.5 Q34 14 34 16 L33 28 Q32 30 30 30 L18 30 Q16 30 15 28 Z"/>
        <path d="M16 30 L17 35 L18 38 L23 38 L25 38 L30 38 L31 35 L32 30 Z"/>
        <path d="M17 38 L16 46 L21 46 L22.5 38 Z"/>
        <path d="M31 38 L32 46 L27 46 L25.5 38 Z"/>
      </g>
    );
  }
  return null;
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

// Generate a friendly shareable code like "IGNITE-X9K2"
// Excludes ambiguous chars: 0, O, 1, I, L
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateShareCode(prefix = "IGNITE") {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `${prefix}-${suffix}`;
}
function normalizeShareCode(input) {
  if (!input) return "";
  return String(input).toUpperCase().replace(/[^A-Z0-9-]/g, "").trim();
}
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

// Reusable plate-per-side calculator
// Returns array of { p, count } or null if unachievable
const BARBELL_BAR_LBS = 45;
const BARBELL_BAR_KG = 20;
const PLATES_LBS_LIST = [45, 35, 25, 10, 5, 2.5];
const PLATES_KG_LIST = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATE_COLOR_MAP = { 45:"#ef4444", 35:"#3b82f6", 25:"#22c55e", 10:"#f59e0b", 5:"#8b5cf6", 2.5:"#ec4899", 20:"#3b82f6", 15:"#22c55e", 1.25:"#ec4899" };
function calcPlatesPerSide(totalWeight, unit) {
  const t = parseFloat(totalWeight);
  const bar = unit === "kg" ? BARBELL_BAR_KG : BARBELL_BAR_LBS;
  if (!t || t <= bar) return null;
  let remaining = (t - bar) / 2;
  const plates = unit === "kg" ? PLATES_KG_LIST : PLATES_LBS_LIST;
  const result = [];
  for (const p of plates) {
    const count = Math.floor(remaining / p);
    if (count > 0) {
      result.push({ p, count });
      remaining = Math.round((remaining - p * count) * 1000) / 1000;
    }
  }
  if (remaining > 0.01) return null;
  return result;
}
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

// Get ISO week boundary (Mon 00:00 local) for a given date
function weekStart(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const offset = day === 0 ? 6 : day - 1; // distance back to Monday
  date.setDate(date.getDate() - offset);
  return date;
}
function weekKey(d) {
  const w = weekStart(d);
  return `${w.getFullYear()}-W${String(Math.floor((w.getTime() - new Date(w.getFullYear(), 0, 1).getTime()) / 604800000) + 1).padStart(2, "0")}`;
}

// Streak v2 — "active week" model.
// User has a weekly workout target (default 3). Each week they hit the target counts as "active".
// Streak is # of consecutive active weeks ending in the current or previous week.
// Returns: { count, target, thisWeek, weeksActive, status } where status is "active" | "at-risk" | "lost"
function calcWeeklyStreak(workoutDates, target = 3) {
  const keys = Object.keys(workoutDates || {});
  if (!keys.length) return { count: 0, target, thisWeek: 0, status: "lost" };

  // Group workouts by week key
  const byWeek = {};
  for (const dk of keys) {
    const wk = weekKey(new Date(dk));
    byWeek[wk] = (byWeek[wk] || 0) + 1;
  }

  // Start from the most recent week we have activity in, walk backward
  const now = new Date();
  const thisWeekKey = weekKey(now);
  const thisWeekCount = byWeek[thisWeekKey] || 0;

  // Determine streak: count consecutive active weeks ending in this week OR last week
  // (this week not counted as failure until the week is over)
  let streak = 0;
  let cursor = new Date(now);
  let countingThisWeek = thisWeekCount >= target;

  // Move cursor to start of this week, then iterate weeks
  cursor = weekStart(cursor);
  // Skip this week if it's not yet "made" — only count if hit target OR allow grace
  if (!countingThisWeek) {
    // Don't count this week toward streak yet, but don't break it either — start from last week
    cursor.setDate(cursor.getDate() - 7);
  }

  for (let i = 0; i < 104; i++) { // up to 2 years
    const wk = weekKey(cursor);
    const count = byWeek[wk] || 0;
    if (count >= target) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
  }

  // Status: active if hit this week, at-risk if last week was active but this week isn't yet
  let status = "lost";
  if (countingThisWeek) status = "active";
  else if (streak > 0) status = "at-risk"; // had a streak going, this week not yet made

  return { count: streak, target, thisWeek: thisWeekCount, status };
}

// Legacy daily-streak helper — kept for components that haven't migrated yet
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

// Get the most recent COMPLETED session for an exercise (across all sets)
function getLastExerciseSession(store, exName) {
  const dates = Object.keys(store.history||{}).sort().reverse();
  for (const d of dates) {
    const sessions = Object.values(store.history[d]||{});
    for (const sess of sessions) {
      const ex = sess.exercises?.find(e => e.name === exName);
      if (!ex) continue;
      const doneSets = (ex.sets||[]).filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0));
      if (doneSets.length > 0) {
        return {
          date: d,
          unit: sess.unit || "lbs",
          sets: doneSets.map(s => ({ w: parseFloat(s.weight)||0, r: parseFloat(s.reps)||0 })),
          daysSince: Math.floor((Date.now() - new Date(d).getTime()) / 86400000),
        };
      }
    }
  }
  return null;
}

// Parse rep range like "8-12" or "8–12" or "5,3,1" or "8" → { low, high }
function parseRepRange(reps) {
  if (!reps) return null;
  const s = String(reps).replace(/\s/g,"");
  // Range with dash or en-dash
  const m = s.match(/^(\d+)[–-](\d+)$/);
  if (m) return { low: parseInt(m[1]), high: parseInt(m[2]) };
  // Single number
  const n = parseInt(s);
  if (!isNaN(n) && /^\d+$/.test(s)) return { low: n, high: n };
  return null;
}

// Progressive overload — double progression model
// Returns { type, weight, reps, note, deltaWeight, deltaReps, reason }
function suggestNextSet(store, exName, repsTarget, unit, setIndex = 0) {
  const last = getLastExerciseSession(store, exName);
  if (!last) return null;

  const range = parseRepRange(repsTarget);
  const lastInUserUnit = last.sets.map(s => ({ w: cvt(s.w, last.unit, unit), r: s.r }));
  const setMatch = lastInUserUnit[setIndex] || lastInUserUnit[lastInUserUnit.length - 1];
  if (!setMatch || !setMatch.w) return null;

  const lastWeight = setMatch.w;
  const lastReps = setMatch.r;
  const inc = unit === "lbs" ? 5 : 2.5;

  // Deload if it's been 14+ days
  if (last.daysSince >= 14) {
    const dl = unit === "lbs" ? Math.round((lastWeight * 0.9) / 5) * 5 : Math.round((lastWeight * 0.9) / 2.5) * 2.5;
    return {
      type: "deload",
      weight: dl,
      reps: range ? range.low : lastReps,
      note: "Deload (off " + last.daysSince + "d)",
      deltaWeight: dl - lastWeight,
      reason: "Back after a break — start lighter",
    };
  }

  // Double progression
  if (range) {
    const allHitTop = lastInUserUnit.every(s => s.r >= range.high);
    if (allHitTop) {
      return {
        type: "weight",
        weight: lastWeight + inc,
        reps: range.low,
        note: `+${inc} ${unit}`,
        deltaWeight: inc,
        reason: `Hit ${range.high} on all sets — add ${inc} ${unit}`,
      };
    } else {
      // Same weight, push for more reps
      const target = Math.min(range.high, Math.max(lastReps + 1, range.low));
      return {
        type: "reps",
        weight: lastWeight,
        reps: target,
        note: `same weight`,
        deltaReps: target - lastReps,
        reason: target > lastReps ? `Push for ${target} reps` : `Match last session`,
      };
    }
  }

  // No range: simple bump on +2 reps
  if (lastReps >= 10) {
    return {
      type: "weight",
      weight: lastWeight + inc,
      reps: Math.max(lastReps - 2, 5),
      note: `+${inc} ${unit}`,
      deltaWeight: inc,
      reason: `Strong last time — add ${inc} ${unit}`,
    };
  }
  return {
    type: "match",
    weight: lastWeight,
    reps: lastReps + 1,
    note: `+1 rep`,
    deltaReps: 1,
    reason: `Push for one more rep`,
  };
}

// Haptic helpers - tiered patterns
function haptic(kind) {
  try {
    if (!navigator.vibrate) return;
    switch (kind) {
      case "tap":      navigator.vibrate(10); break;
      case "light":    navigator.vibrate(15); break;
      case "medium":   navigator.vibrate(25); break;
      case "complete": navigator.vibrate(30); break;
      case "undo":     navigator.vibrate(12); break;
      case "delete":   navigator.vibrate([30, 30, 30]); break;
      case "pr":       navigator.vibrate([20, 40, 20, 40, 80]); break;
      case "lock":     navigator.vibrate(8); break;
      case "warn":     navigator.vibrate([30, 60, 30]); break;
      default:         navigator.vibrate(15);
    }
  } catch {}
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
    if (r) {
      const d = JSON.parse(r);
      return { ...d, posts: [] }; // never load cached posts — always fetch fresh from DB
    }
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
    historyInteractions: {},
    workoutDates: {},
    weeklyTarget: 3, // default: 3 workouts/week for streak system
    seenOnboarding: true,
  };
}
function saveStore(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} }

// ═════════════════════════════════════════════════════════════════════════════
// LOGO — Fyra flame icon + Spotr wordmark
// ═════════════════════════════════════════════════════════════════════════════
function SeshdLogo({ C, big = false }) {
  const sz = big ? 44 : 30;
  return (
    <div style={{ display:"flex", alignItems:"center", gap: big ? 10 : 7 }}>
      <img src="/icon-192.png" width={sz} height={sz} style={{ borderRadius: sz * 0.22, objectFit:"cover" }} alt="Seshd"/>
      <span style={{ fontSize:big?26:17, fontWeight:800, letterSpacing:-0.5, color:C.text, lineHeight:1, fontFamily:F }}>Seshd</span>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// AVATAR
// ═════════════════════════════════════════════════════════════════════════════
function Avatar({ user, size = 36, onClick, C, ring = false }) {
  const imgSrc = user?.avatarUrl || user?.profileImage;
  const content = imgSrc
    ? <img src={imgSrc} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }}/>
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
// PullToRefresh — wraps a scrollable area and triggers `onRefresh` when user
// pulls past the threshold while at the top. iOS-style spring animation.
function PullToRefresh({ onRefresh, C, children }) {
  const [pull, setPull] = useState(0); // current pull distance in pixels
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef(null);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const THRESHOLD = 70;
  const MAX_PULL = 120;

  function onTouchStart(e) {
    if (refreshing) return;
    const el = scrollRef.current;
    if (!el) return;
    // Only initiate pull when at the very top of the scrollable
    if (el.scrollTop > 1) return;
    startYRef.current = e.touches[0].clientY;
    trackingRef.current = true;
  }
  function onTouchMove(e) {
    if (!trackingRef.current || refreshing) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // Damped pull — gets harder as user pulls further
    const damped = Math.min(MAX_PULL, dy * 0.55);
    setPull(damped);
  }
  async function onTouchEnd() {
    if (!trackingRef.current) return;
    trackingRef.current = false;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      haptic("medium");
      try { await onRefresh?.(); } catch {}
      setRefreshing(false);
    }
    setPull(0);
  }

  const visiblePull = refreshing ? THRESHOLD : pull;
  const progress = Math.min(1, visiblePull / THRESHOLD);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { trackingRef.current = false; setPull(0); }}
      style={{ overflow:"hidden", flex:1, display:"flex", flexDirection:"column", position:"relative" }}
    >
      {/* Spinner indicator above the content */}
      <div style={{
        position:"absolute", top:-30, left:0, right:0,
        display:"flex", justifyContent:"center", alignItems:"center",
        height:60,
        transform:`translateY(${visiblePull}px)`,
        transition: trackingRef.current ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        pointerEvents:"none",
        zIndex:1,
      }}>
        <div style={{
          width:28, height:28,
          border:`2.5px solid ${C.divider}`,
          borderTopColor:C.accent,
          borderRadius:"50%",
          transform:`rotate(${progress * 360}deg)`,
          animation: refreshing ? "ptr-spin 0.8s linear infinite" : "none",
          opacity: progress,
        }}/>
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
      {/* Scrollable content — translated downward when pulling */}
      <div
        ref={scrollRef}
        style={{
          flex:1,
          overflowY:"auto",
          transform:`translateY(${visiblePull}px)`,
          transition: trackingRef.current ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          WebkitOverflowScrolling:"touch",
          // Prevent iOS native overscroll/rubber-band from competing with our custom pull animation
          overscrollBehaviorY:"contain",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// AnimatedNumber — smoothly tweens between values with a brief scale pulse on change.
// Use for stats that update during interaction (e.g. running volume during a workout).
function AnimatedNumber({ value, duration = 600, format = (n) => n.toLocaleString(), style }) {
  const [display, setDisplay] = useState(value);
  const [pulse, setPulse] = useState(false);
  const fromRef = useRef(value);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const pulseTimerRef = useRef(0);
  useEffect(() => {
    if (display === value) return;
    fromRef.current = display;
    startRef.current = performance.now();
    setPulse(true);
    // Clear any pending pulse-clear timer from a previous animation so it doesn't
    // fire mid-tween and snap us out of the pulsed state.
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    const animate = (t) => {
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(fromRef.current + (value - fromRef.current) * eased);
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        pulseTimerRef.current = setTimeout(() => setPulse(false), 220);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span style={{
      ...style,
      display:"inline-block",
      transform: pulse ? "scale(1.08)" : "scale(1)",
      transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
    }}>{format(display)}</span>
  );
}

function StreakBadge({ streak, size = "sm", status, thisWeek, target }) {
  // When no streak, show "this week's progress" prompt if user has any thisWeek
  if (!streak && !thisWeek) return null;
  const cfg = {
    sm: { p:"3px 8px", fs:11, ic:11 },
    md: { p:"5px 11px", fs:13, ic:13 },
  }[size] || { p:"3px 8px", fs:11, ic:11 };

  // Visual state based on weekly status
  // active = solid black, on-fire
  // at-risk = amber outline, prompts user to lift this week
  // building (no streak yet but lifting this week) = subtle grey with progress
  let bg = "#0A0A0A", fg = "#fff", flameColor = "#fff";

  // Milestone tiers — flame color changes as streak grows.
  // The bg stays neutral so the flame color does the storytelling.
  if (status === "active" && streak > 0) {
    if (streak >= 26) flameColor = "#a855f7"; // half-year — purple
    else if (streak >= 12) flameColor = "#facc15"; // 3 months — gold
    else if (streak >= 4) flameColor = "#f97316"; // 1 month — orange
    // else stays white
  }

  if (status === "at-risk") { bg = "#f59e0b"; fg = "#fff"; flameColor = "#fff"; }
  else if (!streak && thisWeek) { bg = "#262626"; fg = "#fff"; flameColor = "#a3a3a3"; }

  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      background:bg, color:fg,
      borderRadius:20, padding:cfg.p, fontWeight:700, fontSize:cfg.fs,
      fontVariantNumeric:"tabular-nums",
    }}>
      <Icon name="flame" size={cfg.ic} color={flameColor} strokeWidth={2.2}/>
      <span>{streak > 0 ? streak : `${thisWeek}/${target||3}`}</span>
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// HEATMAP
// ═════════════════════════════════════════════════════════════════════════════
function Heatmap({ workoutDates, C }) {
  const weeks = 26; // 6 months
  const today = new Date(); today.setHours(0,0,0,0);
  const allDays = [];
  for (let i = weeks*7 - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate()-i);
    allDays.push({ k: dKey(d), date: d, active: !!(workoutDates||{})[dKey(d)] });
  }
  const cols = []; let col = [];
  allDays.forEach(d => { col.push(d); if (col.length === 7) { cols.push(col); col = []; } });
  if (col.length) cols.push(col);

  const totalWorkouts = Object.keys(workoutDates||{}).length;
  const thisMonth = allDays.filter(d => {
    const now = new Date();
    return d.date.getMonth() === now.getMonth() && d.date.getFullYear() === now.getFullYear() && d.active;
  }).length;
  const streak = calcStreak(workoutDates||{});

  // Month labels
  const monthLabels = [];
  cols.forEach((col, ci) => {
    const firstDay = col[0]?.date;
    if (firstDay && firstDay.getDate() <= 7) {
      monthLabels.push({ ci, label: firstDay.toLocaleDateString("en",{month:"short"}) });
    }
  });

  return (
    <div style={{ padding:"16px 0 8px" }}>
      {/* Stats strip */}
      <div style={{ display:"flex", gap:0, marginBottom:14 }}>
        {[
          ["Total", totalWorkouts, "sessions"],
          ["This Month", thisMonth, "sessions"],
          ["Streak", streak, "days"],
        ].map(([label, val, unit2], i) => (
          <div key={label} style={{
            flex:1, textAlign:"center",
            borderRight: i < 2 ? `1px solid ${C.divider}` : "none"
          }}>
            <div style={{ fontSize:22, fontWeight:800, color:C.accent, fontFamily:MONO }}>{val}</div>
            <div style={{ fontSize:10, color:C.sub, fontWeight:600, letterSpacing:0.5 }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX:"auto", paddingBottom:4 }}>
        {/* Month labels */}
        <div style={{ display:"flex", gap:3, marginBottom:2, paddingLeft:0 }}>
          {cols.map((col, ci) => {
            const ml = monthLabels.find(m => m.ci === ci);
            return (
              <div key={ci} style={{ width:12, fontSize:8, color:C.muted, textAlign:"center", flexShrink:0 }}>
                {ml ? ml.label : ""}
              </div>
            );
          })}
        </div>
        {/* Day rows (Mon/Wed/Fri labels) */}
        <div style={{ display:"flex", gap:3 }}>
          {cols.map((col, ci) => (
            <div key={ci} style={{ display:"flex", flexDirection:"column", gap:3, flexShrink:0 }}>
              {col.map((d, di) => (
                <div key={di} title={d.k} style={{
                  width:12, height:12, borderRadius:3,
                  background: d.active
                    ? C.accent
                    : C.divider,
                  opacity: d.active ? 1 : 0.5,
                  transition:"opacity 0.2s",
                }}/>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"center", gap:4, marginTop:6 }}>
        <span style={{ fontSize:9, color:C.muted }}>Less</span>
        {[0.2, 0.45, 0.7, 1].map(op => (
          <div key={op} style={{ width:10, height:10, borderRadius:2, background:C.accent, opacity:op }}/>
        ))}
        <span style={{ fontSize:9, color:C.muted }}>More</span>
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
  const [selectedCategory, setSelectedCategory] = useState("All");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const categories = ["All", "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Core"];

  const recent = (() => {
    const seen = new Set();
    (recentExercises || []).slice(0, 10).forEach(sess => {
      (sess.exercises || []).forEach(ex => { if (ex.name) seen.add(ex.name); });
    });
    return Array.from(seen).slice(0, 5);
  })();

  const filteredResults = q.length > 0
    ? EXERCISE_DB.filter(e =>
        e.name.toLowerCase().includes(q.toLowerCase()) &&
        (selectedCategory === "All" || e.muscle === selectedCategory)
      ).slice(0, 10)
    : selectedCategory === "All" && recent.length > 0
      ? recent.map(name => EXERCISE_DB.find(e => e.name === name) || { name, muscle: "" }).filter(Boolean)
      : EXERCISE_DB.filter(e => selectedCategory === "All" || e.muscle === selectedCategory).slice(0, 10);

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
        placeholder="Search exercises..."
        style={{
          width:"100%", background:"transparent", border:"none",
          padding:"8px 0", fontSize:16, fontWeight:600,
          color:C.text, outline:"none", boxSizing:"border-box",
          fontFamily:F
        }}
      />
      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", left:-8, right:-8,
          background:C.surface, border:`1px solid ${C.border}`,
          borderRadius:16, zIndex:200, maxHeight:320, overflow:"hidden",
          boxShadow:"0 12px 40px rgba(0,0,0,0.15)"
        }}>
          {/* Category filters */}
          <div style={{
            padding: "12px 16px 8px",
            borderBottom: `1px solid ${C.divider}`,
            display: "flex",
            gap: 6,
            overflowX: "auto"
          }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "6px 12px",
                  background: selectedCategory === cat ? C.accent : "transparent",
                  color: selectedCategory === cat ? "#fff" : C.sub,
                  border: `1px solid ${selectedCategory === cat ? C.accent : C.border}`,
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {q.length === 0 && selectedCategory === "All" && recent.length > 0 && (
              <div style={{ padding:"8px 16px 4px", fontSize:11, fontWeight:700, color:C.accent, letterSpacing:1 }}>RECENT</div>
            )}
            {filteredResults.length === 0 && (
              <div style={{ padding:"16px", fontSize:14, color:C.sub, textAlign:"center" }}>No exercises found</div>
            )}
            {filteredResults.map((ex, i) => (
              <div
                key={ex.name}
                onClick={() => select(ex)}
                style={{
                  display:"flex", alignItems:"center", gap:12,
                  padding:"12px 16px", cursor:"pointer",
                  borderBottom: i < filteredResults.length-1 ? `1px solid ${C.divider}` : "none"
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.divider}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <MuscleIcon muscle={ex.muscle || ""} size={28} C={C}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize:15, fontWeight:600, color:C.text }}>{ex.name}</div>
                  <div style={{ fontSize:12, color:C.sub, marginTop: 2 }}>{ex.muscle}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// SET ROW (enhanced with cleaner design)
// ═════════════════════════════════════════════════════════════════════════════
const SetRow = memo(function SetRow({ set, si, ei, exName, store, unit, repsTarget, onUpdate, onToggleDone, onDelete, onCopyToNext, onFocusInput, onBlurInput, C }) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const swipeRef = useRef(null);
  const swipeState = useRef({ startX: 0, startY: 0, dx: 0, swiping: false, locked: null });
  const [swipeDx, setSwipeDx] = useState(0);
  const [swipeDir, setSwipeDir] = useState(null);
  const longPressTimer = useRef(null);

  function clearLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  function onTouchStart(e) {
    const t = e.touches[0];
    swipeState.current = { startX: t.clientX, startY: t.clientY, dx: 0, swiping: false, locked: null };
    // Start long-press timer if copy-to-next is wired up. Cancel if user moves or releases early.
    if (onCopyToNext && (set.weight || set.reps)) {
      clearLongPress();
      longPressTimer.current = setTimeout(() => {
        if (!swipeState.current.swiping) {
          onCopyToNext();
          haptic("complete");
          toast("Copied to next set", "success");
        }
        longPressTimer.current = null;
      }, 550);
    }
  }
  function onTouchMove(e) {
    const t = e.touches[0];
    const dx = t.clientX - swipeState.current.startX;
    const dy = t.clientY - swipeState.current.startY;
    // Any meaningful movement cancels the long-press
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) clearLongPress();
    if (!swipeState.current.swiping && Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) > 6) {
      swipeState.current.swiping = true;
      e.preventDefault();
    }
    if (!swipeState.current.swiping) return;
    const clamped = Math.max(-100, Math.min(100, dx));
    // Lock-in haptic when crossing the 60px commit threshold
    const direction = clamped > 0 ? "right" : "left";
    const wouldCommit = Math.abs(clamped) >= 60;
    const lockKey = wouldCommit ? direction : null;
    if (lockKey !== swipeState.current.locked) {
      swipeState.current.locked = lockKey;
      if (lockKey) haptic("lock");
    }
    swipeState.current.dx = clamped;
    setSwipeDx(clamped);
    setSwipeDir(clamped > 0 ? "right" : clamped < 0 ? "left" : null);
  }
  function onTouchEnd() {
    clearLongPress();
    const dx = swipeState.current.dx;
    if (dx > 60) {
      onToggleDone();
      haptic(set.done ? "undo" : "complete");
    } else if (dx < -60 && onDelete) {
      onDelete();
      haptic("delete");
    }
    setSwipeDx(0);
    setSwipeDir(null);
    swipeState.current = { startX: 0, startY: 0, dx: 0, swiping: false, locked: null };
  }

  const prev = exName ? getPrev(store, exName, si, unit) : null;
  const setType = SET_TYPES.find(t => t.id === set.type) || SET_TYPES[0];
  const est1RM = set.weight && set.reps ? calc1RM(set.weight, set.reps) : null;
  const isDone = set.done;

  // Cardio mode detection — show duration + distance inputs instead of weight + reps
  const exMuscle = exName ? EXERCISE_DB.find(e => e.name === exName)?.muscle : null;
  const isCardio = exMuscle === "Cardio";

  // Barbell detection — show plate breakdown inline when this is a barbell move with a set weight
  // Match common barbell movement names; exclude dumbbell/kettlebell/machine/cable variants
  const isBarbell = exName ? (
    /\bbarbell\b|\bbench press\b|\bsquat\b|\bdeadlift\b|\bromanian\b|\bgood morning\b|\bhip thrust\b|\blandmine\b|\bt-?bar\b|\bbent[- ]?over row\b|\bpendlay\b|\bsumo\b|\bconventional\b|\boverhead press\b|\bohp\b|\bpush press\b|\bjerk\b|\bclean\b|\bsnatch\b|\btrap bar\b|\brow\b|\bpress\b|\bcurl\b/i.test(exName)
    && !/dumbbell|\bdb\b|kettlebell|\bkb\b|smith machine|machine|cable|band|tricep|chest fly|fly|lateral|raise/i.test(exName)
  ) : false;
  const platesBreakdown = useMemo(() => {
    if (!isBarbell || !set.weight || isCardio || set.type === "warmup") return null;
    return calcPlatesPerSide(set.weight, unit);
  }, [isBarbell, set.weight, set.type, unit, isCardio]);

  // Progressive overload suggestion (only for working sets, not warmups, not completed, not cardio)
  const suggestion = useMemo(() => {
    if (!exName || isDone || set.type === "warmup" || isCardio) return null;
    if (set.weight || set.reps) return null; // user already filled in
    return suggestNextSet(store, exName, repsTarget, unit, si);
  }, [exName, isDone, set.type, set.weight, set.reps, store, repsTarget, unit, si, isCardio]);

  return (
    <div data-no-tab-swipe style={{ position:"relative", overflow:"hidden", margin:"0 14px 3px", borderRadius:11 }}>
      {/* Swipe hint backgrounds */}
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"flex-start", paddingLeft:16, background:`${C.green}E5`, opacity: swipeDir==="right" ? Math.min(1, swipeDx/45) : 0, borderRadius:11, transition:"opacity 0.08s" }}>
        <div style={{ transform: `scale(${Math.min(1, swipeDx/60)})`, transition:"transform 0.08s ease-out" }}>
          <Icon name="check" size={20} color="#fff" strokeWidth={3}/>
        </div>
      </div>
      {onDelete && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:16, background:"#EF4444E5", opacity: swipeDir==="left" ? Math.min(1, Math.abs(swipeDx)/45) : 0, borderRadius:11, transition:"opacity 0.08s" }}>
          <div style={{ transform: `scale(${Math.min(1, Math.abs(swipeDx)/60)})`, transition:"transform 0.08s ease-out" }}>
            <Icon name="trash" size={18} color="#fff" strokeWidth={2.4}/>
          </div>
        </div>
      )}
      {/* Row content */}
      <div
        ref={swipeRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          background:isDone?`${C.green}0E`:C.surface,
          border:`1.5px solid ${isDone?C.green+"30":C.divider}`,
          // Colored left stripe for non-normal set types — visually rhythmic across an exercise.
          // Always 4px so changing the type doesn't shift layout; transparent when "normal".
          borderLeft: `4px solid ${setType.id !== "normal" ? setType.color : "transparent"}`,
          borderRadius:11, padding:"8px 10px",
          transform: `translateX(${swipeDx}px)`,
          transition: swipeState.current.swiping ? "none" : "transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
          touchAction:"pan-y",
          position:"relative",
        }}
      >
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:24, height:24, borderRadius:7, flexShrink:0, background:isDone?C.green:C.divider, color:isDone?"#fff":C.sub, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, fontFamily:MONO }}>{si+1}</div>
        
        <div style={{ position:"relative", flexShrink:0 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (showTypeMenu) { setShowTypeMenu(false); return; }
              const r = e.currentTarget.getBoundingClientRect();
              // Anchor dropdown just below the button. If it would overflow bottom of viewport, anchor above instead.
              const menuHeight = 200; // approximate
              const spaceBelow = window.innerHeight - r.bottom;
              const top = spaceBelow < menuHeight + 20 ? r.top - menuHeight - 4 : r.bottom + 6;
              setMenuPos({ top, left: r.left });
              setShowTypeMenu(true);
            }}
            style={{ padding:"3px 7px", background:`${setType.color}18`, border:`1.5px solid ${setType.color}40`, borderRadius:6, color:setType.color, fontSize:10, fontWeight:700, cursor:"pointer", minWidth:32, touchAction:"manipulation", userSelect:"none", WebkitTapHighlightColor:"transparent" }}>{setType.short}</button>
        </div>
        {showTypeMenu && menuPos && createPortal(
          <>
            {/* Transparent backdrop to catch outside taps */}
            <div onClick={() => setShowTypeMenu(false)} style={{ position:"fixed", inset:0, zIndex:9998, touchAction:"manipulation" }}/>
            {/* Compact dropdown - Seshd style */}
            <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{
              position:"fixed",
              top:menuPos.top,
              left:Math.max(8, Math.min(menuPos.left, window.innerWidth - 196)),
              zIndex:9999,
              background:C.bg,
              border:`1px solid ${C.border}`,
              borderRadius:14,
              padding:4,
              minWidth:188,
              boxShadow:"0 18px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)",
              fontFamily:F,
              overflow:"hidden",
            }}>
              {SET_TYPES.map((t, i) => {
                const isCurrent = t.id === set.type;
                return (
                  <button
                    key={t.id}
                    onClick={() => { onUpdate({ type: t.id }); setShowTypeMenu(false); }}
                    style={{
                      width:"100%", display:"flex", alignItems:"center", gap:11,
                      background: isCurrent ? C.divider : "transparent",
                      border:"none",
                      borderRadius:10,
                      padding:"10px 10px",
                      fontSize:14, fontWeight:600,
                      color: C.text,
                      cursor:"pointer", fontFamily:F,
                      textAlign:"left",
                      letterSpacing:-0.2,
                    }}>
                    <div style={{
                      width:26, height:26, borderRadius:7, flexShrink:0,
                      background: `${t.color}18`,
                      color: t.color,
                      border: `1.5px solid ${t.color}40`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:11, fontWeight:800, fontFamily:MONO,
                    }}>{t.short}</div>
                    <span style={{ flex:1 }}>{t.label}</span>
                    {isCurrent && (
                      <div style={{ width:6, height:6, borderRadius:"50%", background:C.text, flexShrink:0, marginRight:4 }}/>
                    )}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}

        <div style={{ flex:1, textAlign:"center", fontSize:11, color:C.muted, fontFamily:MONO }}>
          {isCardio ? (prev ? `${prev.w||"—"}m${prev.r?` · ${prev.r}`:""}` : "—") : (prev ? `${prev.w}×${prev.r}` : "—")}
        </div>

        {isCardio ? (
          <>
            <div style={{ position:"relative", width:70 }}>
              <input type="number" inputMode="decimal" value={set.weight||""} onFocus={e => { e.target.select(); onFocusInput && onFocusInput("weight"); }} onBlur={() => onBlurInput && onBlurInput()} onChange={e => onUpdate({weight:e.target.value})} placeholder={prev?.w||"0"}
                style={{ width:"100%", background:isDone?`${C.green}10`:C.bg, border:`1.5px solid ${isDone?C.green+"30":C.divider}`, borderRadius:9, padding:"6px 22px 6px 6px", fontSize:15, fontWeight:700, color:isDone?C.green:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
              />
              <span style={{ position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", fontSize:8, color:C.muted, fontWeight:600 }}>min</span>
            </div>
            <div style={{ position:"relative", width:62 }}>
              <input type="number" inputMode="decimal" value={set.reps||""} onFocus={e => { e.target.select(); onFocusInput && onFocusInput("reps"); }} onBlur={() => onBlurInput && onBlurInput()} onChange={e => onUpdate({reps:e.target.value})} placeholder={prev?.r||"0"}
                style={{ width:"100%", background:isDone?`${C.green}10`:C.bg, border:`1.5px solid ${isDone?C.green+"30":C.divider}`, borderRadius:9, padding:"6px 22px 6px 6px", fontSize:15, fontWeight:700, color:isDone?C.green:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
              />
              <span style={{ position:"absolute", right:3, top:"50%", transform:"translateY(-50%)", fontSize:8, color:C.muted, fontWeight:600 }}>{unit==="kg"?"km":"mi"}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ position:"relative", width:70 }}>
              <input type="number" inputMode="decimal" value={set.weight||""} onFocus={e => { e.target.select(); onFocusInput && onFocusInput("weight"); }} onBlur={() => onBlurInput && onBlurInput()} onChange={e => onUpdate({weight:e.target.value})} placeholder={prev?.w||"0"}
                style={{ width:"100%", background:isDone?`${C.green}10`:C.bg, border:`1.5px solid ${isDone?C.green+"30":C.divider}`, borderRadius:9, padding:"6px 18px 6px 6px", fontSize:15, fontWeight:700, color:isDone?C.green:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
              />
              <span style={{ position:"absolute", right:4, top:"50%", transform:"translateY(-50%)", fontSize:8, color:C.muted, fontWeight:600 }}>{unit}</span>
            </div>

            <div style={{ position:"relative", width:58 }}>
              <input type="number" inputMode="numeric" value={set.reps||""} onFocus={e => { e.target.select(); onFocusInput && onFocusInput("reps"); }} onBlur={() => onBlurInput && onBlurInput()} onChange={e => onUpdate({reps:e.target.value})} placeholder={prev?.r||"0"}
                style={{ width:"100%", background:isDone?`${C.green}10`:C.bg, border:`1.5px solid ${isDone?C.green+"30":C.divider}`, borderRadius:9, padding:"6px 18px 6px 6px", fontSize:15, fontWeight:700, color:isDone?C.green:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
              />
              <span style={{ position:"absolute", right:3, top:"50%", transform:"translateY(-50%)", fontSize:8, color:C.muted, fontWeight:600 }}>reps</span>
            </div>
          </>
        )}

        <button onClick={onToggleDone} style={{
          width:32, height:32, borderRadius:9, flexShrink:0,
          border:`2px solid ${isDone?C.green:C.border}`, background:isDone?C.green:"transparent",
          color:isDone?"#fff":C.muted, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}>
          <Icon name="check" size={16} color={isDone?"#fff":C.muted} strokeWidth={2.8}/>
        </button>
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6, paddingTop:5, borderTop:`1px solid ${C.divider}30`, gap:6 }}>
        <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
          {!isCardio && [-2.5,2.5,5].map(d => (
            <button key={"w"+d} onClick={() => { const cur=parseFloat(set.weight)||parseFloat(prev?.w)||0; onUpdate({weight:String(Math.max(0,Math.round((cur+d)*10)/10))}); haptic("tap"); }} style={{ background:"none", border:`1px solid ${d<0?"#ef444430":"#22c55e30"}`, color:d<0?"#ef4444":"#22c55e", borderRadius:5, padding:"2px 6px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:MONO }}>{d>0?"+":""}{d}</button>
          ))}
          {isCardio && [-1,1,5].map(d => (
            <button key={"m"+d} onClick={() => { const cur=parseFloat(set.weight)||parseFloat(prev?.w)||0; onUpdate({weight:String(Math.max(0,Math.round((cur+d)*10)/10))}); haptic("tap"); }} style={{ background:"none", border:`1px solid ${d<0?"#ef444430":"#22c55e30"}`, color:d<0?"#ef4444":"#22c55e", borderRadius:5, padding:"2px 6px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:MONO }}>{d>0?"+":""}{d}m</button>
          ))}
          {!isCardio && (
            <>
              <span style={{ fontSize:9, color:C.muted, alignSelf:"center", margin:"0 2px 0 4px", fontWeight:700 }}>·</span>
              {[-1, 1].map(d => (
                <button key={"r"+d} onClick={() => { const cur=parseInt(set.reps)||parseInt(prev?.r)||0; onUpdate({reps:String(Math.max(0, cur+d))}); haptic("tap"); }} style={{ background:"none", border:`1px solid ${d<0?"#ef444430":"#22c55e30"}`, color:d<0?"#ef4444":"#22c55e", borderRadius:5, padding:"2px 6px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:MONO }}>{d>0?"+":""}{d}r</button>
              ))}
            </>
          )}
        </div>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          {suggestion && (
            <button onClick={() => { onUpdate({ weight: String(suggestion.weight), reps: String(suggestion.reps) }); haptic("light"); }}
              title={suggestion.reason}
              style={{
                display:"flex", alignItems:"center", gap:4,
                background: suggestion.type === "weight" ? `${C.accent}18` : suggestion.type === "deload" ? "#f59e0b18" : `${C.green}18`,
                border: `1px solid ${suggestion.type === "weight" ? `${C.accent}40` : suggestion.type === "deload" ? "#f59e0b40" : `${C.green}40`}`,
                color: suggestion.type === "weight" ? C.accent : suggestion.type === "deload" ? "#f59e0b" : C.green,
                borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:F,
              }}>
              <Icon name={suggestion.type === "weight" ? "trending-up" : suggestion.type === "deload" ? "chevron-left" : "trending-up"} size={10} strokeWidth={2.6}/>
              <span style={{ fontFamily:MONO }}>{suggestion.weight}<span style={{ opacity:0.5 }}>×</span>{suggestion.reps}</span>
            </button>
          )}
          {!suggestion && prev && (!set.weight || !set.reps) && (
            <button onClick={() => { onUpdate({weight:prev.w,reps:prev.r}); haptic("tap"); }} style={{ background:`${C.accent}15`, border:`1px solid ${C.accent}30`, color:C.accent, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:600, cursor:"pointer", fontFamily:F }}>Use last</button>
          )}
          {est1RM && !isCardio && <div style={{ fontSize:10, color:C.muted, fontFamily:MONO, background:C.divider, padding:"2px 6px", borderRadius:5 }}>e1RM {est1RM}</div>}
        </div>
      </div>
      {platesBreakdown && platesBreakdown.length > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:6, paddingTop:6, borderTop:`1px dashed ${C.divider}`, flexWrap:"wrap" }}>
          <span style={{ fontSize:9, color:C.sub, fontWeight:700, letterSpacing:0.6, marginRight:2 }}>PLATES/SIDE</span>
          {platesBreakdown.map((p, i) => (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:3,
              padding:"2px 7px",
              background: `${PLATE_COLOR_MAP[p.p] || C.muted}22`,
              border: `1px solid ${PLATE_COLOR_MAP[p.p] || C.muted}50`,
              borderRadius:6,
              fontSize:11, fontWeight:700, fontFamily:MONO,
              color: PLATE_COLOR_MAP[p.p] || C.text,
            }}>
              {p.count}<span style={{ opacity:0.55 }}>×</span>{p.p}
            </div>
          ))}
        </div>
      )}
      </div>{/* end swipeable content div */}
    </div>
  );
});


// ═════════════════════════════════════════════════════════════════════════════
// CONFETTI (for PR modal)
// ═════════════════════════════════════════════════════════════════════════════
function Confetti({ origin = "top", duration = 2 }) {
  // origin: "top" (PR modal full-screen) | "set" (centered around the checkmark)
  const colors = ["#7c3aed","#f97316","#eab308","#30d158","#a855f7","#ec4899","#3b82f6"];
  const count = origin === "set" ? 24 : 36;
  const topPos = origin === "set" ? "45%" : "25%";
  return (
    <>
      <style>{`
        @keyframes cfp{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(520px) rotate(720deg);opacity:0}}
        @keyframes cfpBurst{0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}50%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(720deg) scale(0.4);opacity:0}}
      `}</style>
      <div style={{ position:"fixed", top:topPos, left:0, right:0, pointerEvents:"none", zIndex:998 }}>
        {Array.from({length:count},(_,i) => {
          const angle = (i / count) * Math.PI * 2;
          const distance = 120 + Math.random() * 80;
          return {
            id:i,
            left: origin === "set" ? 50 : 50+(Math.random()-0.5)*85,
            delay: origin === "set" ? Math.random()*0.1 : Math.random()*0.4,
            color: colors[i % colors.length],
            dur: origin === "set" ? 0.9 + Math.random()*0.4 : duration,
            dx: origin === "set" ? Math.cos(angle) * distance : 0,
            dy: origin === "set" ? Math.sin(angle) * distance + 200 : 0,
          };
        }).map(p => (
          <div key={p.id} style={{
            position:"absolute", left:`${p.left}%`, width:8, height:8,
            background:p.color, borderRadius:2,
            ...(origin === "set"
              ? { "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animation:`cfpBurst ${p.dur}s ${p.delay}s cubic-bezier(0.2, 0.6, 0.4, 1) forwards` }
              : { animation:`cfp ${p.dur}s ${p.delay}s ease-out forwards` })
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
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>1RM Calculator</div>
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
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>Plate Calculator</div>
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
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{
        background:"#0A0A0A", borderRadius:24, padding:"28px 24px",
        width:"100%", maxWidth:360, color:"#fff", position:"relative",
        fontFamily:F, overflow:"hidden",
      }}>
        {/* Grid texture */}
        <div style={{
          position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
          backgroundImage:`linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize:"24px 24px",
        }}/>

        <button onClick={onClose} style={{
          position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.08)",
          border:"none", color:"#fff", width:30, height:30, borderRadius:10,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1
        }}>
          <Icon name="x" size={14} color="#fff"/>
        </button>

        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:11, letterSpacing:4, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8 }}>SESHD WRAPPED</div>
          <div style={{ fontSize:13, letterSpacing:1.5, fontWeight:600, color:"rgba(255,255,255,0.4)", marginBottom:28 }}>
            {(() => { const d = new Date(); return `Week of ${d.toLocaleDateString("en",{month:"short",day:"numeric"}).toUpperCase()}`; })()}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0, marginBottom:24 }}>
            {[
              ["WORKOUTS", workouts, "activity"],
              ["VOLUME", fmtVol(Math.round(volume), unit).replace(/\s\w+$/, ''), "package"],
              ["PRS", Object.keys(store.prs||{}).length, "trophy"],
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
                <div style={{ fontSize:9, color:"rgba(255,255,255,0.5)", marginTop:6, letterSpacing:1.5, fontWeight:700 }}>{l}</div>
              </div>
            ))}
          </div>

          <button onClick={() => {
            const text = `My week on Seshd\n${workouts} workouts · ${fmtVol(Math.round(volume), unit)} volume\n${Object.keys(store.prs||{}).length} PRs · ${streak} day streak`;
            if (navigator.share) navigator.share({ title:"Seshd Wrapped", text }).catch(()=>{});
            else if (navigator.clipboard) { navigator.clipboard.writeText(text); toast("Copied to clipboard", "success"); }
          }} style={{
            width:"100%", background:"#fff", color:"#0A0A0A", border:"none",
            borderRadius:12, padding:"14px", fontSize:14, fontWeight:700,
            cursor:"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2,
            display:"flex", alignItems:"center", justifyContent:"center", gap:8
          }}>
            <Icon name="share" size={16} color="#0A0A0A"/>
            Share my week
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PR MODAL
// ═════════════════════════════════════════════════════════════════════════════
function PRModal({ pr, unit, onClose, onShare }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <Confetti/>
      <div className="seshd-scale-enter" style={{
        background:"#0A0A0A", borderRadius:24, padding:"36px 28px",
        width:"100%", maxWidth:360, color:"#fff", position:"relative",
        fontFamily:F, overflow:"hidden",
      }}>
        {/* Grid texture */}
        <div style={{
          position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
          backgroundImage:`linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize:"24px 24px",
        }}/>

        <div style={{ position:"relative", zIndex:1 }}>
          {/* Header label */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:36 }}>
            <div>
              <div style={{ fontSize:11, letterSpacing:4, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:3 }}>SESHD</div>
              <div style={{ fontSize:10, letterSpacing:2.5, fontWeight:700, color:"#fff" }}>PERSONAL RECORD</div>
            </div>
            <div style={{
              background:"#fff", color:"#0A0A0A",
              fontSize:9, fontWeight:800, letterSpacing:1.5,
              padding:"5px 10px", borderRadius:20,
            }}>NEW</div>
          </div>

          {/* The big number */}
          <div style={{ marginBottom:32 }}>
            <div className="seshd-count" style={{
              fontFamily:MONO, fontSize:88, lineHeight:0.9, fontWeight:700, letterSpacing:-3,
              fontVariantNumeric: "tabular-nums",
            }}>{pr.weight}</div>
            <div style={{ fontSize:16, color:"rgba(255,255,255,0.5)", marginTop:6, letterSpacing:1, fontWeight:600 }}>{unit.toUpperCase()}</div>
          </div>

          {/* Exercise */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:11, letterSpacing:1.8, color:"rgba(255,255,255,0.4)", fontWeight:600, marginBottom:6 }}>EXERCISE</div>
            <div style={{ fontSize:20, fontWeight:800, lineHeight:1.2, letterSpacing:-0.5 }}>{pr.name}</div>
          </div>

          {/* Increase */}
          {pr.increase > 0 && (
            <div style={{
              padding:"14px 16px", marginBottom:24,
              background:"rgba(255,255,255,0.06)", borderRadius:12,
              border:"1px solid rgba(255,255,255,0.08)",
              display:"flex", alignItems:"center", justifyContent:"space-between"
            }}>
              <div style={{ fontSize:11, letterSpacing:1.8, fontWeight:700, color:"rgba(255,255,255,0.55)" }}>PREVIOUS BEST</div>
              <div style={{ fontFamily:MONO, fontSize:14, fontWeight:700 }}>
                +{pr.increase}<span style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginLeft:3 }}>{unit}</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <button onClick={() => {
            const text = `New PR — ${pr.name} ${pr.weight} ${unit}${pr.increase > 0 ? ` (+${pr.increase})` : ""}. via Seshd.`;
            if (navigator.share) navigator.share({ title:"New PR", text }).catch(()=>{});
            else if (navigator.clipboard) { navigator.clipboard.writeText(text); toast("Copied to clipboard","success"); }
            onClose();
          }} style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            width:"100%", background:"#fff", color:"#0A0A0A",
            border:"none", borderRadius:12, padding:"15px",
            fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:8, fontFamily:F,
            letterSpacing:-0.2,
          }}>
            <Icon name="share" size={16} color="#0A0A0A"/>
            Share this PR
          </button>
          <button onClick={onClose} style={{
            width:"100%", background:"transparent", color:"rgba(255,255,255,0.7)",
            border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, padding:"13px",
            fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600,
          }}>Keep going</button>
        </div>
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
    { icon:"barbell", title:"Track every rep", body:"Log sets, weights, and reps. Watch every lift improve over time." },
    { icon:"trending-up", title:"Share the work", body:"Post your workouts. Give kudos to your crew. Build your identity." },
    { icon:"flame", title:"Train together", body:"Streaks, challenges, private groups. Lift with your people." },
  ];
  const s = steps[step];
  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:600, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", fontFamily:F }}>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 32px", textAlign:"center" }}>
        <div style={{ marginBottom:48 }}>
          <SeshdLogo C={C} big/>
        </div>
        <div key={step} className="seshd-enter" style={{
          width:88, height:88, borderRadius:24, background:C.text, color:C.bg,
          display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28
        }}>
          <Icon name={s.icon} size={40} color={C.bg} strokeWidth={1.7}/>
        </div>
        <div className="seshd-enter" style={{ fontSize:30, fontWeight:800, color:C.text, marginBottom:12, letterSpacing:-0.8, lineHeight:1.1 }}>{s.title}</div>
        <div className="seshd-enter" style={{ fontSize:15, color:C.sub, lineHeight:1.5, maxWidth:300 }}>{s.body}</div>
      </div>
      <div style={{ padding:"0 32px 44px" }}>
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:24 }}>
          {steps.map((_,i) => <div key={i} style={{ width:i===step?22:6, height:6, borderRadius:3, background:i===step?C.text:C.border, transition:"all 0.3s" }}/>)}
        </div>
        <button onClick={() => step<steps.length-1 ? setStep(step+1) : onComplete()} style={{
          width:"100%", background:C.text, color:C.bg, border:"none", borderRadius:14, padding:"16px",
          fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2
        }}>
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
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [days, setDays] = useState([{ id: uid(), name: "Day 1", exercises: [] }]);

  const REST_OPTIONS = [{s:90,label:"1.5m"},{s:120,label:"2m"},{s:180,label:"3m"},{s:300,label:"5m"}];

  function addDay() {
    const newDay = { id: uid(), name: `Day ${days.length + 1}`, exercises: [] };
    setDays(ds => [...ds, newDay]);
    setActiveDayIdx(days.length);
  }
  function removeDay(idx) {
    if (days.length <= 1) return;
    setDays(ds => ds.filter((_, i) => i !== idx));
    setActiveDayIdx(i => Math.min(i, days.length - 2));
  }
  function updateDayName(idx, newName) {
    setDays(ds => ds.map((d, i) => i === idx ? { ...d, name: newName } : d));
  }
  function addExercise(exName) {
    if (!exName) return;
    setDays(ds => ds.map((d, i) => i !== activeDayIdx ? d : {
      ...d,
      exercises: [...d.exercises, { name: exName, sets: 3, reps: "8–12", rest: 90, note: "" }]
    }));
  }
  function updateEx(exIdx, patch) {
    setDays(ds => ds.map((d, i) => i !== activeDayIdx ? d : {
      ...d,
      exercises: d.exercises.map((ex, j) => j !== exIdx ? ex : { ...ex, ...patch })
    }));
  }
  function removeEx(exIdx) {
    setDays(ds => ds.map((d, i) => i !== activeDayIdx ? d : {
      ...d,
      exercises: d.exercises.filter((_, j) => j !== exIdx)
    }));
  }
  function save() {
    if (!name.trim()) { toast("Give your program a name", "error"); return; }
    const validDays = days.filter(d => d.exercises.length > 0);
    if (!validDays.length) { toast("Add at least one exercise", "error"); return; }
    onSave({ id: uid(), name: name.trim(), days: validDays.map(d => ({ ...d, id: uid() })) });
  }

  const activeDay = days[activeDayIdx] || days[0];
  const isDark = C.bg === "#0a0a0c";
  const surface = isDark ? "#141414" : "#F8FAFC";
  const border = isDark ? "#222" : "#E8ECF0";
  const inputBg = isDark ? "#1e1e1e" : "#fff";
  const labelClr = isDark ? "#888" : "#64748B";
  const bodyClr = isDark ? "#f0f0f0" : "#0F172A";

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", background:C.bg }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 18px 14px", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
        <button onClick={onCancel} style={{ fontSize:14, color:labelClr, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Program name..."
          style={{ flex:1, margin:"0 14px", background:"transparent", border:"none", fontSize:16, fontWeight:700, color:bodyClr, outline:"none", fontFamily:F, textAlign:"center" }}
        />
        <button onClick={save} style={{ fontSize:14, fontWeight:700, color:"#fff", background:"#2563EB", border:"none", borderRadius:8, padding:"7px 16px", cursor:"pointer", fontFamily:F }}>Save</button>
      </div>

      {/* Day tabs */}
      <div style={{ display:"flex", gap:6, padding:"12px 18px", borderBottom:`1px solid ${border}`, overflowX:"auto", flexShrink:0 }}>
        {days.map((d, i) => (
          <button key={d.id} onClick={() => setActiveDayIdx(i)} style={{
            padding:"7px 16px", borderRadius:20, border:"none", cursor:"pointer", fontFamily:F,
            fontSize:12, fontWeight:600, whiteSpace:"nowrap", flexShrink:0,
            background: activeDayIdx === i ? "#2563EB" : (isDark ? "#1e1e1e" : "#EEF2F7"),
            color: activeDayIdx === i ? "#fff" : labelClr,
          }}>{d.name}</button>
        ))}
        <button onClick={addDay} style={{
          padding:"7px 14px", borderRadius:20, border:`1.5px dashed ${isDark ? "#333" : "#CBD5E1"}`,
          background:"none", cursor:"pointer", fontFamily:F, fontSize:12, fontWeight:600,
          color:"#2563EB", whiteSpace:"nowrap", flexShrink:0
        }}>+ Day</button>
      </div>

      {/* Active day */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 18px 100px" }}>
        {/* Day name edit */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <input
            value={activeDay.name} onChange={e => updateDayName(activeDayIdx, e.target.value)}
            style={{ flex:1, background:inputBg, border:`1px solid ${border}`, borderRadius:10, padding:"10px 14px", fontSize:14, fontWeight:600, color:bodyClr, outline:"none", fontFamily:F }}
          />
          {days.length > 1 && (
            <button onClick={() => removeDay(activeDayIdx)} style={{ background:"none", border:`1px solid ${isDark?"#333":"#FCA5A5"}`, borderRadius:8, padding:"10px 12px", color:"#EF4444", fontSize:12, cursor:"pointer", fontFamily:F, whiteSpace:"nowrap" }}>Remove Day</button>
          )}
        </div>

        {/* Exercise cards */}
        {activeDay.exercises.map((ex, ei) => {
          const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
          return (
            <div key={ei} style={{ background:inputBg, border:`1px solid ${border}`, borderRadius:16, padding:"14px", marginBottom:12, boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.06)" }}>
              {/* Exercise name row */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background: isDark ? "#252525" : "#EEF2F7", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <MuscleIcon muscle={exInfo?.muscle||""} size={22} C={C}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:bodyClr }}>{ex.name}</div>
                  {exInfo?.muscle && <div style={{ fontSize:11, color:labelClr, marginTop:1 }}>{exInfo.muscle}</div>}
                </div>
                <button onClick={() => removeEx(ei)} style={{ background:"none", border:"none", color:"#EF4444", fontSize:20, cursor:"pointer", padding:"0 4px", lineHeight:1 }}>×</button>
              </div>

              {/* Sets / Reps / Rest row */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:labelClr, letterSpacing:0.5, marginBottom:4 }}>SETS</div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, background: isDark?"#111":"#F1F5F9", borderRadius:8, padding:"6px 10px" }}>
                    <button onClick={() => updateEx(ei,{sets:Math.max(1,(ex.sets||3)-1)})} style={{ background:"none", border:"none", color:"#2563EB", fontSize:18, cursor:"pointer", lineHeight:1, padding:0, fontWeight:700 }}>−</button>
                    <span style={{ flex:1, textAlign:"center", fontSize:16, fontWeight:700, color:bodyClr, fontFamily:MONO }}>{ex.sets||3}</span>
                    <button onClick={() => updateEx(ei,{sets:(ex.sets||3)+1})} style={{ background:"none", border:"none", color:"#2563EB", fontSize:18, cursor:"pointer", lineHeight:1, padding:0, fontWeight:700 }}>+</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:labelClr, letterSpacing:0.5, marginBottom:4 }}>REPS</div>
                  <input value={ex.reps||""} onChange={e => updateEx(ei,{reps:e.target.value})} placeholder="8–12"
                    style={{ width:"100%", background: isDark?"#111":"#F1F5F9", border:"none", borderRadius:8, padding:"8px 10px", fontSize:13, fontWeight:600, color:bodyClr, outline:"none", fontFamily:F, boxSizing:"border-box", textAlign:"center" }}/>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:labelClr, letterSpacing:0.5, marginBottom:4 }}>REST</div>
                  <select value={ex.rest||90} onChange={e => updateEx(ei,{rest:parseInt(e.target.value)})}
                    style={{ width:"100%", background: isDark?"#111":"#F1F5F9", border:"none", borderRadius:8, padding:"8px 6px", fontSize:12, fontWeight:600, color:bodyClr, outline:"none", fontFamily:F, cursor:"pointer" }}>
                    {REST_OPTIONS.map(o => <option key={o.s} value={o.s}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Note */}
              <input value={ex.note||""} onChange={e => updateEx(ei,{note:e.target.value})} placeholder="Add a note (optional)..."
                style={{ width:"100%", background:"transparent", border:"none", borderTop:`1px solid ${border}`, padding:"8px 0 0", fontSize:12, color:labelClr, outline:"none", fontFamily:F, boxSizing:"border-box" }}/>
            </div>
          );
        })}

        {/* Add exercise search */}
        <div style={{ background:inputBg, border:`1.5px dashed ${isDark?"#2563eb55":"#BFDBFE"}`, borderRadius:16, padding:"12px 14px" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#2563EB", marginBottom:8, letterSpacing:0.3 }}>+ ADD EXERCISE</div>
          <ExerciseInput
            key={`builder-${activeDayIdx}-${activeDay.exercises.length}`}
            value="" onChange={v => { if (v) addExercise(v); }} C={C}
          />
        </div>
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
        <div onClick={() => { onClose(); }} style={{ background:"rgba(255,255,255,0.12)", borderRadius:24, padding:"10px 16px", color:"rgba(255,255,255,0.7)", fontSize:13, cursor:"pointer" }}>
          Reply to {user.username}...
        </div>
        <div style={{ textAlign:"center", fontSize:10, color:"rgba(255,255,255,0.4)", marginTop:8 }}>
          Swipe ← → to navigate · ↑ for profile · ↓ to close
        </div>
      </div>
    </div>
  );
}
const PostCard = memo(function PostCard({ post, store, currentUserId, onKudos, onComment, onEditComment, onDeleteComment, onLikeComment, onUserClick, onEdit, onDelete, displayUnit, C }) {
  const user = store.users.find(u => u.id === post.userId);
  const hasKudos = (post.kudos||[]).includes(currentUserId);
  const isOwn = post.userId === currentUserId;
  const [showCmts, setShowCmts] = useState(false);
  const [cmtText, setCmtText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [commentMenu, setCommentMenu] = useState(null); // commentId of open menu
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
    <div style={{ marginBottom:12, borderRadius:0, borderBottom:`1px solid ${C.divider}`, paddingBottom:0 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px 10px" }}>
        <Avatar user={user} size={32} C={C} onClick={() => onUserClick(user?.id)}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            <span onClick={() => onUserClick(user?.id)} style={{ fontSize:13, fontWeight:600, color:C.text, cursor:"pointer" }}>
              {user?.username}
            </span>
            {post.isPR && (
              <span style={{ fontSize:9, background:C.text, color:C.bg, padding:"2px 8px", borderRadius:8, fontWeight:800, letterSpacing:1 }}>PR</span>
            )}
          </div>
          <div style={{ fontSize:11, color:C.sub, display:"flex", alignItems:"center", gap:5 }}>
            {post.location && <>{post.location} · </>}
            {(() => {
              const secs = Math.floor((Date.now() - post.createdAt) / 1000);
              const isFresh = secs >= 0 && secs < 60;
              if (isFresh) {
                return (
                  <span style={{ color:"#22c55e", fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}>
                    <span style={{
                      width:6, height:6, borderRadius:"50%", background:"#22c55e",
                      animation:"seshd-fresh-pulse 1.2s ease-out infinite",
                    }}/>
                    just now
                  </span>
                );
              }
              return timeAgo(post.createdAt);
            })()}
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
        <div style={{ margin:"0 14px", background:"#0A0A0A", color:"#fff", borderRadius:16, padding:"28px 20px", textAlign:"center" }}>
          <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.5)", letterSpacing:2.5, marginBottom:14 }}>STREAK</div>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}><Icon name="flame" size={32} color="#fff"/></div>
          <div style={{ fontFamily:MONO, fontSize:52, fontWeight:700, lineHeight:1, letterSpacing:-2, fontVariantNumeric:"tabular-nums" }}>{post.achievement.days}</div>
          <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.55)", letterSpacing:2, marginTop:10 }}>DAYS</div>
        </div>
      )}

      {(post.type === "photo" || post.type === "form_check") && (
        post.imageData
          ? <img src={post.imageData} alt="" style={{ width:"100%", maxHeight:500, objectFit:"cover", display:"block" }}/>
          : <div style={{ width:"100%", aspectRatio:"1", background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", color:C.muted }}><Icon name="search" size={36} color="currentColor"/></div>
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

      {post.type === "workout" && post.workout && (() => {
        const isDark = C.bg === "#0a0a0c";
        return (
          <div style={{ margin:"0 14px", borderRadius:16, overflow:"hidden", border:`1px solid ${C.border}` }}>
            {/* Header band */}
            <div style={{ background: isDark ? "#1a1a1a" : "#F8FAFC", padding:"14px 16px 12px", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:C.text, letterSpacing:-0.3 }}>{post.workout.name}</div>
                  <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>Strength training</div>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:14, fontWeight:800, color:C.accent, fontFamily:MONO }}>{Math.floor(post.workout.duration/60)}m</div>
                    <div style={{ fontSize:9, color:C.sub, letterSpacing:0.8, marginTop:1 }}>TIME</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:14, fontWeight:800, color:C.accent, fontFamily:MONO }}>{fmtVol(Math.round(cvt(post.workout.volume, postUnit, displayUnit)), displayUnit)}</div>
                    <div style={{ fontSize:9, color:C.sub, letterSpacing:0.8, marginTop:1 }}>VOL</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Exercise rows */}
            <div style={{ background: isDark ? "#111" : "#fff" }}>
              {(expanded ? post.workout.exercises : post.workout.exercises.slice(0,3)).map((ex,i) => (
                <div key={i} style={{ padding:"10px 16px", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{ex.name}</span>
                    {ex.isPR && <span style={{ fontSize:9, background:C.text, color:C.bg, padding:"2px 7px", borderRadius:6, fontWeight:800, flexShrink:0, letterSpacing:1 }}>PR</span>}
                  </div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {ex.sets.map((s,j) => (
                      <span key={j} style={{ fontSize:11, background: isDark ? "#1e1e1e" : "#F1F5F9", border:`1px solid ${C.border}`, borderRadius:6, padding:"3px 8px", color:C.textDim, fontFamily:MONO, fontWeight:600 }}>
                        {s.w > 0 ? `${cvt(s.w, postUnit, displayUnit)}×${s.r}` : `${s.r} reps`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {post.workout.exercises.length > 3 && (
                <button onClick={() => setExpanded(!expanded)} style={{ width:"100%", padding:"10px 16px", fontSize:12, color:C.accent, background:"none", border:"none", cursor:"pointer", fontWeight:700, fontFamily:F, textAlign:"left" }}>
                  {expanded ? "↑ Show less" : `+ ${post.workout.exercises.length-3} more exercises`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Actions */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 12px 2px" }}>
        <button
          onClick={handleKudos}
          aria-label="Give kudos"
          style={{
            background:"none", border:"none", cursor:"pointer",
            padding:"8px 10px", display:"flex", alignItems:"center", gap:5,
            transform: pop ? "scale(1.2)" : "scale(1)",
            transition:"transform 0.2s",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill={hasKudos ? C.orange : "none"} stroke={hasKudos ? C.orange : C.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 C12 2 8 6 8 11 C8 14 10 16 10 16 C10 13 11 12 12 12 C13 12 14 13 14 16 C14 16 16 14 16 11 C16 6 12 2 12 2 Z"/>
            <path d="M7 13 C5 15 4 17 4 19 C4 21.5 7 23 12 23 C17 23 20 21.5 20 19 C20 17 19 15 17 13 C17 16 15 18 12 18 C9 18 7 16 7 13 Z"/>
          </svg>
          {(post.kudos||[]).length > 0 && <span style={{ fontSize:12, color: hasKudos ? C.orange : C.sub, fontWeight:600 }}>{(post.kudos||[]).length}</span>}
        </button>
        <button
          onClick={() => setShowCmts(!showCmts)}
          aria-label="Comments"
          style={{
            background:"none", border:"none", cursor:"pointer",
            padding:"8px 10px", display:"flex", alignItems:"center", gap:5,
          }}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15 Q21 17 19 17 L8 17 L4 21 V17 Q3 17 3 15 V7 Q3 5 5 5 H19 Q21 5 21 7 Z"/>
          </svg>
          {post.comments.length > 0 && <span style={{ fontSize:12, color:C.sub, fontWeight:600 }}>{post.comments.length}</span>}
        </button>
        <button
          onClick={() => {
            const shareText = post.caption ? `${user?.username} on Seshd: ${post.caption}` : `Check out ${user?.username}'s workout on Seshd`;
            if (navigator.share) navigator.share({ title:"Seshd", text: shareText, url: window.location.href }).catch(()=>{});
            else if (navigator.clipboard) { navigator.clipboard.writeText(shareText).then(() => toast("Link copied", "success")).catch(()=>{}); }
          }}
          aria-label="Share"
          style={{ background:"none", border:"none", cursor:"pointer", padding:"8px 10px", display:"flex", alignItems:"center", justifyContent:"center" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>

      {/* Caption + comments */}
      <div style={{ padding:"2px 16px 14px" }}>
        {post.caption && (() => {
          // Detect code in caption (IGNITE-XXXX or WO-XXXX)
          const codeMatch = post.caption.match(/(IGNITE-[A-Z0-9]{4}|WO-[A-Z0-9]{4})/i);
          const code = codeMatch ? codeMatch[0].toUpperCase() : null;
          // Strip the "Try my program: CODE" suffix from display
          const displayCaption = code
            ? post.caption.replace(/\s*·?\s*Try my (program|workout):?\s*(IGNITE-[A-Z0-9]{4}|WO-[A-Z0-9]{4})/i, "").trim()
            : post.caption;
          return (
            <>
              {displayCaption && (
                <div style={{ fontSize:13, color:C.text, lineHeight:1.45, marginBottom:5 }}>
                  <span style={{ fontWeight:600, marginRight:6 }}>{user?.username}</span>
                  {displayCaption}
                </div>
              )}
              {code && (
                <button onClick={() => {
                  // Dispatch an event to open the import flow with the code prefilled
                  window.dispatchEvent(new CustomEvent("seshd:open-code", { detail: { code } }));
                }} style={{
                  display:"flex", alignItems:"center", gap:10,
                  width:"100%", marginTop:6, marginBottom:5,
                  padding:"10px 12px",
                  background: C.bg === "#0a0a0c" ? "#141414" : "#F4F6FA",
                  border:`1px solid ${C.border}`, borderRadius:10, cursor:"pointer", fontFamily:F,
                  textAlign:"left",
                }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:C.text, color:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Icon name={code.startsWith("WO-") ? "dumbbell" : "calendar"} size={14}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, letterSpacing:1.2, fontWeight:700, color:C.sub }}>{code.startsWith("WO-") ? "WORKOUT CODE" : "PROGRAM CODE"}</div>
                    <div style={{ fontFamily:MONO, fontSize:13, fontWeight:700, color:C.text, letterSpacing:1 }}>{code}</div>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.accent }}>Import</div>
                </button>
              )}
            </>
          );
        })()}
        {post.comments.length > 0 && !showCmts && (
          <div>
            {(() => {
              const c = post.comments[0];
              const cu = store.users.find(u => u.id === c.userId);
              return (
                <div style={{ fontSize:13, color:C.text, lineHeight:1.4, marginBottom:3 }}>
                  <span style={{ fontWeight:600, marginRight:5 }}>{cu?.username}</span>{c.text}
                </div>
              );
            })()}
            {post.comments.length > 1 && (
              <button onClick={() => setShowCmts(true)} style={{ fontSize:12, color:C.muted, background:"none", border:"none", cursor:"pointer", padding:"0 0 2px", fontFamily:F }}>
                View all {post.comments.length} comments
              </button>
            )}
          </div>
        )}
      </div>

      {showCmts && (
        <div style={{ padding:"4px 16px 14px" }}>
          {post.comments.map(c => {
            const cu = store.users.find(u => u.id === c.userId);
            const isOwn = c.userId === currentUserId;
            const isEditing = editingCommentId === c.id;
            const likes = c.likes || [];
            const isLiked = likes.includes(currentUserId);
            return (
              <div key={c.id} style={{ display:"flex", gap:10, marginBottom:14, alignItems:"flex-start" }}>
                <Avatar user={cu} size={30} C={C}/>
                <div style={{ flex:1, minWidth:0 }}>
                  {isEditing ? (
                    <div>
                      <input
                        autoFocus
                        value={editCommentText}
                        onChange={e => setEditCommentText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && editCommentText.trim()) {
                            onEditComment && onEditComment(post.id, c.id, editCommentText.trim());
                            setEditingCommentId(null);
                          } else if (e.key === "Escape") {
                            setEditingCommentId(null);
                          }
                        }}
                        style={{ width:"100%", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 8px", fontSize:13, color:C.text, outline:"none", fontFamily:F }}
                      />
                      <div style={{ display:"flex", gap:12, marginTop:6 }}>
                        <button onClick={() => {
                          if (editCommentText.trim()) {
                            onEditComment && onEditComment(post.id, c.id, editCommentText.trim());
                          }
                          setEditingCommentId(null);
                        }} style={{ fontSize:12, fontWeight:700, color:C.accent, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:F }}>Save</button>
                        <button onClick={() => setEditingCommentId(null)} style={{ fontSize:12, color:C.sub, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:F }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>
                        <span style={{ fontWeight:600, marginRight:5 }}>{cu?.username}</span>
                        {c.text}
                      </div>
                      <div style={{ fontSize:11, color:C.muted, marginTop:3, display:"flex", alignItems:"center", gap:14 }}>
                        <span>{timeAgo(c.createdAt)}</span>
                        {likes.length > 0 && (
                          <span style={{ fontWeight:600 }}>{likes.length} {likes.length === 1 ? "like" : "likes"}</span>
                        )}
                        {isOwn && (
                          <>
                            <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.text); }} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", padding:0, fontFamily:F, fontWeight:600 }}>Edit</button>
                            <button onClick={() => {
                              if (window.confirm("Delete this comment?")) {
                                onDeleteComment && onDeleteComment(post.id, c.id);
                              }
                            }} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", padding:0, fontFamily:F, fontWeight:600 }}>Delete</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {!isEditing && (
                  <button onClick={() => onLikeComment && onLikeComment(post.id, c.id)} aria-label="Like comment" style={{
                    background:"none", border:"none", padding:4, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                    marginTop:2,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={isLiked ? "#EF4444" : "none"} stroke={isLiked ? "#EF4444" : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          <div style={{ display:"flex", gap:10, marginTop:4, alignItems:"center" }}>
            <Avatar user={store.users.find(u => u.id === currentUserId)} size={30} C={C}/>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, borderBottom:`1px solid ${C.divider}`, paddingBottom:6 }}>
              <input
                value={cmtText}
                onChange={e => setCmtText(e.target.value)}
                placeholder="Add a comment..."
                onKeyDown={e => { if (e.key === "Enter" && cmtText.trim()) { onComment(post.id, cmtText); setCmtText(""); } }}
                style={{ flex:1, background:"transparent", border:"none", fontSize:13, color:C.text, outline:"none", fontFamily:F, padding:"4px 0" }}
              />
              {cmtText.trim() && (
                <button onClick={() => { onComment(post.id, cmtText); setCmtText(""); }} style={{ background:"none", border:"none", color:C.accent, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F, flexShrink:0 }}>Post</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// PROGRAM DETAIL VIEW
// ═════════════════════════════════════════════════════════════════════════════
function ProgramDetailView({ prog, store, unit, C, F, MONO, onBack, onSaveProgram, onSaveStore, onProgramEdited, startWorkout, initialDayIdx = 0, token }) {
  const [localProg, setLocalProg] = useState(() => JSON.parse(JSON.stringify(prog)));
  const [activeDay, setActiveDay] = useState(initialDayIdx);
  const [shareModal, setShareModal] = useState(null); // { code, generating } when open
  const isActive = store.activeProgramId === prog.id;

  useEffect(() => { setLocalProg(JSON.parse(JSON.stringify(prog))); }, [prog.id]);
  useEffect(() => { setActiveDay(Math.min(initialDayIdx, (prog.days?.length||1)-1)); }, [initialDayIdx]);

  const day = localProg.days?.[activeDay] || { name:"", exercises:[] };
  function patch(u) { setLocalProg(u); if (onProgramEdited) onProgramEdited(u); }
  function updateEx(ei, ch) { patch({...localProg, days:localProg.days.map((d,di)=>di!==activeDay?d:{...d, exercises:d.exercises.map((ex,xi)=>xi!==ei?ex:{...ex,...ch})})}); }
  function addEx() { patch({...localProg, days:localProg.days.map((d,di)=>di!==activeDay?d:{...d, exercises:[...(d.exercises||[]),{name:"",sets:3,reps:"8-12",rest:"90",note:""}]})}); }
  function removeEx(ei) { patch({...localProg, days:localProg.days.map((d,di)=>di!==activeDay?d:{...d, exercises:d.exercises.filter((_,xi)=>xi!==ei)})}); }

  const isDark = C.bg === "#0a0a0c";
  const CARD = isDark ? "#141414" : "#FFFFFF";
  const BG   = isDark ? "#0a0a0a" : "#F4F6FA";
  const BORD = isDark ? "#222"    : "#E8ECF0";
  const SUB  = isDark ? "#666"    : "#94A3B8";
  const TXT  = isDark ? "#F0F0F0" : "#0F172A";
  const BLUE = "#2563EB";

  const DAY_COLORS = ["#7C3AED","#2563EB","#059669","#D97706","#DC2626","#0891B2","#7C3AED"];

  return (
    <div style={{ position:"absolute", inset:0, background:BG, zIndex:15, display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* Top bar */}
      <div style={{ background:CARD, borderBottom:`1px solid ${BORD}`, padding:"14px 18px", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ width:36, height:36, borderRadius:10, background:isDark?"#1e1e1e":"#F1F5F9", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SUB} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M5 12l7-7M5 12l7 7"/></svg>
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <input value={localProg.name} onChange={e => patch({...localProg, name:e.target.value})}
              style={{ width:"100%", background:"transparent", border:"none", outline:"none", fontSize:18, fontWeight:800, color:TXT, fontFamily:F }} />
            <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:2 }}>
              <span style={{ fontSize:11, color:SUB }}>{localProg.days?.length||0} days · {localProg.days?.reduce((a,d)=>a+(d.exercises?.length||0),0)||0} exercises</span>
              {isActive && <span style={{ fontSize:9, background:C.accent, color:"#fff", borderRadius:20, padding:"2px 8px", fontWeight:700 }}>ACTIVE</span>}
            </div>
          </div>
          <button onClick={async () => {
            setShareModal({ code: prog.shareCode || null, generating: !prog.shareCode });
            if (!prog.shareCode && token) {
              // Generate code, save to DB
              try {
                let code = generateShareCode("IGNITE");
                // Try a few times if collision
                for (let i = 0; i < 5; i++) {
                  const existing = await sb.query(`programs?share_code=eq.${code}&select=id`, {}, token).catch(()=>[]);
                  if (!existing || existing.length === 0) break;
                  code = generateShareCode("IGNITE");
                }
                await sb.query(`programs?id=eq.${prog.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ share_code: code })
                }, token);
                const updated = { ...localProg, shareCode: code };
                setLocalProg(updated);
                if (onProgramEdited) onProgramEdited(updated);
                if (onSaveProgram) onSaveProgram(updated);
                setShareModal({ code, generating: false });
              } catch (e) {
                console.error("share code error:", e);
                setShareModal(null);
                toast("Couldn't generate share code", "error");
              }
            }
          }} aria-label="Share program" style={{ width:36, height:36, borderRadius:10, background:"transparent", border:`1px solid ${BORD}`, cursor:"pointer", fontFamily:F, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Icon name="share" size={16} color={TXT}/>
          </button>
          <button onClick={() => onSaveProgram && onSaveProgram(localProg)} style={{ background:BLUE, border:"none", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", fontFamily:F, flexShrink:0 }}>Save</button>
        </div>
      </div>

      {/* Share Modal */}
      {shareModal && (
        <div onClick={() => setShareModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{
            background:"#0A0A0A", borderRadius:24, padding:"32px 24px",
            width:"100%", maxWidth:360, color:"#fff", position:"relative",
            fontFamily:F, overflow:"hidden",
          }}>
            <div style={{
              position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
              backgroundImage:`linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
              backgroundSize:"24px 24px",
            }}/>
            <button onClick={() => setShareModal(null)} style={{
              position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.08)",
              border:"none", color:"#fff", width:30, height:30, borderRadius:10,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1
            }}>
              <Icon name="x" size={14} color="#fff"/>
            </button>

            <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
              <div style={{ fontSize:11, letterSpacing:3, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:6 }}>SHARE CODE</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", marginBottom:24, fontWeight:500 }}>{localProg.name}</div>

              {shareModal.generating ? (
                <div style={{ fontFamily:MONO, fontSize:32, fontWeight:700, color:"rgba(255,255,255,0.3)", padding:"20px 0", letterSpacing:2 }}>···</div>
              ) : (
                <div style={{
                  fontFamily:MONO, fontSize:36, fontWeight:800, color:"#fff",
                  letterSpacing:3, padding:"24px 0",
                  borderTop:"1px solid rgba(255,255,255,0.08)",
                  borderBottom:"1px solid rgba(255,255,255,0.08)",
                  marginBottom:24,
                }}>
                  {shareModal.code}
                </div>
              )}

              <div style={{ fontSize:12, color:"rgba(255,255,255,0.55)", marginBottom:20, lineHeight:1.5 }}>
                Anyone with this code can import your program.
                Codes are case-insensitive.
              </div>

              {!shareModal.generating && (
                <>
                  <button onClick={() => {
                    const text = `Try my program on Seshd — ${shareModal.code}`;
                    if (navigator.share) navigator.share({ title:"Program code", text }).catch(()=>{});
                    else if (navigator.clipboard) { navigator.clipboard.writeText(shareModal.code); toast("Code copied", "success"); }
                  }} style={{
                    width:"100%", background:"#fff", color:"#0A0A0A",
                    border:"none", borderRadius:12, padding:"14px", fontSize:14, fontWeight:700,
                    cursor:"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  }}>
                    <Icon name="share" size={16} color="#0A0A0A"/>
                    Share code
                  </button>
                  <button onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(shareModal.code);
                      toast("Code copied", "success");
                    }
                  }} style={{
                    width:"100%", background:"transparent", color:"rgba(255,255,255,0.85)",
                    border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, padding:"13px",
                    fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600,
                  }}>Copy to clipboard</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Day selector tabs */}
      <div style={{ background:CARD, borderBottom:`1px solid ${BORD}`, padding:"10px 16px", display:"flex", gap:6, overflowX:"auto", flexShrink:0 }}>
        {(localProg.days||[]).map((d,di) => {
          const col = DAY_COLORS[di%7];
          const active = activeDay === di;
          return (
            <button key={di} onClick={() => setActiveDay(di)} style={{
              padding:"8px 16px", borderRadius:20, border:"none", cursor:"pointer", fontFamily:F,
              fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0,
              background: active ? col : (isDark?"#1e1e1e":"#EEF2F7"),
              color: active ? "#fff" : SUB,
              boxShadow: active ? `0 4px 12px ${col}55` : "none",
            }}>{d.name||`Day ${di+1}`}</button>
          );
        })}
        <button onClick={() => {
          const nd = { id:Date.now().toString(), name:`Day ${(localProg.days||[]).length+1}`, exercises:[] };
          patch({...localProg, days:[...(localProg.days||[]), nd]});
          setActiveDay((localProg.days||[]).length);
        }} style={{ padding:"8px 14px", borderRadius:20, border:`1.5px dashed ${isDark?"#333":"#CBD5E1"}`, background:"none", cursor:"pointer", fontFamily:F, fontSize:12, fontWeight:700, color:BLUE, whiteSpace:"nowrap", flexShrink:0 }}>+ Day</button>
      </div>

      {/* Day name + Start */}
      <div style={{ background:isDark?"#111":"#fff", borderBottom:`1px solid ${BORD}`, padding:"12px 18px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <input value={day.name} onChange={e => patch({...localProg, days:localProg.days.map((d,di)=>di!==activeDay?d:{...d, name:e.target.value})})}
          placeholder="Day name..." style={{ flex:1, border:"none", outline:"none", background:"none", color:TXT, fontSize:15, fontWeight:700, fontFamily:F }} />
        <button onClick={() => startWorkout && startWorkout(day, localProg.id)} style={{ background:DAY_COLORS[activeDay%7], border:"none", borderRadius:10, padding:"10px 18px", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F, flexShrink:0, boxShadow:`0 4px 12px ${DAY_COLORS[activeDay%7]}55` }}>Start ›</button>
      </div>

      {/* Exercise list */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px 100px" }}>
        {(day.exercises||[]).length === 0 ? (
          <div style={{ padding:"40px 20px", borderRadius:20, background:CARD, color:SUB, textAlign:"center", marginTop:8, border:`1px solid ${BORD}` }}>
            <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><Icon name="barbell" size={30} color="currentColor"/></div>
            <div style={{ fontSize:15, fontWeight:700, color:TXT, marginBottom:6 }}>No exercises yet</div>
            <div style={{ fontSize:12 }}>Tap below to add your first exercise</div>
          </div>
        ) : (
          day.exercises.map((ex, ei) => {
            const exInfo = EXERCISE_DB?.find(e => e.name === ex.name);
            const sets = Math.max(1, parseInt(ex.sets) || 3);
            const muscleColors = { chest:"#EF4444",back:"#3B82F6",shoulders:"#8B5CF6",biceps:"#F59E0B",triceps:"#F97316",quads:"#10B981",hamstrings:"#10B981",glutes:"#EC4899",calves:"#06B6D4",core:"#84CC16",traps:"#6366F1","full body":"#2563EB","rear delts":"#8B5CF6" };
            const mColor = muscleColors[(exInfo?.muscle||"").toLowerCase()] || "#64748B";
            return (
              <div key={ei} style={{ marginBottom:12, background:CARD, borderRadius:16, overflow:"hidden", border:`1px solid ${BORD}`, boxShadow:isDark?"none":"0 1px 4px rgba(0,0,0,0.05)" }}>
                {/* Exercise header */}
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderLeft:`4px solid ${mColor}` }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${mColor}18`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <MuscleIcon muscle={exInfo?.muscle||""} size={22} C={C}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <input value={ex.name} onChange={e => updateEx(ei,{name:e.target.value})} placeholder="Exercise name"
                      style={{ width:"100%", background:"none", border:"none", outline:"none", fontSize:14, fontWeight:700, color:TXT, fontFamily:F }} />
                    {exInfo?.muscle && <div style={{ fontSize:11, color:SUB, marginTop:1 }}>{exInfo.muscle}</div>}
                  </div>
                  <button onClick={() => removeEx(ei)} style={{ background:"none", border:"none", color:"#EF4444", fontSize:20, cursor:"pointer", padding:"4px 6px", lineHeight:1 }}>×</button>
                </div>

                {/* Sets / Reps / Rest */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", borderTop:`1px solid ${BORD}` }}>
                  {/* Sets */}
                  <div style={{ padding:"12px 14px", borderRight:`1px solid ${BORD}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:SUB, letterSpacing:0.8, marginBottom:8 }}>SETS</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <button onClick={() => updateEx(ei,{sets:Math.max(1,sets-1)})} style={{ width:28, height:28, borderRadius:8, background:isDark?"#222":"#F1F5F9", border:"none", color:BLUE, fontSize:18, fontWeight:900, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
                      <span style={{ fontSize:20, fontWeight:800, color:TXT, fontFamily:MONO }}>{sets}</span>
                      <button onClick={() => updateEx(ei,{sets:sets+1})} style={{ width:28, height:28, borderRadius:8, background:isDark?"#222":"#F1F5F9", border:"none", color:BLUE, fontSize:18, fontWeight:900, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
                    </div>
                  </div>
                  {/* Reps */}
                  <div style={{ padding:"12px 14px", borderRight:`1px solid ${BORD}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:SUB, letterSpacing:0.8, marginBottom:8 }}>REPS</div>
                    <input value={ex.reps||""} onChange={e => updateEx(ei,{reps:e.target.value})} placeholder="8–12"
                      style={{ width:"100%", background:"none", border:"none", outline:"none", fontSize:16, fontWeight:700, color:TXT, fontFamily:MONO, textAlign:"center" }} />
                  </div>
                  {/* Rest */}
                  <div style={{ padding:"12px 14px" }}>
                    <div style={{ fontSize:10, fontWeight:700, color:SUB, letterSpacing:0.8, marginBottom:8 }}>REST</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
                      <input value={ex.rest||""} onChange={e => updateEx(ei,{rest:e.target.value})} placeholder="90" type="number" inputMode="numeric"
                        style={{ width:"100%", background:"none", border:"none", outline:"none", fontSize:16, fontWeight:700, color:TXT, fontFamily:MONO, textAlign:"center" }} />
                      <span style={{ fontSize:11, color:SUB, flexShrink:0 }}>s</span>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div style={{ borderTop:`1px solid ${BORD}`, padding:"10px 16px" }}>
                  <input value={ex.note||""} onChange={e => updateEx(ei,{note:e.target.value})} placeholder="Add a note (optional)..."
                    style={{ width:"100%", background:"none", border:"none", outline:"none", fontSize:12, color:SUB, fontFamily:F }} />
                </div>
              </div>
            );
          })
        )}

        <button onClick={addEx} style={{ width:"100%", marginTop:4, padding:"15px", background:isDark?"#141414":"#fff", border:`1.5px dashed ${isDark?"#2563eb44":"#BFDBFE"}`, borderRadius:16, color:BLUE, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F }}>+ Add Exercise</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// WORKOUT TRACKER
// ═════════════════════════════════════════════════════════════════════════════
const SESSION_KEY = "seshd_active_session";
const WSTART_KEY = "seshd_wstart";

// Inline code-redeem row used in the templates modal
function CodeRedeemRow({ C, store, setStore, onClose, token, initialCode = null }) {
  const [open, setOpen] = useState(!!initialCode);
  const [code, setCode] = useState(initialCode || "");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  // Auto-lookup when initialCode is provided
  useEffect(() => {
    if (initialCode) {
      lookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup() {
    setError("");
    setPreview(null);
    const c = normalizeShareCode(code);
    if (!c || c.length < 3) { setError("Enter a code"); return; }
    setLoading(true);
    try {
      // Workout codes start with WO-
      if (c.startsWith("WO-")) {
        const rows = await sb.query(
          `workout_codes?code=eq.${encodeURIComponent(c)}&select=code,day_name,exercises`,
          {},
          token
        );
        if (!rows || rows.length === 0) {
          setError("Code not found");
        } else {
          const w = rows[0];
          setPreview({
            kind: "workout",
            name: w.day_name,
            days: [{ id: uid(), name: w.day_name, exercises: w.exercises || [] }],
            exerciseCount: (w.exercises || []).length,
          });
        }
      } else {
        const rows = await sb.query(
          `programs?share_code=eq.${encodeURIComponent(c)}&select=id,name,days,user_id`,
          {},
          token
        );
        if (!rows || rows.length === 0) {
          setError("Code not found");
        } else {
          setPreview({ ...rows[0], kind: "program" });
        }
      }
    } catch (e) {
      setError("Couldn't look up code");
    } finally {
      setLoading(false);
    }
  }

  function importProgram() {
    if (!preview) return;
    const newId = uid();
    const isWorkout = preview.kind === "workout";
    const imported = {
      id: newId,
      name: isWorkout ? `${preview.name} (imported)` : `${preview.name} (imported)`,
      days: preview.days || [],
    };
    setStore(p => ({
      ...p,
      programs: [...(p.programs || []), imported],
      activeProgramId: newId,
    }));
    // Save to user's account
    if (token) {
      sb.query("programs", {
        method: "POST",
        body: JSON.stringify({
          id: newId,
          name: imported.name,
          days: imported.days,
          is_active: true,
        })
      }, token).catch(e => console.error("save imported program:", e));
    }
    toast(isWorkout ? "Workout imported" : "Program imported", "success");
    setCode("");
    setPreview(null);
    setOpen(false);
    if (onClose) onClose();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width:"100%", background:"transparent", color:C.sub,
        border:`1px dashed ${C.border}`, borderRadius:14,
        padding:"13px", fontSize:13, fontWeight:600,
        cursor:"pointer", fontFamily:F, marginTop:8,
        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
      }}>
        <Icon name="zap" size={14} color={C.sub}/>
        Have a code? Import a program
      </button>
    );
  }

  return (
    <div style={{ marginTop:8, padding:"14px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:12, fontWeight:700, color:C.text, letterSpacing:0.5 }}>ENTER SHARE CODE</div>
        <button onClick={() => { setOpen(false); setCode(""); setPreview(null); setError(""); }} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", padding:4 }}>
          <Icon name="x" size={14} color={C.muted}/>
        </button>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); setPreview(null); }}
          onKeyDown={e => { if (e.key === "Enter") lookup(); }}
          placeholder="IGNITE-X9K2 or WO-X9K2"
          autoCapitalize="characters"
          autoCorrect="off"
          style={{
            flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:10,
            padding:"11px 12px", fontSize:15, fontWeight:600, color:C.text, outline:"none",
            fontFamily:MONO, letterSpacing:1, boxSizing:"border-box",
          }}
        />
        <button onClick={lookup} disabled={loading || !code.trim()} style={{
          background: loading ? C.sub : C.text, color: C.bg,
          border:"none", borderRadius:10, padding:"0 16px",
          fontSize:13, fontWeight:700, cursor: loading ? "not-allowed" : "pointer",
          fontFamily:F, flexShrink:0,
        }}>{loading ? "..." : "Find"}</button>
      </div>
      {error && <div style={{ fontSize:12, color:"#EF4444", marginTop:10 }}>{error}</div>}
      {preview && (
        <div style={{ marginTop:12, padding:"12px", background:C.divider, borderRadius:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
            <span style={{ fontSize:9, fontWeight:800, letterSpacing:1.2, color:C.bg, background:C.text, padding:"2px 6px", borderRadius:5 }}>
              {preview.kind === "workout" ? "WORKOUT" : "PROGRAM"}
            </span>
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{preview.name}</div>
          <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>
            {preview.kind === "workout"
              ? `${preview.exerciseCount} exercises`
              : `${(preview.days||[]).length} days · ${(preview.days||[]).reduce((a,d)=>a+(d.exercises?.length||0),0)} exercises`
            }
          </div>
          <button onClick={importProgram} style={{
            marginTop:10, width:"100%", background:C.text, color:C.bg,
            border:"none", borderRadius:10, padding:"11px", fontSize:13, fontWeight:700,
            cursor:"pointer", fontFamily:F,
          }}>Import & make active</button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDIT HISTORY MODAL — fix wrong numbers in an already-saved workout
// ═════════════════════════════════════════════════════════════════════════════
function EditHistoryModal({ editing, unit, C, token, currentUserId, store, setStore, onClose }) {
  const { date, sid, sess } = editing;
  const [exercises, setExercises] = useState(() => JSON.parse(JSON.stringify(sess.exercises || [])));
  const [saving, setSaving] = useState(false);

  function updateSet(ei, si, patch) {
    setExercises(p => p.map((ex, i) => i !== ei ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== si ? s : { ...s, ...patch })
    }));
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    // 1. Update local history
    setStore(prev => {
      const dayHistory = { ...(prev.history[date] || {}) };
      if (dayHistory[sid]) {
        dayHistory[sid] = { ...dayHistory[sid], exercises };
      }
      return { ...prev, history: { ...prev.history, [date]: dayHistory } };
    });
    // 2. Patch DB row
    try {
      if (token && !String(sid).startsWith("local_")) {
        await sb.query(`workout_history?id=eq.${sid}`, {
          method: "PATCH",
          body: JSON.stringify({ exercises })
        }, token);
      }
    } catch (e) {
      console.error("edit workout failed:", e);
      toast("Saved locally — couldn't sync to server", "error");
      setSaving(false);
      onClose();
      return;
    }
    // 3. Update any feed post that links to this workout (best-effort: match by dayName + finishedAt window)
    setStore(prev => {
      const newPosts = (prev.posts || []).map(p => {
        if (p.userId !== currentUserId) return p;
        if (p.type !== "workout") return p;
        if (!p.workout) return p;
        if (p.workout.name !== sess.dayName) return p;
        // Match if posted around the same time as the workout finished
        const finishedAt = sess.finishedAt || new Date(date).getTime();
        if (Math.abs((p.createdAt || 0) - finishedAt) > 86400000) return p; // > 24h apart, not the same workout
        // Rebuild the post.workout.exercises to reflect new numbers
        const postEx = exercises.filter(e => e.name).map(ex => {
          const doneSets = (ex.sets || []).filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0));
          const maxW = Math.max(0, ...doneSets.map(s => parseFloat(s.weight) || 0));
          return {
            name: ex.name,
            isPR: maxW > 0 && maxW >= ((prev.prs || {})[ex.name] || 0) * 0.99,
            sets: doneSets.map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 })),
          };
        });
        const newVolume = exercises.reduce((a, ex) => a + (ex.sets || [])
          .filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0))
          .reduce((b, s) => b + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0), 0);
        return { ...p, workout: { ...p.workout, exercises: postEx, volume: Math.round(newVolume) } };
      });
      return { ...prev, posts: newPosts };
    });
    // 4. Patch any matching feed post on the server too (best-effort)
    try {
      if (token) {
        const match = (store.posts || []).find(p =>
          p.userId === currentUserId &&
          p.type === "workout" &&
          p.workout?.name === sess.dayName &&
          Math.abs((p.createdAt || 0) - (sess.finishedAt || new Date(date).getTime())) < 86400000
        );
        if (match && !String(match.id).startsWith("hist_")) {
          // Recompute the workout payload to mirror local state
          const postEx = exercises.filter(e => e.name).map(ex => {
            const doneSets = (ex.sets || []).filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0));
            const maxW = Math.max(0, ...doneSets.map(s => parseFloat(s.weight) || 0));
            return {
              name: ex.name,
              isPR: maxW > 0 && maxW >= ((store.prs || {})[ex.name] || 0) * 0.99,
              sets: doneSets.map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 })),
            };
          });
          const newVolume = exercises.reduce((a, ex) => a + (ex.sets || [])
            .filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0))
            .reduce((b, s) => b + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0), 0);
          await sb.query(`posts?id=eq.${match.id}`, {
            method: "PATCH",
            body: JSON.stringify({ workout: { ...(match.workout || {}), exercises: postEx, volume: Math.round(newVolume) } })
          }, token);
        }
      }
    } catch (e) {
      console.error("post sync failed:", e);
    }
    toast("Workout updated", "success");
    haptic("complete");
    setSaving(false);
    onClose();
  }

  return (
    <div style={{
      position:"fixed", inset:0, background:C.bg, zIndex:600,
      maxWidth:480, margin:"0 auto", display:"flex", flexDirection:"column",
    }}>
      <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.divider}` }}>
        <button onClick={onClose} style={{ background:"none", border:"none", color:C.sub, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:F }}>Cancel</button>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, letterSpacing:-0.2 }}>Edit workout</div>
        <button onClick={handleSave} disabled={saving} style={{ background:"none", border:"none", color:C.accent, fontSize:14, fontWeight:700, cursor: saving ? "default" : "pointer", fontFamily:F, opacity: saving ? 0.5 : 1 }}>{saving ? "..." : "Save"}</button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px 32px" }}>
        <div style={{ fontSize:11, color:C.sub, marginBottom:10, letterSpacing:0.4, fontWeight:600 }}>{sess.dayName} · {new Date(date).toLocaleDateString()}</div>
        {exercises.map((ex, ei) => (
          <div key={ei} style={{ marginBottom:18, background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 12px 8px" }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:8, letterSpacing:-0.2 }}>{ex.name || "Unnamed"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 28px", gap:8, alignItems:"center", marginBottom:6 }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:0.5 }}>SET</div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:0.5 }}>{unit?.toUpperCase() || "LBS"}</div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, letterSpacing:0.5 }}>REPS</div>
              <div/>
            </div>
            {(ex.sets || []).map((s, si) => (
              <div key={si} style={{ display:"grid", gridTemplateColumns:"30px 1fr 1fr 28px", gap:8, alignItems:"center", marginBottom:6 }}>
                <div style={{ fontSize:13, color:C.sub, fontWeight:700, fontFamily:MONO }}>{si + 1}</div>
                <input type="number" inputMode="decimal" value={s.weight || ""} onFocus={e => e.target.select()} onChange={e => updateSet(ei, si, { weight: e.target.value })}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:8, padding:"7px 8px", fontSize:14, fontWeight:700, color:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
                />
                <input type="number" inputMode="numeric" value={s.reps || ""} onFocus={e => e.target.select()} onChange={e => updateSet(ei, si, { reps: e.target.value })}
                  style={{ width:"100%", background:C.bg, border:`1.5px solid ${C.divider}`, borderRadius:8, padding:"7px 8px", fontSize:14, fontWeight:700, color:C.text, textAlign:"center", outline:"none", fontFamily:MONO, boxSizing:"border-box" }}
                />
                <button onClick={() => setExercises(p => p.map((x, i) => i !== ei ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) }))} style={{ background:"none", border:"none", color:C.sub, fontSize:18, cursor:"pointer", padding:0 }}>×</button>
              </div>
            ))}
            <button onClick={() => setExercises(p => p.map((x, i) => i !== ei ? x : { ...x, sets: [...x.sets, { id: uid(), weight: "", reps: "", done: true, type: "normal" }] }))}
              style={{ width:"100%", marginTop:4, background:"transparent", border:`1px dashed ${C.border}`, borderRadius:8, padding:"7px", fontSize:12, color:C.sub, cursor:"pointer", fontFamily:F, fontWeight:600 }}>
              + Add set
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutTracker({ store, setStore, onShareWorkout, onSaveWorkout, onSaveProgram, onProgramEdited, onPRHit, onDeleteHistory, onRefresh, currentUserId, token, C }) {
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
  const REST_KEY = "seshd_rest";
  const [rest, setRest] = useState(() => {
    try {
      const raw = localStorage.getItem(REST_KEY);
      if (!raw) return null;
      const r = JSON.parse(raw);
      if (!r?.startedAt || !r?.total) return null;
      // Recompute secs based on real elapsed time so it's accurate after coming back
      const elapsedMs = Date.now() - r.startedAt;
      const secsRemaining = Math.max(0, r.total - Math.floor(elapsedMs / 1000));
      if (secsRemaining === 0) return null; // already finished while away
      return { ...r, secs: secsRemaining };
    } catch { return null; }
  });
  // Persist rest state across tab switches / unmounts
  useEffect(() => {
    try {
      if (rest && rest.running) {
        localStorage.setItem(REST_KEY, JSON.stringify(rest));
      } else {
        localStorage.removeItem(REST_KEY);
      }
    } catch {}
  }, [rest]);
  const [restEditor, setRestEditor] = useState(null);
  const [showFinish, setShowFinish] = useState(false);
  const [showGroupShare, setShowGroupShare] = useState(false); // group picker after finish-and-share-to-groups
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [show1RM, setShow1RM] = useState(false);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [subTab, setSubTab] = useState("workout");
  const [showTemplates, setShowTemplates] = useState(false);
  const [prefilledCode, setPrefilledCode] = useState(null);
  const [showAICoach, setShowAICoach] = useState(false);
  const [viewingProgram, setViewingProgram] = useState(null); // program ID
  const [showBuilder, setShowBuilder] = useState(false);
  const [initialDayIdx, setInitialDayIdx] = useState(0);
  const [previewDay, setPreviewDay] = useState(null); // {day, programName}
  const [editingHistory, setEditingHistory] = useState(null); // { date, sid, sess }
  // Keyboard accessory bar — tracks which set input is focused so we can show quick +/- buttons above the keyboard
  const [focusedSet, setFocusedSet] = useState(null); // { ei, si, field: "weight"|"reps", isCardio }
  const [prBurst, setPrBurst] = useState(0); // increment to trigger a fresh confetti burst (used as key)
  // Clear the burst after its animation finishes so the DOM doesn't grow indefinitely.
  // Burst duration is ~1.3s max (0.9 + 0.4 random delay), give it 2s of buffer.
  useEffect(() => {
    if (prBurst === 0) return;
    const id = setTimeout(() => setPrBurst(0), 2000);
    return () => clearTimeout(id);
  }, [prBurst]);
  // Tracks the bottom inset created by the iOS keyboard (and its built-in input accessory bar).
  // visualViewport shrinks when the keyboard opens; we use the difference to position our toolbar above it.
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      // window.innerHeight - vv.height = pixels the keyboard is covering at the bottom (approx)
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(overlap);
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  const [viewingExercise, setViewingExercise] = useState(null);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("All");
  const elRef = useRef(null);
  // Reorder mode — when on, exercises collapse to compact rows you can drag freely
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingEx, setDraggingEx] = useState(null); // { index, offsetY, height, startY }
  const dragStartRef = useRef(null);
  const reorderListRef = useRef(null);

  function startReorderDrag(ei, e) {
    const t = e.touches?.[0] || e;
    const li = reorderListRef.current?.children[ei];
    const height = li ? li.offsetHeight : 56;
    dragStartRef.current = { y: t.clientY, ei };
    setDraggingEx({ index: ei, offsetY: 0, height });
    haptic("medium");
  }
  function onReorderTouchMove(e) {
    if (!draggingEx || !dragStartRef.current) return;
    const t = e.touches[0];
    const offsetY = t.clientY - dragStartRef.current.y;
    setDraggingEx(d => d ? { ...d, offsetY } : null);
    e.preventDefault();
  }
  function onReorderTouchEnd() {
    if (!draggingEx || !dragStartRef.current) return;
    const fromIdx = dragStartRef.current.ei;
    const height = draggingEx.height || 56;
    const slots = Math.round(draggingEx.offsetY / height);
    const toIdx = Math.max(0, Math.min((session?.exercises.length || 1) - 1, fromIdx + slots));
    if (toIdx !== fromIdx && session) {
      setSession(p => {
        const arr = [...p.exercises];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        return { ...p, exercises: arr };
      });
      haptic("complete");
    }
    setDraggingEx(null);
    dragStartRef.current = null;
  }

  // Memoized running volume — recomputed only when session changes, not on every keystroke
  const runningVolume = useMemo(() => {
    if (!session) return 0;
    return session.exercises.reduce(
      (a, ex) => a + (ex.sets || []).filter(s => s.done).reduce(
        (b, s) => b + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0
      ), 0
    );
  }, [session]);

  // Listen for code-import requests from feed posts
  useEffect(() => {
    function handleOpenCode(e) {
      const c = e?.detail?.code;
      if (c) {
        setPrefilledCode(c);
        setShowTemplates(true);
      }
    }
    window.addEventListener("seshd:open-code-internal", handleOpenCode);
    return () => window.removeEventListener("seshd:open-code-internal", handleOpenCode);
  }, []);
  const rtRef = useRef(null);

  useEffect(() => {
    if (!session) { try { localStorage.removeItem(SESSION_KEY); } catch {} return; }
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
      try { localStorage.setItem(WSTART_KEY, String(wStart)); } catch {}
      elRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-wStart)/1000)), 1000);
    } else {
      try { localStorage.removeItem(WSTART_KEY); } catch {}
    }
    return () => clearInterval(elRef.current);
  }, [wStart]);

  useEffect(() => {
    clearInterval(rtRef.current);
    if (rest?.running && rest.secs > 0) {
      rtRef.current = setInterval(() => setRest(p => {
        if (!p || !p.running) return p;
        // Always recalculate from startedAt if available (handles backgrounding)
        if (p.startedAt) {
          const elapsed = Math.floor((Date.now() - p.startedAt) / 1000);
          const remaining = Math.max(0, p.total - elapsed);
          if (remaining <= 0) {
            clearInterval(rtRef.current);
            try {
              const Ctx = window.AudioContext || window.webkitAudioContext;
              if (Ctx) {
                const ac = new Ctx();
                const now = ac.currentTime;
                [660,880,1100].forEach((freq,i) => {
                  const osc = ac.createOscillator(); const gain = ac.createGain();
                  osc.type = "sine"; osc.frequency.value = freq;
                  gain.gain.setValueAtTime(0.0001, now+i*0.18);
                  gain.gain.exponentialRampToValueAtTime(0.7, now+i*0.18+0.01);
                  gain.gain.exponentialRampToValueAtTime(0.0001, now+i*0.18+0.25);
                  osc.connect(gain).connect(ac.destination);
                  osc.start(now+i*0.18); osc.stop(now+i*0.18+0.3);
                });
                setTimeout(() => { try { ac.close(); } catch {} }, 1200);
              }
            } catch {}
            try { if (navigator.vibrate) navigator.vibrate([200,100,200,100,400]); } catch {}
            try { toast("Rest is up — go", "success"); } catch {}
            // System notification — shows in the notification tray even if the app is backgrounded
            try {
              if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
                new Notification("Rest's up — back to work", {
                  body: "Go hit your next set",
                  icon: "/icon-192.png",
                  badge: "/icon-192.png",
                  tag: "seshd-rest",
                  silent: false,
                });
              }
            } catch {}
            try {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Rest time's up 🔥", { body:"Get back to it.", icon:"/icon-192.png", tag:"rest-timer" });
              }
            } catch {}
            return null;
          }
          return { ...p, secs: remaining };
        }
        // Fallback: count down
        if (p.secs <= 1) return null;
        return { ...p, secs: p.secs - 1 };
      }), 1000);
    }
    return () => clearInterval(rtRef.current);
  }, [rest?.running, rest?.startedAt]);

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

  // "Repeat workout" — start a new session pre-loaded from a past session's exercises.
  // Pre-fills the same set count + previous weight/reps as placeholders (via the existing prev system).
  function repeatFromSession(pastSession) {
    if (!pastSession?.exercises) return;
    const exs = pastSession.exercises.filter(e => e.name).map(ex => {
      const oldSets = (ex.sets || []).filter(s => s.done === true || (s.done !== false && (parseFloat(s.reps) > 0 || parseFloat(s.r) > 0)));
      const setCount = Math.max(1, oldSets.length);
      return {
        id: uid(),
        name: ex.name,
        reps: ex.reps || "",
        note: ex.note || "",
        sets: Array.from({ length: setCount }, () => ({
          id: uid(),
          weight: "",
          reps: "",
          done: false,
          type: "normal",
        })),
      };
    });
    setSession({
      dayId: null,
      dayName: pastSession.dayName || "Repeat workout",
      programId: store.activeProgramId || null,
      exercises: exs,
    });
    setWStart(Date.now());
    setElapsed(0);
    setSubTab("workout");
  }

  function toggleDone(ei, si) {
    setSession(p => {
      const nowDone = !p.exercises[ei]?.sets[si]?.done;

      if (nowDone) {
        const currentExercise = p.exercises[ei];
        const currentSet = currentExercise?.sets[si];

        // Mid-workout PR detection — fire PR haptic + confetti burst if this set is a new record
        if (currentSet?.weight && currentSet?.reps && currentSet?.type !== "warmup") {
          const wLbs = unit === "lbs" ? parseFloat(currentSet.weight) : cvt(parseFloat(currentSet.weight), "kg", "lbs");
          const currentPR = store.prs?.[currentExercise.name] || 0;
          if (wLbs > currentPR && wLbs > 0) {
            haptic("pr");
            setPrBurst(b => b + 1);
          } else {
            // Last set of an exercise gets a richer haptic + slight nod
            const isLastSet = si === currentExercise.sets.length - 1;
            haptic(isLastSet ? "complete" : "medium");
          }
        } else {
          haptic("complete");
        }

        const restSecs = parseInt(currentSet?.restTime || currentExercise?.rest || 90) || 90;
        setRest({ secs: restSecs, total: restSecs, running: true, startedAt: Date.now(), exerciseIdx: ei });
      } else {
        haptic("undo");
        setRest(null);
      }

      return {
        ...p,
        exercises: p.exercises.map((ex, i) => i !== ei ? ex : {
          ...ex,
          sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: nowDone })
        })
      };
    });
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

  async function finishWorkout(share, groupShare = null) {
    if (!session || finishing) return;
    setFinishing(true);
    setShowFinish(false);
    setShowGroupShare(false);

    try {
      const dk = dKey();
      const sid = uid();
      const originalPRs = { ...store.prs }; // snapshot before any updates
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
            [sid]: { dayName: session.dayName, exercises: cleanEx, duration: elapsed, unit, note: "", finishedAt: Date.now() }
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
        .filter(([k, v]) => (originalPRs[k] || 0) < v)
        .map(([name, weight]) => ({ name, weight: unit === "lbs" ? weight : cvt(weight, "lbs", "kg") }));
      const totalSets = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done && s.type !== "warmup").length, 0);
      const totalVol = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done && s.type !== "warmup").reduce((b, s) => b + (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0), 0), 0);

      // Clear session first so workout screen dismisses
      clearInterval(elRef.current);
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      setSession(null);
      setWStart(null);
      setElapsed(0);
      setRest(null);

      // Compute progressions hit — exercises where user matched or beat suggested target
      let progressionsHit = 0;
      try {
        session.exercises.forEach(ex => {
          if (!ex.name) return;
          // Compare this session's best set vs the suggestion made for this session
          // (suggestion was computed from history that excluded this session)
          // We rebuild the suggestion from history WITHOUT this session
          const histExcludingNow = { ...store, history: store.history };
          const sug = suggestNextSet(histExcludingNow, ex.name, ex.reps, unit, 0);
          if (!sug) return;
          const doneSets = (ex.sets||[]).filter(s => s.done && s.type !== "warmup");
          if (!doneSets.length) return;
          const topWeight = Math.max(...doneSets.map(s => parseFloat(s.weight)||0));
          const topReps = Math.max(...doneSets.filter(s => parseFloat(s.weight) === topWeight).map(s => parseFloat(s.reps)||0));
          if (topWeight >= sug.weight && topReps >= sug.reps) progressionsHit++;
        });
      } catch (e) { /* ignore */ }

      // Build share data (used by both feed share and groups-only share)
      const shareData = (() => {
        const postEx = session.exercises
          .filter(ex => ex.name && ex.sets.some(s => s.done === true && s.type !== "warmup"))
          .map(ex => {
            const maxW = Math.max(0, ...ex.sets.filter(s => s.done === true && s.weight && s.type !== "warmup").map(s => parseFloat(s.weight) || 0));
            const maxLbs = unit === "lbs" ? maxW : cvt(maxW, "kg", "lbs");
            return {
              name: ex.name,
              sets: ex.sets.filter(s => s.done === true && s.type !== "warmup").map(s => ({ w: parseFloat(s.weight) || 0, r: parseFloat(s.reps) || 0 })),
              isPR: maxLbs > 0 && maxLbs > (originalPRs[ex.name] || 0)
            };
          })
          .filter(ex => ex.sets.length > 0);
        const vol = postEx.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
        const hasPR = postEx.some(ex => ex.isPR);
        return { type:"workout", caption:`${session.dayName} — done.`, unit, workout:{ name:session.dayName, duration:elapsed, volume:Math.round(vol), exercises:postEx }, isPR: hasPR };
      })();

      // If user picked "Save & send to groups", post to groups only and skip summary
      if (groupShare && groupShare.groupIds && groupShare.groupIds.length > 0) {
        onShareWorkout({ ...shareData, groupIds: groupShare.groupIds, groupOnly: true });
        // Fire-and-forget DB save
        onSaveWorkout({ dayName: session.dayName, exercises: session.exercises.filter(ex => ex.name && ex.sets.some(s => s.done)).map(ex => ({ name: ex.name, sets: ex.sets.filter(s => s.done).map(s => ({ weight: s.weight, reps: s.reps, done: true, type: s.type })) })), duration: elapsed, unit, note: "", prs: newPRs });
        toast(`Sent to ${groupShare.groupIds.length} group${groupShare.groupIds.length===1?"":"s"}`, "success");
        if (hitPR) setTimeout(() => onPRHit(hitPR), 300);
        return;
      }

      // Show summary
      // Capture undo info so user can roll back if they finished by accident
      setWorkoutSummary({
        dayName: session.dayName,
        duration: fmtTime(elapsed),
        sets: totalSets,
        volume: fmtVol(Math.round(totalVol), unit),
        exercises: session.exercises.filter(e => e.name).length,
        prs: newPRsList,
        progressions: progressionsHit,
        share,
        shareData,
        undo: {
          dk, sid,
          // Full snapshot of the session so we can restore it
          session: JSON.parse(JSON.stringify(session)),
          elapsed,
          prevPRs: originalPRs,
        },
      });
      setShowWorkoutSummary(true);

      // Fire-and-forget DB save (don't block UI)
      onSaveWorkout({ dayName: session.dayName, exercises: session.exercises.filter(ex => ex.name && ex.sets.some(s => s.done)).map(ex => ({ name: ex.name, sets: ex.sets.filter(s => s.done).map(s => ({ weight: s.weight, reps: s.reps, done: true, type: s.type })) })), duration: elapsed, unit, note: "", prs: newPRs });

      toast(share ? "Workout posted" : "Workout saved", "success");
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
        {viewingExercise && (
          <ExerciseDetail
            name={viewingExercise}
            store={store}
            unit={unit}
            C={C}
            onClose={() => setViewingExercise(null)}
          />
        )}
        {editingHistory && (
          <EditHistoryModal
            editing={editingHistory}
            unit={unit}
            C={C}
            token={token}
            currentUserId={currentUserId}
            store={store}
            setStore={setStore}
            onClose={() => setEditingHistory(null)}
          />
        )}

        {/* Header */}
        <div style={{ background:C.bg, padding:"10px 14px 8px", borderBottom:`1px solid ${C.divider}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => { clearInterval(elRef.current); try { localStorage.removeItem(SESSION_KEY); } catch {} setSession(null); setWStart(null); setElapsed(0); setRest(null); }} style={{ fontSize:13, color:C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{session.dayName}</div>
            <div style={{ fontSize:28, fontWeight:800, color:C.accent, fontFamily:MONO, lineHeight:1.1 }}>{fmtTime(elapsed)}</div>
          </div>
          <button onClick={() => setShowFinish(true)} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"8px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F }}>Finish</button>
        </div>

        {/* Progress + tools */}
        <div style={{ background:C.surface, padding:"8px 14px 10px", borderBottom:`1px solid ${C.divider}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ fontSize:11, color:C.sub, fontWeight:600 }}>
              {done} / {total} sets ·{" "}
              <AnimatedNumber
                value={runningVolume}
                style={{ fontWeight:700, color:C.text, fontFamily:MONO }}
              />
              {" "}{unit.toUpperCase()}
            </span>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShow1RM(true)} style={{ fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F, fontWeight:600 }}>1RM</button>
              <button onClick={() => setShowPlateCalc(true)} style={{ fontSize:11, color:C.accent, background:"none", border:"none", cursor:"pointer", fontFamily:F, fontWeight:600 }}>Plates</button>
            </div>
          </div>
          <div style={{ height:4, background:C.divider, borderRadius:4, overflow:"hidden" }}>
            <div style={{ height:"100%", background:C.accent, width:`${(done/Math.max(total,1))*100}%`, transition:"width 0.4s", borderRadius:4 }}/>
          </div>
        </div>

        {/* Rest timer - Full screen modal */}
        {rest && !rest.minimized && (
          <div onClick={() => setRest(p => p ? ({ ...p, minimized: true }) : p)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle at center, ${rest.secs<=10 ? "rgba(239,68,68,0.12)" : "rgba(56,189,248,0.12)"} 0%, transparent 70%)`, pointerEvents:"none" }}/>
            <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:380, borderRadius:28, padding:24, background:"rgba(15,23,42,0.95)", boxShadow:"0 32px 100px rgba(0,0,0,0.35)", position:"relative", display:"flex", flexDirection:"column", alignItems:"center", gap:18 }}>
              <div style={{ position:"absolute", top:16, right:16 }}>
                <button onClick={() => setRest(p => p ? ({ ...p, minimized:true }) : p)} style={{ background:"rgba(255,255,255,0.08)", border:"none", color:"#fff", borderRadius:999, padding:"10px 14px", fontSize:12, cursor:"pointer", fontFamily:F }}>Minimize</button>
              </div>
              <div style={{ width:260, height:260, position:"relative" }}>
                {rest.secs<=10 && rest.running && (
                  <div style={{ position:"absolute", inset:-10, borderRadius:"50%", background:"rgba(239,68,68,0.2)", animation:"pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}/>
                )}
                <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", transform:"rotate(-90deg)" }}>
                  <defs>
                    <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={rest.secs<=10 ? "#ef4444" : C.accent} stopOpacity="0.35"/>
                      <stop offset="100%" stopColor={rest.secs<=10 ? "#dc2626" : C.accent} stopOpacity="0.1"/>
                    </linearGradient>
                  </defs>
                  <circle cx="130" cy="130" r="125" fill="none" stroke={`${C.divider}40`} strokeWidth="10"/>
                  <circle cx="130" cy="130" r="125" fill="none"
                    stroke={rest.secs<=10 ? "#ef4444" : C.accent}
                    strokeWidth="10"
                    strokeDasharray={`${(rest.secs/rest.total)*2*Math.PI*125} ${2*Math.PI*125}`}
                    style={{ transition:"stroke-dasharray 1s linear, stroke 0.3s ease", strokeLinecap:"round", filter:"drop-shadow(0 0 18px rgba(56,189,248,0.35))" }}
                  />
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", userSelect:"none" }}
                  onClick={() => {
                    try { navigator.vibrate(10); } catch {}
                    setRest(p => {
                      if (!p) return null;
                      const newRunning = !p.running;
                      if (newRunning) {
                        return { ...p, running: newRunning, startedAt: Date.now() - ((p.total - p.secs) * 1000) };
                      }
                      return { ...p, running: newRunning };
                    });
                  }}
                >
                  <div style={{ fontSize:12, color:"#93c5fd", fontWeight:700, letterSpacing:1.2, marginBottom:10, textTransform:"uppercase" }}>
                    {rest.running ? "Tap to pause" : "Tap to resume"}
                  </div>
                  <div style={{ fontSize:72, fontWeight:900, color:rest.secs<=10 ? "#f87171" : "#38bdf8", fontFamily:MONO, lineHeight:1, letterSpacing:-1.5, textShadow:rest.running ? `0 0 18px rgba(56,189,248,0.4)` : "none" }}>
                    {fmtTime(rest.secs)}
                  </div>
                  <div style={{ fontSize:12, color:"#cbd5e1", marginTop:10 }}>
                    of {fmtTime(rest.total)}
                  </div>
                </div>
              </div>
              <div style={{ width:"100%", display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10 }}>
                {[{s:90,label:"1.5m"},{s:120,label:"2m"},{s:180,label:"3m"},{s:300,label:"5m"}].map(({s,label}) => (
                  <button key={s}
                    onClick={() => { setRest({ secs:s, total:s, running:true, startedAt:Date.now() }); try{navigator.vibrate(10);} catch{} }}
                    style={{
                      padding:"12px 0", borderRadius:14, fontSize:12, fontWeight:700, fontFamily:MONO,
                      background: rest.total===s ? C.accent : C.surface,
                      border: `2px solid ${rest.total===s ? C.accent : C.divider}`,
                      color: rest.total===s ? "#fff" : C.text,
                      cursor:"pointer"
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:10, width:"100%", justifyContent:"space-between", flexWrap:"wrap" }}>
                <button onClick={() => setRest(p => {
                    if (!p) return null;
                    const newSecs = Math.max(0, p.secs - 10);
                    if (newSecs <= 0) return null;
                    const newTotal = Math.max(newSecs, p.total - 10);
                    return p.running ? { ...p, secs:newSecs, total:newTotal, startedAt:Date.now() - ((newTotal - newSecs) * 1000) } : { ...p, secs:newSecs, total:newTotal };
                  })}
                  style={{ flex:1, minWidth:120, padding:"12px", borderRadius:14, background:C.surface, border:`2px solid ${C.divider}`, color:C.text, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F }}>
                  −10s
                </button>
                <button onClick={() => setRest(p => {
                    if (!p) return null;
                    const newSecs = p.secs + 10;
                    const newTotal = p.total + 10;
                    return p.running ? { ...p, secs:newSecs, total:newTotal, startedAt: Date.now() - ((newTotal - newSecs) * 1000) } : { ...p, secs:newSecs, total:newTotal };
                  })}
                  style={{ flex:1, minWidth:120, padding:"12px", borderRadius:14, background:C.surface, border:`2px solid ${C.divider}`, color:C.text, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F }}>
                  +10s
                </button>
              </div>
              <div style={{ display:"flex", gap:10, width:"100%", flexWrap:"wrap", justifyContent:"space-between" }}>
                <input type="number" inputMode="numeric" placeholder="Custom seconds"
                  onBlur={e => { const v = parseInt(e.target.value); if (v > 0 && v <= 3600) { setRest({ secs:v, total:v, running:true, startedAt: Date.now() }); e.target.value = ""; } }}
                  onKeyDown={e => { if (e.key === "Enter") { const v = parseInt(e.target.value); if (v > 0 && v <= 3600) { setRest({ secs:v, total:v, running:true, startedAt: Date.now() }); e.target.value = ""; } e.target.blur(); } }}
                  style={{ flex:1, minWidth:120, padding:"14px 16px", borderRadius:14, border:`2px solid ${C.divider}`, background:C.surface, color:C.text, fontSize:14, outline:"none", fontFamily:F, textAlign:"center" }}
                />
                <button onClick={() => { clearInterval(rtRef.current); setRest(null); try{navigator.vibrate(20);} catch{} }}
                  style={{ minWidth:120, padding:"14px 16px", borderRadius:14, background:"#8B5CF6", border:"2px solid #8B5CF6", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F }}>
                  Skip
                </button>
              </div>
              <style>{`
                @keyframes pulse {
                  0%, 100% { opacity: 1; transform: scale(1); }
                  50% { opacity: 0.7; transform: scale(1.1); }
                }
              `}</style>
            </div>
          </div>
        )}

        {rest && rest.minimized && (
          <div style={{ position:"fixed", left:12, right:12, bottom:14, zIndex:490, padding:"14px 16px", borderRadius:22, background:C.surface, border:`1px solid ${C.divider}`, boxShadow:"0 20px 40px rgba(0,0,0,0.14)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0, flex:1 }}>
              <div style={{ width:56, height:56, borderRadius:18, background:C.divider, display:"grid", placeItems:"center", fontSize:18, fontWeight:700, color:C.text, fontFamily:MONO }}>
                {fmtTime(rest.secs)}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, color:C.sub, marginBottom:4 }}>{rest.running ? "Rest in progress" : "Paused rest"}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ flex:1, height:6, background:C.divider, borderRadius:999, overflow:"hidden" }}>
                    <div style={{ width:`${Math.round((rest.secs/rest.total)*100)}%`, height:"100%", background:C.accent }}/>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{Math.round((rest.secs/rest.total)*100)}%</div>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button onClick={() => setRest(p => p ? ({ ...p, minimized:false }) : p)} style={{ padding:"10px 14px", borderRadius:14, background:C.surface, border:`1px solid ${C.divider}`, color:C.accent, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:F }}>Expand</button>
              <button onClick={() => setRest(p => {
                if (!p) return null;
                const newRunning = !p.running;
                if (newRunning) {
                  return { ...p, running: newRunning, startedAt: Date.now() - ((p.total - p.secs) * 1000) };
                }
                return { ...p, running: newRunning };
              })} style={{ padding:"10px 14px", borderRadius:14, background:C.accent, border:"none", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:F }}>
                {rest.running ? "Pause" : "Resume"}
              </button>
            </div>
          </div>
        )}

        {/* Exercises */}

        <div style={{ overflowY:"auto", flex:1, paddingBottom:24 }}>
          {session.exercises.length > 1 && (
            <div style={{ padding:"10px 14px 0", display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => setReorderMode(true)} style={{
                background:"transparent", border:`1px solid ${C.border}`,
                borderRadius:10, padding:"6px 12px",
                fontSize:11, fontWeight:700, color:C.sub,
                letterSpacing:0.5, cursor:"pointer", fontFamily:F,
                display:"flex", alignItems:"center", gap:6,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                REORDER
              </button>
            </div>
          )}
          {session.exercises.map((ex, ei) => {
            const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
            return (
              <div key={ex.id || ei}>
                {/* Exercise header */}
                <div style={{ padding:"14px 14px 6px", display:"flex", alignItems:"flex-start", gap:10 }}>
                  <button onClick={() => ex.name && setViewingExercise(ex.name)} style={{ background:"none", border:"none", padding:0, cursor: ex.name ? "pointer" : "default", flexShrink:0, marginTop:2 }}>
                    <MuscleIcon muscle={exInfo?.muscle||""} size={36} C={C}/>
                  </button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <ExerciseInput value={ex.name}
                        onChange={v => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,name:v}) }))}
                        C={C} recentExercises={Object.values(store.history||{}).flatMap(Object.values).slice(0,20)}/>
                    </div>
                    {exInfo?.muscle && (
                      <div style={{ fontSize:11, color:C.sub, marginTop:1, display:"flex", alignItems:"center", gap:6 }}>
                        <span>{exInfo.muscle}</span>
                        {(ex.sets||[]).length > 0 && (
                          <div style={{ display:"flex", gap:3 }}>
                            {ex.sets.map((s, idx) => (
                              <div key={s.id || idx} style={{
                                width:6, height:6, borderRadius:"50%",
                                background: s.done ? C.green : (s.weight || s.reps) ? `${C.text}40` : `${C.muted}40`,
                              }}/>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <input value={ex.note||""}
                      onChange={e => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,note:e.target.value}) }))}
                      placeholder="Add note..."
                      style={{ width:"100%", background:"none", border:"none", padding:"3px 0", fontSize:11, color:C.sub, outline:"none", fontFamily:F, boxSizing:"border-box", marginTop:4 }}
                    />
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0, alignItems:"center" }}>
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
                    <SetRow set={set} si={si} ei={ei} exName={ex.name} store={store} unit={unit} repsTarget={ex.reps} C={C}
                      onFocusInput={(field) => setFocusedSet({ ei, si, field })}
                      onBlurInput={() => {
                        // small delay so a tap on the keyboard accessory button can register before clearing focused state
                        setTimeout(() => setFocusedSet(prev => (prev && prev.ei === ei && prev.si === si) ? null : prev), 100);
                      }}
                      onUpdate={patch => updateSet(ei,si,patch)}
                      onToggleDone={() => toggleDone(ei,si)}
                      onDelete={ex.sets.length > 1 ? () => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,sets:x.sets.filter((_,j)=>j!==si)}) })) : undefined}
                      onCopyToNext={() => setSession(p => ({
                        ...p,
                        exercises: p.exercises.map((x, i) => {
                          if (i !== ei) return x;
                          const sets = [...x.sets];
                          const src = sets[si];
                          const target = sets[si + 1];
                          if (!target) {
                            // Append a new set copied from current
                            sets.push({ id: uid(), weight: src.weight, reps: src.reps, done: false, type: src.type || "normal" });
                          } else {
                            // Only fill if target is empty (don't clobber)
                            sets[si + 1] = {
                              ...target,
                              weight: target.weight || src.weight,
                              reps: target.reps || src.reps,
                            };
                          }
                          return { ...x, sets };
                        })
                      }))}
                    />
                    <div style={{ display:"flex", alignItems:"center", padding:"0 14px" }}>
                      <div style={{ flex:1, height:1, background:`${C.accent}18` }}/>
                      <button onClick={() => setRestEditor({ ei, si })} style={{ background:"none", border:"none", cursor:"pointer", padding:"3px 10px", fontSize:11, fontWeight:700, color:`${C.accent}80`, fontFamily:MONO }}>
                        {fmtTime(set.restTime||store.defaultRestTime||120)}
                      </button>
                      <div style={{ flex:1, height:1, background:`${C.accent}18` }}/>
                    </div>
                    {restEditor?.ei === ei && restEditor?.si === si && (
                      <div style={{ margin:"10px 14px 0", padding:"12px", border:`1px solid ${C.divider}`, borderRadius:18, background:C.surface, display:"grid", gap:10 }}>
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:8 }}>
                          {[{s:90,label:"1.5m"},{s:120,label:"2m"},{s:180,label:"3m"},{s:300,label:"5m"}].map(({s,label}) => (
                            <button key={s} onClick={() => { updateSet(ei, si, { restTime: s }); setRestEditor(null); }} style={{ padding:"10px 0", borderRadius:14, border:`1px solid ${Number(set.restTime)===s ? C.accent : C.divider}`, background:Number(set.restTime)===s ? C.accent : C.bg, color:Number(set.restTime)===s ? "#fff" : C.text, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:F }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <input type="number" inputMode="numeric" placeholder="Custom sec"
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const v = parseInt(e.target.value);
                                if (v > 0) {
                                  updateSet(ei, si, { restTime: v });
                                  setRestEditor(null);
                                  e.target.value = "";
                                }
                              }
                            }}
                            style={{ flex:1, minWidth:0, padding:"10px 12px", border:`1px solid ${C.divider}`, borderRadius:14, background:C.bg, color:C.text, fontSize:12, outline:"none", fontFamily:F }}
                          />
                          <button onClick={() => setRestEditor(null)} style={{ padding:"10px 14px", borderRadius:14, border:"1px solid transparent", background:C.divider, color:C.sub, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:F }}>Close</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div style={{ display:"flex", padding:"8px 14px 12px", borderBottom:`1px solid ${C.divider}` }}>
                  <button onClick={() => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,sets:[...x.sets,{id:uid(),weight:"",reps:"",done:false,type:"normal"}]}) }))} style={{ flex:1, padding:"10px 12px", background:C.bg, border:`1px solid ${C.divider}`, borderRadius:12, color:C.accent, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F, textAlign:"left" }}>+ Add Set</button>
                  {ex.sets.length > 1 && <button onClick={() => setSession(p => ({ ...p, exercises: p.exercises.map((x,i)=>i!==ei?x:{...x,sets:x.sets.slice(0,-1)}) }))} style={{ flex:1, padding:"10px 12px", background:C.bg, border:`1px solid ${C.divider}`, borderRadius:12, color:C.sub, fontSize:13, cursor:"pointer", fontFamily:F, textAlign:"right" }}>Remove</button>}
                </div>
              </div>
            );
          })}

          <button onClick={() => setSession(p => ({ ...p, exercises:[...p.exercises,{id:uid(),name:"",reps:"",note:"",sets:[{id:uid(),weight:"",reps:"",done:false,type:"normal"}]}] }))} style={{
            width:"calc(100% - 28px)", margin:"14px 14px 0", padding:"13px",
            background:C.bg, border:`1px solid ${C.divider}`,
            borderRadius:16, fontSize:13, color:C.accent, fontWeight:700, cursor:"pointer", fontFamily:F
          }}>+ Add Exercise</button>
        </div>

        {showWorkoutSummary && workoutSummary && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
            <div style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}`, maxHeight:"90dvh", display:"flex", flexDirection:"column" }}>
              <div style={{ overflowY:"auto", flex:1, padding:"24px 18px 0" }}>
                {/* Shareable card — magazine-quality art piece */}
                <div id="workout-card" className="seshd-scale-enter" style={{
                  background: "#0A0A0A",
                  borderRadius: 24, padding: "32px 26px 26px",
                  marginBottom: 16, position: "relative", overflow: "hidden",
                  aspectRatio: "4/5",
                  display: "flex", flexDirection: "column",
                  fontFamily: F,
                  color: "#fff",
                }}>
                  {/* Subtle texture - geometric grid */}
                  <div style={{
                    position:"absolute", inset:0, opacity:0.04,
                    backgroundImage:`linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize:"24px 24px",
                    pointerEvents:"none",
                  }}/>

                  {/* Top: Brand mark */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"auto", position:"relative", zIndex:1 }}>
                    <div>
                      <div style={{
                        fontSize: 11, letterSpacing: 4, fontWeight: 700,
                        color: "rgba(255,255,255,0.5)", marginBottom: 3,
                      }}>SESHD</div>
                      <div style={{
                        fontSize: 9, letterSpacing: 2, fontWeight: 500,
                        color: "rgba(255,255,255,0.3)",
                      }}>{new Date().toLocaleDateString("en", { month:"short", day:"numeric", year:"numeric" }).toUpperCase()}</div>
                    </div>
                    {workoutSummary.prs?.length > 0 && (
                      <div style={{
                        background:"#fff", color:"#0A0A0A",
                        fontSize:9, fontWeight:800, letterSpacing:1.5,
                        padding:"5px 10px", borderRadius:20,
                      }}>NEW PR</div>
                    )}
                  </div>

                  {/* Hero stat — the big number */}
                  <div style={{ position:"relative", zIndex:1, marginTop:32, marginBottom:28 }}>
                    <div style={{
                      fontSize: 13, letterSpacing: 2, fontWeight: 700,
                      color: "rgba(255,255,255,0.55)", marginBottom: 6,
                    }}>TOTAL VOLUME</div>
                    <div style={{
                      fontFamily: MONO,
                      fontSize: 72, lineHeight: 0.92, fontWeight: 700,
                      color: "#fff", letterSpacing: -3,
                      display: "flex", alignItems: "baseline", gap: 8,
                    }}>
                      <span className="seshd-count">{(typeof workoutSummary.volume === 'string' ? workoutSummary.volume : String(workoutSummary.volume)).replace(/\s\w+$/,'')}</span>
                      <span style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>
                        {(typeof workoutSummary.volume === 'string' ? workoutSummary.volume.split(' ').pop() : (unit || 'lbs')).toLowerCase()}
                      </span>
                    </div>
                  </div>

                  {/* Workout name */}
                  <div style={{ position:"relative", zIndex:1, marginBottom:28 }}>
                    <div style={{ fontSize:11, letterSpacing:1.8, color:"rgba(255,255,255,0.4)", fontWeight:600, marginBottom:5 }}>SESSION</div>
                    <div style={{
                      fontSize: 22, fontWeight: 800,
                      lineHeight: 1.1, letterSpacing: -0.5,
                      color: "#fff",
                    }}>{workoutSummary.dayName}</div>
                  </div>

                  {/* Bottom stats row */}
                  <div style={{
                    position:"relative", zIndex:1,
                    display:"grid", gridTemplateColumns:"1fr 1fr",
                    gap:0, paddingTop:20,
                    borderTop:"1px solid rgba(255,255,255,0.1)",
                  }}>
                    {[
                      ["TIME", workoutSummary.duration],
                      ["SETS", workoutSummary.sets],
                    ].map(([label, val], i) => (
                      <div key={label} style={{
                        paddingLeft: i === 0 ? 0 : 20,
                        borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none",
                      }}>
                        <div style={{ fontSize:10, letterSpacing:1.8, fontWeight:600, color:"rgba(255,255,255,0.45)", marginBottom:6 }}>{label}</div>
                        <div style={{ fontFamily:MONO, fontSize:24, fontWeight:700, color:"#fff", letterSpacing:-0.5 }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* PROGRESSION callout — when user beat their suggested targets */}
                  {workoutSummary.progressions > 0 && (
                    <div style={{
                      position:"relative", zIndex:1,
                      marginTop:16, padding:"12px 14px",
                      background:"rgba(255,255,255,0.06)",
                      borderRadius:12,
                      border:"1px solid rgba(255,255,255,0.08)",
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <Icon name="trending-up" size={16} color="#fff" strokeWidth={2.4}/>
                        <div>
                          <div style={{ fontSize:10, letterSpacing:1.5, fontWeight:700, color:"rgba(255,255,255,0.55)" }}>PROGRESSION</div>
                          <div style={{ fontSize:12, color:"#fff", fontWeight:600, marginTop:1 }}>Beat last session</div>
                        </div>
                      </div>
                      <div style={{ fontFamily:MONO, fontSize:18, fontWeight:700, color:"#fff" }}>
                        +{workoutSummary.progressions}
                      </div>
                    </div>
                  )}

                  {/* PR callout */}
                  {workoutSummary.prs?.length > 0 && (
                    <div style={{
                      position:"relative", zIndex:1,
                      marginTop:18, padding:"14px 16px",
                      background:"rgba(255,255,255,0.06)",
                      borderRadius:12,
                      border:"1px solid rgba(255,255,255,0.08)",
                    }}>
                      <div style={{ fontSize:9, letterSpacing:1.8, fontWeight:700, color:"rgba(255,255,255,0.55)", marginBottom:7 }}>
                        PERSONAL RECORD{workoutSummary.prs.length > 1 ? "S" : ""}
                      </div>
                      {workoutSummary.prs.map((pr, i) => (
                        <div key={pr.name} style={{
                          display:"flex", justifyContent:"space-between", alignItems:"baseline",
                          marginTop: i > 0 ? 4 : 0,
                        }}>
                          <span style={{ fontSize:13, color:"#fff", fontWeight:500 }}>{pr.name}</span>
                          <span style={{ fontFamily:MONO, fontSize:14, color:"#fff", fontWeight:700, letterSpacing:-0.3 }}>{pr.weight}<span style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginLeft:3 }}>{unit}</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Share to Groups */}
                {(() => {
                  const myGroups = (store.groups||[]).filter(g=>(g.members||g.member_ids||[]).includes(currentUserId));
                  if (!myGroups.length) return null;
                  return (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:0.8, marginBottom:8 }}>SHARE TO GROUPS</div>
                      {myGroups.map(g => {
                        const checked = (workoutSummary.shareToGroups||[]).includes(g.id);
                        return (
                          <div key={g.id} onClick={() => setWorkoutSummary(prev => ({
                            ...prev,
                            shareToGroups: checked
                              ? (prev.shareToGroups||[]).filter(id=>id!==g.id)
                              : [...(prev.shareToGroups||[]), g.id]
                          }))} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, background:C.surface, border:`1px solid ${checked?C.accent:C.border}`, marginBottom:6, cursor:"pointer", transition:"border-color 0.15s" }}>
                            <div style={{ width:32, height:32, borderRadius:10, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{g.name}</div>
                              <div style={{ fontSize:11, color:C.sub }}>{(g.members||[]).length} members</div>
                            </div>
                            <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${checked?C.accent:C.border}`, background:checked?C.accent:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div style={{ padding:"12px 18px 32px", display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={() => {
                  // Find active program's share code to append to caption
                  const activeProg = (store.programs||[]).find(p => p.id === store.activeProgramId);
                  const progCode = activeProg?.shareCode || null;
                  if (workoutSummary.shareData) {
                    const enrichedShareData = progCode
                      ? { ...workoutSummary.shareData, caption: `${workoutSummary.shareData.caption} · Try my program: ${progCode}` }
                      : workoutSummary.shareData;
                    onShareWorkout({ ...enrichedShareData, groupIds: [] });
                  }
                  const text = progCode
                    ? `${workoutSummary.dayName} on Seshd — ${workoutSummary.duration} · ${workoutSummary.sets} sets · ${workoutSummary.volume}\nTry my program: ${progCode}`
                    : `${workoutSummary.dayName} on Seshd — ${workoutSummary.duration} · ${workoutSummary.sets} sets · ${workoutSummary.volume}`;
                  if (navigator.share) navigator.share({ title:"Seshd Workout", text }).catch(()=>{});
                  else if (navigator.clipboard) { navigator.clipboard.writeText(text); toast("Copied to clipboard", "success"); }
                  setShowWorkoutSummary(false); setWorkoutSummary(null);
                }} style={{ width:"100%", background:C.text, color:C.bg, border:"none", borderRadius:14, padding:"16px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  Share to Feed
                </button>
                {(() => {
                  const myGroups = (store.groups||[]).filter(g=>(g.members||g.member_ids||[]).includes(currentUserId));
                  if (myGroups.length === 0) {
                    return (
                      <div style={{ width:"100%", background:"transparent", color:C.muted, border:`1.5px dashed ${C.border}`, borderRadius:14, padding:"13px", fontSize:12, fontFamily:F, letterSpacing:-0.1, textAlign:"center" }}>
                        Join a group from Discover → Groups to share workouts privately
                      </div>
                    );
                  }
                  return (
                    <button onClick={() => {
                      const selectedGroups = workoutSummary.shareToGroups || [];
                      if (!selectedGroups.length) { toast("Select at least one group above", "error"); return; }
                      if (workoutSummary.shareData) onShareWorkout({ ...workoutSummary.shareData, groupIds: selectedGroups, feedOnly: false, groupOnly: true });
                      setShowWorkoutSummary(false); setWorkoutSummary(null);
                    }} style={{ width:"100%", background:"transparent", color:C.text, border:`1.5px solid ${C.border}`, borderRadius:14, padding:"15px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:F, letterSpacing:-0.2, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      Share to Groups Only{(workoutSummary.shareToGroups||[]).length > 0 ? ` (${(workoutSummary.shareToGroups||[]).length})` : ""}
                    </button>
                  );
                })()}
                <button onClick={() => { setShowWorkoutSummary(false); setWorkoutSummary(null); }} style={{ width:"100%", background:"none", color:C.sub, border:"none", padding:"10px", fontSize:13, cursor:"pointer", fontFamily:F }}>Don't share</button>
                {workoutSummary.undo && (
                  <button onClick={async () => {
                    const u = workoutSummary.undo;
                    // 1. Remove from local history
                    setStore(prev => {
                      const day = { ...(prev.history?.[u.dk] || {}) };
                      delete day[u.sid];
                      const newHistory = { ...prev.history };
                      if (Object.keys(day).length === 0) delete newHistory[u.dk];
                      else newHistory[u.dk] = day;
                      // Restore PRs to pre-finish snapshot
                      return { ...prev, history: newHistory, prs: u.prevPRs || prev.prs };
                    });
                    // 2. Restore the session
                    setSession(u.session);
                    setElapsed(u.elapsed || 0);
                    setWStart(Date.now() - (u.elapsed || 0) * 1000);
                    setShowWorkoutSummary(false);
                    setWorkoutSummary(null);
                    // 3. Remove from Supabase workout_history (best-effort)
                    try {
                      const tok = tokenRef.current || loadSession()?.access_token;
                      if (tok) await sb.query(`workout_history?id=eq.${u.sid}`, { method:"DELETE" }, tok);
                    } catch (e) { /* not fatal */ }
                    toast("Workout reopened — make your edits", "success");
                  }} style={{ width:"100%", background:"none", color:C.sub, border:"none", padding:"6px 10px", fontSize:12, cursor:"pointer", fontFamily:F, marginTop:-4 }}>
                    Undo finish & edit
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Reorder modal — collapsed cards you can drag freely */}
        {reorderMode && session && (
          <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:300, maxWidth:480, margin:"0 auto", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${C.divider}` }}>
              <button onClick={() => { setReorderMode(false); setDraggingEx(null); dragStartRef.current = null; }} style={{ background:"none", border:"none", fontSize:14, fontWeight:600, color:C.accent, cursor:"pointer", fontFamily:F }}>Done</button>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, letterSpacing:-0.2 }}>Reorder exercises</div>
              <div style={{ width:48 }}/>
            </div>
            <div style={{ fontSize:11, color:C.sub, padding:"10px 16px 4px", letterSpacing:0.4, fontWeight:600 }}>HOLD & DRAG TO MOVE</div>
            <div
              ref={reorderListRef}
              style={{ padding:"6px 12px 24px", overflowY:"auto", flex:1, position:"relative", touchAction: draggingEx ? "none" : "auto" }}
              onTouchMove={draggingEx ? onReorderTouchMove : undefined}
              onTouchEnd={draggingEx ? onReorderTouchEnd : undefined}
              onTouchCancel={draggingEx ? onReorderTouchEnd : undefined}
            >
              {session.exercises.map((ex, ei) => {
                const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
                const isDragging = draggingEx && draggingEx.index === ei;
                let visualOffset = 0;
                if (draggingEx && !isDragging) {
                  const fromIdx = draggingEx.index;
                  const h = draggingEx.height || 56;
                  const targetIdx = Math.max(0, Math.min(session.exercises.length - 1, fromIdx + Math.round(draggingEx.offsetY / h)));
                  if (fromIdx < ei && ei <= targetIdx) visualOffset = -h;
                  else if (targetIdx <= ei && ei < fromIdx) visualOffset = h;
                }
                return (
                  <div
                    key={ex.id || ei}
                    onTouchStart={(e) => { e.stopPropagation(); startReorderDrag(ei, e); }}
                    style={{
                      display:"flex", alignItems:"center", gap:12,
                      padding:"14px 14px", marginBottom:8,
                      background: isDragging ? C.surface : C.surface,
                      border: `1px solid ${isDragging ? C.accent : C.border}`,
                      borderRadius:14,
                      transform: isDragging
                        ? `translateY(${draggingEx.offsetY}px) scale(1.02)`
                        : `translateY(${visualOffset}px)`,
                      transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      zIndex: isDragging ? 100 : 1,
                      position:"relative",
                      boxShadow: isDragging ? "0 16px 36px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)" : "none",
                      opacity: draggingEx && !isDragging ? 0.5 : 1,
                      touchAction:"none",
                      userSelect:"none",
                      WebkitUserSelect:"none",
                      WebkitTouchCallout:"none",
                      WebkitTapHighlightColor:"transparent",
                    }}>
                    <MuscleIcon muscle={exInfo?.muscle||""} size={32} C={C}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:C.text, letterSpacing:-0.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ex.name || "Unnamed"}</div>
                      <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>{ex.sets?.length || 0} sets · {exInfo?.muscle || ""}</div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PR confetti burst — fires when a mid-workout PR is detected */}
        {prBurst > 0 && <Confetti key={prBurst} origin="set"/>}

        {/* Keyboard accessory bar — appears above the iOS keyboard when a set input is focused
            Lets user nudge weight or reps without dismissing the keyboard */}
        {focusedSet && (() => {
          const ex = session.exercises?.[focusedSet.ei];
          const set = ex?.sets?.[focusedSet.si];
          if (!ex || !set) return null;
          const exMuscle = ex.name ? EXERCISE_DB.find(e => e.name === ex.name)?.muscle : null;
          const isCardio = exMuscle === "Cardio";
          const weightAdj = isCardio ? [-1, 1, 5] : [-2.5, 2.5, 5];
          const repsAdj = [-1, 1, 5];
          const applyWeight = (d) => {
            const cur = parseFloat(set.weight) || 0;
            updateSet(focusedSet.ei, focusedSet.si, { weight: String(Math.max(0, Math.round((cur + d) * 10) / 10)) });
            haptic("tap");
          };
          const applyReps = (d) => {
            const cur = parseInt(set.reps) || 0;
            updateSet(focusedSet.ei, focusedSet.si, { reps: String(Math.max(0, cur + d)) });
            haptic("tap");
          };
          return (
            <div
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.stopPropagation()}
              style={{
                position:"fixed", left:0, right:0,
                // Sit immediately above the keyboard (visualViewport tells us how tall the keyboard is).
                // iOS layers its own input accessory bar (~44px) on top of the keyboard frame; visualViewport
                // doesn't account for that, so we lift our bar by an extra 44px when the keyboard is open.
                bottom: kbOffset > 0 ? kbOffset + 44 : 0,
                maxWidth:480, margin:"0 auto",
                background:C.surface, borderTop:`1px solid ${C.border}`,
                padding:"10px 10px calc(10px + env(safe-area-inset-bottom))",
                zIndex:400, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8,
                boxShadow:"0 -4px 14px rgba(0,0,0,0.08)",
                transition:"bottom 0.15s ease-out",
              }}>
              <div style={{ display:"flex", gap:5, flexWrap:"nowrap", alignItems:"center" }}>
                <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:0.4, marginRight:2 }}>{isCardio?"MIN":(unit||"LBS").toUpperCase()}</span>
                {weightAdj.map(d => (
                  <button key={"w"+d} onClick={() => applyWeight(d)} style={{
                    background:"transparent", border:`1px solid ${d<0?"#ef444440":"#22c55e40"}`,
                    color:d<0?"#ef4444":"#22c55e", borderRadius:8, padding:"6px 10px",
                    fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:MONO, minWidth:42,
                  }}>{d>0?"+":""}{d}</button>
                ))}
              </div>
              {!isCardio && (
                <div style={{ display:"flex", gap:5, flexWrap:"nowrap", alignItems:"center" }}>
                  <span style={{ fontSize:10, fontWeight:700, color:C.muted, letterSpacing:0.4, marginRight:2 }}>REPS</span>
                  {repsAdj.map(d => (
                    <button key={"r"+d} onClick={() => applyReps(d)} style={{
                      background:"transparent", border:`1px solid ${d<0?"#ef444440":"#22c55e40"}`,
                      color:d<0?"#ef4444":"#22c55e", borderRadius:8, padding:"6px 10px",
                      fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:MONO, minWidth:36,
                    }}>{d>0?"+":""}{d}</button>
                  ))}
                </div>
              )}
              <button onClick={() => { if (document.activeElement?.blur) document.activeElement.blur(); }} style={{
                background:"transparent", border:"none", padding:"6px 8px",
                color:C.sub, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:F, flexShrink:0,
              }}>Done</button>
            </div>
          );
        })()}

        {/* Finish modal */}
        {showFinish && (
          <div onClick={() => setShowFinish(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
            <div onClick={e => e.stopPropagation()} className="seshd-slide-up" style={{ background:C.bg, borderRadius:"20px 20px 0 0", padding:"22px 20px 36px", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}` }}>
              <div style={{ width:36, height:4, background:C.divider, borderRadius:2, margin:"0 auto 18px" }}/>
              <div style={{ fontSize:22, fontWeight:800, color:C.text, marginBottom:6, letterSpacing:-0.5 }}>Finish workout?</div>
              <div style={{ fontSize:13, color:C.sub, marginBottom:22, fontFamily:MONO }}>{done}/{total} sets · {fmtTime(elapsed)}</div>
              <button onClick={() => finishWorkout(true)} disabled={finishing} style={{ width:"100%", background:finishing?C.sub:C.text, color:C.bg, border:"none", borderRadius:14, padding:"16px", fontSize:15, fontWeight:700, cursor:finishing?"not-allowed":"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2 }}>{finishing ? "Saving…" : "Finish & share to feed"}</button>
              {(() => {
                const myGroups = (store.groups||[]).filter(g => (g.members||g.member_ids||[]).includes(currentUserId));
                if (myGroups.length === 0) return null;
                return (
                  <button onClick={() => { setShowFinish(false); setSelectedGroupIds([]); setShowGroupShare(true); }} disabled={finishing} style={{ width:"100%", background:"transparent", color:C.text, border:`1px solid ${C.border}`, borderRadius:14, padding:"15px", fontSize:14, fontWeight:600, cursor:finishing?"not-allowed":"pointer", marginBottom:8, fontFamily:F, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Save & send to groups
                  </button>
                );
              })()}
              <button onClick={() => finishWorkout(false)} disabled={finishing} style={{ width:"100%", background:"transparent", color:C.text, border:`1px solid ${C.border}`, borderRadius:14, padding:"15px", fontSize:14, fontWeight:600, cursor:finishing?"not-allowed":"pointer", marginBottom:8, fontFamily:F }}>{finishing ? "…" : "Save only"}</button>
              <button onClick={() => setShowFinish(false)} style={{ width:"100%", background:"none", color:C.sub, border:"none", padding:"10px", fontSize:13, cursor:"pointer", fontFamily:F }}>Keep going</button>
            </div>
          </div>
        )}

        {/* Group share picker (Save & send to groups path - skips feed) */}
        {showGroupShare && (() => {
          const myGroups = (store.groups||[]).filter(g => (g.members||g.member_ids||[]).includes(currentUserId));
          return (
            <div onClick={() => setShowGroupShare(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
              <div onClick={e => e.stopPropagation()} className="seshd-slide-up" style={{ background:C.bg, borderRadius:"20px 20px 0 0", padding:"22px 20px 36px", width:"100%", maxWidth:480, margin:"0 auto", borderTop:`1px solid ${C.border}`, maxHeight:"80dvh", overflowY:"auto" }}>
                <div style={{ width:36, height:4, background:C.divider, borderRadius:2, margin:"0 auto 18px" }}/>
                <div style={{ fontSize:22, fontWeight:800, color:C.text, marginBottom:6, letterSpacing:-0.5 }}>Send to groups</div>
                <div style={{ fontSize:13, color:C.sub, marginBottom:18 }}>Workout will only be visible in selected groups, not the feed.</div>

                <div style={{ marginBottom:18 }}>
                  {myGroups.map(g => {
                    const checked = selectedGroupIds.includes(g.id);
                    return (
                      <div key={g.id} onClick={() => setSelectedGroupIds(prev => checked ? prev.filter(id => id !== g.id) : [...prev, g.id])} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:12, background:C.surface, border:`1px solid ${checked?C.text:C.border}`, marginBottom:8, cursor:"pointer", transition:"border-color 0.15s" }}>
                        <div style={{ width:36, height:36, borderRadius:11, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{g.name}</div>
                          <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>{(g.members||g.member_ids||[]).length} members</div>
                        </div>
                        <div style={{ width:22, height:22, borderRadius:7, border:`2px solid ${checked?C.text:C.border}`, background:checked?C.text:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {checked && <Icon name="check" size={12} color={C.bg} strokeWidth={3}/>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button onClick={async () => {
                  if (selectedGroupIds.length === 0) { toast("Pick at least one group", "error"); return; }
                  setShowGroupShare(false);
                  try {
                    await finishWorkout(false, { groupIds: selectedGroupIds, groupOnly: true });
                  } catch (e) {
                    console.error("Group share finish failed:", e);
                    toast("Couldn't save to groups — your workout is saved locally", "error");
                  }
                }} disabled={finishing || selectedGroupIds.length === 0} style={{ width:"100%", background:(finishing||selectedGroupIds.length===0)?C.sub:C.text, color:C.bg, border:"none", borderRadius:14, padding:"16px", fontSize:15, fontWeight:700, cursor:(finishing||selectedGroupIds.length===0)?"not-allowed":"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2 }}>
                  {finishing ? "Saving…" : `Send to ${selectedGroupIds.length || "0"} group${selectedGroupIds.length===1?"":"s"}`}
                </button>
                <button onClick={() => { setShowGroupShare(false); setShowFinish(true); }} style={{ width:"100%", background:"none", color:C.sub, border:"none", padding:"10px", fontSize:13, cursor:"pointer", fontFamily:F }}>Back</button>
              </div>
            </div>
          );
        })()}
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
    <div style={{ overflowY:viewingProgram||showBuilder?"hidden":"auto", flex:1, display:"flex", flexDirection:"column", paddingBottom:viewingProgram||showBuilder?0:20, position:"relative" }}>
      {/* Sub-tabs — Instagram-style thin underline */}
      <div style={{ display:"flex", borderBottom:`1px solid ${C.divider}`, background:C.bg, position:"sticky", top:0, zIndex:5 }}>
        {[["workout","Workout"],["exercises","Exercises"],["history","History"]].map(([t,l]) => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            flex:1, padding:"12px 4px", background:"none", border:"none",
            color:subTab===t?C.text:C.sub, fontSize:12, fontWeight:subTab===t?700:500, cursor:"pointer",
            borderBottom:subTab===t?`2px solid ${C.text}`:"2px solid transparent", fontFamily:F
          }}>{l}</button>
        ))}
      </div>

      {subTab === "workout" && (
        <div style={{ padding:"16px 14px" }}>
          {/* Weekly streak banner */}
          {(() => {
            const ws = calcWeeklyStreak(store.workoutDates || {}, store.weeklyTarget || 3);
            if (!ws.count && !ws.thisWeek) return null;
            const isAtRisk = ws.status === "at-risk";
            const isBuilding = !ws.count && ws.thisWeek > 0;
            return (
              <div style={{
                background: isAtRisk ? "#f59e0b" : (isBuilding ? C.surface : C.text),
                color: isBuilding ? C.text : (isAtRisk ? "#fff" : C.bg),
                border: isBuilding ? `1px solid ${C.border}` : "none",
                borderRadius:16, padding:"16px 18px", marginBottom:12,
                display:"flex", alignItems:"center", gap:14,
              }}>
                <div style={{ width:40, height:40, borderRadius:12,
                  background: isBuilding ? C.divider : (isAtRisk ? "rgba(255,255,255,0.2)" : C.bg),
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color: isBuilding ? C.text : (isAtRisk ? "#fff" : C.text),
                  flexShrink:0 }}>
                  <Icon name="flame" size={20}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, opacity:0.6, letterSpacing:1.5, marginBottom:2 }}>
                    {isAtRisk ? "STREAK AT RISK" : isBuilding ? "THIS WEEK" : "WEEKLY STREAK"}
                  </div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                    <div style={{ fontFamily:MONO, fontSize:28, fontWeight:700, letterSpacing:-1, lineHeight:1 }}>
                      {ws.count > 0 ? ws.count : `${ws.thisWeek}/${ws.target}`}
                    </div>
                    <div style={{ fontSize:12, fontWeight:600, opacity:0.6 }}>
                      {ws.count > 0
                        ? (isAtRisk ? `${ws.thisWeek}/${ws.target} this week` : `week${ws.count === 1 ? "" : "s"} active`)
                        : "workouts this week"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Quick Start */}
          <button onClick={() => startWorkout(null)} style={{
            width:"100%", background:C.text, color:C.bg,
            border:"none", borderRadius:16, padding:"18px",
            marginBottom:10, cursor:"pointer", display:"flex", alignItems:"center", gap:14, fontFamily:F,
          }}>
            <div style={{ width:40, height:40, borderRadius:10, background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Icon name="zap" size={20}/>
            </div>
            <div style={{ textAlign:"left", flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, letterSpacing:-0.3 }}>Quick Start</div>
              <div style={{ fontSize:12, opacity:0.6, marginTop:2 }}>Start an empty workout</div>
            </div>
            <Icon name="chevron-right" size={18} color={C.bg}/>
          </button>

          {/* Calculators */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[["activity","1RM Calc",() => setShow1RM(true)],["barbell","Plates",() => setShowPlateCalc(true)]].map(([icon,label,fn]) => (
              <button key={label} onClick={fn} style={{
                flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:12,
                padding:"11px 12px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontFamily:F
              }}>
                <Icon name={icon} size={18} color={C.text}/>
                <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{label}</span>
              </button>
            ))}
          </div>

          {show1RM && <OneRMModal onClose={() => setShow1RM(false)} unit={unit} C={C}/>}
          {showPlateCalc && <PlateCalcModal onClose={() => setShowPlateCalc(false)} unit={unit} C={C}/>}

          {prog ? (
            <>
              {/* Today's Targets — progressive overload suggestions for next day */}
              {(() => {
                // Find the next likely day in rotation: day with the oldest last-done date
                const dayLastDone = prog.days.map((day, di) => {
                  const dates = Object.keys(store.history||{}).sort().reverse();
                  for (const dk of dates) {
                    if (Object.values(store.history[dk]||{}).some(s => s.dayName === day.name)) {
                      return { day, di, daysSince: Math.floor((Date.now() - new Date(dk).getTime()) / 86400000) };
                    }
                  }
                  return { day, di, daysSince: 9999 };
                });
                // Pick day not done today, with the highest daysSince
                const candidates = dayLastDone.filter(d => d.daysSince > 0);
                const nextDay = candidates.sort((a,b) => b.daysSince - a.daysSince)[0]?.day || prog.days[0];
                if (!nextDay) return null;
                const targets = (nextDay.exercises||[]).slice(0, 4).map(ex => {
                  const s = suggestNextSet(store, ex.name, ex.reps, unit, 0);
                  return s ? { name: ex.name, suggestion: s } : null;
                }).filter(Boolean);
                if (!targets.length) return null;
                return (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1 }}>NEXT UP · {nextDay.name.toUpperCase()}</div>
                    </div>
                    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"4px 0", overflow:"hidden" }}>
                      {targets.map((t, i) => (
                        <div key={t.name} style={{
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"11px 14px",
                          borderTop: i > 0 ? `1px solid ${C.divider}` : "none",
                        }}>
                          <div style={{ flex:1, minWidth:0, paddingRight:10 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:C.text, lineHeight:1.2, marginBottom:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.name}</div>
                            <div style={{ fontSize:10, color:C.sub, lineHeight:1.3 }}>{t.suggestion.reason}</div>
                          </div>
                          <div style={{
                            display:"flex", alignItems:"center", gap:5, flexShrink:0,
                            background: t.suggestion.type === "weight" ? `${C.accent}15` : t.suggestion.type === "deload" ? "#f59e0b15" : `${C.green}15`,
                            border: `1px solid ${t.suggestion.type === "weight" ? `${C.accent}35` : t.suggestion.type === "deload" ? "#f59e0b35" : `${C.green}35`}`,
                            color: t.suggestion.type === "weight" ? C.accent : t.suggestion.type === "deload" ? "#f59e0b" : C.green,
                            borderRadius:8, padding:"5px 10px",
                          }}>
                            <Icon name={t.suggestion.type === "deload" ? "chevron-left" : "trending-up"} size={11} strokeWidth={2.6}/>
                            <span style={{ fontFamily:MONO, fontSize:12, fontWeight:700 }}>{t.suggestion.weight}<span style={{ opacity:0.5, margin:"0 2px" }}>×</span>{t.suggestion.reps}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1 }}>ACTIVE PROGRAM</div>
                <div style={{ fontSize:12, fontWeight:600, color:C.accent }}>{prog.name}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {prog.days.map((day, di) => {
                  const lastDone = (() => {
                    const dates = Object.keys(store.history||{}).sort().reverse();
                    for (const dk of dates) {
                      if (Object.values(store.history[dk]||{}).some(s => s.dayName === day.name)) {
                        const d = Math.floor((Date.now() - new Date(dk).getTime()) / 86400000);
                        return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
                      }
                    }
                    return null;
                  })();
                  return (
                  <div key={day.id || di} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", borderLeft:`4px solid ${["#7c3aed","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#7c3aed"][di%7]}` }}>
                    <button onClick={() => setPreviewDay({ day, programName: prog.name })} style={{
                      width:"100%", background:"none", border:"none", padding:"13px 14px",
                      display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left", fontFamily:F
                    }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:`${["#7c3aed","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#7c3aed"][di%7]}18`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:14, fontWeight:800, color:["#7c3aed","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#7c3aed"][di%7] }}>{di+1}</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{day.name}</div>
                        <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>
                          {day.exercises.slice(0,3).map(e=>e.name).join(" · ")}{day.exercises.length > 3 ? ` +${day.exercises.length-3}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        {lastDone && <div style={{ fontSize:10, color:C.muted, marginBottom:2 }}>{lastDone}</div>}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
                      </div>
                    </button>
                    <div style={{ display:"flex", borderTop:`1px solid ${C.divider}` }}>
                      <button onClick={() => { setViewingProgram(prog.id); setInitialDayIdx(di); }} style={{
                        flex:1, padding:"9px", background:"none", border:"none", borderRight:`1px solid ${C.divider}`,
                        fontSize:12, fontWeight:600, color:C.sub, cursor:"pointer", fontFamily:F
                      }}>Edit</button>
                      <button onClick={() => startWorkout(day)} style={{
                        flex:1, padding:"9px", background:"none", border:"none",
                        fontSize:12, fontWeight:600, color:C.accent, cursor:"pointer", fontFamily:F
                      }}>Start ›</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ background:C.surface, border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", marginTop:4 }}>
              <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><Icon name="calendar" size={30} color="currentColor"/></div>
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

      {subTab === "workout" && !viewingProgram && !showBuilder && (
        <div style={{ padding:"16px 14px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            <button onClick={() => setShowBuilder(true)} style={{
              background:`linear-gradient(135deg,${C.accent},${C.accent2})`, color:"#fff", border:"none",
              borderRadius:10, padding:"13px 10px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
            }}>
              <div style={{ marginBottom:6, display:"flex", justifyContent:"center" }}><Icon name="spark" size={18} color="currentColor"/></div>
              Build Your Own
            </button>
            <button onClick={() => setShowTemplates(true)} style={{
              background:"none", color:C.text, border:`1px solid ${C.border}`,
              borderRadius:10, padding:"13px 10px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
            }}>
              <div style={{ marginBottom:6, display:"flex", justifyContent:"center" }}><Icon name="calendar" size={18} color="currentColor"/></div>
              Use Template
            </button>
          </div>

          <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>
            MY PROGRAMS · {store.programs?.length || 0}
          </div>
          {(!store.programs || !store.programs.length) && (
            <div style={{ textAlign:"center", color:C.sub, padding:"24px 0", fontSize:13 }}>No programs yet. Build one or import a template.</div>
          )}
          {(() => {
            const progDragRef = { dragging: false, startY: 0, origIdx: 0, overIdx: 0 };
            return (store.programs || []).map((p, idx) => (
            <div key={p.id}
              data-drag-item="true"
              onTouchStart={e => {
                progDragRef.dragging = true;
                progDragRef.startY = e.touches[0].clientY;
                progDragRef.origIdx = idx;
                progDragRef.overIdx = idx;
                try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
              }}
              onTouchMove={e => {
                if (!progDragRef.dragging) return;
                e.preventDefault();
                const dy = e.touches[0].clientY - progDragRef.startY;
                progDragRef.overIdx = Math.max(0, Math.min((store.programs.length - 1), idx + Math.round(dy / 72)));
              }}
              onTouchEnd={() => {
                if (!progDragRef.dragging) return;
                progDragRef.dragging = false;
                if (progDragRef.overIdx !== progDragRef.origIdx) {
                  const arr = [...store.programs];
                  const [moved] = arr.splice(progDragRef.origIdx, 1);
                  arr.splice(progDragRef.overIdx, 0, moved);
                  setStore(prev => ({ ...prev, programs: arr }));
                }
              }}
              onClick={() => setViewingProgram(p.id)}
              style={{
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
              <span style={{ fontSize:18, color:C.muted, touchAction:"none" }}>⠿</span>
            </div>
            ));
          })()}
        </div>
      )}

      {/* Program Detail View */}
      {subTab === "workout" && viewingProgram && (() => {
        const prog = store.programs?.find(p => p.id === viewingProgram);
        if (!prog) { setViewingProgram(null); return null; }
        return (
          <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:C.bg, zIndex:999, display:"flex", flexDirection:"column", overflow:"hidden", maxWidth:480, margin:"0 auto" }}>
          <ProgramDetailView
            prog={prog}
            store={store}
            unit={unit}
            C={C}
            F={F}
            MONO={MONO}
            onBack={() => { setViewingProgram(null); setInitialDayIdx(0); }}
            initialDayIdx={initialDayIdx}
            onSaveProgram={onSaveProgram}
            onSaveStore={setStore}
            onProgramEdited={onProgramEdited}
            token={token}
            startWorkout={(day, progId) => {
              setPreviewDay({ day, programName: prog.name, progId });
            }}
          />
          </div>
        );
      })()}

      {/* Custom Program Builder */}
      {subTab === "workout" && showBuilder && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:C.bg, zIndex:999, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <ProgramBuilder
          C={C}
          onCancel={() => setShowBuilder(false)}
          onSave={prog => {
            if (onSaveProgram) {
              onSaveProgram(prog);
            } else {
              setStore(p => ({ ...p, programs: [...(p.programs || []), prog], activeProgramId: prog.id }));
            }
            setShowBuilder(false);
            setViewingProgram(prog.id);
          }}
        />
        </div>
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
            {["All","Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Calves","Core","Traps","Forearms","Full Body","Cardio"].map(f => (
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
                  {pr && <div style={{ fontSize:11, color:C.gold, marginTop:2, fontWeight:600 }}>PR · <span style={{ fontFamily:MONO, fontWeight:700 }}>{cvt(pr, "lbs", unit)} {unit}</span></div>}
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
        <PullToRefresh onRefresh={onRefresh} C={C}>
          <div style={{ paddingBottom:24 }}>
          <div style={{ padding:"12px 14px 0" }}>
            <Heatmap workoutDates={store.workoutDates} C={C}/>
          </div>

          {/* Volume chart - last 8 weeks */}
          {(() => {
            const weeks = 8;
            const today = new Date(); today.setHours(0,0,0,0);
            const weekData = [];
            for (let w = weeks-1; w >= 0; w--) {
              const wStart = new Date(today); wStart.setDate(wStart.getDate() - w*7 - today.getDay());
              const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
              let vol = 0; let sessions = 0;
              Object.entries(store.history||{}).forEach(([date, sess]) => {
                const d = new Date(date);
                if (d >= wStart && d <= wEnd) {
                  Object.values(sess).forEach(s => {
                    sessions++;
                    (s.exercises||[]).forEach(ex => {
                      (ex.sets||[]).filter(set => set.done).forEach(set => {
                        vol += (parseFloat(set.weight)||0) * (parseFloat(set.reps)||0);
                      });
                    });
                  });
                }
              });
              weekData.push({ label: wStart.toLocaleDateString("en",{month:"short",day:"numeric"}), vol: Math.round(vol), sessions });
            }
            const maxVol = Math.max(...weekData.map(w => w.vol), 1);
            return weekData.some(w => w.vol > 0) ? (
              <div style={{ padding:"0 14px 14px", borderBottom:`1px solid ${C.divider}` }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:12 }}>VOLUME BY WEEK ({(store.unit||"lbs").toUpperCase()})</div>
                <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
                  {weekData.map((w, i) => (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                      <div style={{ fontSize:8, color:C.muted, fontFamily:MONO }}>{w.vol > 0 ? (w.vol >= 1000 ? (w.vol/1000).toFixed(1)+"k" : w.vol) : ""}</div>
                      <div style={{
                        width:"100%", borderRadius:"3px 3px 0 0",
                        background: i === weeks-1 ? C.accent : `${C.accent}66`,
                        height: Math.max(4, (w.vol/maxVol)*64),
                        transition:"height 0.3s"
                      }}/>
                      <div style={{ fontSize:7, color:C.muted, textAlign:"center", transform:"rotate(-45deg)", transformOrigin:"center", whiteSpace:"nowrap" }}>{w.label.split(" ")[0]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* PRs strip */}
          {Object.keys(store.prs||{}).length > 0 && (
            <div style={{ padding:"14px 14px", borderBottom:`1px solid ${C.divider}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:10 }}>PERSONAL RECORDS</div>
              <div style={{ display:"flex", flexDirection:"column", gap:0, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
                {Object.entries(store.prs||{}).sort(([,a],[,b]) => b-a).map(([name, weight], i, arr) => (
                  <div key={name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 14px", borderBottom:i<arr.length-1?`1px solid ${C.divider}`:"none" }}>
                    <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{name}</div>
                    <div style={{ fontSize:14, fontWeight:800, color:C.accent, fontFamily:MONO }}>
                      {cvt(weight,"lbs",store.unit||"lbs")} {store.unit||"lbs"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workout list */}
          <div style={{ padding:"14px 14px 0" }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:12 }}>WORKOUT LOG</div>
            {!Object.keys(store.history || {}).length && (
              <div style={{ textAlign:"center", color:C.sub, padding:"40px 0", fontSize:13 }}>
                <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><Icon name="calendar" size={36} color="currentColor"/></div>
                No workouts logged yet
              </div>
            )}
            {Object.entries(store.history || {}).sort(([a],[b]) => b.localeCompare(a)).map(([date, sessions]) => (
              <div key={date} style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.sub, marginBottom:8, letterSpacing:0.5 }}>
                  {new Date(date).toLocaleDateString("en",{weekday:"long",month:"long",day:"numeric"})}
                </div>
                {Object.entries(sessions).map(([sid, sess], i) => {
                  const done = sess.exercises?.reduce((a,ex) => a+(ex.sets?.filter(s=>s.done).length||0),0)||0;
                  const vol = sess.exercises?.reduce((a,ex) => a+(ex.sets||[]).filter(s=>s.done).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseFloat(s.reps)||0),0),0)||0;
                  const prExercises = sess.exercises?.filter(ex => {
                    if (!ex.name) return false;
                    const maxW = Math.max(0,...(ex.sets||[]).filter(s=>s.done&&s.weight).map(s=>parseFloat(s.weight)||0));
                    return maxW > 0 && (store.prs||{})[ex.name] && maxW >= (store.prs[ex.name] * (sess.unit==="kg"?2.205:1) * 0.98);
                  }) || [];
                  return (
                    <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{sess.dayName}</div>
                          <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{fmtTime(sess.duration||0)} · {done} sets · {Math.round(vol).toLocaleString()} {sess.unit||"lbs"}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                          {prExercises.length > 0 && (
                            <div style={{ background:C.text, color:C.bg, borderRadius:6, padding:"3px 9px", fontSize:10, fontWeight:800, letterSpacing:1 }}>PR</div>
                          )}
                          <button onClick={() => repeatFromSession(sess)} style={{
                            background:C.text, border:"none", borderRadius:8,
                            color:C.bg, fontSize:12, padding:"5px 11px", cursor:"pointer", fontFamily:F, fontWeight:700
                          }}>Repeat</button>
                          <button onClick={() => setEditingHistory({ date, sid, sess: JSON.parse(JSON.stringify(sess)) })} style={{
                            background:"none", border:`1px solid ${C.border}`, borderRadius:8,
                            color:C.text, fontSize:12, padding:"4px 10px", cursor:"pointer", fontFamily:F, fontWeight:600
                          }}>Edit</button>
                          <button onClick={() => onDeleteHistory && onDeleteHistory(date, sid)} style={{
                            background:"none", border:`1px solid ${C.border}`, borderRadius:8,
                            color:"#EF4444", fontSize:12, padding:"4px 10px", cursor:"pointer", fontFamily:F, fontWeight:600
                          }}>Delete</button>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {sess.exercises?.filter(e=>e.name).map((ex,j) => {
                          const doneSets = (ex.sets||[]).filter(s=>s.done===true||(s.done!==false&&(parseFloat(s.reps)>0||parseFloat(s.r)>0)));
                          if (!doneSets.length) return null;
                          const isPR = (store.prs||{})[ex.name] && doneSets.some(s=>{
                            const w = parseFloat(s.weight||s.w)||0;
                            const wLbs = (sess.unit||unit)==="kg" ? w*2.205 : w;
                            return wLbs > 0 && wLbs >= ((store.prs[ex.name]||0)*0.98);
                          });
                          const setsLabel = doneSets.length + " × " + (doneSets[0]?.reps||doneSets[0]?.r||"—");
                          const topWeight = Math.max(0,...doneSets.map(s=>parseFloat(s.weight||s.w)||0));
                          return (
                            <div key={j} style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                                  <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{ex.name}</span>
                                  {isPR && <span style={{ fontSize:9, background:C.text, color:C.bg, borderRadius:5, padding:"2px 6px", fontWeight:800, letterSpacing:0.8 }}>PR</span>}
                                </div>
                                <div style={{ fontSize:11, color:C.sub, marginTop:1 }}>
                                  {setsLabel} reps{topWeight > 0 ? ` · ${topWeight} ${sess.unit||"lbs"}` : ""}
                                </div>
                              </div>
                            </div>
                          );
                        }).filter(Boolean)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        </PullToRefresh>
      )}

      {showTemplates && (
        <div onClick={() => { setShowTemplates(false); setPrefilledCode(null); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"85dvh", display:"flex", flexDirection:"column", borderTop:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${C.divider}` }}>
              <button onClick={() => { setShowTemplates(false); setPrefilledCode(null); }} style={{ fontSize:14, color:C.text, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
              <div style={{ fontSize:15, fontWeight:600, color:C.text }}>Starter Templates</div>
              <div style={{ width:50 }}/>
            </div>

            {/* AI Coach button */}
            <div style={{ padding:"12px 14px 0" }}>
              <button onClick={() => { setShowTemplates(false); setShowAICoach(true); }} style={{
                width:"100%", background:C.text, color:C.bg,
                border:"none", borderRadius:14, padding:"16px", cursor:"pointer", fontFamily:F,
                display:"flex", alignItems:"center", gap:14, marginBottom:2
              }}>
                <div style={{ width:36, height:36, borderRadius:10, background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Icon name="spark" size={20}/>
                </div>
                <div style={{ textAlign:"left", flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.bg, letterSpacing:-0.2 }}>AI Coach</div>
                  <div style={{ fontSize:11, color:C.bg, opacity:0.65, marginTop:1 }}>Answer 5 questions, get a custom plan</div>
                </div>
                <Icon name="chevron-right" size={18} color={C.bg}/>
              </button>

              {/* Code redeem */}
              <CodeRedeemRow C={C} store={store} setStore={setStore} onClose={() => { setShowTemplates(false); setPrefilledCode(null); }} token={token} initialCode={prefilledCode}/>

              <div style={{ fontSize:10, color:C.sub, textAlign:"center", marginBottom:10, marginTop:10, letterSpacing:1, fontWeight:600 }}>OR PICK A TEMPLATE</div>
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
                  <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:2 }}>{t.icon} {t.name}</div>
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
          token={token}
        />
      )}

      {/* Edit History modal — lets you fix wrong numbers in a finished workout */}
      {editingHistory && (
        <EditHistoryModal
          editing={editingHistory}
          unit={unit}
          C={C}
          token={token}
          currentUserId={currentUserId}
          store={store}
          setStore={setStore}
          onClose={() => setEditingHistory(null)}
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
function DayPreviewModal({ previewDay, store, unit, C, onClose, onStart, onSaveProgram, token }) {
  const [editMode, setEditMode] = useState(false);
  const [editDay, setEditDay] = useState(() => JSON.parse(JSON.stringify(previewDay.day)));
  const [viewingExercise, setViewingExercise] = useState(null);
  const [shareModal, setShareModal] = useState(null);

  const isDark = C.bg === "#0a0a0c";
  const BG    = isDark ? "#0a0a0a" : "#F4F6FA";
  const CARD  = isDark ? "#141414" : "#FFFFFF";
  const BORD  = isDark ? "#222"    : "#E8ECF0";
  const SUB   = isDark ? "#666"    : "#94A3B8";
  const TXT   = isDark ? "#F0F0F0" : "#0F172A";
  const BLUE  = "#2563EB";
  const BLUEBG= isDark ? "#1a2540" : "#EFF6FF";

  function saveAndStart() {
    if (editMode && onSaveProgram) {
      const prog = store.programs.find(p => p.days?.some(d => d.name === previewDay.day.name));
      if (prog) onSaveProgram({ ...prog, days: prog.days.map(d => d.name === previewDay.day.name ? editDay : d) });
    }
    onStart(editMode ? editDay : previewDay.day);
  }

  function updateEx(i, patch) {
    setEditDay(d => ({ ...d, exercises: d.exercises.map((ex, j) => j !== i ? ex : { ...ex, ...patch }) }));
  }
  function removeEx(i) {
    setEditDay(d => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }));
  }
  function addEx(name) {
    if (!name) return;
    setEditDay(d => ({ ...d, exercises: [...d.exercises, { name, reps:"3×8–12", note:"" }] }));
  }

  const lastPerformed = (() => {
    for (const dk of Object.keys(store.history||{}).sort().reverse()) {
      if (Object.values(store.history[dk]||{}).some(s => s.dayName === editDay.name)) {
        const d = Math.floor((Date.now() - new Date(dk).getTime()) / 86400000);
        return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
      }
    }
    return null;
  })();

  if (viewingExercise) {
    return <ExerciseDetail name={viewingExercise} store={store} unit={unit} C={C} onClose={() => setViewingExercise(null)}/>;
  }

  const DAY_COLORS = ["#7C3AED","#2563EB","#059669","#D97706","#DC2626","#0891B2","#7C3AED"];
  const colorIdx = (store.programs?.find(p=>p.days?.some(d=>d.name===editDay.name))?.days?.findIndex(d=>d.name===editDay.name)||0)%7;
  const accentColor = DAY_COLORS[colorIdx];

  return (
    <div style={{ position:"fixed", inset:0, background:BG, zIndex:200, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>

      {/* Top bar */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background:CARD, borderBottom:`1px solid ${BORD}`, flexShrink:0 }}>
        <button onClick={onClose} style={{ width:36, height:36, borderRadius:10, background:isDark?"#1e1e1e":"#F1F5F9", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={SUB} strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M5 12l7-7M5 12l7 7"/></svg>
        </button>
        <div style={{ flex:1 }}>
          {editMode
            ? <input value={editDay.name} onChange={e => setEditDay(d=>({...d,name:e.target.value}))}
                style={{ width:"100%", background:"transparent", border:"none", fontSize:17, fontWeight:700, color:TXT, outline:"none", fontFamily:F }}/>
            : <div style={{ fontSize:17, fontWeight:700, color:TXT }}>{editDay.name}</div>
          }
          {lastPerformed && <div style={{ fontSize:11, color:SUB, marginTop:1 }}>Last done {lastPerformed}</div>}
        </div>
        <button onClick={() => {
          // Open picker: share this day OR the whole program
          const prog = store.programs.find(p => p.days?.some(d => d.name === previewDay.day.name));
          setShareModal({ stage: "picker", prog, day: editDay });
        }} aria-label="Share" style={{ width:36, height:36, borderRadius:10, background:isDark?"#1e1e1e":"#F1F5F9", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <Icon name="share" size={16} color={TXT}/>
        </button>
        <button onClick={() => {
          if (editMode && onSaveProgram) {
            const prog = store.programs.find(p => p.days?.some(d => d.name === previewDay.day.name));
            if (prog) onSaveProgram({ ...prog, days: prog.days.map(d => d.name === previewDay.day.name ? editDay : d) });
          }
          setEditMode(m => !m);
        }} style={{
          padding:"8px 16px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:F, border:"none",
          background: editMode ? BLUE : BLUEBG,
          color: editMode ? "#fff" : BLUE,
        }}>{editMode ? "Done" : "Edit"}</button>
      </div>

      {/* Share Modal */}
      {shareModal && (
        <div onClick={() => setShareModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:600, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div onClick={e => e.stopPropagation()} className="seshd-scale-enter" style={{
            background:"#0A0A0A", borderRadius:24, padding:"32px 24px",
            width:"100%", maxWidth:360, color:"#fff", position:"relative",
            fontFamily:F, overflow:"hidden",
          }}>
            <div style={{
              position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
              backgroundImage:`linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
              backgroundSize:"24px 24px",
            }}/>
            <button onClick={() => setShareModal(null)} style={{
              position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.08)",
              border:"none", color:"#fff", width:30, height:30, borderRadius:10,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1
            }}>
              <Icon name="x" size={14} color="#fff"/>
            </button>

            {/* Stage 1: Picker - share day or program */}
            {shareModal.stage === "picker" && (
              <div style={{ position:"relative", zIndex:1 }}>
                <div style={{ fontSize:11, letterSpacing:3, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:8, textAlign:"center" }}>SHARE</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#fff", marginBottom:24, textAlign:"center", letterSpacing:-0.3 }}>What do you want to share?</div>

                <button onClick={async () => {
                  const day = shareModal.day;
                  if (!day || !token) { setShareModal(null); return; }
                  setShareModal({ stage:"code", kind:"day", name: day.name, generating: true });
                  try {
                    let code = generateShareCode("WO");
                    for (let i = 0; i < 5; i++) {
                      const existing = await sb.query(`workout_codes?code=eq.${code}&select=code`, {}, token).catch(()=>[]);
                      if (!existing || existing.length === 0) break;
                      code = generateShareCode("WO");
                    }
                    await sb.query("workout_codes", {
                      method: "POST",
                      body: JSON.stringify({
                        code,
                        user_id: store.currentUserId || undefined,
                        day_name: day.name,
                        exercises: day.exercises || [],
                      })
                    }, token);
                    setShareModal({ stage:"code", kind:"day", name: day.name, code, generating: false });
                  } catch (e) {
                    console.error("workout code error:", e);
                    setShareModal(null);
                    toast("Couldn't generate code — run SQL migration", "error");
                  }
                }} style={{
                  width:"100%", background:"rgba(255,255,255,0.06)",
                  border:"1px solid rgba(255,255,255,0.12)", borderRadius:14,
                  padding:"16px", marginBottom:10, cursor:"pointer", fontFamily:F,
                  display:"flex", alignItems:"center", gap:12, color:"#fff", textAlign:"left",
                }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:"#fff", color:"#0A0A0A", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Icon name="dumbbell" size={18} color="#0A0A0A"/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.2 }}>This workout</div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.55)", marginTop:1 }}>{shareModal.day?.name || ""} · {(shareModal.day?.exercises||[]).length} exercises</div>
                  </div>
                  <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.4)"/>
                </button>

                {shareModal.prog && (
                  <button onClick={async () => {
                    const prog = shareModal.prog;
                    if (prog.shareCode) {
                      setShareModal({ stage:"code", kind:"program", name: prog.name, code: prog.shareCode, generating: false });
                      return;
                    }
                    setShareModal({ stage:"code", kind:"program", name: prog.name, generating: true });
                    if (token) {
                      try {
                        let code = generateShareCode("IGNITE");
                        for (let i = 0; i < 5; i++) {
                          const existing = await sb.query(`programs?share_code=eq.${code}&select=id`, {}, token).catch(()=>[]);
                          if (!existing || existing.length === 0) break;
                          code = generateShareCode("IGNITE");
                        }
                        await sb.query(`programs?id=eq.${prog.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ share_code: code })
                        }, token);
                        if (onSaveProgram) onSaveProgram({ ...prog, shareCode: code });
                        setShareModal({ stage:"code", kind:"program", name: prog.name, code, generating: false });
                      } catch (e) {
                        console.error("share code error:", e);
                        setShareModal(null);
                        toast("Couldn't generate share code", "error");
                      }
                    }
                  }} style={{
                    width:"100%", background:"rgba(255,255,255,0.06)",
                    border:"1px solid rgba(255,255,255,0.12)", borderRadius:14,
                    padding:"16px", marginBottom:6, cursor:"pointer", fontFamily:F,
                    display:"flex", alignItems:"center", gap:12, color:"#fff", textAlign:"left",
                  }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"#fff", color:"#0A0A0A", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Icon name="calendar" size={18} color="#0A0A0A"/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.2 }}>Whole program</div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.55)", marginTop:1 }}>{shareModal.prog.name} · {(shareModal.prog.days||[]).length} days</div>
                    </div>
                    <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.4)"/>
                  </button>
                )}
              </div>
            )}

            {/* Stage 2: Code display */}
            {shareModal.stage === "code" && (
              <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
                <div style={{ fontSize:11, letterSpacing:3, fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:6 }}>
                  {shareModal.kind === "day" ? "WORKOUT CODE" : "PROGRAM CODE"}
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", marginBottom:24, fontWeight:500 }}>{shareModal.name || ""}</div>
                {shareModal.generating ? (
                  <div style={{ fontFamily:MONO, fontSize:32, fontWeight:700, color:"rgba(255,255,255,0.3)", padding:"20px 0", letterSpacing:2 }}>···</div>
                ) : (
                  <div style={{
                    fontFamily:MONO, fontSize:32, fontWeight:800, color:"#fff",
                    letterSpacing:2, padding:"24px 0",
                    borderTop:"1px solid rgba(255,255,255,0.08)",
                    borderBottom:"1px solid rgba(255,255,255,0.08)",
                    marginBottom:24,
                  }}>
                    {shareModal.code}
                  </div>
                )}
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.55)", marginBottom:20, lineHeight:1.5 }}>
                  Anyone with this code can import {shareModal.kind === "day" ? "this workout" : "this program"}.
                </div>
                {!shareModal.generating && (
                  <>
                    <button onClick={() => {
                      const label = shareModal.kind === "day" ? "workout" : "program";
                      const text = `Try my ${label} on Seshd — ${shareModal.code}`;
                      if (navigator.share) navigator.share({ title:`${label} code`, text }).catch(()=>{});
                      else if (navigator.clipboard) { navigator.clipboard.writeText(shareModal.code); toast("Code copied", "success"); }
                    }} style={{
                      width:"100%", background:"#fff", color:"#0A0A0A",
                      border:"none", borderRadius:12, padding:"14px", fontSize:14, fontWeight:700,
                      cursor:"pointer", marginBottom:8, fontFamily:F, letterSpacing:-0.2,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    }}>
                      <Icon name="share" size={16} color="#0A0A0A"/>
                      Share code
                    </button>
                    <button onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(shareModal.code);
                        toast("Code copied", "success");
                      }
                    }} style={{
                      width:"100%", background:"transparent", color:"rgba(255,255,255,0.85)",
                      border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, padding:"13px",
                      fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600,
                    }}>Copy to clipboard</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero band */}
      {!editMode && (
        <div style={{ background:`linear-gradient(135deg,${accentColor},${accentColor}cc)`, padding:"20px 20px 18px", flexShrink:0 }}>
          <div style={{ display:"flex", gap:20 }}>
            {[
              ["dumbbell", editDay.exercises.length, "exercises"],
              ["package", editDay.exercises.reduce((a,ex)=>a+(parseInt(ex.reps)||3),0), "total sets"],
              ...(lastPerformed ? [["check","Done",lastPerformed]] : [["spark","New","first time"]]),
            ].map(([icon,val,label]) => (
              <div key={label} style={{ flex:1, background:"rgba(255,255,255,0.15)", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                <div style={{ marginBottom:4, display:"flex", justifyContent:"center", color:"rgba(255,255,255,0.95)" }}><Icon name={icon} size={18}/></div>
                <div style={{ fontSize:15, fontWeight:800, color:"#fff", lineHeight:1 }}>{val}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.75)", marginTop:3, fontWeight:500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exercise list */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", paddingBottom: editMode ? 120 : 100 }}>
        {!editMode ? (
          editDay.exercises.map((ex, i) => {
            const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
            const pr = store.prs?.[ex.name];
            const muscleColor = {
              chest:"#EF4444",back:"#3B82F6",shoulders:"#8B5CF6",biceps:"#F59E0B",
              triceps:"#F97316",quads:"#10B981",hamstrings:"#10B981",glutes:"#EC4899",
              calves:"#06B6D4",core:"#84CC16",traps:"#6366F1","full body":"#2563EB",
            }[(exInfo?.muscle||"").toLowerCase()] || "#64748B";
            return (
              <div key={i} style={{ background:CARD, borderRadius:14, padding:"14px 16px", marginBottom:10, display:"flex", alignItems:"center", gap:14, boxShadow: isDark?"none":"0 1px 4px rgba(0,0,0,0.06)", borderLeft:`4px solid ${muscleColor}` }}>
                <div style={{ width:42, height:42, borderRadius:10, background:`${muscleColor}18`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <MuscleIcon muscle={exInfo?.muscle||""} size={26} C={C}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:TXT, marginBottom:4 }}>{ex.name}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:11, fontWeight:600, color:BLUE, background:BLUEBG, padding:"3px 9px", borderRadius:20 }}>{ex.reps||"3×8–12"}</span>
                    {exInfo?.muscle && <span style={{ fontSize:11, color:SUB, padding:"3px 0" }}>{exInfo.muscle}</span>}
                    {pr && <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:"#0A0A0A", padding:"3px 8px", borderRadius:6, letterSpacing:0.8 }}>PR {cvt(pr,"lbs",unit)}{unit}</span>}
                  </div>
                  {ex.note && <div style={{ fontSize:11, color:SUB, marginTop:4, fontStyle:"italic" }}>💡 {ex.note}</div>}
                </div>
                <button onClick={() => setViewingExercise(ex.name)} style={{ width:32, height:32, borderRadius:8, background:BLUEBG, border:"none", cursor:"pointer", color:BLUE, fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>?</button>
              </div>
            );
          })
        ) : (
          <>
            {editDay.exercises.map((ex, i) => {
              const exInfo = EXERCISE_DB.find(e => e.name === ex.name);
              return (
                <div key={i} style={{ background:CARD, borderRadius:14, padding:"14px", marginBottom:10, border:`1px solid ${BORD}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:34, height:34, borderRadius:9, background:isDark?"#252525":"#EEF2F7", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <MuscleIcon muscle={exInfo?.muscle||""} size={20} C={C}/>
                    </div>
                    <div style={{ flex:1, fontSize:13, fontWeight:700, color:TXT }}>{ex.name}</div>
                    <button onClick={() => removeEx(i)} style={{ background:"none", border:"none", color:"#EF4444", fontSize:20, cursor:"pointer", padding:"0 2px", lineHeight:1 }}>×</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:SUB, letterSpacing:0.5, marginBottom:4 }}>SETS × REPS</div>
                      <input value={ex.reps||""} onChange={e => updateEx(i,{reps:e.target.value})} placeholder="3×8–12"
                        style={{ width:"100%", background:isDark?"#1a1a1a":"#F8FAFC", border:`1px solid ${BORD}`, borderRadius:8, padding:"8px 10px", fontSize:13, fontWeight:600, color:TXT, outline:"none", fontFamily:F, boxSizing:"border-box" }}/>
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color:SUB, letterSpacing:0.5, marginBottom:4 }}>NOTE</div>
                      <input value={ex.note||""} onChange={e => updateEx(i,{note:e.target.value})} placeholder="Optional..."
                        style={{ width:"100%", background:isDark?"#1a1a1a":"#F8FAFC", border:`1px solid ${BORD}`, borderRadius:8, padding:"8px 10px", fontSize:13, color:TXT, outline:"none", fontFamily:F, boxSizing:"border-box" }}/>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ background:CARD, border:`1.5px dashed ${isDark?"#2563eb55":"#BFDBFE"}`, borderRadius:14, padding:"12px 14px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:BLUE, marginBottom:8 }}>+ ADD EXERCISE</div>
              <ExerciseInput
                key={`preview-edit-${editDay.exercises.length}`}
                value="" onChange={v => { if(v) addEx(v); }} C={C}
              />
            </div>
          </>
        )}
      </div>

      {/* Start button */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"12px 18px 28px", background: isDark?"rgba(10,10,10,0.97)":"rgba(244,246,250,0.97)", backdropFilter:"blur(12px)", borderTop:`1px solid ${BORD}` }}>
        <button onClick={saveAndStart} style={{
          width:"100%", background:accentColor, color:"#fff", border:"none",
          borderRadius:14, padding:"17px", fontSize:16, fontWeight:800,
          cursor:"pointer", fontFamily:F, letterSpacing:-0.3,
          boxShadow:`0 6px 20px ${accentColor}55`
        }}>
          {editMode ? "Save & Start Workout →" : "Start Workout →"}
        </button>
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
// ─── Touch-based drag-to-reorder (works on iOS Safari) ───────────────────────
function useTouchDrag(items, onReorder) {
  const dragRef = useRef(null); // { idx, startY, currentY, nodeHeight }
  const [dragging, setDragging] = useState(null); // index being dragged
  const [overIdx, setOverIdx] = useState(null);
  const containerRef = useRef(null);

  function onHandleTouchStart(idx, e) {
    e.stopPropagation();
    const touch = e.touches[0];
    const node = e.currentTarget.closest('[data-drag-item]');
    dragRef.current = {
      idx,
      startY: touch.clientY,
      nodeHeight: node?.getBoundingClientRect().height || 60,
    };
    setDragging(idx);
    setOverIdx(idx);
    try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
  }

  function onContainerTouchMove(e) {
    if (dragRef.current === null || dragging === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dy = touch.clientY - dragRef.current.startY;
    const steps = Math.round(dy / dragRef.current.nodeHeight);
    const newOver = Math.max(0, Math.min(items.length - 1, dragRef.current.idx + steps));
    setOverIdx(newOver);
  }

  function onContainerTouchEnd() {
    if (dragRef.current !== null && overIdx !== null && overIdx !== dragging) {
      const arr = [...items];
      const [moved] = arr.splice(dragging, 1);
      arr.splice(overIdx, 0, moved);
      onReorder(arr);
    }
    dragRef.current = null;
    setDragging(null);
    setOverIdx(null);
  }

  return { dragging, overIdx, containerRef, onHandleTouchStart, onContainerTouchMove, onContainerTouchEnd };
}

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
        // Best estimated 1RM across all done sets in this session
        const e1rm = Math.max(...doneSets.map(s => {
          const w = cvt(parseFloat(s.weight)||0, sess.unit||"lbs", unit);
          const r = parseInt(s.reps) || 0;
          return calc1RM(w, r) || 0;
        }));
        const d = new Date(dk);
        const label = `${d.getMonth()+1}/${d.getDate()}`;
        points.push({ label, weight: maxW, volume: vol, e1rm, date: dk, sets: doneSets.length });
      }
    }
    return points;
  }, [store.history, name, unit]);

  const chartData = historyData.map(p => ({
    label: p.label,
    value: chartMode === "weight" ? p.weight : chartMode === "e1rm" ? p.e1rm : p.volume
  }));
  const totalSets = historyData.reduce((a, p) => a + p.sets, 0);
  const totalVol = historyData.reduce((a, p) => a + p.volume, 0);
  const sessions = historyData.length;

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:500, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", paddingTop:"env(safe-area-inset-top)" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.divider}`, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.text, padding:"4px 8px 4px 0", fontFamily:F }}>‹</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{name}</div>
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
                <div style={{ fontSize:14, fontWeight:700, color:C.text, fontFamily:MONO }}>{val}</div>
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
              {[["weight","Max"],["e1rm","Est 1RM"],["volume","Volume"]].map(([m, label]) => (
                <button key={m} onClick={() => setChartMode(m)} style={{
                  padding:"4px 10px", borderRadius:14, border:"none",
                  background: chartMode===m ? C.accent : "transparent",
                  color: chartMode===m ? "#fff" : C.sub,
                  fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:F
                }}>{label}</button>
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

function GroupDetail({ g, members, notMembers, currentUserId, store, setStore, C, token, onBack, onUpdateMembers, onLeave }) {
  const [tab, setTab] = useState("feed");
  const [posts, setPosts] = useState([]);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
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
        if (res.ok) {
          const raw = (await res.json()) || [];
          // Merge persisted self-reactions (RLS may block self-PATCH on own group posts)
          // Handle both shapes: { selfReaction: emoji } (new) and { kudos: [userId] } (old, treat as 🔥)
          const persisted = store.historyInteractions || {};
          setPosts(raw.map(p => {
            const dbReactions = p.reactions || {};
            const selfKey = `group_${p.id}`;
            const persistedEntry = persisted[selfKey];
            let selfReaction = persistedEntry?.selfReaction;
            // Backwards compat: if old kudos array exists with current user, treat as a 🔥 reaction
            if (selfReaction === undefined && Array.isArray(persistedEntry?.kudos) && persistedEntry.kudos.includes(currentUserId)) {
              selfReaction = "🔥";
            }
            const merged = { ...dbReactions };
            if (selfReaction) merged[currentUserId] = selfReaction;
            else if (selfReaction === null) delete merged[currentUserId]; // explicit unreact
            return { ...p, _reactions: merged };
          }));
        }
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
        const mime = img.match(/data:(.*?);/)?.[1] || "image/jpeg";
        const upRes = await fetch(`${SUPABASE_URL}/functions/v1/upload-image`, {
          method:"POST",
          headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
          body: JSON.stringify({ base64: img, mimeType: mime })
        });
        if (upRes.ok) {
          const { url } = await upRes.json();
          imageUrl = url || null;
        }
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
                <button onClick={() => setShowWorkoutPicker(true)} style={{ background:"none", border:"none", color:C.accent, fontSize:13, cursor:"pointer", fontFamily:F, fontWeight:600 }}>💪 Share Workout</button>
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
              const isMyPost = post.user_id === currentUserId;
              const myReaction = (post._reactions||{})[currentUserId];
              return (
                <div key={post.id} style={{ padding:"14px 14px", borderBottom:`1px solid ${C.divider}` }}>
                  <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <Avatar user={author} size={36} C={C}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{author?.username || "Unknown"}</span>
                          <span style={{ fontSize:11, color:C.muted }}>{timeAgo(new Date(post.created_at).getTime())}</span>
                        </div>
                        {isMyPost && (
                          <button onClick={async () => {
                            if (!token) return;
                            try {
                              await fetch(`${SUPABASE_URL}/rest/v1/group_posts?id=eq.${post.id}`, {
                                method:"DELETE", headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}` }
                              });
                              setPosts(p => p.filter(x => x.id !== post.id));
                            } catch (e) {
                              console.error("group post delete failed:", e);
                              toast("Couldn't delete post — check connection", "error");
                            }
                          }} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, padding:"0 2px" }}>×</button>
                        )}
                      </div>
                      {post.caption && <div style={{ fontSize:14, color:C.text, lineHeight:1.5, marginBottom:6 }}>{post.caption}</div>}
                      {(post.image_url || post._localImage) && (
                        <img src={post._localImage || post.image_url} alt="" style={{ width:"100%", borderRadius:12, marginBottom:8, maxHeight:320, objectFit:"cover" }}/>
                      )}
                      {post.workout && (
                        <div style={{ marginBottom:8, background:C.divider, borderRadius:12, padding:"12px 14px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                            <div style={{ fontSize:14, fontWeight:800, color:C.text, letterSpacing:-0.2 }}>{post.workout.name}</div>
                            <div style={{ display:"flex", gap:10 }}>
                              {post.workout.duration && (
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:12, fontWeight:800, color:C.accent, fontFamily:MONO }}>{Math.floor((post.workout.duration||0)/60)}m</div>
                                  <div style={{ fontSize:8, color:C.sub, letterSpacing:1 }}>TIME</div>
                                </div>
                              )}
                              {post.workout.volume > 0 && (
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:12, fontWeight:800, color:C.accent, fontFamily:MONO }}>{post.workout.volume >= 1000 ? (post.workout.volume/1000).toFixed(1)+"k" : post.workout.volume}</div>
                                  <div style={{ fontSize:8, color:C.sub, letterSpacing:1 }}>VOL</div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {(post.workout.exercises||[]).map((ex,i) => (
                              <div key={i}>
                                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                                  <span style={{ fontSize:12, fontWeight:700, color:C.text }}>{ex.name}</span>
                                  {ex.isPR && <span style={{ fontSize:8, background:C.text, color:C.bg, padding:"1px 6px", borderRadius:6, fontWeight:800, letterSpacing:1 }}>PR</span>}
                                </div>
                                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {(ex.sets||[]).map((s,j) => (
                                    <span key={j} style={{ fontSize:10, background:C.bg, border:`1px solid ${C.border}`, borderRadius:5, padding:"2px 6px", color:C.textDim||C.sub, fontFamily:MONO, fontWeight:600 }}>
                                      {s.w > 0 ? `${s.w}×${s.r}` : `${s.r} reps`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Reactions */}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {["🔥","💪","👏","🏆"].map(emoji => {
                          const count = Object.values(post._reactions||{}).filter(r=>r===emoji).length;
                          const active = myReaction === emoji;
                          return (
                            <button key={emoji} onClick={async () => {
                              const prev = post._reactions||{};
                              const next = { ...prev };
                              if (active) delete next[currentUserId];
                              else next[currentUserId] = emoji;
                              // Optimistic local update
                              setPosts(p => p.map(x => x.id===post.id ? {...x, _reactions:next} : x));

                              // Persist to DB - RLS now allows any authenticated user to update reactions
                              if (token) {
                                try {
                                  const res = await fetch(`${SUPABASE_URL}/rest/v1/group_posts?id=eq.${post.id}`, {
                                    method:"PATCH",
                                    headers:{
                                      "apikey":SUPABASE_KEY,
                                      "Authorization":`Bearer ${token}`,
                                      "Content-Type":"application/json",
                                    },
                                    body: JSON.stringify({ reactions: next })
                                  });
                                  if (!res.ok) {
                                    console.error("reaction save failed:", res.status, await res.text().catch(()=>""));
                                    toast("Couldn't save reaction", "error");
                                    setPosts(p => p.map(x => x.id===post.id ? {...x, _reactions:prev} : x));
                                  }
                                } catch (e) {
                                  console.error("reaction save error:", e);
                                  toast("Couldn't save reaction", "error");
                                  setPosts(p => p.map(x => x.id===post.id ? {...x, _reactions:prev} : x));
                                }
                              }
                            }} style={{
                              background: active ? `${C.accent}20` : C.divider,
                              border: `1px solid ${active ? C.accent : "transparent"}`,
                              borderRadius:20, padding:"3px 10px", fontSize:12, cursor:"pointer",
                              display:"flex", alignItems:"center", gap:4, fontFamily:F,
                              color: active ? C.accent : C.sub
                            }}>
                              {emoji}{count > 0 && <span style={{ fontSize:11, fontWeight:600 }}>{count}</span>}
                            </button>
                          );
                        })}
                      </div>
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

      {showWorkoutPicker && (() => {
        const recents = Object.entries(store.history||{}).sort(([a],[b])=>b.localeCompare(a)).flatMap(([d,s])=>Object.values(s).map(sess=>({...sess,date:d}))).slice(0,10);
        return (
          <div onClick={() => setShowWorkoutPicker(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 16px" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:C.bg, borderRadius:20, width:"100%", maxWidth:420, maxHeight:"75dvh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.3)", overflow:"hidden" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px 12px", borderBottom:`1px solid ${C.divider}` }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>Share a Workout</div>
                <button onClick={() => setShowWorkoutPicker(false)} style={{ width:28, height:28, borderRadius:"50%", background:C.divider, border:"none", cursor:"pointer", fontSize:14, color:C.text }}>×</button>
              </div>
              <div style={{ overflowY:"auto", flex:1, padding:"10px 14px 14px" }}>
                {recents.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"40px 20px", color:C.sub }}>
                    <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Icon name="dumbbell" size={30} color="currentColor"/></div>
                    <div style={{ fontSize:13 }}>Complete a workout first to share it</div>
                  </div>
                ) : recents.map((sess,i) => {
                  const done = (sess.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).length,0);
                  const vol = (sess.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseFloat(s.reps)||0),0),0);
                  return (
                    <div key={i} onClick={async () => {
                      if (!token) return;
                      setShowWorkoutPicker(false);
                      setPosting(true);
                      const workoutData = { name:sess.dayName, duration:sess.duration, exercises:(sess.exercises||[]).filter(e=>e.name).map(ex=>({ name:ex.name, sets:(ex.sets||[]).filter(s=>s.done).map(s=>({w:parseFloat(s.weight)||0,r:parseFloat(s.reps)||0})) })) };
                      try {
                        const r = await fetch(`${SUPABASE_URL}/rest/v1/group_posts`, {
                          method:"POST",
                          headers:{ "apikey":SUPABASE_KEY, "Authorization":`Bearer ${token}`, "Content-Type":"application/json", "Prefer":"return=representation" },
                          body: JSON.stringify({ group_id:g.id, user_id:currentUserId, type:"workout", caption:`${sess.dayName}`, workout:workoutData })
                        });
                        if (r.ok) {
                          const d = await r.json();
                          const p = Array.isArray(d)?d[0]:d;
                          if(p) setPosts(prev=>[p,...prev]);
                          toast("Shared to group", "success");
                        } else {
                          toast("Couldn't share — try again", "error");
                        }
                      } catch {
                        toast("Couldn't share — try again", "error");
                      } finally {
                        setPosting(false);
                      }
                    }} style={{ padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:12, marginBottom:8, cursor:"pointer", background:C.surface }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{sess.dayName}</div>
                          <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>
                            {new Date(sess.date).toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})} · {fmtTime(sess.duration||0)} · {done} sets
                          </div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>
                            {(sess.exercises||[]).filter(e=>e.name).slice(0,3).map(e=>e.name).join(" · ")}
                            {(sess.exercises||[]).length > 3 ? ` +${(sess.exercises||[]).length-3}` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize:13, color:C.accent, fontWeight:700, fontFamily:MONO, flexShrink:0, marginLeft:10 }}>{Math.round(vol).toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
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
      currentUserId={currentUserId} store={store} setStore={setStore} C={C} token={token}
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
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:14 }}>New Group</div>
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
  const [searchFocused, setSearchFocused] = useState(false);
  const [subTab, setSubTab] = useState("discover");
  const [viewingExercise, setViewingExercise] = useState(null);
  const me = store.users.find(u => u.id === currentUserId);
  const following = me?.following || [];

  const userResults = q.length >= 1
    ? store.users.filter(u => u.id !== currentUserId && (
        u.name?.toLowerCase().includes(q.toLowerCase()) ||
        u.username?.toLowerCase().includes(q.toLowerCase())
      )).slice(0, 8)
    : [];

  const exerciseResults = q.length >= 2
    ? EXERCISE_DB.filter(e => e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];

  const showResults = q.length >= 1 && (userResults.length > 0 || exerciseResults.length > 0);

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

  if (viewingExercise) {
    return <ExerciseDetail name={viewingExercise} store={store} unit={store.unit||"lbs"} C={C} onClose={() => setViewingExercise(null)}/>;
  }
  if (subTab === "groups") {
    return <GroupsScreen store={store} setStore={setStore} currentUserId={currentUserId} C={C} onBack={() => setSubTab("discover")} token={token}/>;
  }
  if (subTab === "challenges") {
    return <FriendsActivityScreen store={store} currentUserId={currentUserId} C={C} unit={store.unit||"lbs"} onBack={() => setSubTab("discover")} onUserClick={onUserClick}/>;
  }

  return (
    <div style={{ overflowY:"auto", flex:1, paddingBottom:24 }}>
      {/* Search bar */}
      <div style={{ padding:"14px 16px 10px", position:"relative" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position:"absolute", left:30, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>
        </svg>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          placeholder="Search people or exercises..."
          style={{ width:"100%", background:C.divider, border:"none", borderRadius:14, padding:"12px 14px 12px 38px", fontSize:14, color:C.text, outline:"none", boxSizing:"border-box", fontFamily:F }}
        />
        {q.length > 0 && (
          <button onClick={() => setQ("")} style={{ position:"absolute", right:28, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18, padding:4, lineHeight:1 }}>×</button>
        )}
      </div>

      {/* Search results */}
      {showResults && (
        <div style={{ padding:"0 16px", marginBottom:8 }}>
          {userResults.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, padding:"8px 0 10px" }}>PEOPLE</div>
              <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:12 }}>
                {userResults.map((u, idx) => {
                  const amFollowing = following.includes(u.id);
                  return (
                    <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom: idx < userResults.length-1 ? `1px solid ${C.divider}` : "none" }}>
                      <div onClick={() => onUserClick && onUserClick(u.id)} style={{ display:"flex", alignItems:"center", gap:12, flex:1, cursor:"pointer" }}>
                        <Avatar user={u} size={44} C={C}/>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                          <div style={{ fontSize:12, color:C.sub }}>{u.name} · {u.followers?.length||0} followers</div>
                        </div>
                      </div>
                      <button onClick={() => onFollow && onFollow(u.id)} style={{
                        padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:700, flexShrink:0,
                        background: amFollowing ? "transparent" : C.accent,
                        color: amFollowing ? C.text : "#fff",
                        border: `1.5px solid ${amFollowing ? C.border : C.accent}`,
                        cursor:"pointer", fontFamily:F
                      }}>{amFollowing ? "Following" : "Follow"}</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {exerciseResults.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, letterSpacing:1, padding:"8px 0 10px" }}>EXERCISES</div>
              <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:12 }}>
                {exerciseResults.map((ex, idx) => (
                  <div key={ex.name} onClick={() => setViewingExercise(ex.name)} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom: idx < exerciseResults.length-1 ? `1px solid ${C.divider}` : "none", cursor:"pointer" }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <MuscleIcon muscle={ex.muscle||""} size={26} C={C}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:500, color:C.text }}>{ex.name}</div>
                      <div style={{ fontSize:12, color:C.sub }}>{ex.muscle}</div>
                    </div>
                    {(store.prs||{})[ex.name] && (
                      <div style={{ fontSize:11, color:C.gold, fontWeight:700, fontFamily:MONO }}>🏆 {store.prs[ex.name]} {store.unit||"lbs"}</div>
                    )}
                    <span style={{ fontSize:14, color:C.sub }}>›</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Default discover view */}
      {!showResults && (
        <div style={{ padding:"4px 16px 0" }}>
          {/* Quick access cards */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
            <button onClick={() => setSubTab("challenges")} style={{
              background:C.text, color:C.bg,
              border:"none", borderRadius:16, padding:"18px 16px",
              cursor:"pointer", textAlign:"left", fontFamily:F,
              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:14,
            }}>
              <div style={{ width:32, height:32, borderRadius:10, background:C.bg, color:C.text, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Icon name="trending-up" size={18}/>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.3 }}>Friends Activity</div>
                <div style={{ fontSize:11, opacity:0.65, marginTop:3 }}>Weekly stats</div>
              </div>
            </button>
            <button onClick={() => setSubTab("groups")} style={{
              background:C.surface, color:C.text,
              border:`1px solid ${C.border}`, borderRadius:16, padding:"18px 16px",
              cursor:"pointer", textAlign:"left", fontFamily:F,
              display:"flex", flexDirection:"column", alignItems:"flex-start", gap:14,
            }}>
              <div style={{ width:32, height:32, borderRadius:10, background:C.divider, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Icon name="users" size={18} color={C.text}/>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, letterSpacing:-0.3 }}>Groups</div>
                <div style={{ fontSize:11, color:C.sub, marginTop:3 }}>Private crews</div>
              </div>
            </button>
          </div>

          {following.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:0.8, marginBottom:12 }}>FRIENDS LEADERBOARD</div>
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
                {["Barbell Bench Press","Barbell Back Squat","Deadlift"].map((ex, i) => (
                  <div key={ex} style={{ padding:"12px 16px", borderBottom: i<2 ? `1px solid ${C.divider}` : "none" }}>
                    <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:8 }}>{ex}</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {[...store.users.filter(u => following.includes(u.id)), store.users.find(u => u.id === currentUserId)].filter(Boolean).map((u, j) => (
                        <div key={u.id} style={{ display:"flex", alignItems:"center", gap:5, background:C.divider, borderRadius:20, padding:"4px 10px" }}>
                          <Avatar user={u} size={16} C={C}/>
                          <span style={{ fontSize:11, color:C.text, fontWeight:500 }}>{u.name.split(" ")[0]}</span>
                          <span style={{ fontSize:11, color:C.accent, fontFamily:MONO, fontWeight:700 }}>{[225,185,205][j%3] || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.divider}` }}>
                  <span style={{ fontSize:10, color:C.muted }}>Friends only · no strangers, no faking</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:0.8, marginBottom:12 }}>SUGGESTED PEOPLE</div>
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
            {store.users.filter(u => u.id !== currentUserId).map((u, idx, arr) => {
              const isF = following.includes(u.id);
              return (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom: idx < arr.length-1 ? `1px solid ${C.divider}` : "none" }}>
                  <Avatar user={u} size={46} C={C} onClick={() => onUserClick(u.id)}/>
                  <div style={{ flex:1, cursor:"pointer", minWidth:0 }} onClick={() => onUserClick(u.id)}>
                    <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                    <div style={{ fontSize:12, color:C.sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}{u.bio ? ` · ${u.bio}` : ""}</div>
                  </div>
                  <button onClick={() => toggleFollow(u.id)} style={{
                    padding:"7px 16px", background:isF?"transparent":C.accent,
                    border:`1.5px solid ${isF?C.border:C.accent}`, borderRadius:20,
                    fontSize:12, fontWeight:700, color:isF?C.text:"#fff",
                    cursor:"pointer", flexShrink:0, fontFamily:F
                  }}>{isF?"Following":"Follow"}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
    // weekly streak — # of consecutive weeks user hit weeklyTarget
    const ws = calcWeeklyStreak(store.workoutDates || {}, store.weeklyTarget || 3);
    return { sessions, volume: Math.round(volume), streak: ws.count, prs: Object.keys(store.prs||{}).length };
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

function ProfileScreen({ userId, store, setStore, currentUserId, onBack, displayUnit, C, onToggleTheme, onUserClick, email, onSignOut, onFollow, token }) {
  const user = store.users.find(u => u.id === userId);
  const isMe = userId === currentUserId;
  const me = store.users.find(u => u.id === currentUserId);
  const isFollowing = me?.following?.includes(userId);
  const sharedWorkoutKeys = new Set((store.posts||[]).filter(p=>p.type==="workout"&&p.userId===userId).map(p=>p.workout?.name+p.createdAt));
  const profileHistoryItems = isMe ? Object.entries(store.history||{}).flatMap(([date, sessions]) =>
    Object.values(sessions).map(sess => {
      const key = sess.dayName + new Date(date).getTime();
      if (sharedWorkoutKeys.has(key)) return null;
      const vol = (sess.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseFloat(s.reps)||0),0),0);
      return {
        id: "hist_"+date+"_"+sess.dayName,
        userId,
        type: "workout",
        caption: "",
        unit: sess.unit || displayUnit || "lbs",
        workout: { name: sess.dayName, duration: sess.duration||0, volume: Math.round(vol), exercises: (sess.exercises||[]).filter(e=>e.name).map(ex=>({ name:ex.name, sets:(ex.sets||[]).filter(s=>s.done).map(s=>({w:parseFloat(s.weight)||0,r:parseFloat(s.reps)||0})) })) },
        kudos: [], comments: [],
        createdAt: new Date(date).getTime(),
        _isHistory: true,
      };
    }).filter(Boolean)
  ) : [];
  const posts = [...store.posts.filter(p => p.userId === userId && p.type !== "story"), ...profileHistoryItems].sort((a, b) => b.createdAt - a.createdAt);
  const avatarRef = useRef(null);
  const weeklyStreak = isMe ? calcWeeklyStreak(store.workoutDates || {}, store.weeklyTarget || 3) : { count: 0, thisWeek: 0, target: 3, status: "lost" };
  const streak = weeklyStreak.count;
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

  async function saveProfile() {
    const newName = editName.trim() || user?.name;
    const newUsername = editUsername.trim().replace(/\s/g, "") || user?.username;
    const newBio = editBio;
    // Update local store first (optimistic)
    setStore(p => ({
      ...p,
      users: p.users.map(u => u.id === currentUserId ? {
        ...u,
        name: newName,
        username: newUsername,
        bio: newBio
      } : u)
    }));
    setShowEdit(false);
    // Persist to Supabase
    const tok = token || loadSession()?.access_token;
    if (tok) {
      try {
        await sb.query(`profiles?id=eq.${currentUserId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: newName, username: newUsername, bio: newBio })
        }, tok);
      } catch (e) {
        console.error("profile save error:", e);
        toast("Couldn't save profile changes", "error");
      }
    }
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

  async function handleAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    const tok = token || loadSession()?.access_token;
    const r = new FileReader();
    r.onload = async ev => {
      const dataUrl = ev.target.result;
      // Show preview immediately
      setStore(p => ({
        ...p,
        users: p.users.map(u => u.id === currentUserId ? { ...u, avatarUrl: dataUrl } : u)
      }));
      // Upload to Supabase Storage
      if (tok) {
        try {
          const uploadedUrl = await uploadImage(dataUrl, tok, currentUserId);
          if (uploadedUrl && !uploadedUrl.startsWith("data:")) {
            // Save URL to profiles table
            await sb.query(`profiles?id=eq.${currentUserId}`, {
              method: "PATCH",
              body: JSON.stringify({ avatar_url: uploadedUrl })
            }, tok);
            // Update store with real URL
            setStore(p => ({
              ...p,
              users: p.users.map(u => u.id === currentUserId ? { ...u, avatarUrl: uploadedUrl } : u)
            }));
            toast("Profile photo updated!", "success");
          } else {
            toast("Upload failed — preview only", "error");
          }
        } catch (err) {
          console.error("avatar upload error:", err);
          toast("Couldn't save photo", "error");
        }
      }
    };
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
            <button onClick={() => setListModal("followers")} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"center", padding:"4px 8px" }}>
              <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{followers}</div>
              <div style={{ fontSize:12, color:C.sub }}>Followers</div>
            </button>
            <button onClick={() => setListModal("following")} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"center", padding:"4px 8px" }}>
              <div style={{ fontSize:17, fontWeight:700, color:C.text }}>{following2}</div>
              <div style={{ fontSize:12, color:C.sub }}>Following</div>
            </button>
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.text, display:"flex", alignItems:"center", gap:8 }}>
            {user?.name}
            {isMe && (streak > 0 || weeklyStreak.thisWeek > 0) && <StreakBadge streak={streak} status={weeklyStreak.status} thisWeek={weeklyStreak.thisWeek} target={weeklyStreak.target} size="sm"/>}
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
            onEditComment={() => {}}
            onDeleteComment={() => {}}
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
                      <button key={u} onClick={async () => {
                        setStore(p => ({ ...p, unit: u }));
                        const tok = token || loadSession()?.access_token;
                        if (tok) {
                          try { await sb.query(`profiles?id=eq.${currentUserId}`, { method:"PATCH", body: JSON.stringify({ unit: u }) }, tok); }
                          catch (e) { console.error("unit save error:", e); }
                        }
                      }} style={{
                        padding:"6px 16px", background:(store.unit||"lbs")===u?C.accent:"transparent",
                        color:(store.unit||"lbs")===u?"#fff":C.sub, border:"none", borderRadius:20,
                        fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F
                      }}>{u.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize:11, fontWeight:600, color:C.sub, letterSpacing:1, marginBottom:10 }}>STREAK</div>
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px" }}>
                  <div>
                    <div style={{ fontSize:14, color:C.text }}>Weekly target</div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>Hit this each week to keep your streak</div>
                  </div>
                  <div style={{ display:"flex", background:C.divider, borderRadius:20, padding:3, gap:1 }}>
                    {[2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setStore(p => ({ ...p, weeklyTarget: n }))} style={{
                        padding:"6px 12px", background:(store.weeklyTarget||3)===n?C.accent:"transparent",
                        color:(store.weeklyTarget||3)===n?"#fff":C.sub, border:"none", borderRadius:20,
                        fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:F, minWidth:32
                      }}>{n}</button>
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
        const myFollowing = me?.following || [];
        return (
          <div onClick={() => setListModal(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:C.bg, borderRadius:20, width:"100%", maxWidth:420, maxHeight:"75dvh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.3)", margin:"0 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 16px 12px", borderBottom:`1px solid ${C.divider}` }}>
                <div style={{ width:44 }}/>
                <div style={{ fontSize:14, fontWeight:700, color:C.text, textTransform:"capitalize" }}>{listModal} · {listUsers.length}</div>
                <button onClick={() => setListModal(null)} style={{ width:28, height:28, borderRadius:"50%", background:C.divider, border:"none", cursor:"pointer", fontSize:14, color:C.text, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
              <div style={{ overflowY:"auto", flex:1, paddingBottom:20 }}>
                {listUsers.length === 0 && (
                  <div style={{ textAlign:"center", color:C.sub, padding:"50px 20px", fontSize:13 }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>👤</div>
                    No {listModal} yet
                  </div>
                )}
                {listUsers.map(u => {
                  const amFollowing = myFollowing.includes(u.id);
                  const isMyself = u.id === currentUserId;
                  return (
                    <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.divider}` }}>
                      <div onClick={() => { setListModal(null); if (onUserClick) onUserClick(u.id); }} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
                        <Avatar user={u} size={44} C={C}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{u.username}</div>
                          <div style={{ fontSize:12, color:C.sub }}>{u.name}</div>
                        </div>
                      </div>
                      {!isMyself && (
                        <button onClick={() => onFollow && onFollow(u.id)} style={{
                          padding:"7px 16px", borderRadius:8, fontSize:12, fontWeight:600,
                          background: amFollowing ? "transparent" : C.accent,
                          color: amFollowing ? C.text : "#fff",
                          border: `1px solid ${amFollowing ? C.border : C.accent}`,
                          cursor:"pointer", fontFamily:F, flexShrink:0
                        }}>{amFollowing ? "Following" : "Follow"}</button>
                      )}
                    </div>
                  );
                })}
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
function NewPostModal({ C, onClose, onPost, initialKind = "photo", recentWorkouts = [] }) {
  const [postKind, setPostKind] = useState(initialKind);
  const [caption, setCaption] = useState("");
  const [img, setImg] = useState(null);
  const [loc, setLoc] = useState("");
  const [runDist, setRunDist] = useState("");
  const [runDistUnit, setRunDistUnit] = useState("mi");
  const [runHrs, setRunHrs] = useState("");
  const [runMins, setRunMins] = useState("");
  const [runSecs, setRunSecs] = useState("");
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const fileRef = useRef(null);
  const MAX_CAPTION = 280;

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
    if (postKind === "workout") return !!selectedWorkout;
    if (postKind === "run") return !!(runDist && (runMins || runHrs));
    return false;
  }

  function handleShare() {
    if (!canShare()) return;
    if (postKind === "story") {
      onPost({ type:"story", caption, imageData:img });
    } else if (postKind === "photo") {
      onPost({ type:"photo", caption, imageData:img, location:loc });
    } else if (postKind === "workout") {
      // done===true means explicitly done; done===undefined (old records) with reps means done; done===false means skipped
      const isDoneSet = s => s.done === true || (s.done === undefined && (parseFloat(s.reps||s.r) > 0));
      const doneExercises = (selectedWorkout.exercises||[])
        .filter(e => e.name && (e.sets||[]).some(isDoneSet))
        .map(ex => ({
          name: ex.name,
          sets: (ex.sets||[]).filter(isDoneSet).map(s => ({ w: parseFloat(s.weight||s.w)||0, r: parseFloat(s.reps||s.r)||0 }))
        }))
        .filter(ex => ex.sets.length > 0);
      const vol = doneExercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+s.w*s.r,0),0);
      onPost({ type:"workout", caption: caption || `${selectedWorkout.dayName} — done.`,
        unit: selectedWorkout.unit || "lbs",
        workout: {
          name: selectedWorkout.dayName,
          duration: selectedWorkout.duration,
          volume: Math.round(vol),
          exercises: doneExercises
        }
      });
    } else if (postKind === "run") {
      const totalMins = (parseInt(runHrs)||0)*60 + (parseInt(runMins)||0) + (parseInt(runSecs)||0)/60;
      onPost({ type:"run", caption, location:loc, run:{
        distance:parseFloat(runDist), distUnit:runDistUnit,
        durationMins:Math.round(totalMins), pace:calcPace()
      }});
    }
    onClose();
  }

  const kinds = [
    { id:"photo", label:"image", full:"Photo" },
    { id:"story", label:"zap", full:"Story" },
    { id:"workout", label:"dumbbell", full:"Workout" },
    { id:"run", label:"activity", full:"Run" },
  ];

  function PostKindIcon({ name, size }) {
    if (name === "image") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
    return <Icon name={name} size={size}/>;
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div style={{ background:C.bg, borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, margin:"0 auto", maxHeight:"92dvh", display:"flex", flexDirection:"column" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 16px 12px" }}>
          <button onClick={onClose} style={{ fontSize:14, color:C.sub, background:"none", border:"none", cursor:"pointer", fontFamily:F }}>Cancel</button>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>New Post</div>
          <button onClick={handleShare} style={{
            fontSize:14, fontWeight:700, color:"#fff",
            background: canShare() ? C.accent : C.divider,
            border:"none", borderRadius:20, padding:"6px 16px", cursor:canShare()?"pointer":"default", fontFamily:F
          }}>Share</button>
        </div>

        {/* Kind tabs */}
        <div style={{ display:"flex", padding:"0 14px 12px", gap:6 }}>
          {kinds.map(k => (
            <button key={k.id} onClick={() => setPostKind(k.id)} style={{
              flex:1, padding:"10px 4px", borderRadius:12, fontSize:11, fontWeight:700,
              background: postKind === k.id ? C.text : C.surface,
              color: postKind === k.id ? C.bg : C.sub,
              border: postKind === k.id ? "none" : `1px solid ${C.border}`, cursor:"pointer", fontFamily:F,
              display:"flex", flexDirection:"column", alignItems:"center", gap:5
            }}>
              <PostKindIcon name={k.label} size={18}/>
              <span>{k.full}</span>
            </button>
          ))}
        </div>

        <div style={{ overflowY:"auto", flex:1, padding:"0 14px 20px" }}>
          {/* Photo / Story */}
          {(postKind === "photo" || postKind === "story") && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])}/>
              <div onClick={() => fileRef.current?.click()} style={{
                border:`1.5px dashed ${C.border}`, borderRadius:14, minHeight:160,
                display:"flex", alignItems:"center", justifyContent:"center",
                flexDirection:"column", gap:8, cursor:"pointer", marginBottom:12, overflow:"hidden", position:"relative"
              }}>
                {img
                  ? <>
                      <img src={img} alt="" style={{ width:"100%", maxHeight:260, objectFit:"cover" }}/>
                      <button onClick={e => { e.stopPropagation(); setImg(null); }} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", border:"none", color:"#fff", borderRadius:"50%", width:26, height:26, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                    </>
                  : <>
                      <span style={{ fontSize:32 }}>{postKind==="story"?"⚡":"📸"}</span>
                      <span style={{ fontSize:13, color:C.sub }}>Tap to add {postKind==="story"?"story photo":"photo"}</span>
                    </>
                }
              </div>
              {postKind === "photo" && (
                <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="📍 Location (optional)"
                  style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}/>
              )}
              <div style={{ position:"relative" }}>
                <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0,MAX_CAPTION))} placeholder="Write a caption..." rows={3}
                  style={{ width:"100%", background:C.divider, border:`1px solid ${caption.length > MAX_CAPTION * 0.9 ? C.gold : "transparent"}`, borderRadius:12, padding:"12px 14px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}/>
                <div style={{ textAlign:"right", fontSize:10, color:caption.length > MAX_CAPTION * 0.9 ? C.gold : C.muted, marginTop:4 }}>{caption.length}/{MAX_CAPTION}</div>
              </div>
            </>
          )}

          {/* Workout share */}
          {postKind === "workout" && (
            <>
              <div style={{ fontSize:12, fontWeight:700, color:C.sub, letterSpacing:1, marginBottom:10 }}>SELECT WORKOUT TO SHARE</div>
              {recentWorkouts.length === 0 ? (
                <div style={{ textAlign:"center", color:C.sub, padding:"30px 0", fontSize:13 }}>
                  <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><Icon name="dumbbell" size={30} color="currentColor"/></div>
                  Complete a workout first
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
                  {recentWorkouts.map((w, i) => {
                    const vol = (w.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseFloat(s.reps)||0),0),0);
                    const done = (w.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done).length,0);
                    const isSelected = selectedWorkout === w;
                    return (
                      <div key={i} onClick={() => setSelectedWorkout(isSelected ? null : w)} style={{
                        border:`2px solid ${isSelected ? C.accent : C.border}`,
                        borderRadius:12, padding:"12px 14px", cursor:"pointer",
                        background: isSelected ? `${C.accent}12` : C.surface
                      }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{w.dayName}</div>
                          {isSelected && <div style={{ color:C.accent, fontSize:18 }}>✓</div>}
                        </div>
                        <div style={{ fontSize:12, color:C.sub, marginTop:3 }}>{fmtTime(w.duration||0)} · {done} sets · {Math.round(vol).toLocaleString()} {w.unit||"lbs"}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ position:"relative" }}>
                <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0,MAX_CAPTION))} placeholder="Add a caption... (optional)" rows={2}
                  style={{ width:"100%", background:C.divider, border:"none", borderRadius:12, padding:"12px 14px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}/>
                <div style={{ textAlign:"right", fontSize:10, color:C.muted, marginTop:4 }}>{caption.length}/{MAX_CAPTION}</div>
              </div>
            </>
          )}

          {/* Run */}
          {postKind === "run" && (
            <>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <div style={{ flex:1, background:C.divider, borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:C.sub, fontWeight:700, letterSpacing:1, marginBottom:6 }}>DISTANCE</div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <input value={runDist} onChange={e => setRunDist(e.target.value)} placeholder="0.0" type="number" inputMode="decimal"
                      style={{ flex:1, background:"none", border:"none", fontSize:28, fontWeight:800, color:C.accent, outline:"none", fontFamily:MONO }}/>
                    <button onClick={() => setRunDistUnit(u => u==="mi"?"km":"mi")} style={{ background:C.border, border:"none", borderRadius:6, padding:"5px 10px", fontSize:11, fontWeight:700, color:C.accent, cursor:"pointer", fontFamily:F }}>{runDistUnit}</button>
                  </div>
                </div>
                <div style={{ flex:1, background:C.divider, borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:C.sub, fontWeight:700, letterSpacing:1, marginBottom:6 }}>TIME (h:m:s)</div>
                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                    {[["h",runHrs,setRunHrs],["m",runMins,setRunMins],["s",runSecs,setRunSecs]].map(([lbl,val,setter]) => (
                      <div key={lbl} style={{ display:"flex", alignItems:"center", gap:2 }}>
                        <input value={val} onChange={e => setter(e.target.value)} placeholder="0" type="number" inputMode="numeric"
                          style={{ width:32, background:"none", border:"none", fontSize:18, fontWeight:700, color:C.text, outline:"none", textAlign:"center", fontFamily:MONO }}/>
                        <span style={{ fontSize:11, color:C.sub }}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {calcPace() && (
                <div style={{ background:C.divider, borderRadius:10, padding:"10px 14px", marginBottom:12, textAlign:"center" }}>
                  <span style={{ fontSize:11, color:C.sub }}>Pace  </span>
                  <span style={{ fontSize:18, fontWeight:800, color:C.accent, fontFamily:MONO }}>{calcPace()}</span>
                </div>
              )}
              <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="📍 Route or location"
                style={{ width:"100%", background:C.divider, border:"none", borderRadius:10, padding:"11px 14px", fontSize:14, color:C.text, outline:"none", marginBottom:10, boxSizing:"border-box", fontFamily:F }}/>
              <textarea value={caption} onChange={e => setCaption(e.target.value.slice(0,MAX_CAPTION))} placeholder="How did it go?" rows={2}
                style={{ width:"100%", background:C.divider, border:"none", borderRadius:12, padding:"12px 14px", fontSize:14, color:C.text, resize:"none", outline:"none", boxSizing:"border-box", fontFamily:F }}/>
            </>
          )}
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
        <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:14 }}>Edit Post</div>
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
function AuthScreen({ onAuth, onGuest, C, initialMode = "welcome", promptReason = null }) {
  const [mode, setMode] = useState(initialMode); // "welcome" | "signin" | "signup"
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
    width:"100%", background:C.divider, border:"none", borderRadius:12,
    padding:"14px 16px", fontSize:16, color:C.text, outline:"none",
    fontFamily:F, boxSizing:"border-box", marginBottom:10
  };

  // ── Welcome / guest entry ────────────────────────────────────
  if (mode === "welcome") {
    return (
      <div style={{
        minHeight:"100dvh", background:C.bg, display:"flex", flexDirection:"column",
        paddingTop:"max(env(safe-area-inset-top), 32px)", paddingBottom:"max(env(safe-area-inset-bottom), 24px)",
        paddingLeft:24, paddingRight:24, position:"relative", overflow:"hidden",
      }}>
        {/* Soft ambient gradient — no generic blobs */}
        <div style={{
          position:"absolute", top:"-20%", right:"-30%", width:"80%", aspectRatio:"1",
          background:`radial-gradient(circle, ${C.accent}1a 0%, transparent 70%)`, pointerEvents:"none"
        }}/>
        <div style={{
          position:"absolute", bottom:"-15%", left:"-25%", width:"70%", aspectRatio:"1",
          background:`radial-gradient(circle, ${C.accent2 || C.accent}14 0%, transparent 70%)`, pointerEvents:"none"
        }}/>

        {/* Hero */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", position:"relative", zIndex:1 }}>
          {promptReason && (
            <div style={{ marginBottom:24, padding:"14px 18px", borderRadius:14, background:C.surface, border:`1px solid ${C.accent}40` }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.accent, letterSpacing:1, marginBottom:4 }}>HEADS UP</div>
              <div style={{ fontSize:14, color:C.text, lineHeight:1.4 }}>{promptReason}</div>
            </div>
          )}

          <SeshdLogo C={C} big/>

          <h1 style={{
            fontSize:34, fontWeight:900, color:C.text, marginTop:24, marginBottom:10,
            letterSpacing:-1, lineHeight:1.05, fontFamily:F
          }}>
            Lift heavy.<br/>Track everything.
          </h1>
          <p style={{
            fontSize:15, color:C.sub, lineHeight:1.5, marginBottom:0, fontFamily:F,
            maxWidth:340
          }}>
            A no-bullshit gym log that actually keeps up with you. Train first — make it social later.
          </p>

          {/* Trust signals — premium feel */}
          <div style={{ marginTop:28, display:"flex", flexDirection:"column", gap:14 }}>
            {[
              ["Plate calculator & 1RM built in"],
              ["Auto rest timer, swipe-to-complete"],
              ["Your data stays yours"],
            ].map(([txt], i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{
                  width:24, height:24, borderRadius:12, background:`${C.accent}1f`,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ fontSize:14, color:C.text, fontFamily:F }}>{txt}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={() => onGuest && onGuest()} style={{
            width:"100%", background:C.text, color:C.bg, border:"none",
            borderRadius:14, padding:"17px", fontSize:16, fontWeight:800,
            cursor:"pointer", fontFamily:F, letterSpacing:-0.3,
            transition:"transform 0.1s",
          }}
            onTouchStart={e => e.currentTarget.style.transform = "scale(0.98)"}
            onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}
          >
            Start Tracking
          </button>
          <button onClick={() => setMode("signin")} style={{
            width:"100%", background:"transparent", color:C.text, border:`1px solid ${C.border}`,
            borderRadius:14, padding:"15px", fontSize:14, fontWeight:600,
            cursor:"pointer", fontFamily:F,
          }}>
            I have an account
          </button>
          <div style={{ textAlign:"center", marginTop:6, fontSize:11, color:C.muted, fontFamily:F }}>
            No account needed to start lifting
          </div>
        </div>
      </div>
    );
  }

  // ── Sign in / Sign up form ────────────────────────────────────
  return (
    <div style={{
      minHeight:"100dvh", background:C.bg, display:"flex", flexDirection:"column",
      padding:"0 24px",
      paddingTop:"max(env(safe-area-inset-top), 20px)",
      paddingBottom:"max(env(safe-area-inset-bottom), 24px)",
    }}>
      <div style={{ display:"flex", alignItems:"center", height:48 }}>
        <button onClick={() => { setMode("welcome"); setError(""); }} style={{
          background:"none", border:"none", padding:"10px 4px",
          display:"flex", alignItems:"center", gap:4, cursor:"pointer", fontFamily:F, color:C.text,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span style={{ fontSize:14, fontWeight:600 }}>Back</span>
        </button>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", maxWidth:380, width:"100%", margin:"0 auto" }}>
        <h1 style={{
          fontSize:28, fontWeight:900, color:C.text, marginBottom:6,
          letterSpacing:-0.8, fontFamily:F
        }}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p style={{ fontSize:14, color:C.sub, marginBottom:28, fontFamily:F }}>
          {mode === "signin" ? "Sign in to sync your progress" : "Save your progress and connect with friends"}
        </p>

        {mode === "signup" && (
          <>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Full name" style={inputStyle} autoComplete="name"/>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
              placeholder="Username" style={inputStyle}
              autoCapitalize="none" autoCorrect="off" autoComplete="username"/>
          </>
        )}
        <input value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" type="email" style={inputStyle}
          autoCapitalize="none" autoCorrect="off" autoComplete="email"/>
        <input value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password" type="password" style={inputStyle}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}/>

        {error && (
          <div style={{ fontSize:13, color:C.red, marginBottom:10, textAlign:"center", lineHeight:1.4 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width:"100%", background:loading ? C.sub : C.text, color:C.bg,
          border:"none", borderRadius:12, padding:"15px",
          fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginTop:6, marginBottom:14,
        }}>
          {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        {/* OAuth divider */}
        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"6px 0 14px" }}>
          <div style={{ flex:1, height:1, background:C.border }}/>
          <div style={{ fontSize:11, color:C.muted, fontWeight:600, letterSpacing:1 }}>OR</div>
          <div style={{ flex:1, height:1, background:C.border }}/>
        </div>

        {/* OAuth buttons */}
        <button onClick={() => sb.signInWithOAuth("apple")} disabled={loading} style={{
          width:"100%", background:"#000", color:"#fff",
          border:"none", borderRadius:12, padding:"14px",
          fontSize:14, fontWeight:600, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginBottom:10,
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </button>
        <button onClick={() => sb.signInWithOAuth("google")} disabled={loading} style={{
          width:"100%", background:"#fff", color:"#1f1f1f",
          border:`1px solid ${C.border}`, borderRadius:12, padding:"14px",
          fontSize:14, fontWeight:600, cursor:loading?"not-allowed":"pointer",
          fontFamily:F, marginBottom:14,
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(""); }} style={{
          width:"100%", background:"none", border:"none", color:C.sub,
          fontSize:13, cursor:"pointer", fontFamily:F, padding:8
        }}>
          {mode === "signin"
            ? <>New to Seshd? <span style={{ color:C.accent, fontWeight:700 }}>Create an account</span></>
            : <>Have an account? <span style={{ color:C.accent, fontWeight:700 }}>Sign in</span></>
          }
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
  const [isGuest, setIsGuest] = useState(() => {
    try { return localStorage.getItem("seshd_guest") === "1"; } catch { return false; }
  });
  const [authPrompt, setAuthPrompt] = useState(null); // { reason: "..." } when guest hits a gated feature

  // ── App data state ──────────────────────────────────────────────
  const [store, setStore] = useState(loadStore);
  const [dbReady, setDbReady] = useState(false);

  // Live tick for time-ago labels — re-renders every 30s so "1m" becomes "2m" etc.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const GUEST_ID = "guest-local";
  const token = session?.access_token || null;
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = session?.access_token || null; }, [session]);
  const currentUserId = session?.user?.id || (isGuest ? GUEST_ID : null);

  // ── All UI state — must be at top level before any returns ──
  const [tab, setTab] = useState("feed");
  const [prevTab, setPrevTab] = useState(null);
  const TABS_ORDER = ["feed", "tracker", "discover", "profile"];
  function switchTab(t) { setPrevTab(tab); setTab(t); }

  // When user taps an Import button on a feed code, switch to tracker and re-dispatch
  useEffect(() => {
    function handleOpenCode(e) {
      const code = e?.detail?.code;
      if (!code) return;
      // If we're not on tracker tab, switch and re-dispatch after mount
      if (tab !== "tracker") {
        switchTab("tracker");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("seshd:open-code-internal", { detail: { code } }));
        }, 100);
      } else {
        window.dispatchEvent(new CustomEvent("seshd:open-code-internal", { detail: { code } }));
      }
    }
    window.addEventListener("seshd:open-code", handleOpenCode);
    return () => window.removeEventListener("seshd:open-code", handleOpenCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
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
      // Check for OAuth callback (Supabase redirects with #access_token=... in URL hash)
      if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
        try {
          const params = new URLSearchParams(window.location.hash.slice(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          const expires_in = params.get("expires_in");
          if (access_token && refresh_token) {
            // Get user info
            const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${access_token}` },
            });
            const user = await userRes.json();
            const sess = { access_token, refresh_token, expires_in: parseInt(expires_in||"3600"), user };
            saveSession(sess);
            setSession(sess);
            // Clear the hash so it doesn't stick
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
            // If user was a guest, migrate their data
            if (localStorage.getItem("seshd_guest") === "1") {
              await migrateGuestData(sess);
            }
            setAuthLoading(false);
            return;
          }
        } catch (e) {
          console.error("OAuth callback error:", e);
        }
      }
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
    if (!token || isGuest) return;
    loadUserData();
  }, [token, currentUserId, isGuest]);

  // Re-fetch when the app comes back to foreground — keeps phone & desktop in sync
  // when user has switched between them or backgrounded the app for a while.
  useEffect(() => {
    if (!token || isGuest) return;
    const lastFetchRef = { current: Date.now() };
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      // Throttle: only re-fetch if it's been at least 30 seconds since last fetch
      const now = Date.now();
      if (now - lastFetchRef.current < 30000) return;
      lastFetchRef.current = now;
      loadUserData();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isGuest, currentUserId]);

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
        id: p.id, name: p.name, days: p.days || [], shareCode: p.share_code || null
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
          duration: w.duration_secs, unit: w.unit, note: w.note,
          // Capture the actual finish timestamp (Supabase auto-populates created_at on insert)
          finishedAt: w.created_at ? new Date(w.created_at).getTime() : new Date(dk).getTime(),
        };
        appWorkoutDates[dk] = true;
      });

      // Clear stale posts immediately so deleted ones don't flash
      setStore(prev => ({ ...prev, posts: [] }));

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
        `posts?select=*,kudos(user_id),comments(id,user_id,text,likes,created_at)&order=created_at.desc&limit=50`,
        {}, tok
      );
      if (!posts) return;

      // Read persisted own-post interactions (these survive page refresh via localStorage)
      const persistedInteractions = store.historyInteractions || {};

      const appPosts = posts.map(p => {
        const persisted = persistedInteractions[p.id];
        const dbKudos = (p.kudos || []).map(k => k.user_id);
        const dbComments = (p.comments || []).map(c => ({
          id: c.id, userId: c.user_id, text: c.text,
          likes: c.likes || [],
          createdAt: new Date(c.created_at).getTime()
        }));
        return {
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
          // Merge persisted kudos (covers both own-post RLS-blocked likes and other-post likes still in flight)
          kudos: persisted ? Array.from(new Set([...dbKudos, ...(persisted.kudos||[])])) : dbKudos,
          comments: persisted ? [...dbComments, ...(persisted.comments||[])] : dbComments,
          createdAt: new Date(p.created_at).getTime(),
        };
      });

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

  // Migrate guest data to a real account on signup
  async function migrateGuestData(authData) {
    const tok = authData.access_token;
    const newUserId = authData.user.id;
    if (!tok || !newUserId) return;
    try {
      // Upload programs
      for (const prog of (store.programs || [])) {
        try {
          await sb.query("programs", {
            method: "POST",
            body: JSON.stringify({
              id: prog.id, user_id: newUserId, name: prog.name,
              days: prog.days, is_active: store.activeProgramId === prog.id,
            })
          }, tok);
        } catch (e) { console.error("migrate program:", e); }
      }
      // Upload PRs
      for (const [exName, weightLbs] of Object.entries(store.prs || {})) {
        try {
          await sb.query("personal_records", {
            method: "POST",
            headers_extra: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify({ user_id: newUserId, exercise_name: exName, weight_lbs: weightLbs })
          }, tok);
        } catch (e) { console.error("migrate PR:", e); }
      }
      // Upload workout history
      for (const [date, daySessions] of Object.entries(store.history || {})) {
        for (const sess of Object.values(daySessions)) {
          try {
            await sb.query("workout_history", {
              method: "POST",
              body: JSON.stringify({
                user_id: newUserId, day_name: sess.dayName,
                exercises: sess.exercises, duration_secs: sess.duration || 0,
                unit: sess.unit || "lbs", note: sess.note || "",
                created_at: new Date(date).toISOString(),
              })
            }, tok);
          } catch (e) { console.error("migrate history:", e); }
        }
      }
      // Clear guest flag and update session
      try { localStorage.removeItem("seshd_guest"); } catch {}
      setIsGuest(false);
      // Remove guest user record from store
      setStore(p => ({
        ...p,
        users: (p.users || []).filter(u => u.id !== GUEST_ID),
      }));
      saveSession(authData);
      setSession(authData);
      toast("Welcome — your progress is saved", "success");
    } catch (e) {
      console.error("guest migration error:", e);
      toast("Account created — some data didn't transfer", "error");
      // Still complete the auth even if migration partially failed
      try { localStorage.removeItem("seshd_guest"); } catch {}
      setIsGuest(false);
      saveSession(authData);
      setSession(authData);
    }
  }

  // Helper: gate a guest action behind signup
  function requireAuth(reason) {
    if (isGuest) { setAuthPrompt({ reason }); return true; }
    return false;
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
    if (requireAuth("Sign up to share your workout with the feed")) return;
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

      const groupIds = postData.groupIds || [];
      const groupOnly = postData.groupOnly === true;

      // Post to each selected group
      if (groupIds.length > 0) {
        for (const gid of groupIds) {
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/group_posts`, {
              method: "POST",
              headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                group_id: gid,
                user_id: currentUserId,
                type: postData.workout ? "workout" : (postData.type || "text"),
                caption: postData.caption || "",
                image_url: imageUrl,
                workout: postData.workout || null,
              })
            });
          } catch (e) { console.error("group post error:", e); }
        }
      }

      // If group-only, skip the feed post
      if (groupOnly) {
        toast(`Shared to ${groupIds.length} group${groupIds.length>1?"s":""}`, "success");
        return;
      }

      const nowIso = new Date().toISOString();
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
        created_at: nowIso,
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
          // Use the timestamp we set on the row (client wall-clock) instead of trusting whatever DB returned
          createdAt: new Date(newPost.created_at || nowIso).getTime(),
        };
        setStore(prev => ({ ...prev, posts: [appPost, ...prev.posts] }));
      }
    } catch (e) { console.error("post error:", e); toast("Couldn't save post", "error"); }
  }

  async function handleKudos(postId) {
    if (requireAuth("Sign up to give kudos and connect with lifters")) return;
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) return;

    // _isHistory posts — store kudos locally in historyInteractions (no DB equivalent yet)
    if (postId.startsWith("hist_")) {
      setStore(prev => {
        const hi = prev.historyInteractions?.[postId] || { kudos: [], comments: [] };
        const hasK = (hi.kudos||[]).includes(currentUserId);
        return {
          ...prev,
          historyInteractions: {
            ...(prev.historyInteractions||{}),
            [postId]: {
              ...hi,
              kudos: hasK ? (hi.kudos||[]).filter(id => id !== currentUserId) : [...(hi.kudos||[]), currentUserId]
            }
          }
        };
      });
      return;
    }

    const post = store.posts.find(p => p.id === postId);
    if (!post) return;
    const hasKudos = (post.kudos||[]).includes(currentUserId);

    // Optimistic update immediately
    setStore(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id !== postId ? p : {
        ...p,
        kudos: hasKudos
          ? (p.kudos||[]).filter(id => id !== currentUserId)
          : [...(p.kudos||[]), currentUserId]
      })
    }));

    try {
      if (hasKudos) {
        await sb.query(`kudos?post_id=eq.${postId}&user_id=eq.${currentUserId}`, { method:"DELETE" }, tok);
      } else {
        await sb.query("kudos", { method:"POST", body: JSON.stringify({ post_id: postId, user_id: currentUserId }) }, tok);
      }
    } catch (e) {
      console.error("kudos save failed:", e);
      toast("Couldn't save like", "error");
      // Revert optimistic update
      setStore(prev => ({
        ...prev,
        posts: prev.posts.map(p => p.id !== postId ? p : {
          ...p,
          kudos: hasKudos
            ? [...(p.kudos||[]), currentUserId]
            : (p.kudos||[]).filter(id => id !== currentUserId)
        })
      }));
    }
  }

  async function handleComment(postId, text) {
    if (requireAuth("Sign up to join the conversation")) return;
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok || !text.trim()) return;

    // _isHistory posts — store comments locally in historyInteractions
    if (postId.startsWith("hist_")) {
      const newComment = { id: uid(), userId: currentUserId, text: text.trim(), createdAt: Date.now() };
      setStore(prev => {
        const hi = prev.historyInteractions?.[postId] || { kudos: [], comments: [] };
        return {
          ...prev,
          historyInteractions: {
            ...(prev.historyInteractions||{}),
            [postId]: { ...hi, comments: [...(hi.comments||[]), newComment] }
          }
        };
      });
      return;
    }

    const post = store.posts.find(p => p.id === postId);
    if (!post) return;

    // Optimistic local comment immediately
    const localComment = { id: "local_" + uid(), userId: currentUserId, text: text.trim(), likes: [], createdAt: Date.now() };
    setStore(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id !== postId ? p : {
        ...p,
        comments: [...(p.comments||[]), localComment]
      })
    }));

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
            comments: p.comments.map(c => c.id === localComment.id ? {
              id: newComment.id, userId: newComment.user_id,
              text: newComment.text, likes: newComment.likes || [],
              createdAt: new Date(newComment.created_at).getTime()
            } : c)
          })
        }));
      }
    } catch (e) {
      console.error("comment save failed:", e);
      toast("Couldn't save comment", "error");
      setStore(prev => ({
        ...prev,
        posts: prev.posts.map(p => p.id !== postId ? p : {
          ...p,
          comments: (p.comments||[]).filter(c => c.id !== localComment.id)
        })
      }));
    }
  }

  async function handleEditComment(postId, commentId, newText) {
    if (!newText || !newText.trim()) return;
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;

    // Optimistic update in posts
    setStore(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id !== postId ? p : {
        ...p,
        comments: (p.comments||[]).map(c => c.id === commentId ? { ...c, text: newText.trim(), editedAt: Date.now() } : c)
      })
    }));

    // Also update historyInteractions if the comment lives there (e.g. local-only or own-post)
    setStore(prev => {
      const hi = prev.historyInteractions?.[postId];
      if (!hi?.comments) return prev;
      const idx = hi.comments.findIndex(c => c.id === commentId);
      if (idx < 0) return prev;
      const updated = { ...hi.comments[idx], text: newText.trim() };
      return {
        ...prev,
        historyInteractions: {
          ...(prev.historyInteractions||{}),
          [postId]: { ...hi, comments: hi.comments.map((c,i) => i === idx ? updated : c) }
        }
      };
    });

    // Skip DB call if it's a local-only comment (own post, RLS-blocked) or _isHistory post
    if (postId.startsWith("hist_") || String(commentId).startsWith("local_")) return;
    if (!tok) return;

    try {
      await sb.query(`comments?id=eq.${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ text: newText.trim() })
      }, tok);
    } catch (e) {
      console.error("comment edit failed:", e);
      toast("Couldn't save edit", "error");
    }
  }

  async function handleLikeComment(postId, commentId) {
    if (requireAuth("Sign up to like comments")) return;
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;

    // Find current state
    const post = store.posts.find(p => p.id === postId);
    if (!post) return;
    const comment = (post.comments||[]).find(c => c.id === commentId);
    if (!comment) return;
    const likes = comment.likes || [];
    const isLiked = likes.includes(currentUserId);
    const newLikes = isLiked
      ? likes.filter(id => id !== currentUserId)
      : [...likes, currentUserId];

    // Optimistic update
    setStore(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id !== postId ? p : {
        ...p,
        comments: (p.comments||[]).map(c => c.id === commentId ? { ...c, likes: newLikes } : c)
      })
    }));

    // Local-only comments or hist_ posts: persist to historyInteractions
    if (postId.startsWith("hist_") || String(commentId).startsWith("local_")) {
      setStore(prev => {
        const hi = prev.historyInteractions?.[postId] || { kudos: [], comments: [] };
        return {
          ...prev,
          historyInteractions: {
            ...(prev.historyInteractions||{}),
            [postId]: {
              ...hi,
              comments: (hi.comments||[]).map(c => c.id === commentId ? { ...c, likes: newLikes } : c)
            }
          }
        };
      });
      return;
    }

    if (!tok) return;
    try {
      await sb.query(`comments?id=eq.${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ likes: newLikes })
      }, tok);
    } catch (e) {
      console.error("comment like failed:", e);
      toast("Couldn't save like", "error");
      // Revert
      setStore(prev => ({
        ...prev,
        posts: prev.posts.map(p => p.id !== postId ? p : {
          ...p,
          comments: (p.comments||[]).map(c => c.id === commentId ? { ...c, likes } : c)
        })
      }));
    }
  }

  async function handleDeleteComment(postId, commentId) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;

    // Optimistic remove from posts
    setStore(prev => ({
      ...prev,
      posts: prev.posts.map(p => p.id !== postId ? p : {
        ...p,
        comments: (p.comments||[]).filter(c => c.id !== commentId)
      })
    }));

    // Remove from historyInteractions too
    setStore(prev => {
      const hi = prev.historyInteractions?.[postId];
      if (!hi?.comments) return prev;
      return {
        ...prev,
        historyInteractions: {
          ...(prev.historyInteractions||{}),
          [postId]: { ...hi, comments: hi.comments.filter(c => c.id !== commentId) }
        }
      };
    });

    if (postId.startsWith("hist_") || String(commentId).startsWith("local_")) return;
    if (!tok) return;

    try {
      await sb.query(`comments?id=eq.${commentId}`, { method: "DELETE" }, tok);
    } catch (e) {
      console.error("comment delete failed:", e);
      toast("Couldn't delete comment", "error");
    }
  }

  async function handleDelete(postId) {
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    // Handle synthetic history posts (id starts with "hist_")
    if (postId.startsWith("hist_")) {
      // Parse: "hist_2026-05-03_Push Day A"
      const withoutPrefix = postId.slice(5); // remove "hist_"
      const dateEnd = withoutPrefix.indexOf("_");
      const date = withoutPrefix.slice(0, dateEnd);
      const dayName = withoutPrefix.slice(dateEnd + 1);
      // Collect session UUIDs (the keys) to delete from DB
      const dayHistory = store.history?.[date] || {};
      const sidsToDelete = Object.keys(dayHistory).filter(sid => dayHistory[sid]?.dayName === dayName);

      // Remove from local state immediately
      setStore(prev => {
        const newDay = { ...(prev.history[date] || {}) };
        sidsToDelete.forEach(sid => delete newDay[sid]);
        const newHistory = { ...prev.history };
        if (Object.keys(newDay).length === 0) delete newHistory[date];
        else newHistory[date] = newDay;
        // Also clear historyInteractions for this synthetic post
        const newHI = { ...(prev.historyInteractions || {}) };
        delete newHI[postId];
        return { ...prev, history: newHistory, historyInteractions: newHI };
      });

      // Delete from Supabase workout_history
      if (tok) {
        for (const sid of sidsToDelete) {
          try {
            await sb.query(`workout_history?id=eq.${sid}`, { method:"DELETE" }, tok);
          } catch (e) { console.error("workout_history delete:", e); }
        }
      }
      return;
    }
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
    const tok = tokenRef.current || session?.access_token || loadSession()?.access_token;
    if (!tok) return;
    try {
      // loadUserData reloads history, PRs, programs, profile, and calls loadFeed internally
      // (so we don't need to call loadFeed again here — that would double-fetch).
      await loadUserData?.();
    } catch (e) { console.error("refresh error:", e); }
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

    // Prevent iOS Safari from auto-zooming on input focus
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement("meta");
      metaViewport.name = "viewport";
      document.head.appendChild(metaViewport);
    }
    metaViewport.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";

    // Inject Inter + JetBrains Mono from Google Fonts
    if (!document.getElementById("seshd-fonts")) {
      const preconnect1 = document.createElement("link");
      preconnect1.rel = "preconnect";
      preconnect1.href = "https://fonts.googleapis.com";
      document.head.appendChild(preconnect1);
      const preconnect2 = document.createElement("link");
      preconnect2.rel = "preconnect";
      preconnect2.href = "https://fonts.gstatic.com";
      preconnect2.crossOrigin = "anonymous";
      document.head.appendChild(preconnect2);
      const fonts = document.createElement("link");
      fonts.id = "seshd-fonts";
      fonts.rel = "stylesheet";
      fonts.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap";
      document.head.appendChild(fonts);
    }

    // Inject global style: ensure all inputs are >=16px to disable iOS zoom-on-focus, plus motion utilities
    const styleId = "seshd-no-zoom";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        body, * { font-feature-settings: "cv02","cv03","cv04","cv11"; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        input, textarea, select { font-size: 16px !important; }
        input[type=number] { -moz-appearance: textfield; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        @keyframes seshd-press { 0%{transform:scale(1)} 50%{transform:scale(0.96)} 100%{transform:scale(1)} }
        @keyframes seshd-fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes seshd-count-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes seshd-pulse-soft { 0%,100%{opacity:1} 50%{opacity:0.55} }
        @keyframes seshd-slide-up { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes seshd-scale-in { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        @keyframes seshd-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes seshd-fresh-pulse { 0%,100%{opacity:0.5;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.15)} }

        button { -webkit-tap-highlight-color: transparent; transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s; }
        button:active:not(:disabled) { transform: scale(0.96); }
        .seshd-enter { animation: seshd-fade-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .seshd-scale-enter { animation: seshd-scale-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .seshd-count { animation: seshd-count-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; font-variant-numeric: tabular-nums; }
        .seshd-slide-up { animation: seshd-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .seshd-pulse { animation: seshd-pulse-soft 2s ease-in-out infinite; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // C needs to be available for loading screens
  const C = THEMES[(store.theme || "light")];
  const unit = store.unit || "lbs";

  // HOOKS — must be before any early returns (React rules of hooks)
  // Stores the timestamp of the last time the user "checked" their notifications.
  // Activity newer than this counts as "unread" and surfaces a red dot.
  // The notifications themselves are not deleted — only the unread badge clears.
  const [lastSeenActivity, setLastSeenActivity] = useState(() => {
    try { return parseInt(localStorage.getItem("seshd_last_activity") || "0"); }
    catch { return 0; }
  });
  function markActivitySeen() {
    const now = Date.now();
    setLastSeenActivity(now);
    try { localStorage.setItem("seshd_last_activity", String(now)); } catch {}
  }
  // Clear the unread badge whenever the activity tab becomes active
  useEffect(() => {
    if (tab === "activity") markActivitySeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Show loading screen ───────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ height:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, flexDirection:"column", gap:16 }}>
        <SeshdLogo C={C} big/>
        <div style={{ fontSize:13, color:C.sub }}>Loading...</div>
      </div>
    );
  }

  // ── Show auth screen if not logged in AND not a guest ─────────
  if (!session && !isGuest) {
    return <AuthScreen
      onAuth={handleAuth}
      onGuest={() => {
        try { localStorage.setItem("seshd_guest", "1"); } catch {}
        // Seed a local guest user record so the app shell works
        setStore(p => {
          const hasGuest = (p.users||[]).some(u => u.id === GUEST_ID);
          return hasGuest ? p : {
            ...p,
            users: [...(p.users||[]), { id: GUEST_ID, username: "guest", name: "Guest", bio: "", avatar: "💪", followers: [], following: [] }]
          };
        });
        setIsGuest(true);
        setDbReady(true); // skip DB load for guests
        setTab("tracker"); // drop them right into tracker
      }}
      C={C}
    />;
  }

  // Guest → upgrade prompt overlay
  if (isGuest && authPrompt) {
    return <AuthScreen
      onAuth={async (data) => {
        // Migrate guest data to new account
        await migrateGuestData(data);
        setAuthPrompt(null);
      }}
      onGuest={() => setAuthPrompt(null)}
      C={C}
      initialMode="signup"
      promptReason={authPrompt.reason}
    />;
  }

  if (!dbReady && !isGuest) {
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
  const weeklyStreak = calcWeeklyStreak(store.workoutDates || {}, store.weeklyTarget || 3);
  const streak = weeklyStreak.count;
  // Build synthetic feed items from own workout history (not shared)
  const sharedWorkoutIds = new Set((store.posts||[]).filter(p=>p.type==="workout"&&p.userId===currentUserId).map(p=>p.workout?.name+p.createdAt));
  const historyFeedItems = Object.entries(store.history||{}).flatMap(([date, sessions]) =>
    Object.entries(sessions).map(([sid, sess]) => {
      const key = sess.dayName + new Date(date).getTime();
      if (sharedWorkoutIds.has(key)) return null;
      // Skip sessions with zero done sets — these are ghost workouts
      const doneSets = (sess.exercises||[]).flatMap(ex => (ex.sets||[]).filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)));
      if (doneSets.length === 0) return null;
      const vol = (sess.exercises||[]).reduce((a,ex)=>a+(ex.sets||[]).filter(s=>s.done===true||(s.done===undefined&&parseFloat(s.reps)>0)).reduce((b,s)=>b+(parseFloat(s.weight)||0)*(parseFloat(s.reps)||0),0),0);
      const histId = "hist_"+date+"_"+sess.dayName;
      const hi = store.historyInteractions?.[histId] || {};
      return {
        id: histId,
        sessionId: sid, // for deletion
        userId: currentUserId,
        type: "workout",
        caption: "",
        unit: sess.unit || unit,
        workout: {
          name: sess.dayName,
          duration: sess.duration||0,
          volume: Math.round(vol),
          exercises: (sess.exercises||[])
            .filter(e => e.name && (e.sets||[]).some(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0)))
            .map(ex => {
              const doneOnly = (ex.sets||[]).filter(s => s.done === true || (s.done === undefined && parseFloat(s.reps) > 0));
              const maxW = Math.max(0, ...doneOnly.map(s => parseFloat(s.weight) || 0));
              const sessUnit = sess.unit || "lbs";
              const maxLbs = sessUnit === "lbs" ? maxW : cvt(maxW, "kg", "lbs");
              return {
                name: ex.name,
                isPR: maxLbs > 0 && maxLbs >= ((store.prs||{})[ex.name] || 0) * 0.99,
                sets: doneOnly.map(s => ({ w: parseFloat(s.weight)||0, r: parseFloat(s.reps)||0 })),
              };
            })
        },
        kudos: hi.kudos || [],
        comments: hi.comments || [],
        // Use the actual finish timestamp if available, else fall back to midnight of the workout date
        createdAt: sess.finishedAt || new Date(date).getTime(),
        _isHistory: true,
        _date: date,
      };
    }).filter(Boolean)
  );

  const feedPosts = [...(store.posts || []).filter(p => (p.userId === currentUserId || following.includes(p.userId)) && p.type !== "story"), ...historyFeedItems.filter(i => !((store.posts||[]).some(p=>p.type==="workout"&&p.userId===currentUserId&&p.workout?.name===i.workout?.name&&Math.abs(p.createdAt-i.createdAt)<86400000)))]
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
    if (requireAuth("Sign up to follow friends and see their workouts")) return;
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

  const notifCount = (store.posts || [])
    .filter(p => p.userId === currentUserId)
    .reduce((a, pt) => {
      const newKudos = (pt.kudos||[]).filter(x => x !== currentUserId && pt.createdAt > lastSeenActivity).length;
      const newComments = (pt.comments||[]).filter(c => c.userId !== currentUserId && c.createdAt > lastSeenActivity).length;
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
          onToggleTheme={async (t) => {
            setStore(p => ({ ...p, theme: t }));
            const tok = tokenRef.current || loadSession()?.access_token;
            if (tok) {
              try { await sb.query(`profiles?id=eq.${currentUserId}`, { method:"PATCH", body: JSON.stringify({ theme: t }) }, tok); }
              catch (e) { console.error("theme save error:", e); }
            }
          }}
          onUserClick={setProfileUserId}
          onFollow={handleFollow}
          token={token}
        />
      </div>
    );
  }

  return (
    <div
      onTouchStart={(e) => {
        if (showNewPost || editingPost || prModal || showWrapped || storyIndex !== null) return;
        // Skip tab swipe if the touch started on an interactive element that has its own swipe behavior
        // (e.g. SetRow, story carousel, horizontal scroller)
        const target = e.target;
        if (target && target.closest && target.closest("[data-no-tab-swipe]")) return;
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
      {/* Global iOS-safe styles — prevent accidental text selection, callout menus, and tap highlights */}
      <style>{`
        button, [role="button"], .seshd-tappable {
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          touch-action: manipulation;
        }
        /* Inputs and editable text should still allow selection */
        input, textarea, [contenteditable="true"] {
          -webkit-user-select: text;
          user-select: text;
          -webkit-touch-callout: default;
        }
        /* Avoid double-tap zoom on iOS */
        body, html { touch-action: manipulation; }
        /* Disable native long-press text selection on commonly-tapped content */
        [data-tap-only] {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
        }
      `}</style>
      {showWrapped && <WrappedModal store={store} C={C} onClose={() => setShowWrapped(false)}/>}
      <ToastHost/>

      {/* GUEST BANNER */}
      {isGuest && (
        <div style={{
          background:C.text, color:C.bg,
          padding:"max(env(safe-area-inset-top), 8px) 16px 8px",
          display:"flex", alignItems:"center", gap:10, flexShrink:0
        }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
            <div style={{ fontSize:12, fontWeight:700, lineHeight:1.2 }}>Guest mode</div>
            <div style={{ fontSize:10, opacity:0.7, lineHeight:1.3, marginTop:1 }}>Data saved on this device only</div>
          </div>
          <button onClick={() => setAuthPrompt({ reason: "Create an account to save your progress to the cloud, sync across devices, and back up your data forever." })} style={{
            background:C.bg, color:C.text, border:"none",
            borderRadius:8, padding:"6px 12px", fontSize:11, fontWeight:700,
            cursor:"pointer", fontFamily:F, flexShrink:0,
          }}>
            Save progress
          </button>
        </div>
      )}

      {/* TOP BAR — Instagram thin, minimal, SVG icons */}
      <div style={{
        background:C.tabBg, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
        borderBottom:`1px solid ${C.divider}`,
        padding: isGuest ? "10px calc(env(safe-area-inset-right) + 14px) 10px calc(env(safe-area-inset-left) + 14px)" : "calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 14px) 10px calc(env(safe-area-inset-left) + 14px)",
        display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0
      }}>
        <SeshdLogo C={C}/>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {(streak > 0 || weeklyStreak.thisWeek > 0) && <div style={{ marginRight:4 }}><StreakBadge streak={streak} status={weeklyStreak.status} thisWeek={weeklyStreak.thisWeek} target={weeklyStreak.target} size="sm"/></div>}
          {tab === "feed" && (
            <button
              onClick={() => {
                if (requireAuth("Sign up to post photos and share your workouts")) return;
                setNewPostKind("photo"); setShowNewPost(true);
              }}
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
            onClick={() => { markActivitySeen(); setTab("activity"); }}
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
              const scrollTop = pullScrollRef.current?.scrollTop || 0;
              if (scrollTop <= 5) {
                touchStartY.current = e.touches[0].clientY;
              } else {
                touchStartY.current = 0;
              }
            }}
            onTouchMove={(e) => {
              if (touchStartY.current === 0 || isRefreshing) return;
              const dist = e.touches[0].clientY - touchStartY.current;
              const scrollTop = pullScrollRef.current?.scrollTop || 0;
              if (dist > 0 && scrollTop <= 5) {
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
              pointerEvents:"none", overflow:"hidden"
            }}>
              {pullDist > 20 && (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <div style={{
                    width:28, height:28, borderRadius:"50%",
                    border:`2.5px solid ${C.divider}`,
                    borderTopColor: C.accent,
                    animation: isRefreshing ? "spotrSpin 0.7s linear infinite" : "none",
                    transform: isRefreshing ? undefined : `rotate(${Math.min(pullDist * 4, 360)}deg)`
                  }}/>
                  {!isRefreshing && pullDist > 55 && (
                    <div style={{ fontSize:10, color:C.accent, fontWeight:600 }}>Release to refresh</div>
                  )}
                </div>
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
                      if (requireAuth("Sign up to share stories with friends")) return;
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

              <div style={{ paddingTop:4 }}>
                {feedPosts.length === 0 && !isRefreshing && (
                  isGuest ? (
                    <div style={{ textAlign:"center", padding:"60px 24px", color:C.sub }}>
                      <div style={{
                        width:80, height:80, borderRadius:24,
                        background:`linear-gradient(135deg,${C.accent}26,${C.accent}0d)`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        margin:"0 auto 18px",
                      }}>
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </div>
                      <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:6, letterSpacing:-0.3 }}>Friends only feed</div>
                      <div style={{ fontSize:14, lineHeight:1.5, marginBottom:24, maxWidth:280, margin:"0 auto 24px" }}>
                        Sign up to follow friends and see their workouts here. No strangers, no faking.
                      </div>
                      <button onClick={() => setAuthPrompt({ reason: "Sign up to follow friends and unlock your feed" })} style={{
                        background:C.text, color:C.bg, border:"none", borderRadius:12,
                        padding:"13px 28px", fontSize:14, fontWeight:700,
                        cursor:"pointer", fontFamily:F, letterSpacing:-0.2,
                      }}>Create account</button>
                    </div>
                  ) : (
                    <div style={{ textAlign:"center", padding:"60px 20px", color:C.sub }}>
                      <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><Icon name="flame" size={42} color="currentColor"/></div>
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
                  )
                )}
                {feedPosts.length === 0 && isRefreshing && (
                  // Skeleton loader
                  <div style={{ padding:"0 14px" }}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{ marginBottom:16, borderBottom:`1px solid ${C.divider}`, paddingBottom:16 }}>
                        <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12 }}>
                          <div style={{ width:40, height:40, borderRadius:"50%", background:C.divider, animation:"shimmer 1.2s ease-in-out infinite alternate" }}/>
                          <div>
                            <div style={{ width:100, height:12, borderRadius:6, background:C.divider, marginBottom:6 }}/>
                            <div style={{ width:60, height:10, borderRadius:6, background:C.divider }}/>
                          </div>
                        </div>
                        <div style={{ width:"100%", height:180, borderRadius:12, background:C.divider, marginBottom:10 }}/>
                        <div style={{ width:"70%", height:10, borderRadius:6, background:C.divider }}/>
                      </div>
                    ))}
                    <style>{`@keyframes shimmer{from{opacity:0.5}to{opacity:1}}`}</style>
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
                      onEditComment={handleEditComment}
                      onDeleteComment={handleDeleteComment}
                      onLikeComment={handleLikeComment}
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
          <WorkoutTracker store={store} setStore={setStore} onShareWorkout={handleNewPost} onSaveWorkout={handleSaveWorkout} onSaveProgram={handleSaveProgram} onProgramEdited={handleProgramEdited} onPRHit={setPrModal} onRefresh={handleRefresh} C={C} currentUserId={currentUserId} token={token}
            onDeleteHistory={async (date, sid) => {
              setStore(prev => {
                const dayHistory = { ...(prev.history[date] || {}) };
                delete dayHistory[sid];
                const newHistory = { ...prev.history };
                if (Object.keys(dayHistory).length === 0) delete newHistory[date];
                else newHistory[date] = dayHistory;
                return { ...prev, history: newHistory };
              });
              try {
                const tok = tokenRef.current || loadSession()?.access_token;
                if (tok) await sb.query(`workout_history?id=eq.${sid}`, { method:"DELETE" }, tok);
              } catch(e) { console.error("history delete:", e); }
            }}
          />
        )}

        {tab === "activity" && (() => {
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
              <div style={{ padding:"12px 14px 10px", borderBottom:`1px solid ${C.divider}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Activity</div>
                <button onClick={() => { handleRefresh(); }} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px 8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
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
            onToggleTheme={async (t) => {
              setStore(p => ({ ...p, theme: t }));
              const tok = tokenRef.current || loadSession()?.access_token;
              if (tok) {
                try { await sb.query(`profiles?id=eq.${currentUserId}`, { method:"PATCH", body: JSON.stringify({ theme: t }) }, tok); }
                catch (e) { console.error("theme save error:", e); }
              }
            }}
            onUserClick={setProfileUserId}
            email={session?.user?.email || ""}
            onSignOut={handleSignOut}
            onFollow={handleFollow}
            token={token}
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

      {showNewPost && <NewPostModal C={C} onClose={() => setShowNewPost(false)} onPost={handleNewPost} initialKind={newPostKind}
        recentWorkouts={Object.entries(store.history||{}).sort(([a],[b])=>b.localeCompare(a)).flatMap(([date,sessions])=>Object.values(sessions).map(s=>({...s,_date:date}))).filter(sess=>{
          const hasDone=(sess.exercises||[]).some(ex=>(ex.sets||[]).some(s=>s.done===true||(s.done!==false&&(parseFloat(s.reps)>0||parseFloat(s.r)>0))));
          return hasDone;
        }).slice(0,10)}
      />}
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

