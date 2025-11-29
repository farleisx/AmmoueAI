export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const auth = Buffer.from(
        process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
    ).toString("base64");

    const response = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`,
        },
        body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: { value: "5.00", currency_code: "USD" }
                }
            ]
        })
    });

    const data = await response.json();
    return res.status(200).json({ orderID: data.id });
}
