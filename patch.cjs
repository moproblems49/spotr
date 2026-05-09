const fs = require('fs');
const path = require('path');

const FILE = path.join('src', 'App.jsx');
if (!fs.existsSync(FILE)) { console.error('Run from C:\\Users\\mohag\\spotr'); process.exit(1); }

let c = fs.readFileSync(FILE, 'utf8');
const orig = c.length;
let n = 0;

const patches = [
  {
    "type": "replace",
    "from": "[[\"today\",\"Today\"],[\"programs\",\"Programs\"],[\"exercises\",\"Exercises\"],[\"history\",\"History\"]]",
    "to": "[[\"workout\",\"Workout\"],[\"exercises\",\"Exercises\"],[\"history\",\"History\"]]",
    "all": true
  },
  {
    "type": "replace",
    "from": "useState(\"today\")",
    "to": "useState(\"workout\")",
    "all": true
  },
  {
    "type": "replace",
    "from": "subTab === \"today\"",
    "to": "subTab === \"workout\"",
    "all": true
  },
  {
    "type": "replace",
    "from": "subTab === \"programs\"",
    "to": "subTab === \"workout\"",
    "all": true
  },
  {
    "type": "replace",
    "from": "setSubTab(\"programs\")",
    "to": "setSubTab(\"workout\")",
    "all": true
  },
  {
    "type": "replace",
    "from": "const [showBuilder, setShowBuilder] = useState(false);",
    "to": "const [showBuilder, setShowBuilder] = useState(false);\n  const [initialDayIdx, setInitialDayIdx] = useState(0);",
    "all": false
  },
  {
    "type": "regex",
    "pattern": "setSubTab\\(\"workout\"\\);\\s*setViewingProgram\\(prog\\.id\\);",
    "to": "setViewingProgram(prog.id); setInitialDayIdx(di);"
  },
  {
    "type": "replace",
    "from": "onBack={() => setViewingProgram(null)}",
    "to": "onBack={() => { setViewingProgram(null); setInitialDayIdx(0); }}\n            initialDayIdx={initialDayIdx}",
    "all": false
  },
  {
    "type": "replace",
    "from": "function ProgramDetailView({ prog, store, unit, C, F, MONO, onBack, onSaveProgram, onSaveStore, startWorkout, onProgramEdited })",
    "to": "function ProgramDetailView({ prog, store, unit, C, F, MONO, onBack, onSaveProgram, onSaveStore, startWorkout, onProgramEdited, initialDayIdx = 0 })",
    "all": false
  },
  {
    "type": "replace",
    "from": "const [expandedDay, setExpandedDay] = useState(0)",
    "to": "const [expandedDay, setExpandedDay] = useState(initialDayIdx)",
    "all": false
  },
  {
    "type": "replace",
    "from": "fontSize:28, fontWeight:800, color:C.accent, fontFamily:MONO, lineHeight:1.1",
    "to": "fontSize:22, fontWeight:800, color:C.accent, fontFamily:MONO, lineHeight:1.2",
    "all": false
  },
  {
    "type": "replace",
    "from": "fontSize:13, fontWeight:700, color:C.text }}>{session.dayName}",
    "to": "fontSize:11, fontWeight:600, color:C.sub, letterSpacing:0.3 }}>{session.dayName}",
    "all": false
  },
  {
    "type": "replace",
    "from": "{rest && (\n          <div style={{ \n            background:C.surface, \n            borderBottom:`1px solid ${C.divider}`, \n            padding: \"12px 16px\",\n            margin: \"0 14px\",\n            borderRadius: 12,\n            marginBottom: 8\n          }}>\n            <div style={{ \n              display:\"flex\", \n              alignItems:\"center\", \n              gap: 12,\n              justifyContent: \"space-between\"\n            }}>\n              <div style={{ flex: 1 }}>\n                <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>Rest Timer</div>\n                <div style={{ display:\"flex\", gap:6, flexWrap: \"wrap\" }}>\n                  {[30, 60, 90, 120, 180, 240].map(s => (\n                    <button \n                      key={s} \n                      onClick={() => setRest({secs:s, total:s, running:true, startedAt:Date.now()})}\n                      style={{\n                        padding:\"6px 12px\",\n                        background: rest.total === s ? C.accent : \"transparent\",\n                        border: `1px solid ${rest.total === s ? C.accent : C.border}`,\n                        color: rest.total === s ? \"#fff\" : C.text,\n                        borderRadius: 8, \n                        cursor: \"pointer\", \n                        fontSize: 13, \n                        fontWeight: 600,\n                        fontFamily: MONO\n                      }}\n                    >\n                      {s >= 60 ? `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : `${s}s`}\n                    </button>\n                  ))}\n                </div>\n              </div>\n              \n              <div style={{ textAlign: \"center\" }}>\n                <div style={{ \n                  fontSize: 28, \n                  fontWeight: 800, \n                  color: rest.secs <= 10 ? C.red : C.accent, \n                  fontFamily: MONO,\n                  marginBottom: 4\n                }}>\n                  {fmtTime(rest.secs)}\n                </div>\n                <button \n                  onClick={() => { clearInterval(rtRef.current); setRest(null); }}\n                  style={{ \n                    background: \"none\", \n                    border: \"none\", \n                    color: C.sub, \n                    fontSize: 14, \n                    cursor: \"pointer\",\n                    padding: \"4px\"\n                  }}\n                >\n                  \u2715 Cancel\n                </button>\n              </div>\n            </div>\n          </div>\n        )}",
    "to": "{rest && (\n          <div style={{ background:C.surface, borderBottom:`1px solid ${C.divider}` }}>\n            <div style={{ height:2, background:C.divider }}>\n              <div style={{ height:\"100%\", background:rest.secs<=10?\"#ef4444\":C.accent, width:`${(rest.secs/(rest.total||120))*100}%`, transition:\"width 1s linear\" }}/>\n            </div>\n            <div style={{ display:\"flex\", alignItems:\"center\", padding:\"8px 14px\", gap:8 }}>\n              <div style={{ display:\"flex\", gap:4, flex:1 }}>\n                {[30,60,90,120,180,240].map(s => (\n                  <button key={s} onClick={() => setRest({secs:s,total:s,running:true,startedAt:Date.now()})} style={{\n                    fontSize:11, padding:\"4px 8px\", flexShrink:0,\n                    background: rest.total===s ? C.accent : C.divider, border:\"none\", borderRadius:20,\n                    color: rest.total===s ? \"#fff\" : C.sub, cursor:\"pointer\", fontFamily:MONO, fontWeight:600\n                  }}>{s>=60?`${s/60}m`:`${s}s`}</button>\n                ))}\n              </div>\n              <input type=\"number\" inputMode=\"numeric\" placeholder=\"\u2014\"\n                onBlur={e=>{const v=parseInt(e.target.value);if(v>0){setRest({secs:v,total:v,running:true,startedAt:Date.now()});e.target.value=\"\";}}}\n                onKeyDown={e=>{if(e.key===\"Enter\"){const v=parseInt(e.target.value);if(v>0){setRest({secs:v,total:v,running:true,startedAt:Date.now()});e.target.value=\"\";}e.target.blur();}}}\n                style={{ width:40, background:C.divider, border:\"none\", borderRadius:8, padding:\"4px 6px\", fontSize:13, color:C.text, outline:\"none\", fontFamily:MONO, textAlign:\"center\", flexShrink:0 }}\n              />\n              <div style={{ fontSize:24, fontWeight:800, color:rest.secs<=10?\"#ef4444\":C.text, fontFamily:MONO, flexShrink:0, minWidth:54, textAlign:\"right\" }}>{fmtTime(rest.secs)}</div>\n              <button onClick={() => { clearInterval(rtRef.current); setRest(null); }} style={{ color:C.muted, background:\"none\", border:\"none\", cursor:\"pointer\", fontSize:18, padding:0, flexShrink:0 }}>\u2715</button>\n            </div>\n          </div>\n        )}",
    "all": false
  }
];

for (const p of patches) {
  if (p.type === 'replace') {
    if (c.includes(p.from)) {
      c = p.all ? c.split(p.from).join(p.to) : c.replace(p.from, p.to);
      n++;
    }
  } else if (p.type === 'regex') {
    const re = new RegExp(p.pattern, 'g');
    const before = c;
    c = c.replace(re, p.to);
    if (c !== before) n++;
  }
}

fs.writeFileSync(FILE, c, 'utf8');
console.log('Applied ' + n + ' patches. ' + orig + ' → ' + c.length + ' bytes');
console.log(c.includes('setInitialDayIdx(di)') ? '✅ Edit button fixed' : '❌ Edit button NOT fixed');
console.log(c.includes('subTab === \"workout\" && showBuilder') ? '✅ Build Your Own fixed' : '❌ Build Your Own NOT fixed');
console.log('\nNow run: git add . && git commit -m \"Fix edit button, Build Your Own, rest timer\" && git push');
