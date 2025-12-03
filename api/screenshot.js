// api/screenshot.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// For ES modules: get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Vercel Serverless Handler
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { url, projectId } = req.body;

        if (!url) {
            return res.status(400).json({ error: "Missing URL in request body" });
        }

        // Launch headless Chromium
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "networkidle2" });

        // Ensure screenshots folder exists in /tmp (Vercel writes to /tmp)
        const screenshotDir = path.join("/tmp", "screenshots");
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }

        const screenshotPath = path.join(screenshotDir, `${projectId || "project"}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await browser.close();

        // Optionally: convert to Base64 to save to Firestore
        const imageBase64 = fs.readFileSync(screenshotPath, { encoding: "base64" });

        return res.status(200).json({
            message: "Screenshot taken successfully",
            screenshotPath,
            screenshotBase64: imageBase64,
        });
    } catch (error) {
        console.error("Screenshot Error:", error);
        return res.status(500).json({ error: "Failed to take screenshot", details: error.message });
    }
}
