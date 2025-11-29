import admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        ),
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    const { orderID } = req.query;
    if (!orderID) return res.status(400).json({ error: "Missing orderID" });

    try {
        const auth = Buffer.from(
            process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET
        ).toString("base64");

        const PAYPAL_API = "https://api-m.paypal.com"; // Live API

        const response = await fetch(
            `${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Basic ${auth}`,
                }
            }
        );

        const payment = await response.json();

        if (payment.status !== "COMPLETED") {
            console.error("PayPal capture failed:", payment);
            return res.status(400).json({ error: "Payment not completed" });
        }

        const uid = req.headers["x-user-id"];
        if (!uid) return res.status(400).json({ error: "Missing Firebase UID" });

        await db.collection("users").doc(uid).set({ plan: "pro" }, { merge: true });

        return res.status(200).json({ message: "User upgraded to PRO" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error capturing PayPal order" });
    }
}
