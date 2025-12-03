const admin = require('firebase-admin');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } catch (error) {
        console.error("Failed to initialize Firebase Admin SDK:", error.message);
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

module.exports = async (req, res) => {
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
    console.log(`Processing screenshot request for document: ${docPath}`);

    let browser = null;
    try {
        const docRef = db.doc(docPath);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            console.log("Project document not found.");
            res.status(404).json({ error: 'Project document not found.' });
            return;
        }

        const projectData = docSnap.data();
        const htmlContent = projectData.htmlContent;

        if (!htmlContent) {
            console.log("No HTML content to screenshot.");
            res.status(400).json({ error: 'Project has no HTML content.' });
            return;
        }

        console.log("Launching Puppeteer browser...");
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

        const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 80 });

        const storagePath = `screenshots/${userId}/${projectId}.jpeg`;
        console.log(`Uploading screenshot to bucket path: ${storagePath}`);

        const file = bucket.file(storagePath);

        await file.save(screenshotBuffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=31536000',
            },
            public: true
        });

        console.log("Screenshot successfully uploaded.");

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });

        console.log(`Screenshot URL: ${url}`);

        await docRef.set({
            screenshotUrl: url,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.status(200).json({ success: true, url });

    } catch (error) {
        console.error("Error during screenshot generation:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (browser) await browser.close();
    }
};
