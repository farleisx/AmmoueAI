// file: pages/api/capture-paypal-order.js (Finalizes payment and updates user)

import fetch from 'node-fetch';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Environment variables for PayPal and Firebase Admin SDK
const {
    PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET,
} = process.env;

// --- Firebase Admin Setup ---
// You must set the FIREBASE_SERVICE_ACCOUNT_KEY environment variable on Vercel.
// It should contain the JSON content of your service account key.
const serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

// Initialize Firebase Admin SDK only if the service key is available and it hasn't been initialized
if (Object.keys(serviceAccountKey).length > 0 && !initializeApp.length) {
    initializeApp({
        credential: cert(serviceAccountKey)
    });
}
const db = getFirestore();
// --- End Firebase Admin Setup ---


const PAYPAL_BASE_URL = 'https://api.paypal.com'; // Change to 'https://api.paypal.com' for production

// 1. Function to get an access token from PayPal
async function getAccessToken() {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
        throw new Error('Failed to obtain PayPal access token (check Client ID/Secret).');
    }
    const data = await response.json();
    return data.access_token;
}


export default async function handler(req, res) {
    // PayPal redirects here with the token (which is the Order ID) and user_id (from our return_url parameter)
    const { token, user_id } = req.query; 
    const orderId = token; 
    const dashboardUrl = '/dashboard.html';

    // 1. Basic validation
    if (!orderId || !user_id) {
        console.error("Missing Order ID or User ID in query parameters.");
        // Redirect to dashboard with an error message
        return res.redirect(302, `${dashboardUrl}?status=error&message=Payment processing failed: missing payment details.`);
    }

    try {
        const accessToken = await getAccessToken();

        // 2. Capture the payment for the Order using the Order ID
        const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({}) // Empty body is required for capture
        });

        const captureData = await captureResponse.json();

        // Check if the capture succeeded and the status is COMPLETED
        if (!captureResponse.ok || captureData.status !== 'COMPLETED') {
            console.error("PayPal Capture Failed:", captureData);
            return res.redirect(302, `${dashboardUrl}?status=error&message=Payment failed or was denied.`);
        }
        
        // 3. Update the user's plan in Firestore
        // This grants the PRO access to the user
        const userRef = db.doc(`users/${user_id}`);
        await userRef.update({
            plan: 'pro',
            paypal_order_id: orderId,
            plan_activated_at: new Date(),
        });

        // 4. Redirect to dashboard on success
        return res.redirect(302, `${dashboardUrl}?status=success&message=Congratulations! You are now a PRO user.`);

    } catch (error) {
        console.error("Error capturing PayPal order or updating Firestore:", error);
        return res.redirect(302, `${dashboardUrl}?status=error&message=An internal server error occurred during finalization.`);
    }
}
