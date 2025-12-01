import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

// Helper to extract keywords
function extractKeywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery: userQuery, imageCount = 10, videoCount = 2 } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // 1️⃣ Generate Pexels query
    let pexelsQuery = userQuery;
    if (!pexelsQuery) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: API_MODEL });
        const queryPrompt = `
Given this website description:
"${prompt}"

Generate a short (1-5 words) Pexels search query focused ONLY on real-world objects mentioned in the prompt.
Return only the query text.
        `;
        const result = await model.generateContent(queryPrompt);
        pexelsQuery = (result.response.text?.() || "").trim();
        if (!pexelsQuery) pexelsQuery = extractKeywords(prompt).slice(0, 5).join(" ");
        console.log("🔍 Generated Pexels query:", pexelsQuery);
      } catch (err) {
        console.warn("Gemini query generation failed:", err);
        pexelsQuery = extractKeywords(prompt).slice(0, 5).join(" ");
      }
    }

    // 2️⃣ Fetch Pexels Images
    let imageURLs = [];
    try {
      const resImg = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=${imageCount}`, {
        headers: { Authorization: PEXELS_API_KEY }
      });
      const data = await resImg.json();
      imageURLs = (data.photos || []).map(p => p.src.large);
    } catch (err) {
      console.warn("Pexels image fetch error:", err);
    }

    // 3️⃣ Fetch Pexels Videos
    let videoURLs = [];
    let heroVideo = "";
    try {
      const resVid = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(pexelsQuery)}&per_page=${videoCount}`, {
        headers: { Authorization: PEXELS_API_KEY }
      });
      const data = await resVid.json();
      videoURLs = (data.videos || []).map(v => v.video_files?.[0]?.link).filter(Boolean);
      heroVideo = videoURLs[0] || "";
    } catch (err) {
      console.warn("Pexels video fetch error:", err);
    }

    // 4️⃣ Build AI instruction
    const systemInstruction = `
You are an elite fullstack developer.
Generate a complete Node.js + Express project with frontend and backend
based on the user's prompt and supplied media.

Hero video: ${heroVideo || "No video"}
Images: ${imageURLs.join(", ") || "No images"}
Additional videos: ${videoURLs.join(", ") || "No extra videos"}

Return ONLY a valid JSON object with this structure:
{
  "files": [
    { "path": "relative/path", "content": "..." }
  ]
}
Do not include extra text outside JSON.
User prompt: ${prompt}
    `;

    // 5️⃣ Set up SSE streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    const streamResult = await model.generateContentStream(systemInstruction);

    let fullResponse = "";

    try {
      for await (const chunk of streamResult.stream ?? []) {
        const textChunk = chunk.text?.() || chunk.delta?.content || "";
        if (textChunk) {
          fullResponse += textChunk;
          res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
        }
      }

      // Try parsing JSON safely
      let parsedFiles = [];
      try {
        const firstBrace = fullResponse.indexOf("{");
        const lastBrace = fullResponse.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const maybeJson = fullResponse.slice(firstBrace, lastBrace + 1);
          const jsonObj = JSON.parse(maybeJson);
          if (Array.isArray(jsonObj.files)) parsedFiles = jsonObj.files;
        }
      } catch (parseErr) {
        console.warn("AI JSON parse failed, sending raw response:", parseErr);
      }

      // Send final event
      res.write(`data: ${JSON.stringify({ files: parsedFiles, done: true, raw: parsedFiles.length === 0 ? fullResponse : undefined })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (streamErr) {
      console.error("Stream error:", streamErr);
      res.write(`data: ${JSON.stringify({ error: streamErr.message || "Stream error", done: true })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Internal server error." });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message || "Internal server error", done: true })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
}
