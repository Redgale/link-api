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
            const targetUrl = "https://red-portal.koyeb.app/";
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

    // fallback...
});

function makeSelfContained(html, baseUrl) {
    // ... your existing function
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
