// api/screenshot.js
import { chromium } from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

// Vercel serverless handler
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { userId, projectId, url, htmlContent } = req.body;

        // ✅ Validate required fields
        if (!userId || !projectId || (!url && !htmlContent)) {
            return res.status(400).json({
                error: "Missing required fields: userId, projectId, and url or htmlContent are required."
            });
        }

        // Launch headless browser
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: "networkidle2" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle0" });
        }

        // Take full-page screenshot as base64
        const screenshotBuffer = await page.screenshot({ encoding: "base64", fullPage: true });

        await browser.close();

        // Return a data URL for the frontend to use
        const screenshotUrl = `data:image/png;base64,${screenshotBuffer}`;

        return res.status(200).json({ screenshotUrl });

    } catch (err) {
        console.error("Screenshot generation error:", err);
        return res.status(500).json({ error: err.message });
    }
}
