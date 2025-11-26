// file: pages/api/capture-paypal-order.js

import fetch from 'node-fetch';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// --- Initialization (Same as deploy.js) ---
// Initialize Firebase Admin SDK here using FIREBASE_SERVICE_ACCOUNT...

// Assume initialization is done or use your existing initialization logic
if (!getApps().length) {
    // ... (Your Firebase Admin SDK initialization logic) ...
}
const db = getFirestore();

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
const PAYPAL_BASE_URL = 'https://api.sandbox.paypal.com'; 

// Helper to get an Access Token (needed for capture)
async function getAccessToken() {
    // ... (Your existing getAccessToken logic from create-checkout-session.js) ...
}

export default async function handler(req, res) {
    // 1. Get query parameters after PayPal redirects the user
    const { token: orderId, user_id: userId } = req.query; 
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.headers.origin;

    if (!orderId || !userId) {
        console.error("Missing PayPal order token or userId in return URL.");
        return res.redirect(`${baseUrl}/dashboard.html?status=payment_error`);
    }

    try {
        const accessToken = await getAccessToken();

        // 2. Capture the Order (Finalizes the payment and charges the user)
        const captureResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({}), // Empty body is fine for a simple capture
        });

        const captureData = await captureResponse.json();

        if (captureResponse.ok && captureData.status === 'COMPLETED') {
            // 3. Payment Successful: Update user's plan in Firestore
            const userDocRef = db.collection('users').doc(userId);
            
            await userDocRef.set({
                plan: 'pro',
                paypalOrderId: orderId,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`✅ User ${userId} successfully upgraded to PRO via one-time PayPal order ${orderId}.`);

            // 4. Redirect to a success page
            return res.redirect(`${baseUrl}/success.html?status=success`);
            
        } else {
            console.error("PayPal Order Capture Failed:", captureData);
            return res.redirect(`${baseUrl}/dashboard.html?status=payment_failed`);
        }

    } catch (error) {
        console.error("Order Capture Error:", error);
        return res.redirect(`${baseUrl}/dashboard.html?status=server_error`);
    }
}
