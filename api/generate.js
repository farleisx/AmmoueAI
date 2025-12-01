import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

// Helper: extract keywords
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

  const { prompt, pexelsQuery: userQuery, imageCount = 5, videoCount = 2 } = req.body;

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
      if (!pexelsQuery) {
        pexelsQuery = extractKeywords(prompt).slice(0, 5).join(" ");
      }
    } catch {
      pexelsQuery = extractKeywords(prompt).slice(0, 5).join(" ");
    }
  }

  // 2️⃣ Fetch Pexels Images
  let imageURLs = [];
  try {
    const resp = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(
        pexelsQuery
      )}&per_page=${imageCount}`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    const data = await resp.json();
    imageURLs = (data.photos || []).map((p) => p.src.large);
  } catch (err) {
    console.warn("Pexels image fetch error:", err);
  }

  // 3️⃣ Fetch Pexels Videos
  let videoURLs = [];
  let heroVideo = "";
  try {
    const resp = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(
        pexelsQuery
      )}&per_page=${videoCount}`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    const data = await resp.json();
    videoURLs = (data.videos || []).map((v) => v.video_files?.[0]?.link).filter(Boolean);
    heroVideo = videoURLs[0] || "";
  } catch (err) {
    console.warn("Pexels video fetch error:", err);
  }

  // 4️⃣ Generate full project files using Gemini
  const systemInstruction = `
You are an elite fullstack developer.
Generate a complete Node.js + Express project with a frontend and backend
based on the user's prompt and media below:

Hero video: ${heroVideo}
Images: ${imageURLs.join(", ")}

Return ONLY a JSON object like:
{
  "files": [
    { "path": "relative/path", "content": "..." }
  ]
}
Do NOT include any text outside JSON.
User prompt: ${prompt}
  `;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    const aiResponse = await model.generateContent(systemInstruction);
    let projectFiles;
    try {
      projectFiles = JSON.parse(aiResponse.response.text());
    } catch (err) {
      console.error("Failed to parse AI JSON:", err);
      return res.status(500).json({ error: "AI JSON parsing failed." });
    }

    return res.status(200).json({ files: projectFiles.files || [] });
  } catch (err) {
    console.error("AI generation error:", err);
    return res.status(500).json({ error: "AI generation failed." });
  }
}

// ✅ Notes:
// 1. This version avoids SSE streaming and uses a simple await call.
// 2. Pexels images/videos are fetched and used in the AI prompt.
// 3. SQLite DB creation & contact form saving should be generated inside the AI output.
// 4. The frontend can fetch `/api/media` or read from JSON placeholders returned by AI.
