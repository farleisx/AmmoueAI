import puppeteer from "puppeteer-core";
import chromiumPkg from "@sparticuz/chromium";
const chromium = chromiumPkg.default || chromiumPkg;

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { url, htmlContent } = req.body;

        if (!url && !htmlContent) {
            return res.status(400).json({ error: "Missing URL or HTML content" });
        }

        const executablePath = await chromium.executablePath();

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath,
            headless: "new",
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: "networkidle2" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });
        }

        const screenshotBuffer = await page.screenshot({ fullPage: true });
        await browser.close();

        const screenshotUrl = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;

        res.status(200).json({ screenshotUrl });
    } catch (err) {
        console.error("Screenshot generation failed:", err);
        res.status(500).json({ error: err.message });
    }
}
