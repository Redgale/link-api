const express = require('express');
const app = express();
const port = 3000;

// This is the endpoint Chrome will hit
app.get('/api/run', (req, res) => {
    // Extract the text the user typed after the @shortcut
    const userInput = req.query.text;

    if (!userInput) {
        return res.send('<h1>No text provided!</h1>');
    }

    // --- NEW LOGIC: Check for "red" query ---
    if (userInput.trim().toLowerCase() === 'red') {
        // Safely escaped template literal so Node doesn't parse the internal JS
        const blobLauncherHtml = `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <title>Instant Blob Launcher</title>
        </head>
        <body>
        <script>
        // ==========================================
        // CHANGE THIS TO YOUR TARGET URL
        // ==========================================
        const TARGET_URL = "https://red-portal.koyeb.app/";
        // ==========================================

        function escapeRegExp(string) {
            return string.replace(/[.*+?^\\$\\{}()|[\\]\\\\]/g, '\\\\$&');
        }

        function makeSelfContained(html, baseUrl) {
            const cleanBaseUrl = baseUrl.replace(/\\/$/, "");
            const escapedUrl = escapeRegExp(cleanBaseUrl);

            // Inject base tag
            html = html.replace(
                /<head[^>]*>/i,
                match => \`\${match}<base href="\${cleanBaseUrl}/">\`
            );

            // Rewrite absolute links to relative
            html = html.replace(
                new RegExp(\`href="\${escapedUrl}(\\\\/[^"]*)"\`, 'g'),
                                'href="$1"'
            );

            html = html.replace(
                new RegExp(\`action="\${escapedUrl}(\\\\/[^"]*)"\`, 'g'),
                                'action="$1"'
            );

            return html;
        }

        async function launch() {
            try {
                const res = await fetch(TARGET_URL);

                if (!res.ok) {
                    throw new Error("Fetch failed: " + res.status);
                }

                const html = await res.text();
                const fixedHtml = makeSelfContained(html, TARGET_URL);

                const blob = new Blob([fixedHtml], {
                    type: "text/html"
                });

                const blobUrl = URL.createObjectURL(blob);

                // instantly replace current page with blob
                location.replace(blobUrl);

            } catch (err) {
                document.body.innerHTML =
                "<h1>Failed to fetch</h1><pre>" +
                err.message +
                "</pre>";
            }
        }

        launch();
        </script>
        </body>
        </html>`;

        return res.send(blobLauncherHtml);
    }
    // --- END NEW LOGIC ---

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
    // You can run instant client-side scripts here based on the input
    const input = "${userInput}";
    console.log("Running script for:", input);

    // Example: Modify the DOM instantly based on what was typed
    document.getElementById('js-output').innerText = "Script executed at " + new Date().toLocaleTimeString();

    // If you typed "@mytool alert Hello", you could parse it here:
    if (input.startsWith("alert ")) {
        alert(input.replace("alert ", ""));
    }
    </script>
    </body>
    </html>
    `;

    res.send(htmlResponse);
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`URL to put in Chrome: http://localhost:${port}/api/run?text=%s`);
});
