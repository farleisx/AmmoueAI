// file: api/confirm-crypto-payment.js
import admin from "firebase-admin";

// Initialize Firebase Admin only once
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Endpoint to confirm crypto payment and upgrade user's plan
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { userId, reference } = req.body;

    if (!userId || !reference) {
      return res.status(400).json({ error: "Missing userId or payment reference" });
    }

    // 🔹 STEP 1: Verify crypto payment
    // TODO: Replace this with real Solana/Phantom blockchain verification
    const paymentValid = true; // Mock for now

    if (!paymentValid) {
      return res.status(400).json({ error: "Payment not valid" });
    }

    // 🔹 STEP 2: Update user's plan in Firestore
    const userRef = db.collection("users").doc(userId);

    await userRef.set(
      {
        plan: "pro",
        upgradedAt: new Date().toISOString()
      },
      { merge: true } // Merge to keep existing fields
    );

    // 🔹 STEP 3: Return success response
    return res.status(200).json({ success: true, message: "User upgraded to Pro" });

  } catch (err) {
    console.error("Error confirming crypto payment:", err);
    return res.status(500).json({ error: "Server error confirming payment" });
  }
}
