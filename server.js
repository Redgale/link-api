const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CACHE_FILE = path.join(__dirname, '.cache_red.html');
const CACHE_TTL_MS = 60 * 60 * 1000;
const TARGET_URL = 'https://red-portal-l2.vercel.app/';

const escapeHTML = (str) =>
  str.replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );

// One-click launcher page — auto-focused so Enter/Space opens the blob immediately.
// window.open() inside a click handler is always allowed by browsers.
const makeLauncher = (b64) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening…</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;display:grid;place-items:center;background:#0f0f0f;font-family:system-ui,sans-serif}
  button{
    background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:12px;
    padding:18px 48px;font-size:18px;cursor:pointer;letter-spacing:.02em;
    transition:background .15s,transform .1s;outline:none;
  }
  button:hover,button:focus{background:#252525;border-color:#555}
  button:active{transform:scale(.97)}
  p{color:#555;font-size:13px;margin-top:14px;text-align:center}
</style>
</head>
<body>
<div style="text-align:center">
  <button id="btn" autofocus>Open ↗</button>
  <p>Press <kbd style="color:#888">Enter</kbd> or click to continue</p>
</div>
<script>
const b64=${JSON.stringify(b64)};
document.getElementById('btn').addEventListener('click',function(){
  const a=new Uint8Array(atob(b64).split('').map(c=>c.charCodeAt(0)));
  const url=URL.createObjectURL(new Blob([a],{type:'text/html'}));
  window.open(url,'_blank');
  // Close this launcher tab if the browser allows it
  window.close();
});
</script>
</body>
</html>`;

let cache = {
  launcher: null,
  fetchedAt: 0,
  fetching: false,
};

async function fetchSite() {
  if (cache.fetching) return;
  cache.fetching = true;
  console.log('[cache] fetching', TARGET_URL);
  try {
    const res = await fetch(TARGET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let html = await res.text();
    html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${TARGET_URL}">`);
    const b64 = Buffer.from(html, 'utf8').toString('base64');
    cache.launcher = makeLauncher(b64);
    cache.fetchedAt = Date.now();
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ b64, fetchedAt: cache.fetchedAt }));
    console.log(`[cache] updated — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('[cache] fetch failed:', err.message);
  } finally {
    cache.fetching = false;
  }
}

// Warm from disk on startup
if (fs.existsSync(CACHE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    cache.launcher = makeLauncher(saved.b64);
    cache.fetchedAt = saved.fetchedAt;
    const ageMin = ((Date.now() - saved.fetchedAt) / 60000).toFixed(1);
    console.log(`[cache] loaded from disk — age ${ageMin} min`);
  } catch { /* corrupt, will re-fetch */ }
}

if (!cache.launcher || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
  fetchSite();
} else {
  const msUntilExpiry = CACHE_TTL_MS - (Date.now() - cache.fetchedAt);
  setTimeout(() => { fetchSite(); setInterval(fetchSite, CACHE_TTL_MS); }, msUntilExpiry);
}
setInterval(fetchSite, CACHE_TTL_MS);

// ---------- Routes ----------
app.get('/api/run', (req, res) => {
  const userInput = req.query.text;
  if (!userInput) return res.status(400).send('<h1>No text provided</h1>');

  if (userInput.trim().toLowerCase() === 'red') {
    if (cache.launcher) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      return res.send(cache.launcher);
    }
    return res.send(
      `<!DOCTYPE html><meta charset="UTF-8"><title>Loading…</title>` +
      `<meta http-equiv="refresh" content="2">` +
      `<style>body{font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0}</style>` +
      `<p>Warming cache — ready in a moment…</p>`
    );
  }

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Script Runner</title></head>
<body>
<h2>Triggered</h2>
<pre>${escapeHTML(userInput)}</pre>
<p id="t"></p>
<script>
const i=${JSON.stringify(userInput)};
document.getElementById('t').textContent='Ran at '+new Date().toLocaleTimeString();
if(i.startsWith('alert '))alert(i.slice(6));
</script></body></html>`);
});

app.get('/api/status', (_req, res) => {
  const ageMs = Date.now() - cache.fetchedAt;
  res.json({
    cached: !!cache.launcher,
    ageSeconds: Math.floor(ageMs / 1000),
    expiresInSeconds: Math.max(0, Math.floor((CACHE_TTL_MS - ageMs) / 1000)),
    fetching: cache.fetching,
  });
});

app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
