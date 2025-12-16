import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

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
    // ⬇️ EXACTLY what frontend sends
    const {
      prompt,
      images = [],           // Base64 Data URLs
      pexelsQuery: userQuery,
      imageCount = 8,
      videoCount = 2,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt." });
    }

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

    const systemInstruction = `
You are an elite web development AI.

TASK:
Generate ONE self-contained HTML file.

ABSOLUTE RULES:
- Output ONLY valid HTML
- NO markdown
- NO explanations
- NO placeholders
- NO invented URLs

IMAGE RULES (CRITICAL):
- User-uploaded images are provided as Base64 Data URIs
- You MUST embed them directly using <img src="data:...">
- NEVER use placeholders like _USER_UPLOADED_IMAGE_
- NEVER invent image URLs
- If user uploaded images exist:
  - Use the FIRST as hero
  - Reuse others in sections
- If no uploaded images, you MAY use provided stock images

VIDEO RULES:
- Use hero video ONLY if provided

HERO VIDEO:
${heroVideo || "None"}

STOCK IMAGES:
${imageURLs.join("\n") || "None"}

USER UPLOADED IMAGES (SAFE FOR <img src>):
${images.join("\n\n") || "None"}

USER PROMPT:
${prompt}
    `.trim();

    // ---------------- STEP 5: GEMINI VISION INPUT ----------------

    const parts = [
      { text: systemInstruction },

      // Vision images (for understanding)
      ...images
        .filter(img => typeof img === "string" && img.startsWith("data:"))
        .slice(0, 4)
        .map(img => {
          const inline = dataUriToInlineData(img);
          if (!inline) return null;
          return {
            inlineData: {
              data: inline.data,
              mimeType: inline.mimeType,
            },
          };
        })
        .filter(Boolean),
    ];

    // ---------------- STEP 6: GUARD ----------------

    if (!images.length && !imageURLs.length && !heroVideo) {
      console.warn("⚠️ No visual assets provided");
    }

    // ---------------- STEP 7: STREAM RESPONSE ----------------

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const stream = await model.generateContentStream({
      contents: [{ role: "user", parts }],
    });

    try {
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
      res.write(
        `data: ${JSON.stringify({
          error: err.message || "Stream error",
          done: true,
        })}\n\n`
      );
      res.write(`data: [DONE]\n\n`);
      res.end();
    }

  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
