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

// Pre-built redirect shell — served as-is on every request, <1ms
// b64 is computed once per cache refresh, never per-request
const makeBlobRedirect = (b64) =>
  `<!DOCTYPE html><meta charset="UTF-8"><script>` +
  `var a=new Uint8Array(atob(${JSON.stringify(b64)}).split('').map(c=>c.charCodeAt(0)));` +
  `location.replace(URL.createObjectURL(new Blob([a],{type:'text/html'})))` +
  `</script>`;

let cache = {
  redirect: null,   // pre-built blob-redirect HTML (~200 bytes), served directly
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

    // Encode once here, never again
    const b64 = Buffer.from(html, 'utf8').toString('base64');
    cache.redirect = makeBlobRedirect(b64);
    cache.fetchedAt = Date.now();

    fs.writeFileSync(CACHE_FILE, JSON.stringify({ b64, fetchedAt: cache.fetchedAt }));
    console.log(`[cache] updated — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('[cache] fetch failed:', err.message);
  } finally {
    cache.fetching = false;
  }
}

// Warm from disk on startup (instant)
if (fs.existsSync(CACHE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    cache.redirect = makeBlobRedirect(saved.b64);
    cache.fetchedAt = saved.fetchedAt;
    const ageMin = ((Date.now() - saved.fetchedAt) / 60000).toFixed(1);
    console.log(`[cache] loaded from disk — age ${ageMin} min`);
  } catch { /* corrupt, will re-fetch */ }
}

if (!cache.redirect || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
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
    if (cache.redirect) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      return res.send(cache.redirect); // pre-built, ~200 bytes, <1ms
    }
    // Only hit on very first cold start with no disk cache
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
    cached: !!cache.redirect,
    ageSeconds: Math.floor(ageMs / 1000),
    expiresInSeconds: Math.max(0, Math.floor((CACHE_TTL_MS - ageMs) / 1000)),
    fetching: cache.fetching,
  });
});

app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
