// File: api/confirm-crypto-payment.js
import admin from "firebase-admin";

// ----------------------
// Initialize Firebase Admin
// ----------------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const db = admin.firestore();

// ----------------------
// Confirm Crypto Payment Handler
// ----------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { uid, paymentId } = req.body;

    if (!uid || !paymentId) {
      return res.status(400).json({ error: "Missing UID or paymentId" });
    }

    // TODO: Insert your crypto payment verification logic here.
    // For example, call your crypto provider API with `paymentId` to confirm success.
    const paymentSuccess = true; // Mock: Replace with actual verification
    if (!paymentSuccess) return res.status(400).json({ error: "Payment not verified" });

    // 🔥 Update user plan to PRO in Firestore
    const userRef = db.collection("users").doc(uid);
    await userRef.set({ plan: "pro" }, { merge: true });

    return res.status(200).json({ message: "Payment verified, plan upgraded to PRO" });

  } catch (err) {
    console.error("Error confirming payment:", err);
    return res.status(500).json({ error: "Server error during payment confirmation" });
  }
}
