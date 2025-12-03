const admin = require('firebase-admin');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// IMPORTANT: Initialize Firebase Admin SDK ONLY ONCE.
// In a Vercel environment, you must use environment variables 
// for credentials instead of relying on the Google Cloud environment.
// For Vercel, this usually involves setting FIREBASE_ADMIN_CONFIG (or similar) 
// in JSON format in the project settings.

// The credentials should be passed via an environment variable in Vercel
// Example: FIREBASE_SA_KEY = '{ "type": "service_account", ... }'
if (!admin.apps.length) {
    try {
        // We assume the service account key is stored in a Vercel environment variable
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Assuming default storage bucket is implicitly handled by the service account
        });
    } catch (error) {
        console.error("Failed to initialize Firebase Admin SDK:", error.message);
        // This is a common error if the environment variable is not set correctly
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket(); // Default Storage bucket

/**
 * Vercel Serverless Function HTTP Handler.
 * This function must be triggered manually via a POST request from the dashboard 
 * whenever a project's HTML changes.
 */
module.exports = async (req, res) => {
    // Only allow POST method
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const { userId, projectId, appId = "ammoueai" } = req.body;

    if (!userId || !projectId) {
        res.status(400).send('Missing userId or projectId in request body.');
        return;
    }

    // Path to the project document
    const docPath = `artifacts/${appId}/users/${userId}/projects/${projectId}`;
    
    console.log(`Processing screenshot request for: ${docPath}`);

    let browser = null;
    try {
        // 1. Fetch Document Data
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

        // 2. Launch Puppeteer with Vercel/Lambda configuration
        console.log(`Starting headless browser using @sparticuz/chromium.`);
        
        const executablePath = await chromium.executablePath();
        
        browser = await puppeteer.launch({
            args: [...chromium.args, '--disable-gpu', '--single-process'], // Recommended args for Vercel
            executablePath: executablePath,
            headless: chromium.headless,
            defaultViewport: chromium.defaultViewport,
        });
        
        const page = await browser.newPage();
        
        // 3. Set Content & Capture Screenshot
        await page.setViewport({ width: 800, height: 600 });
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        
        // Take the screenshot buffer
        const screenshotBuffer = await page.screenshot({ 
            type: 'jpeg',
            quality: 80
        });

        // 4. Upload to Firebase Storage
        const storagePath = `screenshots/${userId}/${projectId}.jpeg`;
        const file = bucket.file(storagePath);
        
        console.log(`Uploading screenshot to: gs://${bucket.name}/${storagePath}`);
        
        await file.save(screenshotBuffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=31536000'
            },
            public: true
        });

        // Get the public URL for the image
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491'
        });

        // 5. Update Firestore Document
        console.log(`Screenshot generated. Updating Firestore with URL.`);
        
        await docRef.set({ 
            screenshotUrl: url,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 6. Respond to HTTP request
        res.status(200).json({ success: true, url });

    } catch (error) {
        console.error(`ERROR processing screenshot for project ${projectId}:`, error);
        res.status(500).json({ error: 'Internal Server Error during screenshot generation.', details: error.message });
    } finally {
        // 7. Cleanup
        if (browser) {
            await browser.close();
        }
    }
};
