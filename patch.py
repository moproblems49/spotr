#!/usr/bin/env python3
"""
Seshd patch script - run from C:\Users\mohag\spotr
python patch.py
"""
import re, sys, subprocess
from pathlib import Path

FILE = Path("src/App.jsx")
if not FILE.exists():
    print("ERROR: src/App.jsx not found. Run from C:\\Users\\mohag\\spotr")
    sys.exit(1)

content = FILE.read_text(encoding="utf-8", errors="replace")
original = content
print(f"File loaded: {len(content):,} chars")
changes = []

# ── 1. Edit button fix ────────────────────────────────────────────────────────
if "setInitialDayIdx(di)" not in content:
    # Add state
    if "const [initialDayIdx" not in content:
        content = content.replace(
            "const [showBuilder, setShowBuilder] = useState(false);",
            "const [showBuilder, setShowBuilder] = useState(false);\n  const [initialDayIdx, setInitialDayIdx] = useState(0);",
            1
        )
        changes.append("Added initialDayIdx state")
    
    # Fix edit button - try all variations
    for old, new in [
        ('setSubTab("workout"); setViewingProgram(prog.id);', 'setViewingProgram(prog.id); setInitialDayIdx(di);'),
        ('setSubTab("programs"); setViewingProgram(prog.id);', 'setViewingProgram(prog.id); setInitialDayIdx(di);'),
        ('setSubTab("workout");\n                      setViewingProgram(prog.id);', 'setViewingProgram(prog.id); setInitialDayIdx(di);'),
    ]:
        if old in content:
            content = content.replace(old, new)
            changes.append(f"Fixed edit button")
            break
    
    # Pass to PDV
    if "initialDayIdx={initialDayIdx}" not in content:
        content = content.replace(
            "onBack={() => setViewingProgram(null)}",
            "onBack={() => { setViewingProgram(null); setInitialDayIdx(0); }}\n            initialDayIdx={initialDayIdx}",
            1
        )
        changes.append("Passed initialDayIdx to ProgramDetailView")
    
    # PDV signature
    content = re.sub(
        r'function ProgramDetailView\(\{([^}]+)\}\)',
        lambda m: f"function ProgramDetailView({{{m.group(1).rstrip()}, initialDayIdx = 0 }})" if "initialDayIdx" not in m.group(1) else m.group(0),
        content, count=1
    )
    
    # PDV state - use initialDayIdx
    for pat in ['const [expandedDay, setExpandedDay] = useState(0)', 'const [activeDay, setActiveDay] = useState(0)']:
        content = content.replace(pat, pat.replace("useState(0)", "useState(initialDayIdx)"))
    
    changes.append("ProgramDetailView opens to correct day")
else:
    changes.append("Edit button already fixed ✓")

# ── 2. Merge tabs ─────────────────────────────────────────────────────────────
if '"Today","Today"' in content or '"today","Today"' in content:
    content = content.replace(
        '[["today","Today"],["programs","Programs"],["exercises","Exercises"],["history","History"]]',
        '[["workout","Workout"],["exercises","Exercises"],["history","History"]]'
    )
    content = content.replace('useState("today")', 'useState("workout")')
    content = content.replace('subTab === "today"', 'subTab === "workout"')
    content = content.replace('setSubTab("programs")', 'setSubTab("workout")')
    content = content.replace('subTab === "programs"', 'subTab === "workout"')
    changes.append("Merged Today+Programs into Workout tab")
else:
    changes.append("Tabs already merged ✓")

# ── 3. Rest timer redesign ────────────────────────────────────────────────────
if "Rest Timer" in content and "Rest timer \u2014 Strong" not in content:
    # Find and replace the rest timer block
    start = content.find("{rest && (")
    if start > -1:
        # Find matching closing )}
        depth = 0
        end = start
        for i in range(start, len(content)):
            if content[i] == "(": depth += 1
            elif content[i] == ")": 
                depth -= 1
                if depth == 0:
                    end = i + 1
                    # Check if followed by }
                    if content[end:end+1] == "}":
                        end += 1
                    break
        
        new_rest = """{rest && (
          <div style={{ background:C.surface, borderBottom:`1px solid ${C.divider}` }}>
            <div style={{ height:2, background:C.divider }}>
              <div style={{ height:"100%", background:rest.secs<=10?"#ef4444":C.accent, width:`${(rest.secs/(rest.total||120))*100}%`, transition:"width 1s linear" }}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", padding:"8px 14px", gap:8 }}>
              <div style={{ display:"flex", gap:4, flex:1 }}>
                {[30,60,90,120,180,240].map(s => (
                  <button key={s} onClick={() => setRest({secs:s,total:s,running:true,startedAt:Date.now()})} style={{
                    fontSize:11, padding:"4px 8px", flexShrink:0,
                    background: rest.total===s ? C.accent : C.divider,
                    border:"none", borderRadius:20,
                    color: rest.total===s ? "#fff" : C.sub,
                    cursor:"pointer", fontFamily:MONO, fontWeight:600
                  }}>{s>=60?`${s/60}m`:`${s}s`}</button>
                ))}
              </div>
              <input type="number" inputMode="numeric" placeholder="—"
                onBlur={e=>{const v=parseInt(e.target.value);if(v>0){setRest({secs:v,total:v,running:true,startedAt:Date.now()});e.target.value="";}}}
                onKeyDown={e=>{if(e.key==="Enter"){const v=parseInt(e.target.value);if(v>0){setRest({secs:v,total:v,running:true,startedAt:Date.now()});e.target.value="";}e.target.blur();}}}
                style={{ width:40, background:C.divider, border:"none", borderRadius:8, padding:"4px 6px", fontSize:13, color:C.text, outline:"none", fontFamily:MONO, textAlign:"center", flexShrink:0 }}
              />
              <div style={{ fontSize:24, fontWeight:800, color:rest.secs<=10?"#ef4444":C.text, fontFamily:MONO, flexShrink:0, minWidth:54, textAlign:"right" }}>{fmtTime(rest.secs)}</div>
              <button onClick={() => { clearInterval(rtRef.current); setRest(null); }} style={{ color:C.muted, background:"none", border:"none", cursor:"pointer", fontSize:18, padding:0, flexShrink:0 }}>✕</button>
            </div>
          </div>
        )}"""
        content = content[:start] + new_rest + content[end:]
        changes.append("Rest timer redesigned")
else:
    changes.append("Rest timer already updated ✓" if "Rest timer" in content else "Rest timer not found")

# ── 4. Workout header smaller text ───────────────────────────────────────────
content = content.replace(
    'fontSize:28, fontWeight:800, color:C.accent, fontFamily:MONO, lineHeight:1.1',
    'fontSize:22, fontWeight:800, color:C.accent, fontFamily:MONO, lineHeight:1.2'
)
content = content.replace(
    'fontSize:13, fontWeight:700, color:C.text }}>{session.dayName}',
    'fontSize:11, fontWeight:600, color:C.sub, letterSpacing:0.3 }}>{session.dayName}'
)

# ── Report ────────────────────────────────────────────────────────────────────
print("\nChanges applied:")
for c in changes:
    print(f"  {'✅' if '✓' not in c else '⚪'} {c}")

if content == original:
    print("\n⚠️  No changes made - file may already be up to date")
else:
    FILE.write_text(content, encoding="utf-8")
    print(f"\nSaved: {len(content):,} chars (was {len(original):,})")
    print("\nNow run:")
    print('  git add .')
    print('  git commit -m "Apply patches"')
    print('  git push')
