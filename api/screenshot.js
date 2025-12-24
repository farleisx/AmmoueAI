// api/screenshot.js
import { chromium } from 'playwright-core';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let browser = null;

  try {
    // Launch headless Chromium
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });

    const page = await browser.newPage();
    const { url, htmlContent } = req.body;

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle' });
    } else if (htmlContent) {
      await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    } else {
      throw new Error('Either "url" or "htmlContent" must be provided.');
    }

    const buffer = await page.screenshot({ type: 'png', fullPage: true });

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
