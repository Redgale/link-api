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

function processHtml(html) {
  // Inject base tag so relative assets resolve to the origin site
  html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${TARGET_URL}">`);
  // Remove allow-same-origin from sandboxes that also have allow-scripts
  html = html.replace(/\bsandbox=(["'])(.*?)\1/gi, (match, q, attrs) => {
    if (/allow-scripts/i.test(attrs) && /allow-same-origin/i.test(attrs)) {
      return `sandbox=${q}${attrs.replace(/\ballow-same-origin\b\s*/gi, '').trim()}${q}`;
    }
    return match;
  });
  return html;
}

let cache = { html: null, fetchedAt: 0, fetching: false };

async function fetchSite() {
  if (cache.fetching) return;
  cache.fetching = true;
  console.log('[cache] fetching', TARGET_URL);
  try {
    const res = await fetch(TARGET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache.html = processHtml(await res.text());
    cache.fetchedAt = Date.now();
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ html: cache.html, fetchedAt: cache.fetchedAt }));
    console.log(`[cache] updated — ${(Buffer.byteLength(cache.html) / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('[cache] fetch failed:', err.message);
  } finally {
    cache.fetching = false;
  }
}

if (fs.existsSync(CACHE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    cache.html = saved.html;
    cache.fetchedAt = saved.fetchedAt;
    console.log(`[cache] loaded from disk — age ${((Date.now() - saved.fetchedAt) / 60000).toFixed(1)} min`);
  } catch { /* corrupt, re-fetch */ }
}

if (!cache.html || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
  fetchSite();
} else {
  const msUntilExpiry = CACHE_TTL_MS - (Date.now() - cache.fetchedAt);
  setTimeout(() => { fetchSite(); setInterval(fetchSite, CACHE_TTL_MS); }, msUntilExpiry);
}
setInterval(fetchSite, CACHE_TTL_MS);

// ---------- Launcher ----------
// Tiny page — no embedded data. On click:
//   1. Opens about:blank synchronously (must be inside click handler)
//   2. Fetches raw HTML from /api/html (launcher tab → server, NOT the new tab)
//   3. Navigates the new tab to a neutral relay domain
//   4. Passes the HTML via postMessage and closes itself
const LAUNCHER = `<!DOCTYPE html>
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
  button:disabled{opacity:.4;cursor:default}
  kbd{color:#888;font-family:inherit}
  p{color:#555;font-size:13px;margin-top:14px;text-align:center}
</style>
</head>
<body>
<div style="text-align:center">
  <button id="btn" autofocus>Open ↗</button>
  <p>Press <kbd>Enter</kbd> or click to continue</p>
</div>
<script>
document.getElementById('btn').addEventListener('click', function () {
  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Loading…';

  // Must be synchronous — browser only trusts window.open inside a click handler
  var w = window.open('about:blank', '_blank');

  if (!w) {
    btn.disabled = false;
    btn.textContent = 'Open ↗';
    alert('Popup blocked — please allow popups for this page and try again.');
    return;
  }

  // Fetch raw HTML from server (this request comes from the LAUNCHER tab, not about:blank)
  var RELAY = 'https://extraordinary-blancmange-0dae6b.netlify.app/';

  fetch('/api/html')
    .then(function(r) {
      if (!r.ok) throw new Error('Cache not ready (' + r.status + ')');
      return r.text();
    })
    .then(function(html) {
      // Navigate the new tab to the relay page on the neutral domain
      w.location.href = RELAY;

      // Wait for the relay page to load, then hand off the HTML via postMessage.
      // The relay renders it — the tab's origin is now the neutral domain, not koyeb.
      var interval = setInterval(function() {
        try {
          w.postMessage(html, RELAY);
          clearInterval(interval);
          
          // Sever reference and close launcher only AFTER message succeeds
          w.opener = null;
          w = null;
          window.close();
        } catch(e) { /* still loading, retry */ }
      }, 100);
    })
    .catch(function(err) {
      if (w) { w.close(); w = null; }
      btn.disabled = false;
      btn.textContent = 'Open ↗';
      alert('Failed: ' + err.message);
    });
});
</script>
</body>
</html>`;

// ---------- Routes ----------

app.get('/api/run', (req, res) => {
  const userInput = req.query.text;
  if (!userInput) return res.status(400).send('<h1>No text provided</h1>');

  if (userInput.trim().toLowerCase() === 'red') {
    if (cache.html) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      return res.send(LAUNCHER);
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

// Raw cached HTML — requested only by the launcher tab's fetch(), never by the new tab
app.get('/api/html', (req, res) => {
  if (!cache.html) return res.status(503).send('<h1>Cache warming — try again shortly</h1>');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(cache.html);
});

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
