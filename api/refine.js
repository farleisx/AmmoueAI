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

    // ---------------- SSE HEADERS ----------------
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

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

    // ---------------- STREAM FROM GEMINI ----------------
    const stream = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
      },
    });

    let fullOutput = "";

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        fullOutput += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }

    // ---------------- CLEAN OUTPUT ----------------
    const cleanedHtml = fullOutput
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

    // ---------------- END STREAM ----------------
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Refine Error:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "Refinement failed" });
    } else {
      res.write(
        `data: ${JSON.stringify({ error: "Refinement failed" })}\n\n`
      );
      res.end();
    }
  }
}
