export default async function handler(req, res) {
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method Not Allowed" });

    try {
        const auth = Buffer.from(
            process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET
        ).toString("base64");

        const PAYPAL_API = "https://api-m.paypal.com"; // Live API

        const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${auth}`,
            },
            body: JSON.stringify({
                intent: "CAPTURE",
                purchase_units: [
                    {
                        amount: { 
                            value: process.env.PRO_UPGRADE_PRICE, 
                            currency_code: "USD" 
                        }
                    }
                ]
            })
        });

        const data = await response.json();

        if (!data.id) {
            console.error("PayPal order creation failed:", data);
            return res.status(500).json({ error: "Error creating PayPal order" });
        }

        return res.status(200).json({ orderID: data.id });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error creating PayPal order" });
    }
}
