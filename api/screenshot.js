const admin = require('firebase-admin');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET // e.g., 'ammoueai.appspot.com'
        });
    } catch (error) {
        console.error("Failed to initialize Firebase Admin SDK:", error.message);
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket(); // Uses the bucket specified above

/**
 * Vercel Serverless Function to generate project screenshots.
 */
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const { userId, projectId, appId = "ammoueai" } = req.body;

    if (!userId || !projectId) {
        res.status(400).send('Missing userId or projectId.');
        return;
    }

    const docPath = `artifacts/${appId}/users/${userId}/projects/${projectId}`;
    console.log(`Processing screenshot for: ${docPath}`);

    let browser = null;

    try {
        // 1️⃣ Fetch project document
        const docRef = db.doc(docPath);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ error: 'Project not found.' });
            return;
        }

        const projectData = docSnap.data();

        // 2️⃣ Get HTML content (handle Base64 encoding if used)
        const htmlContent = projectData.encodedHtmlContent
            ? decodeURIComponent(escape(Buffer.from(projectData.encodedHtmlContent, 'base64').toString('utf8')))
            : projectData.htmlContent;

        if (!htmlContent) {
            res.status(400).json({ error: 'Project has no HTML content.' });
            return;
        }

        // 3️⃣ Launch Puppeteer with Lambda-friendly config
        console.log('Launching headless browser...');
        browser = await puppeteer.launch({
            args: [...chromium.args, '--disable-gpu', '--single-process'],
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            defaultViewport: chromium.defaultViewport
        });

        const page = await browser.newPage();

        // Set content
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        // Adjust viewport dynamically
        const pageHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: 1200, height: Math.min(pageHeight, 2000) });

        // 4️⃣ Capture screenshot
        const screenshotBuffer = await page.screenshot({
            type: 'jpeg',
            quality: 80,
            fullPage: false
        });

        // 5️⃣ Upload to Firebase Storage
        const storagePath = `screenshots/${userId}/${projectId}.jpeg`;
        const file = bucket.file(storagePath);

        console.log(`Uploading screenshot to: gs://${bucket.name}/${storagePath}`);
        await file.save(screenshotBuffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public,max-age=31536000'
            }
        });

        // Make public
        await file.makePublic();
        const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        // 6️⃣ Update Firestore
        await docRef.set({
            screenshotUrl: url,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log('Screenshot generated and Firestore updated.');
        res.status(200).json({ success: true, url });

    } catch (error) {
        console.error(`Error generating screenshot for ${projectId}:`, error);
        res.status(500).json({ error: 'Internal server error.', details: error.message });
    } finally {
        if (browser) await browser.close();
    }
};
