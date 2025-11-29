import admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    const { orderID } = req.query;

    if (!orderID) return res.status(400).json({ error: "Missing orderID" });

    const auth = Buffer.from(
        process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
    ).toString("base64");

    const response = await fetch(
        `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${auth}`,
            }
        }
    );

    const payment = await response.json();
    console.log("PAYMENT CAPTURE RESULT:", payment);

    if (payment.status !== "COMPLETED") {
        return res.status(400).json({ error: "Payment not completed" });
    }

    const uid = req.headers["x-user-id"];
    if (!uid) return res.status(400).json({ error: "Missing Firebase user UID" });

    await db.collection("users").doc(uid).set({ plan: "pro" }, { merge: true });

    return res.status(200).json({ message: "User upgraded to PRO" });
}
