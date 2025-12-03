// api/screenshot.js
import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";

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
        // Launch Chromium in Vercel Lambda
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: "networkidle2" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });
        }

        // Generate screenshot
        const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true });

        // For demo: return as base64 URL (you can save to Firebase Storage or S3 instead)
        const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

        res.status(200).json({ screenshotUrl: screenshotBase64 });
    } catch (err) {
        console.error("Screenshot generation failed:", err);
        res.status(500).json({ error: "Failed to generate screenshot", details: err.message });
    } finally {
        if (browser) await browser.close();
    }
}
