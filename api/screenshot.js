import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let browser;
  try {
    // Vercel-compatible Puppeteer launch
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(), // critical!
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    const { url, htmlContent } = req.body;

    if (!url && !htmlContent) {
      return res.status(400).json({ error: "Provide 'url' or 'htmlContent'" });
    }

    if (url) {
      await page.goto(url, { waitUntil: "networkidle2" });
    } else {
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    }

    const buffer = await page.screenshot({ fullPage: true });
    await browser.close();

    return res.status(200).json({
      screenshotUrl: `data:image/png;base64,${buffer.toString("base64")}`,
    });
  } catch (err) {
    console.error("Screenshot error:", err);
    if (browser) await browser.close();
    return res.status(500).json({ error: err.message });
  }
}
