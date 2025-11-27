// file: /api/confirm-crypto-payment.js
import admin from "firebase-admin";
import serviceAccount from "../serviceAccountKey.json" assert { type: "json" };

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const RECEIVER_WALLET = "3XcK6mfubPZbsNGSKe4MZc7YNJyxJx8rDGkCJcomNSnc";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { userId, reference } = req.body;
    if (!userId || !reference) return res.status(400).json({ error: "Missing parameters" });

    // Fetch recent signatures
    const sigResponse = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [RECEIVER_WALLET, { limit: 50 }],
      }),
    });

    const sigData = await sigResponse.json();
    if (!sigData.result) return res.status(500).json({ error: "Failed to fetch signatures" });

    let paymentFound = false;

    for (let sigInfo of sigData.result) {
      // Fetch transaction details
      const txResponse = await fetch(SOLANA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [sigInfo.signature, { encoding: "json" }],
        }),
      });

      const txData = await txResponse.json();
      if (!txData.result) continue;

      const memoIx = txData.result.transaction.message.instructions.find(
        (ix) => ix.programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
      );

      if (!memoIx) continue;

      const memo = Buffer.from(memoIx.data, "base64").toString();
      if (memo === reference) {
        paymentFound = true;
        break;
      }
    }

    if (!paymentFound) return res.status(400).json({ error: "Payment not found yet" });

    // Upgrade user to Pro
    await db.collection("users").doc(userId).set({ plan: "pro" }, { merge: true });

    // Remove pending payment
    await db.collection("pendingPayments").doc(reference).delete();

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to confirm payment", details: err.message });
  }
}
