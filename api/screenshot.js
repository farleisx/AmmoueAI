// api/screenshot.js
import admin from 'firebase-admin';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // optional if you want to specify explicitly
        });
    } catch (error) {
        console.error("Failed to initialize Firebase Admin SDK:", error.message);
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket(); // default bucket

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const { userId, projectId, appId = "ammoueai" } = req.body;

    if (!userId || !projectId) {
        res.status(400).send('Missing userId or projectId in request body.');
        return;
    }

    const docPath = `artifacts/${appId}/users/${userId}/projects/${projectId}`;
    console.log(`Processing screenshot request for: ${docPath}`);

    let browser;
    try {
        // 1. Fetch document data
        const docRef = db.doc(docPath);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ error: 'Project document not found.' });
            return;
        }

        const projectData = docSnap.data();
        const htmlContent = projectData.htmlContent;
        if (!htmlContent) {
            res.status(400).json({ error: 'Project has no HTML content to screenshot.' });
            return;
        }

        // 2. Launch Puppeteer
        const executablePath = await chromium.executablePath();
        browser = await puppeteer.launch({
            args: [...chromium.args, '--disable-gpu', '--single-process'],
            executablePath,
            headless: chromium.headless,
            defaultViewport: chromium.defaultViewport,
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        // 3. Take screenshot
        const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 80 });

        // 4. Upload to Firebase Storage
        const storagePath = `screenshots/${userId}/${projectId}.jpeg`;
        const file = bucket.file(storagePath);
        await file.save(screenshotBuffer, {
            metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' },
            public: true,
        });

        const [url] = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });

        // 5. Update Firestore
        await docRef.set(
            { screenshotUrl: url, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );

        res.status(200).json({ success: true, url });

    } catch (error) {
        console.error(`Error generating screenshot for project ${projectId}:`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    } finally {
        if (browser) await browser.close();
    }
}
