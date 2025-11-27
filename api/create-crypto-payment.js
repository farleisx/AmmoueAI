// File: api/create-crypto-payment.js
import admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { uid } = req.body;

    if (!uid) return res.status(400).json({ error: "Missing UID" });

    // Generate a mock paymentId
    const paymentId = `mockpay_${Date.now()}`;

    // Generate a mock QR/barcode URL (you can render this on frontend)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${paymentId}`;

    // Optionally, store this in Firestore for testing
    await db.collection("mockPayments").doc(paymentId).set({
      uid,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ paymentId, qrUrl });
  } catch (err) {
    console.error("Error creating payment:", err);
    return res.status(500).json({ error: "Server error creating payment" });
  }
}
