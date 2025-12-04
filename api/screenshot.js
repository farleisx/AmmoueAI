// api/screenshot.js - FIXED VERSION

// 1. Use the standard puppeteer package (installed as 'puppeteer')
import puppeteer from "puppeteer"; 
// 2. Use the Vercel/Lambda compatible Chromium executable
import chromium from "@sparticuz/chromium"; 

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
        // Launch Chromium with arguments required for Vercel/Lambda
        browser = await puppeteer.launch({
            // CRITICAL FIXES for stability and dependency errors (libnss3.so)
            args: [
                ...chromium.args,
                '--no-sandbox',             // CRITICAL: Required for root user in Lambda
                '--single-process',         // CRITICAL: Improves memory usage and prevents crashes
                '--disable-setuid-sandbox',
                '--hide-scrollbars',
                '--disable-web-security'
            ],
            defaultViewport: chromium.defaultViewport,
            // CRITICAL FIX: The correct way to get the executable path from @sparticuz/chromium
            executablePath: await chromium.executablePath(), 
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        
        // Ensure the viewport is set before content loads for accurate rendering
        await page.setViewport(chromium.defaultViewport);

        if (url) {
            await page.goto(url, { waitUntil: "networkidle2" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });
        }
        
        // Add a slight delay to ensure all CSS/JS has rendered
        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate screenshot
        const screenshotBuffer = await page.screenshot({ 
            type: "png", 
            fullPage: true 
        });

        // Return as base64 URL
        const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

        res.status(200).json({ screenshotUrl: screenshotBase64 });
    } catch (err) {
        console.error("Screenshot generation failed:", err);
        // Include the error details in the response for debugging
        res.status(500).json({ error: "Failed to generate screenshot", details: err.message });
    } finally {
        if (browser) await browser.close();
    }
}
