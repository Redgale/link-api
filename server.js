const express = require('express');
const app = express();
const port = 3000;

const escapeHTML = (str) =>
  str.replace(/[&<>'"]/g, (tag) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
  );

// Minimal redirect shell — parsed and executed in <1ms by the browser.
// Base64 sidesteps the </script> injection bug entirely.
const blobRedirect = (b64) =>
  `<!DOCTYPE html><meta charset="UTF-8"><script>` +
  `const b=atob(${JSON.stringify(b64)});` +
  `const a=new Uint8Array(b.length);` +
  `for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);` +
  `location.replace(URL.createObjectURL(new Blob([a],{type:'text/html'})))` +
  `</script>`;

app.get('/api/run', async (req, res) => {
  const userInput = req.query.text;
  if (!userInput) return res.status(400).send('<h1>No text provided!</h1>');

  if (userInput.trim().toLowerCase() === 'red') {
    try {
      const targetUrl = 'https://red-portal-l2.vercel.app/';
      const response = await fetch(targetUrl);
      let html = await response.text();

      // Inject base tag so relative links/assets resolve correctly
      html = html.replace(/<head[^>]*>/i, (m) => `${m}<base href="${targetUrl}">`);

      // Encode as base64 — safe against any content in the fetched HTML
      const b64 = Buffer.from(html, 'utf8').toString('base64');

      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(blobRedirect(b64));
    } catch (err) {
      return res.status(500).send(`<h1>Failed to fetch</h1><pre>${escapeHTML(err.message)}</pre>`);
    }
  }

  // --- Fallback ---
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Script Runner</title></head>
<body>
<div class="card">
  <h2>Shortcut Triggered 🚀</h2>
  <p>Received text payload:</p>
  <div class="input-display">${escapeHTML(userInput)}</div>
  <p id="js-output"></p>
</div>
<script>
const input = ${JSON.stringify(userInput)};
document.getElementById('js-output').innerText = "Executed at " + new Date().toLocaleTimeString();
if (input.startsWith("alert ")) alert(input.replace("alert ", ""));
</script>
</body></html>`);
});

app.listen(port, () => console.log(`Running at http://localhost:${port}`));
