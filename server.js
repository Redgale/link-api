const express = require('express');
const app = express();
const port = 3000;

const escapeHTML = (str) => str.replace(/[&<>'"]/g, 
    tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag])
);

app.get('/api/run', async (req, res) => {
    const userInput = req.query.text;

    if (!userInput) {
        return res.status(400).send('<h1>No text provided!</h1>');
    }

    if (userInput.trim().toLowerCase() === 'red') {
        try {
            const targetUrl = "https://red-portal-l2.vercel.app/";
            const response = await fetch(targetUrl);
            let html = await response.text();

            // 1. FAST HTML FIX: Inject base tag so relative links work automatically
            html = html.replace(
                /<head[^>]*>/i,
                match => `${match}<base href="${targetUrl}">`
            );

            // 2. BLOB REDIRECT: Push to a blob URL so the address bar leaves /api/run
            const blobRedirectHtml = `<!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
            <script>
            // Safely inject the raw HTML into the client
            const html = ${JSON.stringify(html)};
            const blob = new Blob([html], {type: "text/html"});
            // Replace the current /api/run history state with the new blob: URL
            location.replace(URL.createObjectURL(blob));
            </script>
            </body>
            </html>`;

            return res.send(blobRedirectHtml);

        } catch (err) {
            return res.status(500).send(`<h1>Failed to fetch</h1><pre>${escapeHTML(err.message)}</pre>`);
        }
    }

    // --- Original fallback logic ---
    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <title>Instant Script Runner</title>
    </head>
    <body>
    <div class="card">
    <h2>Shortcut Triggered Successfully 🚀</h2>
    <p>Received text payload:</p>
    <div class="input-display">${escapeHTML(userInput)}</div>
    <p id="js-output"></p>
    </div>

    <script>
    const input = ${JSON.stringify(userInput)};
    document.getElementById('js-output').innerText = "Script executed at " + new Date().toLocaleTimeString();
    if (input.startsWith("alert ")) alert(input.replace("alert ", ""));
    </script>
    </body>
    </html>
    `;

    res.send(htmlResponse);
});

app.listen(port, () => console.log(`Running at http://localhost:${port}`));
