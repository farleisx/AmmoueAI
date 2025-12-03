// api/screenshot.js
import pkg from '@sparticuz/chromium';
const { chromium } = pkg;

import fs from 'fs';
import path from 'path';

// Example: if you plan to use Firestore to save screenshots URLs
import admin from 'firebase-admin';

// Initialize Firebase Admin (make sure you have your service account JSON in env or file)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId, projectId, url, htmlContent } = req.body;

    if (!userId || !projectId || (!url && !htmlContent)) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    let browser = null;

    try {
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: true,
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: 'networkidle2' });
        } else if (htmlContent) {
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        }

        // Take a screenshot
        const screenshotBuffer = await page.screenshot({ type: 'png' });

        // Save to Vercel filesystem temporarily (optional, or upload directly to Firebase Storage)
        const filePath = path.join('/tmp', `${projectId}.png`);
        fs.writeFileSync(filePath, screenshotBuffer);

        // Example: upload to Firebase Storage (if you want)
        const bucket = admin.storage().bucket();
        const storageFile = bucket.file(`screenshots/${userId}/${projectId}.png`);
        await storageFile.save(screenshotBuffer, {
            metadata: { contentType: 'image/png' },
            public: true
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/screenshots/${userId}/${projectId}.png`;

        // Optionally: save URL to Firestore
        await db.doc(`artifacts/ammoueai/users/${userId}/projects/${projectId}`).update({
            screenshotUrl: publicUrl
        });

        res.status(200).json({ screenshotUrl: publicUrl });
    } catch (err) {
        console.error('Screenshot generation failed:', err);
        res.status(500).json({ error: 'Screenshot generation failed' });
    } finally {
        if (browser) await browser.close();
    }
}
