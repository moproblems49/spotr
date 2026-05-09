// Run from C:\Users\mohag\spotr: node fix2.cjs
const fs = require('fs');

// 1. Fix App.jsx
let c = fs.readFileSync('src/App.jsx', 'utf8');
const orig = c.length;

c = c.split('[["today","Today"],["programs","Programs"],["exercises","Exercises"],["history","History"]]')
     .join('[["workout","Workout"],["exercises","Exercises"],["history","History"]]');
c = c.split('useState("today")').join('useState("workout")');
c = c.split('subTab === "today"').join('subTab === "workout"');
c = c.split('subTab === "programs"').join('subTab === "workout"');
c = c.split('setSubTab("programs")').join('setSubTab("workout")');

if (!c.includes('const [initialDayIdx')) {
  c = c.replace(
    'const [showBuilder, setShowBuilder] = useState(false);',
    'const [showBuilder, setShowBuilder] = useState(false);\n  const [initialDayIdx, setInitialDayIdx] = useState(0);'
  );
}

c = c.replace(/setSubTab\("workout"\);\s*setViewingProgram\(prog\.id\);/g,
  'setViewingProgram(prog.id); setInitialDayIdx(di);');

if (!c.includes('initialDayIdx={initialDayIdx}')) {
  c = c.replace(
    'onBack={() => setViewingProgram(null)}',
    'onBack={() => { setViewingProgram(null); setInitialDayIdx(0); }}\n            initialDayIdx={initialDayIdx}'
  );
}

c = c.replace(
  'function ProgramDetailView({ prog, store, unit, C, F, MONO, onBack, onSaveProgram, onSaveStore, startWorkout, onProgramEdited })',
  'function ProgramDetailView({ prog, store, unit, C, F, MONO, onBack, onSaveProgram, onSaveStore, startWorkout, onProgramEdited, initialDayIdx = 0 })'
);

['const [expandedDay, setExpandedDay] = useState(0)',
 'const [activeDay, setActiveDay] = useState(0)'].forEach(p => {
  if (c.includes(p)) c = c.replace(p, p.replace('useState(0)', 'useState(initialDayIdx)'));
});

fs.writeFileSync('src/App.jsx', c, 'utf8');
console.log('App.jsx: ' + orig + ' -> ' + c.length);
console.log('Edit: ' + c.includes('setInitialDayIdx(di)'));
console.log('Build: ' + c.includes('showBuilder'));
console.log('Tabs: ' + c.includes('"workout","Workout"'));

// 2. Update vite.config.js to bust PWA cache
const vite = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'Seshd',
        short_name: 'Seshd',
        theme_color: '#7c3aed',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
})
`;

fs.writeFileSync('vite.config.js', vite, 'utf8');
console.log('vite.config.js updated - PWA cache bust enabled');
console.log('\nNow run:');
console.log('git add .');
console.log('git commit -m "Fix tabs, edit button, bust PWA cache"');
console.log('git push');
