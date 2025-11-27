import { Connection, PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";

// --- Firebase config ---
const firebaseConfig = {
    apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
    authDomain: "ammoueai.firebaseapp.com",
    projectId: "ammoueai",
    storageBucket: "ammoueai.firebasestorage.app",
    messagingSenderId: "135818868149",
    appId: "1:135818868149:web:db9280baf9540a3339d5fc",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Your receive wallet (public) ---
const RECEIVER_WALLET = new PublicKey("3XcK6mfubPZbsNGSKe4MZc7YNJyxJx8rDGkCJcomNSnc");

// --- Solana connection ---
const connection = new Connection("https://api.mainnet-beta.solana.com");

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "Missing userId" });

        // Generate a unique reference for the transaction
        const reference = `ammoue-${userId}-${Date.now()}`;

        // Return the payment details to frontend
        res.status(200).json({
            amount: 5, // 5 USDC
            token: "USDC",
            network: "solana",
            receiver: RECEIVER_WALLET.toBase58(),
            reference
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create crypto payment session" });
    }
}
