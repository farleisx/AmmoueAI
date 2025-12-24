// api/screenshot.js
import { chromium as playwrightChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let browser;

  try {
    // Get Chromium executable path from Sparticuz
    const executablePath = await chromium.executablePath();

    // Launch browser
    browser = await playwrightChromium.launch({
      executablePath,
      headless: true,
      args: chromium.args,
    });

    const page = await browser.newPage();

    const { url, htmlContent } = req.body;

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle' });
    } else if (htmlContent) {
      await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    } else {
      return res.status(400).json({ error: 'url or htmlContent is required' });
    }

    const buffer = await page.screenshot({ fullPage: true, type: 'png' });

    // If screenshot is too big for Firestore or DB, return directly
    res.status(200).json({
      screenshotUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    });
  } catch (error) {
    console.error('Screenshot generation failed:', error);
    res.status(500).json({
      error: 'Failed to generate screenshot',
      details: error.message,
    });
  } finally {
    if (browser) await browser.close();
  }
}
