// Run from C:\Users\mohag\spotr: node killcache.cjs
const fs = require('fs');
const path = require('path');

// 1. Kill service worker - add unregister code to main.jsx
let main = fs.readFileSync('src/main.jsx', 'utf8');
if (!main.includes('unregister')) {
  main = `// Kill old service worker caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

` + main;
  fs.writeFileSync('src/main.jsx', main, 'utf8');
  console.log('✅ Service worker killer added to main.jsx');
}

// 2. Add cache-busting version to App.jsx
let app = fs.readFileSync('src/App.jsx', 'utf8');
const version = `// v${Date.now()}\n`;
if (!app.startsWith('// v')) {
  app = version + app;
} else {
  app = version + app.slice(app.indexOf('\n') + 1);
}
fs.writeFileSync('src/App.jsx', app, 'utf8');
console.log('✅ Version timestamp updated: ' + version.trim());

// 3. Create a simple sw that never caches
const swContent = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => e.respondWith(fetch(e.request.clone()).catch(() => caches.match(e.request))));
`;
fs.writeFileSync('public/sw.js', swContent, 'utf8');
console.log('✅ Cache-busting service worker written');

console.log('\nNow run:');
console.log('git add .');
console.log('git commit -m "Kill PWA cache permanently"');
console.log('git push');
