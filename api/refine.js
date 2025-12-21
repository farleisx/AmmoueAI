import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from 'firebase-admin';

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { prompt: refinePrompt, html: currentHtml, userId, projectId } = req.body;

  if (!userId || !currentHtml || !refinePrompt) {
    return res.status(400).json({ error: "Missing required data." });
  }

  try {
    // 1. Get User Plan
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const plan = userData?.plan || "free"; // Default to free

    // 2. Count today's refinements
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const refinementsToday = await db.collection('refinements')
      .where('userId', '==', userId)
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .count()
      .get();

    const usageCount = refinementsToday.data().count;

    // 3. Check Limits
    const limit = (plan === "pro") ? 5 : 2;
    if (usageCount >= limit) {
      return res.status(403).json({ 
        error: `Limit reached. ${plan.toUpperCase()} users are limited to ${limit} refinements per day.`,
        limitReached: true
      });
    }

    // 4. Call Gemini AI
    const prompt = `Modify this HTML based on the request: ${refinePrompt}\n\nHTML: ${currentHtml}`;
    const result = await model.generateContent(prompt);
    const cleanedHtml = result.response.text().replace(/^```html|```$/gi, "").trim();

    // 5. Log the usage so it counts against their limit
    await db.collection('refinements').add({
      userId,
      projectId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      plan
    });

    res.status(200).json({ text: cleanedHtml });

  } catch (error) {
    console.error("Refine Error:", error);
    res.status(500).json({ error: "Server error during refinement." });
  }
}
