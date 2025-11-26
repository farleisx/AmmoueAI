// file: pages/api/paypal-webhook.js

import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// --- Initialization (Same as deploy.js) ---
if (!getApps().length) {
    // ... (Your Firebase Admin SDK initialization logic using FIREBASE_SERVICE_ACCOUNT) ...
}
const db = getFirestore();

// Important: You'll need to fetch the PayPal-supplied Webhook ID from your ENV
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID; // 👈 You must set this
const PAYPAL_BASE_URL = 'https://api.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

// Helper to get an Access Token (needed to verify the webhook)
async function getAccessToken() {
    // ... (Your existing getAccessToken logic from create-checkout-session.js) ...
}


// Disable Vercel's default body parser to handle the raw request body
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // 1. Get raw body and headers
    const rawBody = await new Promise(resolve => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
    });
    
    let webhookEvent;

    try {
        // 2. Obtain access token for validation
        const accessToken = await getAccessToken();

        // 3. Verify the Webhook (CRITICAL SECURITY STEP)
        const verificationResponse = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                auth_algo: req.headers['paypal-auth-algo'],
                cert_url: req.headers['paypal-cert-url'],
                transmission_id: req.headers['paypal-transmission-id'],
                transmission_sig: req.headers['paypal-transmission-sig'],
                transmission_time: req.headers['paypal-transmission-time'],
                webhook_id: PAYPAL_WEBHOOK_ID,
                // The body is sent as a raw string
                webhook_event: JSON.parse(rawBody), 
            }),
        });
        
        const verificationData = await verificationResponse.json();
        if (verificationData.verification_status !== 'SUCCESS') {
            console.error("PayPal Webhook Verification Failed:", verificationData.verification_status);
            return res.status(403).send('Webhook signature verification failed.');
        }

        webhookEvent = JSON.parse(rawBody);

    } catch (error) {
        console.error("PayPal Webhook processing error:", error);
        return res.status(500).send('Webhook server error.');
    }

    // 4. Handle the Event Type
    switch (webhookEvent.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
            // The custom_id is where you stored the userId
            const userId = webhookEvent.resource.custom_id; 
            
            if (userId) {
                try {
                    // Update user's plan in Firestore
                    const userDocRef = db.collection('users').doc(userId);
                    await userDocRef.set({
                        plan: 'pro',
                        paypalSubscriptionId: webhookEvent.resource.id,
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    console.log(`✅ User ${userId} successfully upgraded to PRO via PayPal.`);

                } catch (firestoreError) {
                    console.error("Firestore update failed:", firestoreError);
                    // Return 500 so PayPal attempts to retry
                    return res.status(500).send('Firestore update failed.');
                }
            }
            break;

        case 'BILLING.SUBSCRIPTION.CANCELLED':
             // You would implement logic here to downgrade the user back to 'free'
             break;

        default:
            console.log(`Unhandled PayPal event type ${webhookEvent.event_type}`);
    }

    // Acknowledge receipt of the event
    res.status(200).json({ received: true });
}
