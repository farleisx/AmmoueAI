// api/screenshot.js
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(), // or use service account JSON
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET // e.g., "your-project.appspot.com"
  });
}

const bucket = admin.storage().bucket();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let browser = null;

  try {
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
    } else {
      await page.setContent(htmlContent, { waitUntil: "networkidle2" });
    }

    // Take screenshot as a buffer
    const buffer = await page.screenshot({ type: "png", fullPage: true });

    // Upload to Firebase Storage
    const fileName = `screenshots/${Date.now()}.png`;
    const file = bucket.file(fileName);
    await file.save(buffer, {
      metadata: { contentType: "image/png" },
      resumable: false
    });

    // Make the file publicly accessible (optional)
    await file.makePublic();

    const screenshotUrl = file.publicUrl();

    res.status(200).json({ screenshotUrl });

  } catch (error) {
    console.error("Screenshot generation failed:", error);
    res.status(500).json({
      error: "Failed to generate screenshot",
      details: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
}
