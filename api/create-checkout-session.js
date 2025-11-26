// file: pages/api/create-checkout-session.js (One-Time Payment)

import fetch from 'node-fetch';

const {
    PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET,
    PRO_UPGRADE_PRICE // <--- NEW KEY
} = process.env;

// PayPal environment (change to 'api.paypal.com' for production)
const PAYPAL_BASE_URL = 'https://api.paypal.com'; 
const CURRENCY = 'USD'; // Define your currency

// 1. Function to get an access token from PayPal (REMAINS THE SAME)
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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed.' });
    }

    const { userId, plan } = req.body;
    const upgradePrice = PRO_UPGRADE_PRICE;
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.headers.origin;

    if (!userId || plan !== 'pro' || !upgradePrice) {
        return res.status(400).json({ error: 'Missing required parameters or price configuration.' });
    }

    try {
        const accessToken = await getAccessToken();

        // 2. Create the PayPal Payment Order (NOT Subscription)
        const orderResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                intent: 'CAPTURE', // Instruct PayPal to capture the funds immediately
                purchase_units: [{
                    // Pass userId as metadata in the custom_id field
                    custom_id: userId, 
                    amount: {
                        currency_code: CURRENCY,
                        value: upgradePrice,
                        breakdown: {
                            item_total: { currency_code: CURRENCY, value: upgradePrice }
                        }
                    },
                    items: [{
                        name: 'Ammoue AI PRO One-Time Upgrade',
                        description: 'Permanent increase to 5 deployment slots.',
                        unit_amount: { currency_code: CURRENCY, value: upgradePrice },
                        quantity: '1'
                    }]
                }],
                application_context: {
                    // Redirect URLs after approval or cancellation
                    return_url: `${baseUrl}/api/capture-paypal-order?user_id=${userId}`, // 👈 New API endpoint to finalize payment
                    cancel_url: `${baseUrl}/dashboard.html`,
                    brand_name: "Ammoue AI",
                    shipping_preference: "NO_SHIPPING"
                }
            })
        });

        if (!orderResponse.ok) {
             const errorDetails = await orderResponse.json();
             throw new Error(`PayPal Order creation failed: ${JSON.stringify(errorDetails)}`);
        }

        const orderData = await orderResponse.json();
        
        // 3. Find the approval URL to redirect the user
        const approvalLink = orderData.links.find(link => link.rel === 'approve');
        
        if (approvalLink) {
            return res.status(200).json({ url: approvalLink.href, orderId: orderData.id });
        } else {
            throw new Error('PayPal did not return an approval link.');
        }

    } catch (error) {
        console.error("PayPal Order Creation Error:", error);
        return res.status(500).json({ error: 'Failed to create PayPal payment order.', details: error.message });
    }
}
