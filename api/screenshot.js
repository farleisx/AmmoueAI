// api/screenshot.js
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let browser = null;

  try {
    // Use Sparticuz Chromium binary for serverless
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    const { url, htmlContent } = req.body;

    if (url) {
      await page.goto(url, { waitUntil: "networkidle2" });
    } else if (htmlContent) {
      await page.setContent(htmlContent, { waitUntil: "networkidle2" });
    } else {
      return res.status(400).json({ error: "Missing url or htmlContent" });
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
