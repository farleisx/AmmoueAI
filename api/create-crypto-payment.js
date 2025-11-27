import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();
const RECEIVER_WALLET = "3XcK6mfubPZbsNGSKe4MZc7YNJyxJx8rDGkCJcomNSnc";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const reference = `ammoue-${userId}-${Date.now()}`;

    await db.collection("pendingPayments").doc(reference).set({
      userId,
      amount: 5,
      token: "USDC",
      receiver: RECEIVER_WALLET,
      createdAt: Date.now(),
    });

    res.status(200).json({
      amount: 5,
      token: "USDC",
      network: "solana",
      receiver: RECEIVER_WALLET,
      reference,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create crypto payment session", details: err.message });
  }
}
