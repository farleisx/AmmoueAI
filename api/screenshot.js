// api/screenshot.js

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const { url, htmlContent } = req.body;

    let browser = null;

    try {
        const executablePath = await chromium.executablePath();

        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--no-zygote",
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: "networkidle0" });
        } else {
            await page.setContent(htmlContent, { waitUntil: "networkidle0" });
        }

        const buffer = await page.screenshot({ type: "png", fullPage: true });

        res.status(200).json({
            screenshotUrl: `data:image/png;base64,${buffer.toString("base64")}`,
        });
    } catch (error) {
        console.error("Screenshot generation failed:", error);
        res.status(500).json({
            error: "Failed to generate screenshot",
            details: error.message,
        });
    } finally {
        if (browser) await browser.close();
    }
}
