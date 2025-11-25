// file: pages/api/stripe-webhook.js

import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// --- CRITICAL: Stripe Initialization ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// --- Firebase Admin Initialization ---
// Reuse the initialization logic from deploy.js to ensure the SDK is ready
if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
        try {
            const serviceAccount = JSON.parse(serviceAccountJson);
            initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (error) {
            console.error("Firebase Admin SDK failed to initialize in webhook.", error);
        }
    }
}
const db = getFirestore();

// Helper to convert the request stream into a buffer for Stripe verification
const buffer = (req) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => {
            chunks.push(chunk);
        });
        req.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        req.on('error', reject);
    });
};

// We must disable the default body parser to handle the raw request body for Stripe signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET not set.");
        return res.status(500).send('Server configuration error.');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // 1. Get the raw body
        const rawBody = await buffer(req);
        
        // 2. Verify the webhook signature against the raw body
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        // Verification failed
        console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 3. Handle the specific event type
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            const { userId, plan } = session.metadata; // CRITICAL: Get metadata passed from create-checkout-session.js

            // Ensure we have the user ID and the expected plan
            if (!userId || plan !== 'pro') {
                console.warn(`Webhook: Missing userId or invalid plan in session metadata. Session ID: ${session.id}`);
                return res.status(200).json({ received: true, message: 'Missing metadata, skipping update.' });
            }

            try {
                // 4. Update the user's plan in Firestore
                const userDocRef = db.collection('users').doc(userId);
                
                await userDocRef.set({
                    // Store the plan and the Stripe Customer ID for future reference
                    plan: plan,
                    stripeCustomerId: session.customer, 
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                console.log(`✅ User ${userId} successfully upgraded to ${plan} plan.`);
                
            } catch (firestoreError) {
                console.error("Firestore update failed:", firestoreError);
                // Return 500 so Stripe attempts to retry the webhook
                return res.status(500).send('Firestore update failed.');
            }
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
}
