const express = require('express');
const app = express();
const port = 3000;

app.get('/api/run', async (req, res) => {
    const userInput = req.query.text;

    if (!userInput) {
        return res.send('<h1>No text provided!</h1>');
    }

    if (userInput.trim().toLowerCase() === 'red') {
        try {
            // FETCH AND PROCESS ON SERVER (fast - no client latency)
            const targetUrl = "https://red-portal-l2.vercel.app/";
            const response = await fetch(targetUrl);
            const html = await response.text();
            const fixedHtml = makeSelfContained(html, targetUrl);

            // Return minimal HTML - just create blob and redirect
            const blobRedirectHtml = `<!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
            <script>
            const html = ${JSON.stringify(fixedHtml)};
            const blob = new Blob([html], {type: "text/html"});
            const blobUrl = URL.createObjectURL(blob);
            location.replace(blobUrl);
            </script>
            </body>
            </html>`;

            res.send(blobRedirectHtml);
        } catch (err) {
            res.send(`<h1>Failed to fetch</h1><pre>${err.message}</pre>`);
        }
        return;
    }

    // Original fallback logic for any other input
    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <title>Instant Script Runner</title>
    <style>
    body {
        font-family: system-ui, -apple-system, sans-serif;
        background-color: #202124;
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
    }
    .card {
        background: #303134;
        padding: 2rem;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .input-display {
        color: #8ab4f8;
        font-size: 1.5rem;
        margin: 1rem 0;
        padding: 1rem;
        background: rgba(138, 180, 248, 0.1);
        border-radius: 8px;
    }
    </style>
    </head>
    <body>
    <div class="card">
    <h2>Shortcut Triggered Successfully 🚀</h2>
    <p>Received text payload:</p>
    <div class="input-display">${userInput}</div>
    <p id="js-output"></p>
    </div>

    <script>
    const input = "${userInput}";
    console.log("Running script for:", input);
    document.getElementById('js-output').innerText = "Script executed at " + new Date().toLocaleTimeString();

    if (input.startsWith("alert ")) {
        alert(input.replace("alert ", ""));
    }
    </script>
    </body>
    </html>
    `;

    res.send(htmlResponse);
});

function makeSelfContained(html, baseUrl) {
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const escapedUrl = escapeRegExp(cleanBaseUrl);

    // Inject base tag
    html = html.replace(
        /<head[^>]*>/i,
        match => `${match}<base href="${cleanBaseUrl}/">`
    );

    // Rewrite absolute links to relative
    html = html.replace(
        new RegExp(`href="${escapedUrl}(/[^"]*)"`, 'g'),
        'href="$1"'
    );

    html = html.replace(
        new RegExp(`action="${escapedUrl}(/[^"]*)"`, 'g'),
        'action="$1"'
    );

    return html;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`URL to put in Chrome: http://localhost:${port}/api/run?text=%s`);
});
