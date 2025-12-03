import puppeteer from "puppeteer-core";
import pkg from "@sparticuz/chromium";
const { chromium } = pkg;

export default async function handler(req, res) {
    try {
        const { url, htmlContent, userId, projectId } = req.body;

        if (!userId || !projectId || (!url && !htmlContent)) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ✅ Correct: await the function
        const executablePath = await chromium.executablePath();

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath,       // ✅ string, not function
            headless: "new"
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: "networkidle2" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });
        }

        const screenshotBuffer = await page.screenshot({ fullPage: true });
        await browser.close();

        const screenshotBase64 = screenshotBuffer.toString("base64");
        const screenshotUrl = `data:image/png;base64,${screenshotBase64}`;

        res.status(200).json({ screenshotUrl });
    } catch (err) {
        console.error("Screenshot generation failed:", err);
        res.status(500).json({ error: err.message });
    }
}
