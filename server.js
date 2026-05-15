const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CACHE_FILE = path.join(__dirname, '.cache_red.html');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TARGET_URL = 'https://red-portal-l2.vercel.app/';

const escapeHTML = (str) =>
  str.replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );

// ---------- In-memory cache ----------
let cache = {
  html: null,       // ready-to-serve HTML string
  fetchedAt: 0,     // epoch ms of last successful fetch
  fetching: false,  // lock to prevent parallel fetches
};

// ---------- Fetch + process ----------
async function fetchSite() {
  if (cache.fetching) return;
  cache.fetching = true;
  console.log('[cache] fetching', TARGET_URL);
  try {
    const res = await fetch(TARGET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let html = await res.text();
    // Inject base tag so relative assets resolve correctly
    html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${TARGET_URL}">`);
    cache.html = html;
    cache.fetchedAt = Date.now();
    // Persist to disk so a server restart doesn't cause a cold fetch
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ html, fetchedAt: cache.fetchedAt }));
    console.log(`[cache] updated — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('[cache] fetch failed:', err.message);
  } finally {
    cache.fetching = false;
  }
}

// ---------- Startup ----------
// 1. Try to warm from disk (instant, even if stale)
if (fs.existsSync(CACHE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    cache.html = saved.html;
    cache.fetchedAt = saved.fetchedAt;
    const ageMin = ((Date.now() - saved.fetchedAt) / 60000).toFixed(1);
    console.log(`[cache] loaded from disk — age ${ageMin} min`);
  } catch { /* corrupt file, ignore */ }
}

// 2. Fetch now if cache is missing or stale
if (!cache.html || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
  fetchSite();
} else {
  // Schedule next refresh to exactly when the cached copy expires
  const msUntilExpiry = CACHE_TTL_MS - (Date.now() - cache.fetchedAt);
  setTimeout(() => {
    fetchSite();
    setInterval(fetchSite, CACHE_TTL_MS);
  }, msUntilExpiry);
}

// Always keep refreshing every hour
setInterval(fetchSite, CACHE_TTL_MS);

// ---------- Routes ----------
app.get('/api/run', (req, res) => {
  const userInput = req.query.text;
  if (!userInput) return res.status(400).send('<h1>No text provided</h1>');

  if (userInput.trim().toLowerCase() === 'red') {
    if (cache.html) {
      // Serve directly — no fetch, no blob, no JS redirect needed
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      return res.send(cache.html);
    }
    // Cache is still warming (only on very first cold start with no disk cache)
    return res.send(
      `<!DOCTYPE html><meta charset="UTF-8">` +
      `<title>Loading…</title>` +
      `<meta http-equiv="refresh" content="2">` +
      `<style>body{font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0}</style>` +
      `<p>Warming cache — ready in a moment…</p>`
    );
  }

  // --- Fallback ---
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

// Cache status — hit /api/status to inspect
app.get('/api/status', (_req, res) => {
  const ageMs = Date.now() - cache.fetchedAt;
  res.json({
    cached: !!cache.html,
    ageSeconds: Math.floor(ageMs / 1000),
    expiresInSeconds: Math.max(0, Math.floor((CACHE_TTL_MS - ageMs) / 1000)),
    sizeKB: cache.html ? (Buffer.byteLength(cache.html) / 1024).toFixed(1) : 0,
    fetching: cache.fetching,
  });
});

app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
