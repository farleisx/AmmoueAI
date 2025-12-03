// api/screenshot.js
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        storageBucket: process.env.FIREBASE_BUCKET // e.g., "your-project.appspot.com"
    });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userId, projectId, url, htmlContent } = req.body;
    if (!userId || !projectId || (!url && !htmlContent)) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: true
        });

        const page = await browser.newPage();

        if (url) {
            await page.goto(url, { waitUntil: 'networkidle2' });
        } else {
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        }

        const screenshotBuffer = await page.screenshot({ type: 'png' });

        // Save to Firebase Storage
        const file = bucket.file(`screenshots/${userId}/${projectId}.png`);
        await file.save(screenshotBuffer, {
            metadata: { contentType: 'image/png' },
            public: true
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/screenshots/${userId}/${projectId}.png`;

        // Save screenshot URL to Firestore
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
