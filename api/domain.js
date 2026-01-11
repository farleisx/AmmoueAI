import fetch from "node-fetch";
import admin from "firebase-admin";
import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) {
    initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        ),
    });
}

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;
const VERCEL_PROJECT = "ammoueai-sites";

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

        const idToken = authHeader.split("Bearer ")[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        const userId = decoded.uid;

        const { domain } = req.body;
        if (!domain) return res.status(400).json({ error: "Missing domain" });

        // Attach domain via Vercel API
        const response = await fetch(
            `https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/domains`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${VERCEL_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: domain,
                    project: VERCEL_PROJECT,
                    ...(VERCEL_TEAM_ID ? { teamId: VERCEL_TEAM_ID } : {}),
                }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || "Domain attach failed" });
        }

        // ✅ Return status info
        return res.status(200).json({ status: data.status || "pending", domain: data.name });
    } catch (err) {
        console.error("DOMAIN ATTACH ERROR:", err);
        return res.status(500).json({ error: "Domain attach failed" });
    }
}
