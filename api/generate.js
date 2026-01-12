import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import admin from "firebase-admin";

// ---------------- FIREBASE ADMIN ----------------

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const auth = admin.auth();

// ---------------- CONFIG ----------------

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

// ---------------- HELPERS ----------------

// Extract keywords fallback
function extractKeywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Convert Data URI → Gemini inlineData
function dataUriToInlineData(dataUri) {
  if (!dataUri?.startsWith("data:")) return null;

  const [meta, base64] = dataUri.split(",");
  if (!meta || !base64) return null;

  const mimeType = meta.replace("data:", "").split(";")[0];

  return {
    data: base64,
    mimeType: mimeType || "image/png",
  };
}

// ---------------- HANDLER ----------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  try {
    // ---------------- AUTH ----------------

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid auth token." });
    }

    const uid = decoded.uid;
    const email = decoded.email || null;

    // ---------------- REQUEST BODY ----------------

    const {
      prompt,
      images = [],
      pexelsQuery: userQuery,
      imageCount = 8,
      videoCount = 2,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt." });
    }

    // ---------------- GEMINI INIT ----------------

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    // ---------------- STEP 1: PEXELS QUERY ----------------

    let pexelsQuery = userQuery;

    if (!pexelsQuery) {
      try {
        const queryPrompt = `
Given this website description:
"${prompt}"

Generate a short (1–5 words) Pexels search query
focused ONLY on real-world objects.
Return ONLY the query text.
        `.trim();

        const q = await model.generateContent(queryPrompt);
        pexelsQuery = q.response.text()?.trim();
      } catch {
        pexelsQuery = extractKeywords(prompt).slice(0, 4).join(" ");
      }
    }

    // ---------------- STEP 2: PEXELS IMAGES ----------------

    let imageURLs = [];
    try {
      const r = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${imageCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );

      const data = await r.json();
      imageURLs = (data.photos || [])
        .map(p => p.src?.large)
        .filter(Boolean)
        .slice(0, 6);
    } catch {}

    // ---------------- STEP 3: PEXELS VIDEOS ----------------

    let heroVideo = "";
    try {
      const r = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${videoCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );

      const data = await r.json();
      heroVideo =
        data.videos?.[0]?.video_files?.[0]?.link || "";
    } catch {}

    // ---------------- STEP 4: SYSTEM INSTRUCTION ----------------

    // ---------------- STEP 4: SYSTEM INSTRUCTION (UPDATED) ----------------

const systemInstruction = `
You are an elite web development AI.

TASK:
Generate ONE self-contained HTML file.

REPLIT-STYLE NARRATION:
Before you write each major section of the code, output a single line starting with [ACTION: ...] 
describing what you are doing *right now* in 3-5 words.
Make it dynamic, varied, and reflective of the actual step you are performing.
Examples of more “alive” lines:
[ACTION: Creating hero heading]
[ACTION: Embedding user image]
[ACTION: Linking social icons]
[ACTION: Adding responsive CSS]
[ACTION: Building subscription form]
[ACTION: Injecting Tailwind utilities]

ABSOLUTE RULES:
- Output ONLY valid HTML and these ACTION tags.
- NO markdown (no \`\`\`html blocks).
- NO explanations outside of the ACTION tags.
- NEVER invent URLs

IMAGE RULES (CRITICAL):
- User-uploaded images are Base64 Data URIs
- You MUST embed them directly using <img src="data:...">
- NEVER invent image URLs

VIDEO RULES:
- Use hero video ONLY if provided

SOCIAL MEDIA RULES:
- Use homepage links only
- Facebook: https://www.facebook.com
- Instagram: https://www.instagram.com
- Twitter: https://www.twitter.com

HERO VIDEO:
${heroVideo || "None"}

STOCK IMAGES:
${imageURLs.join("\n") || "None"}

USER UPLOADED IMAGES:
${images.join("\n\n") || "None"}

USER PROMPT:
${prompt}

NOTE:
- Every [ACTION: ...] line must describe the *exact operation you are currently performing*.
- Do NOT repeat generic action lines like “Building Section” or “Styling Hero Section”.
- Vary wording, include specific elements, components, or content being created.
- Make it feel like the AI is narrating its live process step by step.
`.trim();


    // ---------------- STEP 5: GEMINI INPUT ----------------

    const parts = [
      { text: systemInstruction },
      ...images
        .filter(i => typeof i === "string" && i.startsWith("data:"))
        .slice(0, 4)
        .map(img => {
          const inline = dataUriToInlineData(img);
          return inline
            ? { inlineData: inline }
            : null;
        })
        .filter(Boolean),
    ];

    // ---------------- STEP 6: STREAM ----------------

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const stream = await model.generateContentStream({
      contents: [{ role: "user", parts }],
    });

    for await (const chunk of stream.stream ?? []) {
      const text = chunk.text?.();
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
