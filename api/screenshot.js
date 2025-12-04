// api/screenshot.js - UPDATED
import puppeteer from "puppeteer"; // Use the standard 'puppeteer' package
import chromium from "@sparticuz/chromium"; // Use the Vercel-compatible package

// You must set the NODE_OPTIONS environment variable in Vercel to: --max-old-space-size=1024
// And set the function memory to 1024MB or 2048MB for best stability.

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { url, htmlContent, userId, projectId } = req.body;

    if (!userId || !projectId || (!url && !htmlContent)) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    let browser = null;

    try {
        // --- CORRECTED LAUNCH LOGIC FOR VERCEL ---
        browser = await puppeteer.launch({
            // Pass necessary arguments for running in a serverless environment
            args: [
                ...chromium.args,
                '--hide-scrollbars',
                '--disable-web-security'
            ],
            // Use the executable path provided by @sparticuz/chromium
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            defaultViewport: chromium.defaultViewport,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        
        // CRITICAL: Set the viewport BEFORE navigating/setting content to ensure proper rendering
        // chromium.defaultViewport is typically 1280x800, which is a good default.
        await page.setViewport(chromium.defaultViewport);

        if (url) {
            // Note: networkidle0 or networkidle2 can be slow; you might use 'domcontentloaded' for speed
            await page.goto(url, { waitUntil: "networkidle2" }); 
        } else {
            // Use page.setContent() for local HTML
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });
        }

        // Add a slight delay to ensure all resources and fonts are loaded before screenshot
        await new Promise(resolve => setTimeout(resolve, 500)); 

        // Generate screenshot
        const screenshotBuffer = await page.screenshot({ 
            type: "png", 
            fullPage: true,
            // clip: { x: 0, y: 0, width: 1280, height: 800 } // Optionally clip to a fixed size
        });

        // Return as base64 URL
        const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

        res.status(200).json({ screenshotUrl: screenshotBase64 });
    } catch (err) {
        console.error("Screenshot generation failed:", err);
        // Include the full error message in the details for better client-side logging
        res.status(500).json({ error: "Failed to generate screenshot", details: err.message, stack: err.stack });
    } finally {
        if (browser) await browser.close();
    }
}
