import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";

/* ---------------- FIREBASE ADMIN INIT ---------------- */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();

/* ---------------- GEMINI INIT ---------------- */
if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

/* ---------------- HELPERS ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractGeminiText(response) {
  if (response?.candidates?.length) {
    return response.candidates[0].content.parts
      .map((p) => p.text || "")
      .join("");
  }
  return response?.text?.() || "";
}

async function generateWithRetry(prompt, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = extractGeminiText(result.response);

      if (!text || text.length < 100) {
        throw new Error("Empty or invalid model response");
      }

      return text;
    } catch (err) {
      lastError = err;
      console.warn(`Gemini attempt ${attempt} failed`, err.message);

      if (attempt < retries) {
        await sleep(500 * attempt); // exponential backoff
      }
    }
  }

  throw lastError;
}

function cleanHtml(text) {
  return text
    .replace(/^```[\s\S]*?\n/i, "")
    .replace(/```$/i, "")
    .trim();
}

/* ---------------- API HANDLER ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    /* ---------- AUTH ---------- */
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;

    /* ---------- INPUT ---------- */
    const { html, prompt, projectId } = req.body;

    if (!html || !prompt) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (html.length > 150_000) {
      return res.status(413).json({ error: "HTML too large to refine" });
    }

    /* ---------- PLAN + LIMIT ---------- */
    const userSnap = await db.collection("users").doc(userId).get();
    const plan = userSnap.data()?.plan || "free";
    const dailyLimit = plan === "pro" ? 5 : 2;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let usedToday = 0;
    try {
      const usageSnap = await db
        .collection("refinements")
        .where("userId", "==", userId)
        .where(
          "timestamp",
          ">=",
          admin.firestore.Timestamp.fromDate(startOfDay)
        )
        .count()
        .get();

      usedToday = usageSnap.data().count;
    } catch {
      usedToday = 0; // fail open, never block user
    }

    if (usedToday >= dailyLimit) {
      return res.status(403).json({
        error: `Daily limit reached (${dailyLimit})`,
        limitReached: true,
      });
    }

    /* ---------- PROMPT ---------- */
    const systemPrompt = `
You are an expert web developer.
Modify the provided HTML ONLY according to the user's request.
Return the COMPLETE updated HTML.
Do NOT include explanations, comments, or markdown.

Current HTML:
---
${html}
---

User Request:
---
${prompt}
---
`;

    /* ---------- GEMINI CALL (WITH RETRY) ---------- */
    let rawOutput;
    try {
      rawOutput = await generateWithRetry(systemPrompt, 3);
    } catch {
      // Fallback attempt (simpler instruction)
      rawOutput = await generateWithRetry(
        `Update this HTML based on the request and return full HTML only.\n\nHTML:\n${html}\n\nRequest:\n${prompt}`,
        1
      );
    }

    const cleanedHtml = cleanHtml(rawOutput);

    if (!cleanedHtml.includes("<html")) {
      throw new Error("Model returned invalid HTML");
    }

    /* ---------- LOG USAGE ---------- */
    await db.collection("refinements").add({
      userId,
      projectId: projectId || null,
      plan,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* ---------- RESPONSE ---------- */
    return res.status(200).json({
      htmlCode: cleanedHtml, // IMPORTANT: frontend-compatible
    });
  } catch (err) {
    console.error("Refine API Error:", err);
    return res.status(500).json({
      error: "Refinement failed",
    });
  }
}
