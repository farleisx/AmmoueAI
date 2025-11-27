import { Connection, PublicKey } from "@solana/web3.js";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// --- Firebase config ---
const firebaseConfig = { /* your config */ };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const connection = new Connection("https://api.mainnet-beta.solana.com");

const RECEIVER_WALLET = new PublicKey("3XcK6mfubPZbsNGSKe4MZc7YNJyxJx8rDGkCJcomNSnc");

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const { userId, reference } = req.body;
        if (!userId || !reference) return res.status(400).json({ error: "Missing parameters" });

        // Fetch recent confirmed transactions for your wallet
        const signatures = await connection.getSignaturesForAddress(RECEIVER_WALLET, { limit: 20 });

        // Check for the reference in memo (or other on-chain metadata)
        let found = false;
        for (let sigInfo of signatures) {
            const tx = await connection.getTransaction(sigInfo.signature);
            if (!tx) continue;
            const memoIx = tx.transaction.message.instructions.find(ix => ix.programId.toString() === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
            if (memoIx) {
                const memo = Buffer.from(memoIx.data, "base64").toString();
                if (memo === reference) {
                    found = true;
                    break;
                }
            }
        }

        if (!found) return res.status(400).json({ error: "Payment not found yet" });

        // Update Firestore plan to Pro
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, { plan: "pro" }, { merge: true });

        res.status(200).json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to confirm payment" });
    }
}
