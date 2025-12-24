import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import admin from "firebase-admin";

// Initialize Firebase Admin using service account from env
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: serviceAccount?.project_id + ".appspot.com" // derive bucket from project_id
  });
}

const bucket = admin.storage().bucket();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let browser;
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
    } else if (htmlContent) {
      await page.setContent(htmlContent, { waitUntil: "networkidle2" });
    } else {
      throw new Error("No URL or HTML content provided");
    }

    const buffer = await page.screenshot({ type: "png", fullPage: true });

    // Upload to Firebase Storage
    const file = bucket.file(`screenshots/${Date.now()}.png`);
    await file.save(buffer, { contentType: "image/png" });
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    res.status(200).json({ screenshotUrl: publicUrl });
  } catch (error) {
    console.error("Screenshot error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
}
