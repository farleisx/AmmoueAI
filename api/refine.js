import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";

// ---------------- INIT FIREBASE ADMIN ----------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();

// ---------------- INIT GEMINI ----------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // ---------------- AUTH VERIFICATION ----------------
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // ---------------- INPUT VALIDATION ----------------
    const { html: currentHtml, prompt: refinePrompt, projectId } = req.body;

    if (!currentHtml || !refinePrompt) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (currentHtml.length > 150_000) {
      return res.status(413).json({ error: "HTML too large to refine" });
    }

    // ---------------- FETCH USER PLAN ----------------
    const userSnap = await db.collection("users").doc(userId).get();
    const plan = userSnap.data()?.plan || "free";

    // ---------------- DAILY LIMIT CHECK ----------------
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const limit = plan === "pro" ? 5 : 2;

    const usageQuery = db
      .collection("refinements")
      .where("userId", "==", userId)
      .where(
        "timestamp",
        ">=",
        admin.firestore.Timestamp.fromDate(startOfDay)
      );

    const usageSnap = await usageQuery.count().get();
    const usedToday = usageSnap.data().count;

    if (usedToday >= limit) {
      return res.status(403).json({
        error: `Daily limit reached (${limit})`,
        limitReached: true,
      });
    }

    // ---------------- STRONG PROMPT ----------------
    const prompt = `
You are an expert web developer.
Modify the provided HTML ONLY according to the user's request.
Return the COMPLETE updated HTML.
Do NOT add explanations, comments, or markdown fences.

Current HTML:
---
${currentHtml}
---

User Request:
---
${refinePrompt}
---
`;

    // ---------------- CALL GEMINI ----------------
    const result = await model.generateContent(prompt);
    const cleanedHtml = result.response
      .text()
      .replace(/^```[\s\S]*?\n/i, "")
      .replace(/```$/i, "")
      .trim();

    if (!cleanedHtml.includes("<html")) {
      throw new Error("Invalid HTML returned by model");
    }

    // ---------------- LOG USAGE ----------------
    await db.collection("refinements").add({
      userId,
      projectId: projectId || null,
      plan,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ---------------- SEND RESPONSE ----------------
    res.status(200).json({ html: cleanedHtml });
  } catch (error) {
    console.error("Refine Error:", error);
    res.status(500).json({ error: "Refinement failed" });
  }
}
