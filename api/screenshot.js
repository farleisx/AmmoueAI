// api/screenshot.js - FIXED VERSION

import puppeteer from "puppeteer"; 
import chromium from "@sparticuz/chromium"; 

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { url, htmlContent, userId, projectId } = req.body;
    // ... (rest of your validation logic)

    let browser = null;

    try {
        // --- CRITICAL FIX: Launch Arguments ---
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',             // CRITICAL: Bypasses shared library checks in Lambda
                '--single-process',         // Prevents crashes by limiting resource use
                '--disable-setuid-sandbox',
                '--hide-scrollbars',
                '--disable-web-security'
            ],
            defaultViewport: chromium.defaultViewport,
            // CRITICAL FIX: Must call the executablePath() function
            executablePath: await chromium.executablePath(), 
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setViewport(chromium.defaultViewport);

        if (url) {
            await page.goto(url, { waitUntil: "networkidle2" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });
        }
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for rendering

        const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true });
        const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

        res.status(200).json({ screenshotUrl: screenshotBase64 });
    } catch (err) {
        console.error("Screenshot generation failed:", err);
        res.status(500).json({ error: "Failed to generate screenshot", details: err.message });
    } finally {
        if (browser) await browser.close();
    }
}
