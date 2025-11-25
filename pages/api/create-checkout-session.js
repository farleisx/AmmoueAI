// file: pages/api/create-checkout-session.js

// Import the Stripe library, which will use the STRIPE_SECRET_KEY from environment variables
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    }

    const { userId, plan } = req.body;
    
    if (!userId || plan !== 'pro') {
        return res.status(400).json({ error: 'Invalid user or plan requested. Must include userId and plan="pro".' });
    }

    // Retrieve the Stripe Price ID from environment variables
    const priceId = process.env.STRIPE_PRO_PRICE_ID; 

    if (!priceId) {
        console.error("CRITICAL: STRIPE_PRO_PRICE_ID is missing from environment variables.");
        return res.status(500).json({ 
            error: 'Payment service configuration error.',
            details: 'The required Stripe Price ID is not set on the server.'
        });
    }

    // Determine the base URL for redirection (uses VERCEL_URL for a robust link)
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.headers.origin;

    try {
        // 1. Create a Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription', 
            payment_method_types: ['card'],
            line_items: [{
                price: priceId, // The ID of your Stripe Pro Plan Price
                quantity: 1,
            }],
            // 2. Pass metadata (CRITICAL for updating plan later)
            metadata: {
                userId: userId,
                plan: plan,
            },
            // 3. Define redirection URLs
            // After successful payment, redirect to a success page that we need to create next
            success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            // If the user cancels payment, send them back to the dashboard
            cancel_url: `${baseUrl}/dashboard.html`,
        });

        // 4. Send the Stripe URL back to the client for redirection
        return res.status(200).json({ url: session.url });
        
    } catch (error) {
        console.error("Stripe Checkout Session Creation Error:", error);
        return res.status(500).json({ 
            error: 'Failed to create payment session.', 
            details: error.message 
        });
    }
}
